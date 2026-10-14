import { describe, expect, it } from 'vitest';
import { z } from 'zod';

import { ApiChangedError } from './errors';
import { chatOrganizations, conversationSchema, organizationSchema, parseOrThrow } from './schemas';
import { conversation, id, morningConversation, organization } from './testing/fixtures';

const parseConversation = (data: unknown) => parseOrThrow(conversationSchema, data, '/test');

describe('conversationSchema', () => {
	it('reads the shape claude.ai returns and keeps only the fields we use', () => {
		expect(parseConversation(conversation(1))).toEqual({
			uuid: id(1),
			name: 'Chat 1',
			created_at: '2026-10-12T12:00:00.000Z',
			updated_at: '2026-10-13T12:00:00.000Z',
			is_starred: false,
			project_uuid: null,
			project: null
		});
	});

	it('degrades display-only fields to placeholders instead of blocking', () => {
		const parsed = parseConversation(
			conversation(1, { name: null, project: { id: 7, title: 'unexpected shape' } })
		);
		expect(parsed.name).toBe('');
		expect(parsed.project).toBeNull();
		expect(parsed.project_uuid).toBeUndefined();
	});

	it.each([
		['the starred flag is missing', { is_starred: undefined }],
		['the starred flag is not a boolean', { is_starred: 'false' }],
		['the id is not a uuid', { uuid: '42' }],
		['the last activity is not a date', { updated_at: 'yesterday' }],
		['the creation date is missing', { created_at: undefined }],
		['the project link is not a uuid', { project_uuid: 'my-project' }],
		['the project link and the project disagree', { project_uuid: id(900), project: null }],
		[
			'the project link and the project object point to different projects',
			{ project_uuid: id(900), project: { uuid: id(901), name: 'Other' } }
		]
	])('stops with ApiChangedError when %s', (_, overrides) => {
		expect(() => parseConversation(conversation(1, overrides))).toThrow(ApiChangedError);
	});

	describe('project membership', () => {
		it('is "none" when the chat says project: null', () => {
			expect(parseConversation(conversation(1)).project_uuid).toBeNull();
		});

		it('comes from the project object when there is no project_uuid', () => {
			const parsed = parseConversation(
				conversation(1, { project: { uuid: id(900), name: 'Taxes' } })
			);
			expect(parsed.project_uuid).toBe(id(900));
			expect(parsed.project).toEqual({ uuid: id(900), name: 'Taxes' });
		});

		it('comes from project_uuid in the morning shape', () => {
			expect(parseConversation(morningConversation(1)).project_uuid).toBeNull();
			const inProject = morningConversation(1, {
				project_uuid: id(900),
				project: { uuid: id(900), name: 'Taxes' }
			});
			expect(parseConversation(inProject).project_uuid).toBe(id(900));
		});

		it('is unknown when neither field says', () => {
			const { project: _, ...withoutProject } = conversation(1);
			expect(parseConversation(withoutProject).project_uuid).toBeUndefined();
			expect(parseConversation(conversation(1, { project: 'p-1' })).project_uuid).toBeUndefined();
		});
	});

	it('names the path and the problem in the error', () => {
		expect(() =>
			parseOrThrow(z.array(conversationSchema), [conversation(1, { is_starred: 1 })], '/list')
		).toThrow(/\/list.*is_starred/s);
	});
});

describe('organizationSchema', () => {
	it('reads the shape claude.ai returns', () => {
		expect(parseOrThrow(organizationSchema, organization(), '/organizations')).toEqual({
			uuid: organization().uuid,
			name: "someone@example.com's Organization",
			capabilities: ['claude_max', 'chat']
		});
	});
});

describe('chatOrganizations', () => {
	it('keeps only orgs that have claude.ai chats', () => {
		const chat = { uuid: id(1), name: 'Personal', capabilities: ['chat'] };
		const apiOnly = { uuid: id(2), name: 'API', capabilities: ['api'] };
		expect(chatOrganizations([chat, apiOnly])).toEqual([chat]);
	});
});
