import type { Outcome } from './deleter';
import type { Conversation } from './schemas';

/*
 * The CSV receipt of a run: what was deleted, what was left and why. Quoting follows
 * RFC 4180 with `,` as the separator; the BOM makes Excel read UTF-8 titles correctly.
 */

const BOM = '\uFEFF';
const HEADER = ['status', 'title', 'last_active', 'created', 'id'] as const;

/**
 * Chat titles are free text, so a title starting with `=`, `+`, `-` or `@` would run as a
 * formula when the receipt is opened in a spreadsheet (CSV injection). A leading `'` defuses
 * it, as OWASP recommends.
 */
function cell(value: string): string {
	const text = /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
	return /[",\n\r]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

export function receiptCsv(
	conversations: readonly Conversation[],
	outcomes: ReadonlyMap<string, Outcome>
): string {
	const rows = conversations
		.filter((c) => outcomes.has(c.uuid))
		.map((c) => [outcomes.get(c.uuid) as Outcome, c.name, c.updated_at, c.created_at, c.uuid]);
	const lines = [HEADER, ...rows].map((row) => row.map(cell).join(','));
	return `${BOM}${lines.join('\r\n')}\r\n`;
}
