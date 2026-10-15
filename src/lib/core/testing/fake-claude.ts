/*
 * An in-memory claude.ai: the four endpoints the extension uses, behaving the way the real
 * ones did in the 2026-10-14 spike (docs/api-notes.md). Unit tests inject `fake.fetch`; the
 * e2e suite routes https://claude.ai/api/** to it (e2e/fixtures.ts). Anything it doesn't know
 * answers with a loud 404, so a test can never pass by accident against an endpoint we don't
 * model.
 */

export interface RecordedCall {
	method: string;
	path: string;
	body: unknown;
}

interface Fault {
	method: string;
	path: RegExp;
	status: number;
	retryAfter: string | null;
	times: number;
}

type Json = Record<string, unknown>;

export class FakeClaude {
	readonly calls: RecordedCall[] = [];
	readonly orgs: Json[];
	private readonly chats = new Map<string, Json[]>();
	private readonly faults: Fault[] = [];
	/** Ids that delete endpoints acknowledge but silently keep (a partial failure). */
	readonly stubborn = new Set<string>();
	/** Runs before every request is handled: lets a test change the world mid-run. */
	beforeRequest: ((call: RecordedCall) => void) | null = null;

	constructor(orgs: Json[], chatsByOrg: Record<string, Json[]>) {
		this.orgs = orgs;
		for (const [org, chats] of Object.entries(chatsByOrg)) this.chats.set(org, [...chats]);
	}

	/** The next `times` matching requests answer with `status` instead. */
	fail(
		method: string,
		path: RegExp,
		status: number,
		{ times = 1, retryAfter = null }: { times?: number; retryAfter?: string | null } = {}
	) {
		this.faults.push({ method, path, status, retryAfter, times });
	}

	conversations(org: string): Json[] {
		return this.chats.get(org) ?? [];
	}

	has(org: string, uuid: string): boolean {
		return this.conversations(org).some((chat) => chat.uuid === uuid);
	}

	/** Gone as if deleted somewhere else (another tab, the app): no call is recorded. */
	drop(org: string, uuid: string) {
		this.chats.set(
			org,
			this.conversations(org).filter((chat) => chat.uuid !== uuid)
		);
	}

	deleteCalls(): RecordedCall[] {
		return this.calls.filter(
			(call) => call.method === 'DELETE' || call.path.endsWith('/delete_many')
		);
	}

	/** Every id that reached a delete endpoint, in order. */
	deletedIds(): string[] {
		return this.deleteCalls().flatMap((call) =>
			call.method === 'DELETE'
				? [call.path.split('/').pop() as string]
				: ((call.body as { conversation_uuids: string[] }).conversation_uuids ?? [])
		);
	}

	readonly fetch: typeof fetch = (input, init) => {
		// Like the real fetch: an aborted signal rejects with its reason and nothing is sent.
		if (init?.signal?.aborted) return Promise.reject(init.signal.reason as Error);
		const url = new URL(input instanceof Request ? input.url : String(input));
		const method = (init?.method ?? 'GET').toUpperCase();
		const body = typeof init?.body === 'string' ? (JSON.parse(init.body) as unknown) : undefined;
		const call = { method, path: url.pathname + url.search, body };
		this.calls.push(call);
		this.beforeRequest?.(call);
		return Promise.resolve(this.handle(method, url, body));
	};

	private handle(method: string, url: URL, body: unknown): Response {
		const fault = this.faults.find(
			(f) => f.times > 0 && f.method === method && f.path.test(url.pathname)
		);
		if (fault) {
			fault.times--;
			const headers: Record<string, string> = fault.retryAfter
				? { 'retry-after': fault.retryAfter }
				: {};
			return new Response(JSON.stringify({ error: 'fault' }), { status: fault.status, headers });
		}

		const path = url.pathname.replace(/^\/api/, '');
		if (method === 'GET' && path === '/organizations') return json(this.orgs);

		const list = path.match(/^\/organizations\/([^/]+)\/chat_conversations$/);
		if (method === 'GET' && list) {
			const limit = Number(url.searchParams.get('limit') ?? 50);
			const offset = Number(url.searchParams.get('offset') ?? 0);
			const sorted = [...this.conversations(list[1] as string)].sort((a, b) =>
				String(b.updated_at).localeCompare(String(a.updated_at))
			);
			return json(sorted.slice(offset, offset + limit));
		}

		const many = path.match(/^\/organizations\/([^/]+)\/chat_conversations\/delete_many$/);
		if (method === 'POST' && many) {
			// As observed: unknown ids don't fail the batch, the known ones are deleted.
			const ids = (body as { conversation_uuids?: string[] }).conversation_uuids ?? [];
			this.remove(many[1] as string, ids);
			return json({});
		}

		const one = path.match(/^\/organizations\/([^/]+)\/chat_conversations\/([^/]+)$/);
		if (method === 'DELETE' && one) {
			const [, org, id] = one as unknown as [string, string, string];
			if (!this.has(org, id)) return json({ error: 'not found' }, 404);
			this.remove(org, [id]);
			return new Response(null, { status: 204 });
		}

		return json({ error: `fake-claude: unhandled ${method} ${url.pathname}` }, 404);
	}

	private remove(org: string, ids: readonly string[]) {
		const drop = new Set(ids.filter((id) => !this.stubborn.has(id)));
		this.chats.set(
			org,
			this.conversations(org).filter((chat) => !drop.has(chat.uuid as string))
		);
	}
}

function json(data: unknown, status = 200): Response {
	return new Response(JSON.stringify(data), {
		status,
		headers: { 'content-type': 'application/json' }
	});
}
