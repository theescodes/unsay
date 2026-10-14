import type { Outcome, SweepProgress } from '@/lib/core/deleter';
import { ApiChangedError, HttpError } from '@/lib/core/errors';
import type { Conversation } from '@/lib/core/schemas';

/*
 * Everything the panel says, kept out of the components so it can be tested in Node.
 * English only for v1.
 */

const numbers = new Intl.NumberFormat('en');
const months = new Intl.DateTimeFormat('en', { month: 'long', year: 'numeric' });
const relative = new Intl.RelativeTimeFormat('en', { numeric: 'always' });

/** `count(1, 'chat')` → "1 chat", `count(1200, 'chat')` → "1,200 chats". */
export function count(n: number, noun: string): string {
	return `${numbers.format(n)} ${n === 1 ? noun : `${noun}s`}`;
}

export function chatTitle(chat: Conversation): string {
	return chat.name.trim() || 'Untitled';
}

export interface MonthGroup {
	/** `YYYY-MM` in local time. */
	key: string;
	label: string;
	chats: Conversation[];
}

/**
 * Chats grouped by the month of their last activity, newest first. Sorted here rather than
 * trusting the API's order, which was never checked (docs/api-notes.md).
 */
export function groupByMonth(chats: readonly Conversation[]): MonthGroup[] {
	const sorted = [...chats].sort((a, b) => Date.parse(b.updated_at) - Date.parse(a.updated_at));
	const groups = new Map<string, MonthGroup>();
	for (const chat of sorted) {
		const date = new Date(chat.updated_at);
		const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
		let group = groups.get(key);
		if (!group) {
			group = { key, label: months.format(date), chats: [] };
			groups.set(key, group);
		}
		group.chats.push(chat);
	}
	return [...groups.values()];
}

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;
const UNITS: [Intl.RelativeTimeFormatUnit, number][] = [
	['year', 365 * DAY],
	['month', 30 * DAY],
	['week', 7 * DAY],
	['day', DAY],
	['hour', HOUR],
	['minute', MINUTE]
];

/** "3 months ago": truncated, so a chat is never shown as older than it is. */
export function lastActiveLabel(iso: string, now: number): string {
	const diff = Date.parse(iso) - now;
	for (const [unit, ms] of UNITS) {
		if (Math.abs(diff) >= ms) return relative.format(Math.trunc(diff / ms), unit);
	}
	return 'just now';
}

/** What the user types to confirm: `delete 42`, digits without separators. */
export function confirmPhrase(n: number): string {
	return `delete ${n}`;
}

export function isConfirmed(typed: string, n: number): boolean {
	return n > 0 && typed.trim().replace(/\s+/g, ' ').toLowerCase() === confirmPhrase(n);
}

export interface ErrorText {
	title: string;
	detail: string;
	/** What it means for the user's chats. */
	consequence: string;
	/** For a bug report: which request failed and why. Ids are blanked out; no titles. */
	technical: string | null;
}

const UUID_PATTERN = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi;

function technicalDetail(error: unknown): string | null {
	if (error instanceof ApiChangedError) {
		return `${error.path.replace(UUID_PATTERN, '…')}\n${error.detail}`;
	}
	if (error instanceof HttpError) return `${error.status} ${error.path.replace(UUID_PATTERN, '…')}`;
	if (error instanceof Error) return `${error.name}: ${error.message}`;
	return null;
}

/** `deletesStarted`: whether a delete request may have gone out before the error. */
export function describeError(error: unknown, deletesStarted: boolean): ErrorText {
	const consequence = deletesStarted
		? 'The run stopped before it finished. Chats deleted up to then are gone; start over to see what is left.'
		: 'Nothing was deleted.';
	const technical = technicalDetail(error);
	const text = (title: string, detail: string): ErrorText => ({
		title,
		detail,
		consequence,
		technical
	});

	if (error instanceof ApiChangedError) {
		return text(
			'claude.ai changed',
			"claude.ai answered in a way this version of Unsay doesn't recognise, so it stopped. Check for an update of the extension."
		);
	}
	if (error instanceof HttpError) {
		if (error.status === 401 || error.status === 403) {
			return text(
				'Not logged in',
				`claude.ai refused the request (${error.status}). Make sure you are logged in, then try again.`
			);
		}
		if (error.status === 429) {
			return text(
				'Too many requests',
				'claude.ai kept asking to slow down. Wait a few minutes, then try again.'
			);
		}
		return text(
			'claude.ai answered with an error',
			`It answered ${error.status}. Try again later.`
		);
	}
	if (
		error instanceof TypeError ||
		(error instanceof DOMException && error.name === 'TimeoutError')
	) {
		return text("Couldn't reach claude.ai", 'Check your connection, then try again.');
	}
	return text('Something went wrong', error instanceof Error ? error.message : String(error));
}

export function progressLabel(progress: SweepProgress | null): string {
	switch (progress?.phase) {
		case undefined:
		case 'checking':
			return 'Checking that the chats are still there…';
		case 'deleting':
			return `Deleting… ${numbers.format(progress.done)} of ${count(progress.total, 'chat')} done`;
		case 'verifying':
			return 'Checking which chats are gone…';
		case 'retrying':
			return `Trying ${count(progress.total, 'chat')} again, one at a time…`;
		case 'final':
			return 'Deleting the chat open in this tab…';
	}
}

/** Completes "N chats …" on the done screen, in this order. */
export const OUTCOME_TEXT: Record<Outcome, string> = {
	deleted: 'deleted',
	failed: 'still there after every attempt',
	'skipped-changed': 'left alone: used again after your review',
	'skipped-starred': 'left alone: starred after your review',
	'already-gone': 'already gone before the run',
	'not-attempted': 'not touched: the run was cancelled first'
};
