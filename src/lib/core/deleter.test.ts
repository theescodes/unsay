import { describe, expect, it, vi } from 'vitest';

import { createClaudeApi } from './api';
import { MAX_ATTEMPTS, type Sleep } from './backoff';
import {
	countOutcomes,
	type Outcome,
	runSweep,
	type SweepOptions,
	type SweepProgress,
	type SweepResult,
	type SweepTarget
} from './deleter';
import { ApiChangedError, HttpError } from './errors';
import { FakeClaude } from './testing/fake-claude';
import { conversation, daysAgo, id, ORG, organization } from './testing/fixtures';

const DELETE_MANY = /\/delete_many$/;
const DELETE_ONE = /\/chat_conversations\/[^/]+$/;

/** Like the real sleep, minus the waiting: a cancelled wait still rejects. */
const noWait: Sleep = (_ms, signal) =>
	signal?.aborted ? Promise.reject(new DOMException('Aborted', 'AbortError')) : Promise.resolve();

function range(from: number, to: number): number[] {
	return Array.from({ length: to - from + 1 }, (_, i) => from + i);
}

function claude(count: number, overrides: (n: number) => Record<string, unknown> = () => ({})) {
	return new FakeClaude([organization()], {
		[ORG]: range(1, count).map((n) => conversation(n, overrides(n)))
	});
}

/** What the review step hands over for chat `n` as the fixtures create it. */
function target(n: number): SweepTarget {
	return { uuid: id(n), updated_at: daysAgo(n) };
}

function sweep(fake: FakeClaude, targets: SweepTarget[], options: Partial<SweepOptions> = {}) {
	return runSweep({
		api: createClaudeApi(fake.fetch),
		orgId: ORG,
		targets,
		allowStarred: false,
		sleep: noWait,
		random: () => 0,
		...options
	});
}

function outcomesOf(result: SweepResult): Record<string, Outcome> {
	return Object.fromEntries(result.outcomes);
}

function expectOutcomes(result: SweepResult, expected: Record<Outcome, number[]>) {
	const flat: Record<string, Outcome> = {};
	for (const [outcome, ns] of Object.entries(expected)) {
		for (const n of ns) flat[id(n)] = outcome as Outcome;
	}
	expect(outcomesOf(result)).toEqual(flat);
}

const none = {
	deleted: [],
	'already-gone': [],
	'skipped-changed': [],
	'skipped-starred': [],
	failed: [],
	'not-attempted': []
} satisfies Record<Outcome, number[]>;

function remaining(fake: FakeClaude): string[] {
	return fake.conversations(ORG).map((c) => c.uuid as string);
}

function modify(fake: FakeClaude, n: number, changes: Record<string, unknown>) {
	const chat = fake.conversations(ORG).find((c) => c.uuid === id(n));
	if (!chat) throw new Error(`no chat ${n}`);
	Object.assign(chat, changes);
}

/** Cancels on the `nth` delete request (1-based), while that request is in flight. */
function cancelOnDelete(fake: FakeClaude, controller: AbortController, nth: number) {
	let seen = 0;
	let cancelledAt: number | null = null;
	fake.beforeRequest = (call) => {
		const isDelete = call.method === 'DELETE' || DELETE_MANY.test(call.path);
		if (isDelete && ++seen === nth) {
			controller.abort();
			cancelledAt = fake.calls.length;
		}
	};
	return {
		/** Delete requests sent after the cancel. Must always be empty. */
		deletesAfterCancel: () =>
			cancelledAt === null
				? []
				: fake.calls
						.slice(cancelledAt)
						.filter((call) => call.method === 'DELETE' || DELETE_MANY.test(call.path))
	};
}

describe('runSweep: what gets deleted', () => {
	it('deletes exactly the selected chats, in batches of 50, and verifies them', async () => {
		const fake = claude(130);
		const result = await sweep(fake, range(1, 120).map(target));

		expectOutcomes(result, { ...none, deleted: range(1, 120) });
		expect(result.cancelled).toBe(false);
		expect(remaining(fake)).toEqual(range(121, 130).map(id));
		expect(fake.deleteCalls().map((call) => call.method)).toEqual(['POST', 'POST', 'POST']);
		expect(
			fake
				.deleteCalls()
				.map((call) => (call.body as { conversation_uuids: string[] }).conversation_uuids.length)
		).toEqual([50, 50, 20]);
	});

	it('never sends an id that is not in the selection', async () => {
		const fake = claude(20);
		await sweep(fake, [target(3), target(7)]);
		expect(fake.deletedIds()).toEqual([id(3), id(7)]);
		expect(remaining(fake)).toHaveLength(18);
	});

	it('never sends an id that is not in the fresh list', async () => {
		const fake = claude(5);
		const result = await sweep(fake, [target(1), target(99)]);
		expectOutcomes(result, { ...none, deleted: [1], 'already-gone': [99] });
		expect(fake.deletedIds()).toEqual([id(1)]);
	});

	it('leaves a chat alone that was used again after the review', async () => {
		const fake = claude(3);
		modify(fake, 2, { updated_at: daysAgo(0) });
		const result = await sweep(fake, range(1, 3).map(target));
		expectOutcomes(result, { ...none, deleted: [1, 3], 'skipped-changed': [2] });
		expect(fake.deletedIds()).not.toContain(id(2));
		expect(remaining(fake)).toEqual([id(2)]);
	});

	it('leaves a chat alone that was starred after the review', async () => {
		const fake = claude(3);
		modify(fake, 2, { is_starred: true });
		const result = await sweep(fake, range(1, 3).map(target));
		expectOutcomes(result, { ...none, deleted: [1, 3], 'skipped-starred': [2] });
		expect(fake.deletedIds()).not.toContain(id(2));
	});

	it('deletes a starred chat only when the user opted in', async () => {
		const fake = claude(2, (n) => ({ is_starred: n === 2 }));
		const result = await sweep(fake, [target(1), target(2)], { allowStarred: true });
		expectOutcomes(result, { ...none, deleted: [1, 2] });
	});

	it('sends a chat selected twice only once', async () => {
		const fake = claude(2);
		await sweep(fake, [target(1), target(1), target(2)]);
		expect(fake.deletedIds()).toEqual([id(1), id(2)]);
	});

	it('deletes nothing when claude.ai answers with a shape it does not know', async () => {
		const fake = claude(3, (n) => (n === 3 ? { is_starred: 'yes' } : {}));
		await expect(sweep(fake, [target(1), target(2)])).rejects.toThrow(ApiChangedError);
		expect(fake.deleteCalls()).toEqual([]);
	});

	it('deletes nothing when the fresh list cannot be read', async () => {
		const fake = claude(3);
		fake.fail('GET', /\/chat_conversations$/, 401);
		await expect(sweep(fake, [target(1)])).rejects.toThrow(HttpError);
		expect(fake.deleteCalls()).toEqual([]);
	});
});

describe('runSweep: failures', () => {
	it('retries a rate-limited batch after the time Retry-After asks for', async () => {
		const fake = claude(3);
		fake.fail('POST', DELETE_MANY, 429, { retryAfter: '5' });
		const sleep = vi.fn(noWait);
		const result = await sweep(fake, range(1, 3).map(target), { sleep });

		expectOutcomes(result, { ...none, deleted: [1, 2, 3] });
		expect(sleep).toHaveBeenCalledWith(5_000, undefined);
		expect(fake.deleteCalls().map((call) => call.method)).toEqual(['POST', 'POST']);
	});

	it('deletes one by one when a batch keeps failing', async () => {
		const fake = claude(3);
		fake.fail('POST', DELETE_MANY, 500, { times: MAX_ATTEMPTS });
		const result = await sweep(fake, range(1, 3).map(target));

		expectOutcomes(result, { ...none, deleted: [1, 2, 3] });
		const singles = fake.deleteCalls().filter((call) => call.method === 'DELETE');
		expect(singles.map((call) => call.body).sort()).toEqual([id(1), id(2), id(3)]);
		expect(fake.deleteCalls().filter((call) => call.method === 'POST')).toHaveLength(MAX_ATTEMPTS);
	});

	it('goes one by one at once on a batch error that retrying will not fix', async () => {
		const fake = claude(3);
		fake.fail('POST', DELETE_MANY, 400);
		const result = await sweep(fake, range(1, 3).map(target));
		expectOutcomes(result, { ...none, deleted: [1, 2, 3] });
		expect(fake.deleteCalls().filter((call) => call.method === 'POST')).toHaveLength(1);
	});

	it('retries a chat on its own when a batch left it behind', async () => {
		const fake = claude(3);
		fake.stubborn.add(id(2));
		fake.beforeRequest = (call) => {
			if (call.method === 'DELETE') fake.stubborn.delete(id(2));
		};
		const result = await sweep(fake, range(1, 3).map(target));

		expectOutcomes(result, { ...none, deleted: [1, 2, 3] });
		expect(fake.deleteCalls().filter((call) => call.method === 'DELETE')).toEqual([
			expect.objectContaining({ body: id(2) })
		]);
	});

	it('reports a chat as failed when it is still there after every attempt', async () => {
		const fake = claude(3);
		fake.stubborn.add(id(2));
		const result = await sweep(fake, range(1, 3).map(target));
		expectOutcomes(result, { ...none, deleted: [1, 3], failed: [2] });
		expect(remaining(fake)).toEqual([id(2)]);
	});

	it('keeps going when a single delete keeps failing', async () => {
		const fake = claude(3);
		fake.fail('POST', DELETE_MANY, 400);
		fake.fail('DELETE', new RegExp(`${id(2)}$`), 500, { times: 99 });
		const result = await sweep(fake, range(1, 3).map(target));
		expectOutcomes(result, { ...none, deleted: [1, 3], failed: [2] });
	});
});

describe('runSweep: cancel', () => {
	it('sends nothing when cancelled before it starts', async () => {
		const fake = claude(3);
		const result = await sweep(fake, range(1, 3).map(target), { signal: AbortSignal.abort() });
		expect(result.cancelled).toBe(true);
		expectOutcomes(result, { ...none, 'not-attempted': [1, 2, 3] });
		expect(fake.deleteCalls()).toEqual([]);
	});

	it('stops before the next batch and still verifies the first', async () => {
		const fake = claude(120);
		const controller = new AbortController();
		const { deletesAfterCancel } = cancelOnDelete(fake, controller, 1);
		const result = await sweep(fake, range(1, 120).map(target), { signal: controller.signal });

		expect(result.cancelled).toBe(true);
		expectOutcomes(result, { ...none, deleted: range(1, 50), 'not-attempted': range(51, 120) });
		expect(deletesAfterCancel()).toEqual([]);
		expect(fake.calls.at(-1)?.method).toBe('GET');
	});

	it('stops every worker of the one-by-one fallback', async () => {
		const fake = claude(10);
		fake.fail('POST', DELETE_MANY, 400);
		const controller = new AbortController();
		// Delete request 1 is the failing batch, 2 the first single delete.
		const { deletesAfterCancel } = cancelOnDelete(fake, controller, 2);
		const result = await sweep(fake, range(1, 10).map(target), { signal: controller.signal });

		expect(result.cancelled).toBe(true);
		expect(deletesAfterCancel()).toEqual([]);
		expect(fake.deleteCalls().filter((call) => call.method === 'DELETE')).toHaveLength(1);
		expect(countOutcomes(result.outcomes)).toMatchObject({ deleted: 1, 'not-attempted': 9 });
	});

	it('stops while waiting to retry, without sending again', async () => {
		const fake = claude(3);
		fake.fail('POST', DELETE_MANY, 503);
		const controller = new AbortController();
		const sleep: Sleep = (ms, signal) => {
			controller.abort();
			return noWait(ms, signal);
		};
		const result = await sweep(fake, range(1, 3).map(target), {
			signal: controller.signal,
			sleep
		});

		expect(result.cancelled).toBe(true);
		expect(fake.deleteCalls()).toHaveLength(1);
		expectOutcomes(result, { ...none, 'not-attempted': [1, 2, 3] });
	});
});

describe('runSweep: the chat open in this tab', () => {
	it('goes last and alone, after the others are verified', async () => {
		const fake = claude(5);
		const result = await sweep(fake, range(1, 5).map(target), { deleteLast: id(3) });

		expectOutcomes(result, { ...none, deleted: range(1, 5) });
		const sequence = fake.calls
			.slice(1)
			.map((call) =>
				call.method === 'GET' ? 'list' : `${call.method} ${JSON.stringify(call.body)}`
			);
		expect(sequence).toEqual([
			`POST ${JSON.stringify({ conversation_uuids: [id(1), id(2), id(4), id(5)] })}`,
			'list',
			`DELETE ${JSON.stringify(id(3))}`,
			'list'
		]);
	});

	it('is left alone when the run was cancelled', async () => {
		const fake = claude(3);
		const controller = new AbortController();
		cancelOnDelete(fake, controller, 1);
		const result = await sweep(fake, range(1, 3).map(target), {
			signal: controller.signal,
			deleteLast: id(3)
		});
		expect(outcomesOf(result)[id(3)]).toBe('not-attempted');
		expect(fake.deletedIds()).not.toContain(id(3));
	});

	it('is not deleted when it is not to be deleted', async () => {
		const fake = claude(3, (n) => ({ is_starred: n === 3 }));
		const result = await sweep(fake, range(1, 3).map(target), { deleteLast: id(3) });
		expectOutcomes(result, { ...none, deleted: [1, 2], 'skipped-starred': [3] });
		expect(fake.deletedIds()).not.toContain(id(3));
	});
});

describe('runSweep: progress', () => {
	it('reports each phase in order', async () => {
		const fake = claude(60);
		fake.stubborn.add(id(1));
		const progress: SweepProgress[] = [];
		await sweep(fake, range(1, 60).map(target), {
			deleteLast: id(60),
			onProgress: (p) => progress.push(p)
		});
		expect(progress).toEqual([
			{ phase: 'checking', done: 0, total: 60 },
			{ phase: 'deleting', done: 0, total: 59 },
			{ phase: 'deleting', done: 50, total: 59 },
			{ phase: 'verifying', done: 0, total: 59 },
			{ phase: 'retrying', done: 0, total: 1 },
			{ phase: 'final', done: 0, total: 1 }
		]);
	});
});

/*
 * The invariant from CLAUDE.md, checked across random runs: whatever the faults, cancels and
 * changes after the review, an id only ever reaches a delete endpoint if it was selected and,
 * when the run started, existed unchanged and unstarred (or starred with the opt-in). And every
 * reported outcome matches what is left on the server.
 */
describe('runSweep: invariants under random runs', () => {
	// mulberry32: small, seedable, good enough to pick scenarios.
	function prng(seed: number) {
		return () => {
			seed = (seed + 0x6d2b79f5) | 0;
			let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
			t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
			return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
		};
	}

	it.each(range(1, 300))('seed %i', async (seed) => {
		const random = prng(seed);
		const chance = (p: number) => random() < p;
		const pick = <T>(items: readonly T[]) => items[Math.floor(random() * items.length)] as T;

		const count = 1 + Math.floor(random() * 30);
		const fake = claude(count, () => ({ is_starred: chance(0.2) }));
		const selected = range(1, count).filter(() => chance(0.6));
		const targets = [...selected.map(target), ...(chance(0.3) ? [target(500)] : [])];
		const allowStarred = chance(0.3);

		// Changes between the review and the run.
		for (const n of selected) {
			if (chance(0.1)) modify(fake, n, { updated_at: daysAgo(0) });
			if (chance(0.1)) modify(fake, n, { is_starred: true });
		}
		for (const n of range(1, count)) if (chance(0.05)) fake.stubborn.add(id(n));
		if (chance(0.4)) {
			fake.fail('POST', DELETE_MANY, pick([400, 429, 500]), {
				times: 1 + Math.floor(random() * 6),
				retryAfter: chance(0.5) ? '1' : null
			});
		}
		if (chance(0.3)) fake.fail('DELETE', DELETE_ONE, pick([404, 429, 500]), { times: 2 });

		const allowed = new Set(
			fake
				.conversations(ORG)
				.filter((c) => {
					const t = targets.find((x) => x.uuid === c.uuid);
					return t && t.updated_at === c.updated_at && (!c.is_starred || allowStarred);
				})
				.map((c) => c.uuid as string)
		);
		const before = new Set(remaining(fake));

		const controller = new AbortController();
		const { deletesAfterCancel } = chance(0.3)
			? cancelOnDelete(fake, controller, 1 + Math.floor(random() * 4))
			: { deletesAfterCancel: () => [] };
		const deleteLast = chance(0.3) && selected.length > 0 ? id(pick(selected)) : null;

		const result = await sweep(fake, targets, {
			allowStarred,
			deleteLast,
			signal: controller.signal,
			batchSize: 1 + Math.floor(random() * 5),
			random
		});

		for (const sent of fake.deletedIds()) expect(allowed).toContain(sent);
		expect(deletesAfterCancel()).toEqual([]);

		const after = new Set(remaining(fake));
		for (const uuid of before) {
			if (!targets.some((t) => t.uuid === uuid)) expect(after).toContain(uuid);
		}
		expect([...result.outcomes.keys()].sort()).toEqual(
			[...new Set(targets.map((t) => t.uuid))].sort()
		);
		for (const [uuid, outcome] of result.outcomes) {
			const gone = outcome === 'deleted' || outcome === 'already-gone';
			expect(after.has(uuid), `${uuid}: ${outcome}`).toBe(!gone);
		}
	});
});
