import { describe, expect, it } from 'vitest';

import type { Outcome } from './deleter';
import { receiptCsv } from './receipt';
import type { Conversation } from './schemas';
import { id } from './testing/fixtures';

function chat(n: number, name: string): Conversation {
	return {
		uuid: id(n),
		name,
		created_at: '2026-01-01T00:00:00.000Z',
		updated_at: '2026-02-01T00:00:00.000Z',
		is_starred: false,
		project_uuid: null,
		project: null
	};
}

function rows(csv: string): string[] {
	return csv
		.replace(/^\uFEFF/, '')
		.split('\r\n')
		.slice(0, -1);
}

describe('receiptCsv', () => {
	it('starts with a BOM and ends every line with CRLF', () => {
		const csv = receiptCsv([chat(1, 'A')], new Map([[id(1), 'deleted']]));
		expect(csv.startsWith('\uFEFFstatus,')).toBe(true);
		expect(csv.endsWith('\r\n')).toBe(true);
	});

	it('lists every chat that has an outcome, in the given order', () => {
		const outcomes = new Map<string, Outcome>([
			[id(2), 'failed'],
			[id(1), 'deleted']
		]);
		expect(
			rows(receiptCsv([chat(1, 'First'), chat(2, 'Second'), chat(3, 'Untouched')], outcomes))
		).toEqual([
			'status,title,last_active,created,id',
			`deleted,First,2026-02-01T00:00:00.000Z,2026-01-01T00:00:00.000Z,${id(1)}`,
			`failed,Second,2026-02-01T00:00:00.000Z,2026-01-01T00:00:00.000Z,${id(2)}`
		]);
	});

	it('quotes titles with commas, quotes or line breaks', () => {
		const csv = receiptCsv(
			[chat(1, 'a, b'), chat(2, 'say "hi"'), chat(3, 'two\nlines')],
			new Map([
				[id(1), 'deleted'],
				[id(2), 'deleted'],
				[id(3), 'deleted']
			])
		);
		expect(csv).toContain('deleted,"a, b",');
		expect(csv).toContain('deleted,"say ""hi""",');
		expect(csv).toContain('deleted,"two\nlines",');
	});

	it.each(['=1+1', '+1', '-1', '@SUM(A1)', '\tx'])(
		'defuses a title that a spreadsheet would run as a formula: %j',
		(title) => {
			const csv = receiptCsv([chat(1, title)], new Map([[id(1), 'deleted']]));
			expect(rows(csv)[1]?.split(',')[1]).toBe(`'${title}`);
		}
	);
});
