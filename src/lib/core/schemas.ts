import { z } from 'zod';

import { ApiChangedError } from './errors';

// Zod 4 tries `new Function` for its JIT, which the extension's CSP blocks; it would log a
// violation and fall back to interpreted validation anyway. Skip the attempt.
z.config({ jitless: true });

/*
 * Shapes of claude.ai's internal API as seen on 2026-10-14 (docs/api-notes.md). Strict only
 * where a deletion decision depends on the value — ids, timestamps, the starred flag — so an
 * unexpected change there stops everything. Fields we only display are lenient: an odd title
 * degrades to a placeholder instead of blocking. Project membership is the one in between:
 * when claude.ai's answer doesn't say, it is unknown, and no project filter can select it.
 */

const timestamp = z.string().refine((value) => !Number.isNaN(Date.parse(value)), 'not a date');

export const organizationSchema = z.object({
	uuid: z.guid(),
	name: z.string().catch(''),
	capabilities: z.array(z.string()).catch([])
});

const projectSchema = z.object({ uuid: z.guid(), name: z.string().catch('') });

export const conversationSchema = z
	.object({
		uuid: z.guid(),
		name: z.string().catch(''),
		created_at: timestamp,
		updated_at: timestamp,
		is_starred: z.boolean(),
		// On every chat in the morning, gone from the list by the evening; used when present.
		project_uuid: z.guid().nullable().optional(),
		// null means not in a project. The filled shape has never been seen (the probed account
		// has no projects), so one we can't read leaves the membership unknown, not blocked.
		project: projectSchema.nullable().optional().catch(undefined)
	})
	.refine(
		({ project_uuid, project }) =>
			project_uuid === undefined ||
			project === undefined ||
			(project?.uuid ?? null) === project_uuid,
		{ message: 'project_uuid and project disagree', path: ['project_uuid'] }
	)
	.transform(({ project_uuid, project, ...rest }) => ({
		...rest,
		/** The chat's project: null for none, undefined when claude.ai's answer doesn't say. */
		project_uuid: project_uuid !== undefined ? project_uuid : project && project.uuid,
		project: project ?? null
	}));

export type Organization = z.infer<typeof organizationSchema>;
export type Conversation = z.infer<typeof conversationSchema>;

export function parseOrThrow<T>(schema: z.ZodType<T>, data: unknown, path: string): T {
	const result = schema.safeParse(data);
	if (!result.success) throw new ApiChangedError(path, z.prettifyError(result.error));
	return result.data;
}

/** Organizations that have claude.ai chats at all (API-only orgs don't). */
export function chatOrganizations(orgs: readonly Organization[]): Organization[] {
	return orgs.filter((org) => org.capabilities.includes('chat'));
}
