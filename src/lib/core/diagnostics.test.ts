import { describe, expect, it } from 'vitest';

import { createClaudeApi } from './api';
import {
	blankIds,
	describeBrowser,
	type DiagnosticsFacts,
	DiagnosticsRecorder,
	diagnosticsReport,
	isFieldName
} from './diagnostics';
import { FakeClaude } from './testing/fake-claude';
import { conversation, id, ORG, organization } from './testing/fixtures';

const BASE = 'https://claude.ai/api';
const LIST = 'GET /organizations/…/chat_conversations';

function answering(body: string, init: ResponseInit = {}): typeof fetch {
	return () => Promise.resolve(new Response(body, init));
}

const facts: DiagnosticsFacts = {
	unsay: '0.1.1',
	browser: 'Google Chrome 141, macOS',
	date: '2026-10-15',
	chatOpenInTab: false,
	accounts: [],
	chats: null,
	lastRun: null,
	lastError: null
};

describe('blankIds', () => {
	it('blanks UUIDs and other long ids, and nothing else', () => {
		expect(blankIds(`/organizations/${id(1)}/chat_conversations/${id(2)}`)).toBe(
			'/organizations/…/chat_conversations/…'
		);
		expect(blankIds('/code/project/chan_01JABCDEF23456789XYZ')).toBe('/code/project/chan_…');
		expect(blankIds('/chat_conversations_v2?limit=30')).toBe('/chat_conversations_v2?limit=30');
	});
});

describe('isFieldName', () => {
	it('accepts field names and turns down data used as a key', () => {
		expect(isFieldName('is_starred')).toBe(true);
		expect(isFieldName('chat')).toBe(true);
		expect(isFieldName(id(1))).toBe(false);
		expect(isFieldName('someone@example.com')).toBe(false);
		expect(isFieldName('2026-10-15')).toBe(false);
		expect(isFieldName('Chat about taxes')).toBe(false);
		expect(isFieldName('01JABCDEF23456789XYZ')).toBe(false);
	});
});

describe('DiagnosticsRecorder', () => {
	it('counts answers per kind of request, ids blanked, and leaves the body to the caller', async () => {
		const recorder = new DiagnosticsRecorder();
		const watched = recorder.wrap(answering('[]', { status: 200 }));
		const response = await watched(`${BASE}/organizations/${id(1)}/chat_conversations?offset=0`);
		await watched(`${BASE}/organizations/${id(2)}/chat_conversations?offset=0`);

		expect(await response.json()).toEqual([]);
		expect(recorder.snapshot().requests).toEqual({
			[LIST]: { 200: 2, slowestMs: expect.any(Number) as number }
		});
	});

	it('describes an answer by field names, kinds of values and counts', async () => {
		const recorder = new DiagnosticsRecorder();
		const body = [
			{ uuid: id(1), name: 'Taxes', updated_at: '2026-10-01T10:00:00Z', is_starred: true },
			{ uuid: id(2), name: '', updated_at: '2026-10-02T10:00:00Z', is_starred: false },
			{
				uuid: id(3),
				name: 'Holiday',
				updated_at: '2026-10-03T10:00:00Z',
				is_starred: false,
				project: { uuid: id(9), name: 'Home' },
				tags: ['a', 'b'],
				by_id: { [id(4)]: 1, [id(5)]: 2 }
			}
		];
		await recorder.wrap(answering(JSON.stringify(body)))(`${BASE}/organizations/${id(1)}`);

		expect(recorder.snapshot().answers).toEqual({
			'GET /organizations/…': {
				items: 'object 3',
				fields: {
					uuid: 'uuid 3',
					name: 'string 2, empty 1',
					updated_at: 'date 3',
					is_starred: 'false 2, true 1',
					project: 'object 1, missing 2',
					'project.uuid': 'uuid 1',
					'project.name': 'string 1',
					tags: 'array 1, missing 2',
					'tags[]': 'string 2',
					by_id: 'object 1, missing 2',
					'by_id.*': 'number 2'
				}
			}
		});
	});

	it('merges the pages of one read, and starts over with the next read', async () => {
		const fake = new FakeClaude([organization()], {
			[ORG]: Array.from({ length: 150 }, (_, i) => conversation(i + 1))
		});
		const recorder = new DiagnosticsRecorder();
		const api = createClaudeApi(recorder.wrap(fake.fetch));
		await api.listConversations(ORG);
		fake.drop(ORG, id(1));
		await api.listConversations(ORG);

		const { requests, answers } = recorder.snapshot();
		expect(requests[LIST]).toMatchObject({ 200: 4 });
		expect(answers[LIST]).toMatchObject({
			items: 'object 149',
			pages: [100, 49],
			fields: { uuid: 'uuid 149', is_starred: 'false 149', project: 'null 149' }
		});
	});

	it('keeps failed answers apart, with the headers about rate limits', async () => {
		const recorder = new DiagnosticsRecorder();
		const watched = recorder.wrap(
			answering('{"error":{"type":"rate_limit_error","message":"Slow down"}}', {
				status: 429,
				headers: { 'retry-after': '30', 'x-ratelimit-remaining': '0', 'content-type': 'json' }
			})
		);
		await watched(`${BASE}/organizations/${id(1)}/chat_conversations/delete_many`, {
			method: 'POST'
		});

		const { requests, rateHeaders, answers } = recorder.snapshot();
		expect(requests['POST /organizations/…/chat_conversations/delete_many']).toMatchObject({
			429: 1
		});
		expect(rateHeaders).toEqual(['retry-after (seconds)', 'x-ratelimit-remaining']);
		expect(answers['POST /organizations/…/chat_conversations/delete_many 429']?.fields).toEqual({
			error: 'object 1',
			'error.type': 'string 1',
			'error.message': 'string 1'
		});
	});

	it('says when an answer is empty or not JSON', async () => {
		const recorder = new DiagnosticsRecorder();
		await recorder.wrap(answering('', { status: 200 }))(`${BASE}/a`, { method: 'DELETE' });
		await recorder.wrap(answering('<html>', { status: 200 }))(`${BASE}/b`);

		const { answers } = recorder.snapshot();
		expect(answers['DELETE /a']).toEqual({ items: 'empty body 1', fields: {} });
		expect(answers['GET /b']).toEqual({ items: 'not JSON 1', fields: {} });
	});

	it('counts a request that failed outright, and passes the failure on', async () => {
		const recorder = new DiagnosticsRecorder();
		const failing = recorder.wrap(() => Promise.reject(new TypeError('Failed to fetch')));

		await expect(failing(`${BASE}/organizations`)).rejects.toThrow('Failed to fetch');
		expect(recorder.snapshot().requests['GET /organizations']).toMatchObject({ TypeError: 1 });
	});
});

describe('diagnosticsReport', () => {
	it('passes on only capabilities that read like flags, and blanks ids in the error', () => {
		const report = JSON.parse(
			diagnosticsReport(
				{
					...facts,
					accounts: [
						{
							capabilities: ['chat', 'claude_max', id(1)],
							shown: true,
							selected: true,
							lastActive: true
						}
					],
					lastError: `/organizations/${id(1)}/chat_conversations\nexpected boolean`
				},
				{ requests: {}, rateHeaders: [], answers: {} }
			)
		) as { accounts: { capabilities: string[] }[]; lastError: string };

		expect(report.accounts[0]?.capabilities).toEqual(['chat', 'claude_max']);
		expect(report.lastError).toBe('/organizations/…/chat_conversations\nexpected boolean');
	});
});

describe('describeBrowser', () => {
	it('names the browser, not Chromium or the made-up brand', () => {
		expect(
			describeBrowser({
				brands: [
					{ brand: 'Not)A;Brand', version: '8' },
					{ brand: 'Chromium', version: '141' },
					{ brand: 'Google Chrome', version: '141' }
				],
				platform: 'macOS'
			})
		).toBe('Google Chrome 141, macOS');
		expect(
			describeBrowser({ brands: [{ brand: 'Chromium', version: '141' }], platform: 'Linux' })
		).toBe('Chromium 141, Linux');
		expect(describeBrowser(undefined)).toBe('unknown');
	});
});
