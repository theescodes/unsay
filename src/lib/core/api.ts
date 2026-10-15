import { z } from 'zod';

import { ApiChangedError, HttpError } from './errors';
import {
	type Conversation,
	conversationSchema,
	type Organization,
	organizationSchema,
	parseOrThrow
} from './schemas';

/** claude.ai's internal web API, as the claude.ai web app itself uses it. */
export interface ClaudeApi {
	listOrganizations(signal?: AbortSignal): Promise<Organization[]>;
	/** Every conversation in the org, page by page. `onPage` reports how many are loaded. */
	listConversations(
		orgId: string,
		options?: { signal?: AbortSignal; onPage?: (loaded: number) => void }
	): Promise<Conversation[]>;
	deleteMany(orgId: string, ids: readonly string[]): Promise<void>;
	deleteOne(orgId: string, id: string): Promise<void>;
}

export const PAGE_SIZE = 100;
const TIMEOUT_MS = 20_000;

/**
 * `fetchImpl` is injected so tests run against an in-memory claude.ai and nothing here
 * depends on the browser. In the extension it is the content script's own fetch: same
 * origin as claude.ai, so the session cookie goes along like for the web app itself.
 *
 * Delete requests take no abort signal on purpose: a delete the server may already be
 * processing is never cut off mid-flight. Cancelling stops before the next request.
 */
export function createClaudeApi(
	fetchImpl: typeof fetch,
	baseUrl = 'https://claude.ai/api'
): ClaudeApi {
	async function request(path: string, init: RequestInit = {}): Promise<Response> {
		const timeout = AbortSignal.timeout(TIMEOUT_MS);
		const response = await fetchImpl(`${baseUrl}${path}`, {
			...init,
			credentials: 'include',
			headers: { 'content-type': 'application/json' },
			signal: init.signal ? AbortSignal.any([init.signal, timeout]) : timeout
		});
		if (!response.ok) {
			throw new HttpError(
				response.status,
				path,
				parseRetryAfter(response.headers.get('retry-after'))
			);
		}
		return response;
	}

	async function getJson<T>(path: string, schema: z.ZodType<T>, signal?: AbortSignal): Promise<T> {
		const response = await request(path, { signal });
		let body: unknown;
		try {
			body = await response.json();
		} catch {
			throw new ApiChangedError(path, 'the response is not JSON');
		}
		return parseOrThrow(schema, body, path);
	}

	return {
		listOrganizations: (signal) => getJson('/organizations', z.array(organizationSchema), signal),

		async listConversations(orgId, { signal, onPage } = {}) {
			const byId = new Map<string, Conversation>();
			for (let offset = 0; ; offset += PAGE_SIZE) {
				const path = `/organizations/${orgId}/chat_conversations?limit=${PAGE_SIZE}&offset=${offset}`;
				const page = await getJson(path, z.array(conversationSchema), signal);
				const before = byId.size;
				// Keyed by id: a chat that moves up while we page (someone writes in it) would
				// otherwise show up twice.
				for (const conversation of page) byId.set(conversation.uuid, conversation);
				onPage?.(byId.size);
				if (page.length < PAGE_SIZE) return [...byId.values()];
				// A full page with nothing new means the offset is being ignored; without this
				// guard we would loop forever.
				if (byId.size === before) {
					throw new ApiChangedError(path, 'paging does not advance (offset ignored?)');
				}
			}
		},

		async deleteMany(orgId, ids) {
			await request(`/organizations/${orgId}/chat_conversations/delete_many`, {
				method: 'POST',
				body: JSON.stringify({ conversation_uuids: ids })
			});
		},

		async deleteOne(orgId, id) {
			// The JSON-string body comes from the MIT console script this API knowledge started
			// from; claude.ai accepted it on 2026-10-15 (docs/api-notes.md).
			await request(`/organizations/${orgId}/chat_conversations/${id}`, {
				method: 'DELETE',
				body: JSON.stringify(id)
			});
		}
	};
}

/** `Retry-After` is either seconds or an HTTP date. */
export function parseRetryAfter(value: string | null, now = Date.now()): number | null {
	if (value === null || value.trim() === '') return null;
	const seconds = Number(value);
	if (Number.isFinite(seconds)) return Math.max(0, seconds * 1000);
	const date = Date.parse(value);
	return Number.isNaN(date) ? null : Math.max(0, date - now);
}
