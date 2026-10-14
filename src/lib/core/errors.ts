/** claude.ai answered with a non-2xx status. */
export class HttpError extends Error {
	override readonly name = 'HttpError';

	constructor(
		readonly status: number,
		readonly path: string,
		/** From a `Retry-After` header, when there was one. */
		readonly retryAfterMs: number | null = null
	) {
		super(`claude.ai answered ${status} for ${path}`);
	}
}

/**
 * claude.ai's internal API returned something we don't recognise. Nothing may be deleted on
 * the basis of a response we couldn't read; the UI asks the user to update the extension.
 */
export class ApiChangedError extends Error {
	override readonly name = 'ApiChangedError';

	constructor(
		readonly path: string,
		readonly detail: string
	) {
		super(`claude.ai's API changed (${path}): ${detail}`);
	}
}

export function isAbortError(error: unknown): boolean {
	return error instanceof DOMException && error.name === 'AbortError';
}
