import type { Conversation } from './schemas';

export type ProjectFilter =
	{ kind: 'any' } | { kind: 'none' } | { kind: 'in'; ids: readonly string[] };

export interface Filters {
	/** Only chats whose last activity is at least this many days ago; null = any age. */
	olderThanDays: number | null;
	/** Case-insensitive substring of the title; empty = any title. */
	titleContains: string;
	project: ProjectFilter;
	/** Starred chats are left alone unless the user explicitly opts in. */
	includeStarred: boolean;
}

export const DEFAULT_FILTERS: Filters = {
	olderThanDays: null,
	titleContains: '',
	project: { kind: 'any' },
	includeStarred: false
};

const DAY_MS = 24 * 60 * 60 * 1000;

export function applyFilters(
	conversations: readonly Conversation[],
	filters: Filters,
	now: Date
): Conversation[] {
	const cutoff =
		filters.olderThanDays === null ? null : now.getTime() - filters.olderThanDays * DAY_MS;
	const needle = filters.titleContains.trim().toLocaleLowerCase();

	return conversations.filter((conversation) => {
		if (conversation.is_starred && !filters.includeStarred) return false;
		if (cutoff !== null && Date.parse(conversation.updated_at) > cutoff) return false;
		if (needle && !conversation.name.toLocaleLowerCase().includes(needle)) return false;
		return matchesProject(conversation, filters.project);
	});
}

function matchesProject(conversation: Conversation, filter: ProjectFilter): boolean {
	switch (filter.kind) {
		case 'any':
			return true;
		// A chat whose project claude.ai didn't tell us (undefined) matches neither of these.
		case 'none':
			return conversation.project_uuid === null;
		case 'in':
			return (
				typeof conversation.project_uuid === 'string' &&
				filter.ids.includes(conversation.project_uuid)
			);
	}
}

export interface ProjectOption {
	uuid: string;
	name: string;
	count: number;
}

/** The projects that actually have chats, for the project filter. Names come with the chats. */
export function projectsIn(conversations: readonly Conversation[]): ProjectOption[] {
	const projects = new Map<string, ProjectOption>();
	for (const { project_uuid: uuid, project } of conversations) {
		if (typeof uuid !== 'string') continue;
		const known = projects.get(uuid);
		if (known) known.count++;
		else projects.set(uuid, { uuid, name: project?.name || 'Unnamed project', count: 1 });
	}
	return [...projects.values()].sort((a, b) => a.name.localeCompare(b.name));
}
