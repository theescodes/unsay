import { describe, expect, it } from 'vitest';

import { ApiChangedError, HttpError } from '@/lib/core/errors';
import type { Conversation } from '@/lib/core/schemas';
import { id, NOW } from '@/lib/core/testing/fixtures';

import {
	chatTitle,
	count,
	describeError,
	formatNumber,
	groupByMonth,
	isConfirmed,
	lastActiveLabel,
	progressLabel
} from './format';

function chat(n: number, updated_at: string, name = `Chat ${n}`): Conversation {
	return {
		uuid: id(n),
		name,
		created_at: updated_at,
		updated_at,
		is_starred: false,
		project_uuid: null,
		project: null
	};
}

describe('count', () => {
	it('pluralises and groups digits', () => {
		expect(count(1, 'chat')).toBe('1 chat');
		expect(count(0, 'chat')).toBe('0 chats');
		expect(count(1200, 'starred chat')).toBe('1,200 starred chats');
	});
});

describe('formatNumber', () => {
	it('groups digits like count', () => {
		expect(formatNumber(999)).toBe('999');
		expect(formatNumber(2500)).toBe('2,500');
	});
});

describe('chatTitle', () => {
	it('names untitled chats', () => {
		expect(chatTitle(chat(1, NOW.toISOString(), '  '))).toBe('Untitled');
		expect(chatTitle(chat(1, NOW.toISOString(), 'Taxes'))).toBe('Taxes');
	});
});

describe('groupByMonth', () => {
	// Mid-month at noon UTC, so the local month is the same in every time zone.
	it('groups by month of last activity, newest first, whatever order the API used', () => {
		const groups = groupByMonth([
			chat(1, '2026-09-15T12:00:00Z'),
			chat(2, '2026-10-14T12:00:00Z'),
			chat(3, '2025-12-15T12:00:00Z'),
			chat(4, '2026-10-12T12:00:00Z')
		]);
		expect(groups.map((g) => [g.key, g.label, g.chats.map((c) => c.uuid)])).toEqual([
			['2026-10', 'October 2026', [id(2), id(4)]],
			['2026-09', 'September 2026', [id(1)]],
			['2025-12', 'December 2025', [id(3)]]
		]);
	});
});

describe('lastActiveLabel', () => {
	const ago = (ms: number) => new Date(NOW.getTime() - ms).toISOString();
	const now = NOW.getTime();
	const DAY = 86_400_000;

	it.each([
		[30_000, 'just now'],
		[5 * 60_000, '5 minutes ago'],
		[3 * 3_600_000, '3 hours ago'],
		[DAY, '1 day ago'],
		[13 * DAY, '1 week ago'],
		[45 * DAY, '1 month ago'],
		[400 * DAY, '1 year ago']
	])('%i ms ago reads "%s"', (ms, label) => {
		expect(lastActiveLabel(ago(ms), now)).toBe(label);
	});
});

describe('isConfirmed', () => {
	it('accepts the phrase with any case and spacing', () => {
		expect(isConfirmed('delete 3', 3)).toBe(true);
		expect(isConfirmed('  Delete   3 ', 3)).toBe(true);
	});

	it('rejects anything else', () => {
		expect(isConfirmed('delete 30', 3)).toBe(false);
		expect(isConfirmed('delete', 3)).toBe(false);
		expect(isConfirmed('delete 3 chats', 3)).toBe(false);
	});

	it('never confirms deleting nothing', () => {
		expect(isConfirmed('delete 0', 0)).toBe(false);
	});
});

describe('describeError', () => {
	it.each([
		[new ApiChangedError('/x', 'odd'), 'claude.ai changed'],
		[new HttpError(401, '/x'), 'Not logged in'],
		[new HttpError(403, '/x'), 'Not logged in'],
		[new HttpError(429, '/x'), 'Too many requests'],
		[new HttpError(502, '/x'), 'claude.ai answered with an error'],
		[new TypeError('Failed to fetch'), "Couldn't reach claude.ai"],
		[new DOMException('Timed out', 'TimeoutError'), "Couldn't reach claude.ai"],
		[new Error('boom'), 'Something went wrong']
	])('names %s', (error, title) => {
		expect(describeError(error, false).title).toBe(title);
	});

	it('names the failed request and field for a bug report, without ids', () => {
		const error = new ApiChangedError(
			`/organizations/${id(1)}/chat_conversations?limit=100&offset=0`,
			'✖ Invalid input: expected boolean, received undefined\n  → at [3].is_starred'
		);
		expect(describeError(error, true).technical).toBe(
			'/organizations/…/chat_conversations?limit=100&offset=0\n' +
				'✖ Invalid input: expected boolean, received undefined\n  → at [3].is_starred'
		);
		expect(describeError(new HttpError(500, `/organizations/${id(1)}`), false).technical).toBe(
			'500 /organizations/…'
		);
	});

	it('only promises that nothing was deleted when no run had started', () => {
		expect(describeError(new TypeError('x'), false).consequence).toBe('Nothing was deleted.');
		expect(describeError(new TypeError('x'), true).consequence).toMatch(
			/deleted up to then are gone/
		);
	});
});

describe('progressLabel', () => {
	it('describes every phase', () => {
		expect(progressLabel(null)).toBe('Checking that the chats are still there…');
		expect(progressLabel({ phase: 'deleting', done: 50, total: 120 })).toBe(
			'Deleting… 50 of 120 chats done'
		);
		expect(progressLabel({ phase: 'verifying', done: 0, total: 120 })).toBe(
			'Checking which chats are gone…'
		);
		expect(progressLabel({ phase: 'retrying', done: 0, total: 1 })).toBe(
			'Trying 1 chat again, one at a time…'
		);
		expect(progressLabel({ phase: 'final', done: 0, total: 1 })).toBe(
			'Deleting the chat open in this tab…'
		);
	});
});
