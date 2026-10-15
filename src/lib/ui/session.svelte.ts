import { SvelteSet } from 'svelte/reactivity';

import type { ClaudeApi } from '@/lib/core/api';
import { countOutcomes, runSweep, type SweepProgress, type SweepResult } from '@/lib/core/deleter';
import {
	type DiagnosticsRecorder,
	diagnosticsReport,
	type RecorderSnapshot
} from '@/lib/core/diagnostics';
import { applyFilters, DEFAULT_FILTERS, type Filters, projectsIn } from '@/lib/core/filters';
import { chatOrganizations, type Conversation, type Organization } from '@/lib/core/schemas';

import { describeError, type ErrorText } from './format';

export type Step =
	| { kind: 'loading'; loaded: number }
	| { kind: 'filter' }
	| { kind: 'review' }
	| { kind: 'confirm' }
	| { kind: 'running'; progress: SweepProgress | null; cancelling: boolean }
	| { kind: 'done'; result: SweepResult; swept: Conversation[] }
	| { kind: 'error'; text: ErrorText };

export interface SessionDeps {
	api: ClaudeApi;
	/** The org claude.ai last had open, to preselect. */
	activeOrgId: () => string | null;
	/** The chat open in this tab: if it is deleted at all, it goes last (see runSweep). */
	openChatId: () => string | null;
	/** Epoch milliseconds; injectable for tests. */
	now?: () => number;
	/** For the diagnostics: what the API's fetch went through, and where the extension runs. */
	diagnostics?: { recorder: DiagnosticsRecorder; version: string; browser: string };
}

const NOTHING_RECORDED: RecorderSnapshot = { requests: {}, rateHeaders: [], answers: {} };

const preventUnload = (event: BeforeUnloadEvent) => event.preventDefault();

/**
 * One sweep, from loading the list to the done screen. The content script owns it, not the
 * panel: closing the panel mid-run doesn't stop the run, and reopening shows where it is.
 *
 * The only way to `run()` is through the confirm step, which the review step leads to; the
 * targets are exactly what was selected there.
 */
export class SweepSession {
	step = $state.raw<Step>({ kind: 'loading', loaded: 0 });
	orgs = $state.raw<Organization[]>([]);
	orgId = $state<string | null>(null);
	conversations = $state.raw<Conversation[]>([]);
	filters = $state<Filters>({ ...DEFAULT_FILTERS });
	/** Unticked in the review; everything that matches is selected by default. */
	readonly excluded = new SvelteSet<string>();
	/** When the list was loaded: "older than N days" counts from here, so it stays stable. */
	loadedAt = $state(Date.now());

	readonly matches = $derived(
		// A throwaway argument, never stored or mutated: nothing for SvelteDate to track.
		// eslint-disable-next-line svelte/prefer-svelte-reactivity
		applyFilters(this.conversations, this.filters, new Date(this.loadedAt))
	);
	readonly selected = $derived(this.matches.filter((chat) => !this.excluded.has(chat.uuid)));
	readonly projects = $derived(projectsIn(this.conversations));
	readonly starredCount = $derived(this.conversations.filter((chat) => chat.is_starred).length);
	/** Chats claude.ai didn't say the project of: only "any project" can select them. */
	readonly unknownProjectCount = $derived(
		this.conversations.filter((chat) => chat.project_uuid === undefined).length
	);

	readonly #deps: SessionDeps;
	// For the diagnostics only: the accounts the panel hides too, whether a list is loaded, and
	// how the latest run and the latest error went, even after "Start over" or "Try again".
	#allOrgs: Organization[] = [];
	#listed = false;
	#lastRun: SweepResult | null = null;
	#lastError: string | null = null;
	#started = false;
	#load: AbortController | null = null;
	#run: AbortController | null = null;

	constructor(deps: SessionDeps) {
		this.#deps = deps;
	}

	get running(): boolean {
		return this.step.kind === 'running';
	}

	/** Loads the orgs and the list the first time the panel opens; later calls do nothing. */
	start() {
		if (this.#started) return;
		this.#started = true;
		void this.refresh();
	}

	/** (Re)loads the list, and the orgs if they aren't loaded yet. Not during a run. */
	async refresh() {
		if (this.running) return;
		this.#load?.abort();
		const load = new AbortController();
		this.#load = load;
		this.step = { kind: 'loading', loaded: 0 };
		try {
			if (this.orgs.length === 0) {
				this.#allOrgs = await this.#deps.api.listOrganizations(load.signal);
				const orgs = chatOrganizations(this.#allOrgs);
				if (orgs.length === 0) {
					this.#fail({
						title: 'No chats here',
						detail: 'None of your claude.ai accounts has chats.',
						consequence: 'Nothing was deleted.',
						technical: null
					});
					return;
				}
				this.orgs = orgs;
				const active = this.#deps.activeOrgId();
				this.orgId = orgs.some((org) => org.uuid === active) ? active : (orgs[0]?.uuid ?? null);
			}
			if (this.orgId === null) return;
			const conversations = await this.#deps.api.listConversations(this.orgId, {
				signal: load.signal,
				onPage: (loaded) => {
					if (this.#load === load) this.step = { kind: 'loading', loaded };
				}
			});
			if (this.#load !== load) return;
			this.conversations = conversations;
			this.#listed = true;
			this.loadedAt = this.#deps.now?.() ?? Date.now();
			this.step = { kind: 'filter' };
		} catch (error) {
			// A newer load superseded this one; its outcome is the one that counts.
			if (this.#load !== load) return;
			console.error('[Unsay] loading failed:', error);
			this.#fail(describeError(error, false));
		} finally {
			if (this.#load === load) this.#load = null;
		}
	}

	selectOrg(orgId: string) {
		if (orgId === this.orgId || this.running) return;
		this.orgId = orgId;
		this.conversations = [];
		this.#listed = false;
		this.excluded.clear();
		void this.refresh();
	}

	setSelected(chats: readonly Conversation[], selected: boolean) {
		for (const chat of chats) {
			if (selected) this.excluded.delete(chat.uuid);
			else this.excluded.add(chat.uuid);
		}
	}

	review() {
		if (this.step.kind === 'filter' && this.matches.length > 0) this.step = { kind: 'review' };
	}

	toConfirm() {
		if (this.step.kind === 'review' && this.selected.length > 0) this.step = { kind: 'confirm' };
	}

	back() {
		if (this.step.kind === 'review') this.step = { kind: 'filter' };
		else if (this.step.kind === 'confirm') this.step = { kind: 'review' };
	}

	/** Whether the chat open in this tab is about to be deleted (it then goes last). */
	openChatSelected(): boolean {
		const open = this.#deps.openChatId();
		return open !== null && this.selected.some((chat) => chat.uuid === open);
	}

	async run() {
		if (this.step.kind !== 'confirm' || this.orgId === null) return;
		const swept = [...this.selected];
		if (swept.length === 0) return;

		const run = new AbortController();
		this.#run = run;
		// runSweep re-reads the list before its first delete; a failure there deleted nothing.
		let deletesStarted = false;
		this.step = { kind: 'running', progress: null, cancelling: false };
		// A reload would end this content script mid-run.
		addEventListener('beforeunload', preventUnload);
		try {
			const result = await runSweep({
				api: this.#deps.api,
				orgId: this.orgId,
				targets: swept.map(({ uuid, updated_at }) => ({ uuid, updated_at })),
				allowStarred: this.filters.includeStarred,
				deleteLast: this.#deps.openChatId(),
				signal: run.signal,
				onProgress: (progress) => {
					if (progress.phase !== 'checking') deletesStarted = true;
					if (this.step.kind === 'running') this.step = { ...this.step, progress };
				}
			});
			this.#lastRun = result;
			this.step = { kind: 'done', result, swept };
		} catch (error) {
			console.error('[Unsay] the run failed:', error);
			this.#fail(describeError(error, deletesStarted));
		} finally {
			removeEventListener('beforeunload', preventUnload);
			this.#run = null;
		}
	}

	/** Stops before the next delete request; the run then verifies and reports as usual. */
	cancel() {
		if (this.step.kind !== 'running' || this.step.cancelling) return;
		this.#run?.abort();
		this.step = { ...this.step, cancelling: true };
	}

	/**
	 * The report behind the panel's Diagnostics view, for compatibility and bug reports: counts,
	 * flags and the shape of claude.ai's answers, never a title, an id or a name.
	 */
	diagnostics(): string {
		const now = this.#deps.now?.() ?? Date.now();
		const lastActive = this.#deps.activeOrgId();
		const chats = this.conversations;
		const times = chats.map((chat) => Date.parse(chat.updated_at));
		return diagnosticsReport(
			{
				unsay: this.#deps.diagnostics?.version ?? 'unknown',
				browser: this.#deps.diagnostics?.browser ?? 'unknown',
				// A throwaway, never stored or mutated: nothing for SvelteDate to track.
				// eslint-disable-next-line svelte/prefer-svelte-reactivity
				date: new Date(now).toISOString().slice(0, 10),
				chatOpenInTab: this.#deps.openChatId() !== null,
				accounts: this.#allOrgs.map((org) => ({
					capabilities: org.capabilities,
					shown: this.orgs.some((shown) => shown.uuid === org.uuid),
					selected: org.uuid === this.orgId,
					lastActive: org.uuid === lastActive
				})),
				chats: this.#listed
					? {
							loaded: chats.length,
							starred: this.starredCount,
							projects: this.projects.length,
							inProjects: chats.filter((chat) => typeof chat.project_uuid === 'string').length,
							projectUnknown: this.unknownProjectCount,
							newestFirst: times.every((time, i) => i === 0 || time <= (times[i - 1] as number))
						}
					: null,
				lastRun: this.#lastRun && {
					...countOutcomes(this.#lastRun.outcomes),
					cancelled: this.#lastRun.cancelled
				},
				lastError: this.#lastError
			},
			this.#deps.diagnostics?.recorder.snapshot() ?? NOTHING_RECORDED
		);
	}

	#fail(text: ErrorText) {
		this.#lastError = text.technical ?? text.title;
		this.step = { kind: 'error', text };
	}
}
