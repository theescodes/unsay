import type { ClaudeApi } from './api';
import { type RetryOptions, withRetry } from './backoff';
import { isAbortError } from './errors';
import type { Conversation } from './schemas';

/** What the user reviewed and confirmed: enough to notice if a chat changed since then. */
export interface SweepTarget {
	uuid: string;
	updated_at: string;
}

export type Outcome =
	/** Gone after the run, verified by re-reading the list. */
	| 'deleted'
	/** Already gone before we started. */
	| 'already-gone'
	/** Used again after the review (newer activity), so it was left alone. */
	| 'skipped-changed'
	/** Starred after the review, or starred without the user opting in. */
	| 'skipped-starred'
	/** Still there after every attempt. */
	| 'failed'
	/** The run was cancelled before this chat's turn. */
	| 'not-attempted';

export interface SweepProgress {
	phase: 'checking' | 'deleting' | 'verifying' | 'retrying' | 'final';
	done: number;
	total: number;
}

export interface SweepOptions extends Pick<RetryOptions, 'sleep' | 'random'> {
	api: ClaudeApi;
	orgId: string;
	targets: readonly SweepTarget[];
	allowStarred: boolean;
	/**
	 * The chat open in this tab, if it is among the targets. Deleting it makes claude.ai close it
	 * in the page, and in one early test the page reloaded, which would end this content script.
	 * So it goes last, after everything else is verified.
	 */
	deleteLast?: string | null;
	/**
	 * Cancel: stops before the next delete request; requests in flight are not cut off. Abort
	 * without a reason, so the rejection is recognisable as an AbortError.
	 */
	signal?: AbortSignal;
	onProgress?: (progress: SweepProgress) => void;
	batchSize?: number;
}

export interface SweepResult {
	outcomes: Map<string, Outcome>;
	cancelled: boolean;
}

const BATCH_SIZE = 50;
const SINGLE_DELETE_CONCURRENCY = 3;

/**
 * Deletes the confirmed chats without trusting any single response: claude.ai's delete
 * endpoints are undocumented, and delete_many accepts unknown ids without failing the batch
 * (docs/api-notes.md). Every outcome is decided by re-reading the list afterwards.
 *
 * Invariant: an id is only ever sent to a delete endpoint if it is in `targets` AND in the
 * list fetched at the start of this run, unchanged, and not starred (unless allowed).
 */
export async function runSweep(options: SweepOptions): Promise<SweepResult> {
	const { api, orgId, signal, onProgress } = options;
	const batchSize = options.batchSize ?? BATCH_SIZE;
	const retry: RetryOptions = { signal, sleep: options.sleep, random: options.random };
	// Verification ignores the cancel signal: after a cancel the user needs to know what is gone.
	const verifyRetry: RetryOptions = { sleep: options.sleep, random: options.random };
	const outcomes = new Map<string, Outcome>();
	const targets = [...new Map(options.targets.map((t) => [t.uuid, t])).values()];

	const throwIfCancelled = () => {
		if (signal?.aborted) throw new DOMException('Cancelled', 'AbortError');
	};

	// 1. Re-read the list: only what still exists, unchanged, is deleted.
	onProgress?.({ phase: 'checking', done: 0, total: targets.length });
	let fresh: Map<string, Conversation>;
	try {
		const list = await withRetry(() => api.listConversations(orgId, { signal }), retry);
		fresh = new Map(list.map((c) => [c.uuid, c]));
	} catch (error) {
		if (!isAbortError(error)) throw error;
		for (const target of targets) outcomes.set(target.uuid, 'not-attempted');
		return { outcomes, cancelled: true };
	}
	const queue: string[] = [];
	for (const target of targets) {
		const current = fresh.get(target.uuid);
		if (!current) outcomes.set(target.uuid, 'already-gone');
		else if (current.is_starred && !options.allowStarred)
			outcomes.set(target.uuid, 'skipped-starred');
		else if (current.updated_at !== target.updated_at) outcomes.set(target.uuid, 'skipped-changed');
		else queue.push(target.uuid);
	}

	const last = options.deleteLast && queue.includes(options.deleteLast) ? options.deleteLast : null;
	const main = queue.filter((id) => id !== last);
	const attempted = new Set<string>();
	let cancelled = false;

	async function deleteSingly(ids: readonly string[]) {
		await eachLimited(ids, SINGLE_DELETE_CONCURRENCY, async (id) => {
			throwIfCancelled();
			try {
				await withRetry(() => api.deleteOne(orgId, id), retry);
			} catch (error) {
				// Anything but a cancel (a 404 for a chat that is gone already, a 5xx that outlasted
				// the retries) is settled by the verification.
				if (isAbortError(error)) throw error;
			}
		});
	}

	async function stillThere(ids: readonly string[]): Promise<Set<string>> {
		const list = await withRetry(() => api.listConversations(orgId), verifyRetry);
		const present = new Set(list.map((c) => c.uuid));
		return new Set(ids.filter((id) => present.has(id)));
	}

	// 2. Batches through delete_many; a batch that fails outright is retried one by one.
	try {
		for (let i = 0; i < main.length; i += batchSize) {
			throwIfCancelled();
			onProgress?.({ phase: 'deleting', done: i, total: main.length });
			const batch = main.slice(i, i + batchSize);
			try {
				await withRetry(() => api.deleteMany(orgId, batch), retry);
			} catch (error) {
				if (isAbortError(error)) throw error;
				await deleteSingly(batch);
			}
			for (const id of batch) attempted.add(id);
		}
	} catch (error) {
		if (!isAbortError(error)) throw error;
		cancelled = true;
	}

	// 3. Verify; whatever survived gets one more try on its own, then verify again.
	onProgress?.({ phase: 'verifying', done: 0, total: main.length });
	let remaining = await stillThere(main);
	const retryable = [...remaining].filter((id) => attempted.has(id));
	if (!cancelled && retryable.length > 0) {
		onProgress?.({ phase: 'retrying', done: 0, total: retryable.length });
		try {
			await deleteSingly(retryable);
		} catch (error) {
			if (!isAbortError(error)) throw error;
			cancelled = true;
		}
		remaining = await stillThere(main);
	}
	for (const id of main) {
		if (!remaining.has(id)) outcomes.set(id, 'deleted');
		else outcomes.set(id, attempted.has(id) ? 'failed' : 'not-attempted');
	}

	// 4. The chat open in this tab, alone and last. If claude.ai reloads the page now, every
	// other outcome has already been reported through onProgress / the caller's state.
	if (last) {
		if (!cancelled) {
			onProgress?.({ phase: 'final', done: 0, total: 1 });
			try {
				await deleteSingly([last]);
			} catch (error) {
				if (!isAbortError(error)) throw error;
				cancelled = true;
			}
		}
		if (cancelled) outcomes.set(last, 'not-attempted');
		else outcomes.set(last, (await stillThere([last])).size === 0 ? 'deleted' : 'failed');
	}

	return { outcomes, cancelled };
}

export function countOutcomes(outcomes: ReadonlyMap<string, Outcome>): Record<Outcome, number> {
	const counts: Record<Outcome, number> = {
		deleted: 0,
		'already-gone': 0,
		'skipped-changed': 0,
		'skipped-starred': 0,
		failed: 0,
		'not-attempted': 0
	};
	for (const outcome of outcomes.values()) counts[outcome]++;
	return counts;
}

/**
 * Runs `task` over `items`, at most `limit` at a time. The first failure stops every worker from
 * starting another task, and is rethrown once the tasks in flight have settled: with a plain
 * Promise.all the other workers would keep sending deletes after a cancel.
 */
async function eachLimited<T>(
	items: readonly T[],
	limit: number,
	task: (item: T) => Promise<void>
): Promise<void> {
	let next = 0;
	const failures: unknown[] = [];
	const worker = async () => {
		while (failures.length === 0 && next < items.length) {
			const item = items[next++] as T;
			try {
				await task(item);
			} catch (error) {
				failures.push(error);
			}
		}
	};
	await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
	if (failures.length > 0) throw failures[0];
}
