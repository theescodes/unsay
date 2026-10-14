import { describe, expect, it, vi } from 'vitest';

import { createClaudeApi, PAGE_SIZE, parseRetryAfter } from './api';
import { ApiChangedError, HttpError } from './errors';
import { FakeClaude } from './testing/fake-claude';
import { conversation, id, ORG, organization } from './testing/fixtures';

function setup(count: number) {
	const chats = Array.from({ length: count }, (_, i) => conversation(i + 1));
	const fake = new FakeClaude([organization()], { [ORG]: chats });
	return { fake, api: createClaudeApi(fake.fetch) };
}

const listCalls = (fake: FakeClaude) =>
	fake.calls.filter((call) => call.method === 'GET' && call.path.includes('/chat_conversations'));

describe('listOrganizations', () => {
	it('parses the org list', async () => {
		const { api } = setup(0);
		const orgs = await api.listOrganizations();
		expect(orgs.map((org) => org.uuid)).toEqual([ORG]);
	});
});

describe('listConversations', () => {
	it('reads every page until a short one', async () => {
		const { fake, api } = setup(250);
		const loaded: number[] = [];
		const chats = await api.listConversations(ORG, { onPage: (n) => loaded.push(n) });

		expect(chats).toHaveLength(250);
		expect(new Set(chats.map((c) => c.uuid)).size).toBe(250);
		expect(listCalls(fake).map((call) => call.path)).toEqual([
			`/api/organizations/${ORG}/chat_conversations?limit=${PAGE_SIZE}&offset=0`,
			`/api/organizations/${ORG}/chat_conversations?limit=${PAGE_SIZE}&offset=100`,
			`/api/organizations/${ORG}/chat_conversations?limit=${PAGE_SIZE}&offset=200`
		]);
		expect(loaded).toEqual([100, 200, 250]);
	});

	it('asks for one more page when the last one is exactly full', async () => {
		const { fake, api } = setup(100);
		expect(await api.listConversations(ORG)).toHaveLength(100);
		expect(listCalls(fake)).toHaveLength(2);
	});

	it('lists a chat once even if it moves up while the pages are read', async () => {
		const { fake, api } = setup(150);
		// After the first page, chat 150 gets new activity and jumps to the top, which pushes
		// the last chat of page one onto page two.
		fake.beforeRequest = (call) => {
			if (call.path.endsWith('offset=100')) {
				const moved = fake.conversations(ORG).find((c) => c.uuid === id(150));
				if (moved) moved.updated_at = '2030-01-01T00:00:00.000Z';
			}
		};
		const chats = await api.listConversations(ORG);
		const ids = chats.map((c) => c.uuid);
		expect(ids).toHaveLength(new Set(ids).size);
		expect(ids).toContain(id(100));
	});

	it('stops with ApiChangedError instead of looping when the offset is ignored', async () => {
		const { fake } = setup(150);
		const ignoringOffset: typeof fetch = (input, init) =>
			fake.fetch((input as string).replace(/offset=\d+/, 'offset=0'), init);
		const api = createClaudeApi(ignoringOffset);
		await expect(api.listConversations(ORG)).rejects.toThrow(ApiChangedError);
		expect(listCalls(fake)).toHaveLength(2);
	});

	it('stops with ApiChangedError on a chat it cannot read', async () => {
		const fake = new FakeClaude([organization()], {
			[ORG]: [conversation(1), conversation(2, { is_starred: 'no' })]
		});
		await expect(createClaudeApi(fake.fetch).listConversations(ORG)).rejects.toThrow(
			ApiChangedError
		);
	});

	it('stops with ApiChangedError when the list is wrapped in an object', async () => {
		const wrapped: typeof fetch = () => Promise.resolve(Response.json({ data: [conversation(1)] }));
		await expect(createClaudeApi(wrapped).listConversations(ORG)).rejects.toThrow(ApiChangedError);
	});

	it('stops with ApiChangedError when the answer is not JSON', async () => {
		const html: typeof fetch = () => Promise.resolve(new Response('<!doctype html><p>Login</p>'));
		await expect(createClaudeApi(html).listConversations(ORG)).rejects.toThrow(/not JSON/);
	});

	it('does not start a request once cancelled', async () => {
		const { fake, api } = setup(10);
		await expect(api.listConversations(ORG, { signal: AbortSignal.abort() })).rejects.toThrow();
		expect(fake.calls).toHaveLength(0);
	});
});

describe('requests', () => {
	it('throws HttpError with the status and Retry-After', async () => {
		const { fake, api } = setup(1);
		fake.fail('GET', /\/organizations$/, 429, { retryAfter: '30' });
		await expect(api.listOrganizations()).rejects.toMatchObject({
			name: 'HttpError',
			status: 429,
			path: '/organizations',
			retryAfterMs: 30_000
		});
	});

	it('sends the session cookie, like the claude.ai web app', async () => {
		const { fake } = setup(1);
		const spy = vi.fn(fake.fetch);
		await createClaudeApi(spy).listOrganizations();
		expect(spy).toHaveBeenCalledWith(
			'https://claude.ai/api/organizations',
			expect.objectContaining({ credentials: 'include' })
		);
	});

	it('sends delete_many with the ids in the body', async () => {
		const { fake, api } = setup(3);
		await api.deleteMany(ORG, [id(1), id(2)]);
		expect(fake.deleteCalls()).toEqual([
			{
				method: 'POST',
				path: `/api/organizations/${ORG}/chat_conversations/delete_many`,
				body: { conversation_uuids: [id(1), id(2)] }
			}
		]);
		expect(fake.conversations(ORG).map((c) => c.uuid)).toEqual([id(3)]);
	});

	it('sends a single DELETE for one chat', async () => {
		const { fake, api } = setup(2);
		await api.deleteOne(ORG, id(2));
		expect(fake.deleteCalls()).toEqual([
			{
				method: 'DELETE',
				path: `/api/organizations/${ORG}/chat_conversations/${id(2)}`,
				body: id(2)
			}
		]);
		await expect(api.deleteOne(ORG, id(2))).rejects.toThrow(HttpError);
	});
});

describe('parseRetryAfter', () => {
	const now = Date.parse('2026-10-14T12:00:00Z');

	it('reads seconds', () => {
		expect(parseRetryAfter('120', now)).toBe(120_000);
		expect(parseRetryAfter('0', now)).toBe(0);
	});

	it('reads an HTTP date', () => {
		expect(parseRetryAfter('Wed, 14 Oct 2026 12:00:30 GMT', now)).toBe(30_000);
	});

	it('never returns a negative wait', () => {
		expect(parseRetryAfter('-5', now)).toBe(0);
		expect(parseRetryAfter('Wed, 14 Oct 2026 11:00:00 GMT', now)).toBe(0);
	});

	it('ignores a missing or unreadable header', () => {
		expect(parseRetryAfter(null, now)).toBeNull();
		expect(parseRetryAfter('  ', now)).toBeNull();
		expect(parseRetryAfter('soon', now)).toBeNull();
	});
});
