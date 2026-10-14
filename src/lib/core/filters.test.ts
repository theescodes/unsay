import { describe, expect, it } from 'vitest';

import { applyFilters, DEFAULT_FILTERS, type Filters, projectsIn } from './filters';
import type { Conversation } from './schemas';
import { daysAgo, id, NOW } from './testing/fixtures';

function chat(n: number, overrides: Partial<Conversation> = {}): Conversation {
	return {
		uuid: id(n),
		name: `Chat ${n}`,
		created_at: daysAgo(n + 1),
		updated_at: daysAgo(n),
		is_starred: false,
		project_uuid: null,
		project: null,
		...overrides
	};
}

const run = (chats: Conversation[], filters: Partial<Filters>) =>
	applyFilters(chats, { ...DEFAULT_FILTERS, ...filters }, NOW).map((c) => c.uuid);

describe('applyFilters', () => {
	it('leaves starred chats out by default', () => {
		const chats = [chat(1), chat(2, { is_starred: true })];
		expect(run(chats, {})).toEqual([id(1)]);
	});

	it('includes starred chats only when the user opts in', () => {
		const chats = [chat(1), chat(2, { is_starred: true })];
		expect(run(chats, { includeStarred: true })).toEqual([id(1), id(2)]);
	});

	it('matches chats whose last activity is at least the given days ago', () => {
		const justInside = chat(1, { updated_at: daysAgo(30) });
		const justOutside = chat(2, {
			updated_at: new Date(Date.parse(daysAgo(30)) + 1).toISOString()
		});
		const old = chat(3, { updated_at: daysAgo(400) });
		expect(run([justInside, justOutside, old], { olderThanDays: 30 })).toEqual([id(1), id(3)]);
	});

	it('goes by last activity, not by creation date', () => {
		const oldButActive = chat(1, { created_at: daysAgo(100), updated_at: daysAgo(1) });
		expect(run([oldButActive], { olderThanDays: 30 })).toEqual([]);
	});

	it('matches titles case-insensitively and ignores surrounding spaces', () => {
		const chats = [chat(1, { name: 'Tax return 2025' }), chat(2, { name: 'Holiday plans' })];
		expect(run(chats, { titleContains: '  TAX ' })).toEqual([id(1)]);
	});

	it('treats an empty title filter as any title, untitled chats included', () => {
		expect(run([chat(1, { name: '' })], { titleContains: '   ' })).toEqual([id(1)]);
	});

	it('filters by project', () => {
		const loose = chat(1);
		const inA = chat(2, { project_uuid: id(900) });
		const inB = chat(3, { project_uuid: id(901) });
		const chats = [loose, inA, inB];
		expect(run(chats, { project: { kind: 'any' } })).toEqual([id(1), id(2), id(3)]);
		expect(run(chats, { project: { kind: 'none' } })).toEqual([id(1)]);
		expect(run(chats, { project: { kind: 'in', ids: [id(901)] } })).toEqual([id(3)]);
		expect(run(chats, { project: { kind: 'in', ids: [] } })).toEqual([]);
	});

	it('never lets a project filter select a chat whose project is unknown', () => {
		const unknown = chat(1, { project_uuid: undefined });
		const loose = chat(2);
		expect(run([unknown, loose], { project: { kind: 'none' } })).toEqual([id(2)]);
		expect(run([unknown, loose], { project: { kind: 'in', ids: [id(900)] } })).toEqual([]);
		expect(run([unknown, loose], { project: { kind: 'any' } })).toEqual([id(1), id(2)]);
	});

	it('combines every filter', () => {
		const chats = [
			chat(1, { name: 'notes', updated_at: daysAgo(60) }),
			chat(2, { name: 'notes', updated_at: daysAgo(5) }),
			chat(3, { name: 'other', updated_at: daysAgo(60) }),
			chat(4, { name: 'notes', updated_at: daysAgo(60), is_starred: true }),
			chat(5, { name: 'notes', updated_at: daysAgo(60), project_uuid: id(900) })
		];
		const filters = {
			olderThanDays: 30,
			titleContains: 'note',
			project: { kind: 'none' } as const
		};
		expect(run(chats, filters)).toEqual([id(1)]);
	});
});

describe('projectsIn', () => {
	it('lists the projects that have chats, with counts, sorted by name', () => {
		const chats = [
			chat(1),
			chat(2, { project_uuid: id(901), project: { uuid: id(901), name: 'Zeta' } }),
			chat(3, { project_uuid: id(900), project: { uuid: id(900), name: 'Alpha' } }),
			chat(4, { project_uuid: id(901), project: { uuid: id(901), name: 'Zeta' } })
		];
		expect(projectsIn(chats)).toEqual([
			{ uuid: id(900), name: 'Alpha', count: 1 },
			{ uuid: id(901), name: 'Zeta', count: 2 }
		]);
	});

	it('leaves out chats whose project is unknown', () => {
		expect(projectsIn([chat(1, { project_uuid: undefined })])).toEqual([]);
	});

	it('falls back to a placeholder when the project name is missing', () => {
		expect(projectsIn([chat(1, { project_uuid: id(900) })])).toEqual([
			{ uuid: id(900), name: 'Unnamed project', count: 1 }
		]);
	});
});
