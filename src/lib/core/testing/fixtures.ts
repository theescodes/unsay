/*
 * Builders for API payloads in the exact shapes claude.ai returned on 2026-10-14 (field sets
 * from the read-only probes in docs/api-notes.md, values invented). Keeping the full shape,
 * not just the fields we read, makes the schema tests meaningful.
 */

export const ORG = '4f000000-0000-4000-8000-000000000001';

/** Deterministic, valid ids: `id(7)` → 00000000-0000-4000-8000-000000000007. */
export function id(n: number): string {
	return `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
}

/** An ISO timestamp `days` before 2026-10-14T12:00:00Z (the tests' fixed "now"). */
export const NOW = new Date('2026-10-14T12:00:00.000Z');
export function daysAgo(days: number): string {
	return new Date(NOW.getTime() - days * 24 * 60 * 60 * 1000).toISOString();
}

export function organization(overrides: Record<string, unknown> = {}): Record<string, unknown> {
	return {
		id: 1,
		uuid: ORG,
		name: "someone@example.com's Organization",
		settings: { claude_ai_chat_sharing_enabled: true },
		capabilities: ['claude_max', 'chat'],
		parent_organization_uuid: null,
		rate_limit_tier: 'default_claude_max_20x',
		billing_type: 'stripe_subscription',
		created_at: daysAgo(400),
		updated_at: daysAgo(3),
		active_flags: [],
		...overrides
	};
}

/**
 * A chat in the list's shape from the evening of 2026-10-14, after claude.ai dropped
 * `project_uuid`. Fields only some chats had (last_read_at, workspace_session_id, …) are left out.
 */
export function conversation(
	n: number,
	overrides: Record<string, unknown> = {}
): Record<string, unknown> {
	return {
		uuid: id(n),
		name: `Chat ${n}`,
		summary: '',
		model: 'claude-opus-5-5',
		created_at: daysAgo(n + 1),
		updated_at: daysAgo(n),
		settings: { enabled_web_search: true, paprika_mode: 'auto' },
		is_starred: false,
		is_archived: false,
		is_temporary: false,
		is_multiplayer: false,
		platform: 'CLAUDE_AI',
		current_leaf_message_uuid: id(100_000 + n),
		project: null,
		workspace_upgraded: false,
		...overrides
	};
}

/** The same chat in the morning's shape, which still had `project_uuid` and a few more nulls. */
export function morningConversation(
	n: number,
	overrides: Record<string, unknown> = {}
): Record<string, unknown> {
	const { workspace_upgraded: _, ...current } = conversation(n);
	return {
		...current,
		project_uuid: null,
		session_id: null,
		workspace_session_id: null,
		has_assistant_outputs: true,
		latest_assistant_output_kind: 'message',
		last_read_at: daysAgo(n),
		user_uuid: null,
		...overrides
	};
}
