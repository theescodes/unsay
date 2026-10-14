import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { createClaudeApi } from '@/lib/core/api';
import { FakeClaude } from '@/lib/core/testing/fake-claude';
import { conversation, id, NOW, ORG, organization } from '@/lib/core/testing/fixtures';

import { SweepSession } from './session.svelte';

const OTHER_ORG = id(9_001);
const API_ORG = id(9_002);

function range(from: number, to: number): number[] {
	return Array.from({ length: to - from + 1 }, (_, i) => from + i);
}

interface Setup {
	orgs?: Record<string, unknown>[];
	chats?: Record<string, Record<string, unknown>[]>;
	active?: string | null;
	openChat?: string | null;
	fetch?: (fake: FakeClaude) => typeof fetch;
}

function setup(options: Setup = {}) {
	const fake = new FakeClaude(
		options.orgs ?? [organization()],
		options.chats ?? { [ORG]: range(1, 5).map((n) => conversation(n)) }
	);
	const session = new SweepSession({
		api: createClaudeApi(options.fetch?.(fake) ?? fake.fetch),
		activeOrgId: () => (options.active === undefined ? ORG : options.active),
		openChatId: () => options.openChat ?? null,
		now: () => NOW.getTime()
	});
	return { fake, session };
}

/** Loads the list and walks to the confirm step with everything that matches selected. */
async function toConfirm(session: SweepSession) {
	await session.refresh();
	session.review();
	session.toConfirm();
	expect(session.step.kind).toBe('confirm');
}

const uuids = (chats: readonly { uuid: string }[]) => chats.map((chat) => chat.uuid);

beforeEach(() => {
	// The session guards the tab against reloads during a run; Node has no window to guard.
	vi.stubGlobal('addEventListener', vi.fn());
	vi.stubGlobal('removeEventListener', vi.fn());
});

afterEach(() => {
	vi.unstubAllGlobals();
});

describe('loading', () => {
	it('loads the chat accounts, preselects the active one and opens the filters', async () => {
		const { session } = setup({
			orgs: [
				organization({ uuid: API_ORG, capabilities: ['api'] }),
				organization(),
				organization({ uuid: OTHER_ORG })
			],
			chats: { [ORG]: [conversation(1)], [OTHER_ORG]: [conversation(2), conversation(3)] },
			active: OTHER_ORG
		});
		await session.refresh();

		expect(uuids(session.orgs)).toEqual([ORG, OTHER_ORG]);
		expect(session.orgId).toBe(OTHER_ORG);
		expect(uuids(session.conversations)).toEqual([id(2), id(3)]);
		expect(session.step).toEqual({ kind: 'filter' });
	});

	it('falls back to the first chat account when the active one is unknown', async () => {
		const { session } = setup({ active: null });
		await session.refresh();
		expect(session.orgId).toBe(ORG);
	});

	it('loads only once however often the panel opens', async () => {
		const { fake, session } = setup();
		session.start();
		session.start();
		await vi.waitFor(() => expect(session.step.kind).toBe('filter'));
		expect(fake.calls.filter((call) => call.path === '/api/organizations')).toHaveLength(1);
	});

	it('says so when no account has chats', async () => {
		const { session } = setup({ orgs: [organization({ capabilities: ['api'] })] });
		await session.refresh();
		expect(session.step).toMatchObject({ kind: 'error', text: { title: 'No chats here' } });
	});

	it('stops on a list it cannot read, and says nothing was deleted', async () => {
		const { fake, session } = setup({
			chats: { [ORG]: [conversation(1, { is_starred: 'maybe' })] }
		});
		await session.refresh();
		expect(session.step).toMatchObject({
			kind: 'error',
			text: { title: 'claude.ai changed', consequence: 'Nothing was deleted.' }
		});
		expect(fake.deleteCalls()).toEqual([]);
	});

	it('keeps the newest account choice when an older load finishes late', async () => {
		let release = () => {};
		const gate = new Promise<void>((resolve) => (release = resolve));
		const { session } = setup({
			orgs: [organization(), organization({ uuid: OTHER_ORG })],
			chats: { [ORG]: [conversation(1)], [OTHER_ORG]: [conversation(2)] },
			// The other account's list hangs until released.
			fetch: (fake) => async (input, init) => {
				// createClaudeApi always passes the URL as a string.
				if ((input as string).includes(OTHER_ORG)) await gate;
				return fake.fetch(input, init);
			}
		});
		await session.refresh();

		session.selectOrg(OTHER_ORG);
		session.selectOrg(ORG);
		await vi.waitFor(() => expect(session.step.kind).toBe('filter'));
		release();
		await new Promise((resolve) => setTimeout(resolve, 0));

		expect(session.orgId).toBe(ORG);
		expect(uuids(session.conversations)).toEqual([id(1)]);
		expect(session.step.kind).toBe('filter');
	});

	it('forgets the unticked chats when switching accounts', async () => {
		const { session } = setup({
			orgs: [organization(), organization({ uuid: OTHER_ORG })],
			chats: { [ORG]: [conversation(1)], [OTHER_ORG]: [conversation(2)] }
		});
		await session.refresh();
		session.setSelected(session.conversations, false);

		session.selectOrg(OTHER_ORG);
		await vi.waitFor(() => expect(session.step.kind).toBe('filter'));
		expect(session.excluded.size).toBe(0);
		expect(uuids(session.selected)).toEqual([id(2)]);
	});
});

describe('selection', () => {
	it('leaves starred chats out until the user opts in', async () => {
		const { session } = setup({
			chats: { [ORG]: range(1, 4).map((n) => conversation(n, { is_starred: n % 2 === 0 })) }
		});
		await session.refresh();
		expect(uuids(session.matches)).toEqual([id(1), id(3)]);
		expect(session.starredCount).toBe(2);

		session.filters.includeStarred = true;
		expect(uuids(session.matches)).toEqual(range(1, 4).map(id));
	});

	it('counts "older than" from when the list was loaded', async () => {
		const { session } = setup();
		await session.refresh();
		session.filters.olderThanDays = 3;
		expect(uuids(session.matches)).toEqual([id(3), id(4), id(5)]);
	});

	it('selects everything that matches, minus what the user unticks', async () => {
		const { session } = setup();
		await session.refresh();
		session.setSelected([session.conversations[1]!], false);
		expect(uuids(session.selected)).toEqual([id(1), id(3), id(4), id(5)]);
		session.setSelected(session.matches, true);
		expect(session.selected).toHaveLength(5);
	});

	it('does not reach the confirm step with nothing selected', async () => {
		const { session } = setup();
		await session.refresh();
		session.review();
		session.setSelected(session.matches, false);
		session.toConfirm();
		expect(session.step.kind).toBe('review');
	});

	it('does not reach the review with nothing matching', async () => {
		const { session } = setup();
		await session.refresh();
		session.filters.titleContains = 'no such chat';
		session.review();
		expect(session.step.kind).toBe('filter');
	});

	it('walks back from confirm to review to the filters', async () => {
		const { session } = setup();
		await toConfirm(session);
		session.back();
		expect(session.step.kind).toBe('review');
		session.back();
		expect(session.step.kind).toBe('filter');
	});
});

describe('run', () => {
	it('does nothing unless the user went through the confirm step', async () => {
		const { fake, session } = setup();
		await session.refresh();
		session.review();
		await session.run();
		expect(session.step.kind).toBe('review');
		expect(fake.deleteCalls()).toEqual([]);
	});

	it('deletes exactly the selected chats and reports them', async () => {
		const { fake, session } = setup();
		await session.refresh();
		session.review();
		session.setSelected([session.conversations[1]!], false);
		session.toConfirm();
		await session.run();

		expect(fake.deletedIds()).toEqual([id(1), id(3), id(4), id(5)]);
		expect(uuids(fake.conversations(ORG) as { uuid: string }[])).toEqual([id(2)]);
		if (session.step.kind !== 'done') throw new Error(`step is ${session.step.kind}`);
		expect(uuids(session.step.swept)).toEqual([id(1), id(3), id(4), id(5)]);
		expect([...session.step.result.outcomes.values()]).toEqual([
			'deleted',
			'deleted',
			'deleted',
			'deleted'
		]);
	});

	it('guards the tab against a reload while it runs, and only then', async () => {
		const { session } = setup();
		await toConfirm(session);
		const run = session.run();
		expect(session.running).toBe(true);
		expect(addEventListener).toHaveBeenCalledWith('beforeunload', expect.any(Function));
		expect(removeEventListener).not.toHaveBeenCalled();
		await run;
		expect(removeEventListener).toHaveBeenCalledWith(
			'beforeunload',
			vi.mocked(addEventListener).mock.calls[0]?.[1]
		);
	});

	it('deletes the chat open in this tab last', async () => {
		const { fake, session } = setup({ openChat: id(2) });
		await toConfirm(session);
		expect(session.openChatSelected()).toBe(true);
		await session.run();
		expect(fake.deleteCalls().at(-1)).toMatchObject({ method: 'DELETE', body: id(2) });
	});

	it('deletes starred chats when the user opted in', async () => {
		const { fake, session } = setup({
			chats: { [ORG]: [conversation(1, { is_starred: true }), conversation(2)] }
		});
		await session.refresh();
		session.filters.includeStarred = true;
		session.review();
		session.toConfirm();
		await session.run();
		expect(fake.deletedIds()).toEqual([id(1), id(2)]);
	});

	it('stops after the current batch when cancelled', async () => {
		const { fake, session } = setup({
			chats: { [ORG]: range(1, 60).map((n) => conversation(n)) }
		});
		await toConfirm(session);
		fake.beforeRequest = (call) => {
			if (call.path.endsWith('/delete_many')) session.cancel();
		};
		await session.run();

		expect(fake.deletedIds()).toHaveLength(50);
		expect(session.step).toMatchObject({ kind: 'done', result: { cancelled: true } });
	});

	it('marks the run as stopping while it winds down', async () => {
		const { fake, session } = setup();
		await toConfirm(session);
		let during: unknown;
		fake.beforeRequest = (call) => {
			if (call.path.endsWith('/delete_many')) {
				session.cancel();
				during = session.step;
			}
		};
		await session.run();
		expect(during).toMatchObject({ kind: 'running', cancelling: true });
	});

	it('says nothing was deleted when the run fails before its first delete', async () => {
		const { fake, session } = setup();
		await toConfirm(session);
		fake.fail('GET', /\/chat_conversations$/, 401);
		await session.run();
		const step = session.step;
		if (step.kind !== 'error') throw new Error(`step is ${step.kind}`);
		expect(step.text.title).toBe('Not logged in');
		expect(step.text.consequence).toBe('Nothing was deleted.');
		expect(fake.deleteCalls()).toEqual([]);
		expect(session.running).toBe(false);
	});

	it('does not claim nothing was deleted when the run fails after deleting', async () => {
		const { fake, session } = setup();
		await toConfirm(session);
		// The verification read after the batch fails.
		fake.beforeRequest = (call) => {
			if (call.path.endsWith('/delete_many')) fake.fail('GET', /\/chat_conversations$/, 401);
		};
		await session.run();
		const step = session.step;
		if (step.kind !== 'error') throw new Error(`step is ${step.kind}`);
		expect(fake.deleteCalls()).toHaveLength(1);
		expect(step.text.consequence).toMatch(/stopped before it finished/);
	});

	it('starts over with a fresh list after a run', async () => {
		const { session } = setup();
		await toConfirm(session);
		await session.run();
		await session.refresh();
		expect(session.step.kind).toBe('filter');
		expect(session.conversations).toEqual([]);
	});
});
