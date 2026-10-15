import type { Outcome } from './deleter';

/*
 * Diagnostics for compatibility and bug reports: what claude.ai's answers looked like, never
 * what they said. The recorder sits between the API client and fetch and keeps, per kind of
 * request, how claude.ai answered and the shape of the answers: field names, the kind of each
 * value and how many had it. It keeps no value itself, so no titles, ids or names. It lives in
 * memory in the tab and leaves it only when the user copies the report.
 */

const UUID_SOURCE = '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}';
const UUID_ANYWHERE = new RegExp(UUID_SOURCE, 'gi');
const UUID_EXACT = new RegExp(`^${UUID_SOURCE}$`, 'i');
// Ids in formats other than UUIDs (`chan_01J…`): a long run of letters and digits with a digit.
const LONG_RUN = /[A-Za-z0-9]{16,}/g;
const FIELD_NAME = /^[A-Za-z_][A-Za-z0-9_]{0,63}$/;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}(?:[T ]\d{2}:\d{2}|$)/;

/** `text` with every id replaced by `…`: `/organizations/…/chat_conversations`. */
export function blankIds(text: string): string {
	return text.replace(UUID_ANYWHERE, '…').replace(LONG_RUN, (run) => (/\d/.test(run) ? '…' : run));
}

/** Whether `key` reads like a field name, not like data used as a key (an id, a date, an address). */
export function isFieldName(key: string): boolean {
	return FIELD_NAME.test(key) && blankIds(key) === key;
}

/** The kind of a value, which is all a report says about it. */
function kindOf(value: unknown): string {
	if (value === null) return 'null';
	if (Array.isArray(value)) return 'array';
	switch (typeof value) {
		case 'string':
			if (value === '') return 'empty';
			if (UUID_EXACT.test(value)) return 'uuid';
			return ISO_DATE.test(value) ? 'date' : 'string';
		case 'boolean':
			return String(value);
		default:
			return typeof value;
	}
}

// Deep enough for `data[].project.uuid`; the caps keep an answer with an odd shape from
// growing the report without bound.
const MAX_DEPTH = 6;
const MAX_PATHS = 300;

export interface ShapeSummary {
	/** What the answer held: `object 76` for a list of 76 chats, `empty body 1`, `not JSON 1`. */
	items: string;
	/** For a paged list: how many items each page of the latest read had. */
	pages?: number[];
	/** Per field path (`project.uuid`, `capabilities[]`): the kinds of its values, with counts. */
	fields: Record<string, string>;
}

/** The shape of one kind of answer, merged over the pages of one read. */
class Shape {
	readonly #kinds = new Map<string, Map<string, number>>();
	pages: number[] | null = null;

	addText(text: string, paged: boolean) {
		if (text.trim() === '') return this.#count('', 'empty body');
		let body: unknown;
		try {
			body = JSON.parse(text);
		} catch {
			return this.#count('', 'not JSON');
		}
		// A list's items each count as one answer: "object 76" rather than "array 1".
		const items = Array.isArray(body) ? (body as unknown[]) : [body];
		for (const item of items) this.#visit(item, '', 0);
		if (paged) (this.pages ??= []).push(pageLength(body));
	}

	summary(): ShapeSummary {
		const fields: Record<string, string> = {};
		for (const [path, kinds] of this.#kinds) {
			if (path === '') continue;
			const counts = [...kinds].sort(([, a], [, b]) => b - a);
			const missing = this.#missing(path, kinds);
			if (missing > 0) counts.push(['missing', missing]);
			fields[path] = describe(counts);
		}
		const summary: ShapeSummary = {
			items: describe([...(this.#kinds.get('') ?? [])]),
			fields
		};
		if (this.pages) summary.pages = this.pages;
		return summary;
	}

	#visit(value: unknown, path: string, depth: number) {
		const kind = kindOf(value);
		this.#count(path, kind);
		if (depth >= MAX_DEPTH) return;
		if (kind === 'object') {
			for (const [key, child] of Object.entries(value as object)) {
				const name = isFieldName(key) ? key : '*';
				this.#visit(child, path === '' ? name : `${path}.${name}`, depth + 1);
			}
		} else if (kind === 'array') {
			for (const child of value as unknown[]) this.#visit(child, `${path}[]`, depth + 1);
		}
	}

	#count(path: string, kind: string) {
		let kinds = this.#kinds.get(path);
		if (!kinds) {
			if (this.#kinds.size >= MAX_PATHS) return;
			kinds = new Map();
			this.#kinds.set(path, kinds);
		}
		kinds.set(kind, (kinds.get(kind) ?? 0) + 1);
	}

	/** How many of the objects holding this field didn't have it. */
	#missing(path: string, kinds: Map<string, number>): number {
		const dot = path.lastIndexOf('.');
		const name = path.slice(dot + 1);
		// Array items and collapsed keys (`*`) can't be missing in a meaningful way.
		if (name.endsWith('[]') || name === '*') return 0;
		const holders = this.#kinds.get(dot === -1 ? '' : path.slice(0, dot))?.get('object') ?? 0;
		const seen = [...kinds.values()].reduce((sum, n) => sum + n, 0);
		return Math.max(0, holders - seen);
	}
}

function pageLength(body: unknown): number {
	if (Array.isArray(body)) return body.length;
	const data = (body as { data?: unknown } | null)?.data;
	return Array.isArray(data) ? data.length : 0;
}

function describe(counts: [kind: string, n: number][]): string {
	return counts.map(([kind, n]) => `${kind} ${n}`).join(', ');
}

function retryAfterFormat(value: string | null): string {
	if (value !== null && /^\s*\d+\s*$/.test(value)) return 'seconds';
	return value !== null && !Number.isNaN(Date.parse(value)) ? 'date' : 'other';
}

export interface RecorderSnapshot {
	/** Per kind of request (`GET /organizations`): answers by status, failures by error name. */
	requests: Record<string, Record<string, number>>;
	/** Names of response headers about rate limits or retrying. */
	rateHeaders: string[];
	/** The shape of the latest answer of each kind; a failed status gets its own entry. */
	answers: Record<string, ShapeSummary>;
}

export class DiagnosticsRecorder {
	readonly #requests = new Map<string, Map<string, number>>();
	readonly #slowest = new Map<string, number>();
	readonly #rateHeaders = new Set<string>();
	readonly #answers = new Map<string, Shape>();
	readonly #now: () => number;

	constructor(now: () => number = () => Date.now()) {
		this.#now = now;
	}

	/** `fetchImpl`, watched: the caller gets the same response, body unread. */
	wrap(fetchImpl: typeof fetch): typeof fetch {
		return async (input, init) => {
			const url = new URL(input instanceof Request ? input.url : String(input));
			const path = blankIds(url.pathname.replace(/^\/api(?=\/)/, ''));
			const kind = `${(init?.method ?? 'GET').toUpperCase()} ${path}`;
			const started = this.#now();
			let response: Response;
			try {
				response = await fetchImpl(input, init);
			} catch (error) {
				this.#count(kind, error instanceof Error ? error.name : 'failed');
				throw error;
			}
			this.#count(kind, String(response.status));
			this.#slowest.set(kind, Math.max(this.#slowest.get(kind) ?? 0, this.#now() - started));
			try {
				await this.#record(kind, url, response);
			} catch {
				// Recording must never get in the way of the request it watches.
			}
			return response;
		};
	}

	snapshot(): RecorderSnapshot {
		const requests: Record<string, Record<string, number>> = {};
		for (const [kind, outcomes] of this.#requests) {
			requests[kind] = { ...Object.fromEntries(outcomes), slowestMs: this.#slowest.get(kind) ?? 0 };
		}
		const answers: Record<string, ShapeSummary> = {};
		for (const [key, shape] of this.#answers) answers[key] = shape.summary();
		return { requests, rateHeaders: [...this.#rateHeaders].sort(), answers };
	}

	#count(kind: string, outcome: string) {
		let outcomes = this.#requests.get(kind);
		if (!outcomes) this.#requests.set(kind, (outcomes = new Map<string, number>()));
		outcomes.set(outcome, (outcomes.get(outcome) ?? 0) + 1);
	}

	async #record(kind: string, url: URL, response: Response) {
		for (const [name, value] of response.headers) {
			if (name === 'retry-after') this.#rateHeaders.add(`retry-after (${retryAfterFormat(value)})`);
			else if (/rate|retry/i.test(name)) this.#rateHeaders.add(name);
		}
		const text = await response.clone().text();
		const key = response.ok ? kind : `${kind} ${response.status}`;
		// A list read page by page is one answer: later pages add to the first.
		const paged = url.searchParams.has('offset');
		const continued = paged && Number(url.searchParams.get('offset')) > 0;
		const shape = (continued && this.#answers.get(key)) || new Shape();
		this.#answers.set(key, shape);
		shape.addText(text, paged);
	}
}

/** What the session knows on top of the recorder. Counts and flags only. */
export interface DiagnosticsFacts {
	unsay: string;
	browser: string;
	/** The day of the report, so a shape can be dated. */
	date: string;
	chatOpenInTab: boolean;
	accounts: {
		/** claude.ai's flags for the account, like `chat`. */
		capabilities: string[];
		/** In the panel's account list (it has chats). */
		shown: boolean;
		selected: boolean;
		/** The one claude.ai last had open. */
		lastActive: boolean;
	}[];
	/** null until a list is loaded. */
	chats: {
		loaded: number;
		starred: number;
		projects: number;
		inProjects: number;
		projectUnknown: number;
		/** Whether claude.ai sent the list ordered by last activity, newest first. */
		newestFirst: boolean;
	} | null;
	lastRun: (Record<Outcome, number> & { cancelled: boolean }) | null;
	/** The technical details of the latest error, as the error screen shows them. */
	lastError: string | null;
}

/** The report the panel shows and copies: pretty JSON, so it reads in a GitHub issue. */
export function diagnosticsReport(facts: DiagnosticsFacts, recorded: RecorderSnapshot): string {
	return JSON.stringify(
		{
			...facts,
			// Values from claude.ai, so they pass the same test as field names.
			accounts: facts.accounts.map((account) => ({
				...account,
				capabilities: account.capabilities.filter(isFieldName)
			})),
			lastError: facts.lastError === null ? null : blankIds(facts.lastError),
			...recorded
		},
		null,
		2
	);
}

export interface UserAgentData {
	brands: readonly { brand: string; version: string }[];
	platform: string;
}

/** `Google Chrome 141, macOS`, from `navigator.userAgentData`. */
export function describeBrowser(data: UserAgentData | undefined): string {
	// Chromium lists itself next to the browser built on it, plus a made-up "Not A Brand".
	const brands = (data?.brands ?? []).filter(({ brand }) => !/not.?a.?brand/i.test(brand));
	const main = brands.find(({ brand }) => brand !== 'Chromium') ?? brands[0];
	if (!data || !main) return 'unknown';
	return `${main.brand} ${main.version}, ${data.platform || 'unknown platform'}`;
}
