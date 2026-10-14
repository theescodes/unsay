import { HttpError, isAbortError } from './errors';

export const MAX_ATTEMPTS = 5;
const BASE_DELAY_MS = 1_000;
const MAX_DELAY_MS = 60_000;

export type Sleep = (ms: number, signal?: AbortSignal) => Promise<void>;

export interface RetryOptions {
	/** Aborting stops waiting between attempts; the attempt in flight is not cut off. */
	signal?: AbortSignal;
	sleep?: Sleep;
	random?: () => number;
}

/**
 * Worth another try: rate limiting, server errors and network failures. Retrying a delete is
 * safe — deleting what is already gone changes nothing. A 4xx other than 429 is final.
 */
export function isRetryable(error: unknown): boolean {
	if (error instanceof HttpError) return error.status === 429 || error.status >= 500;
	if (error instanceof DOMException) return error.name === 'TimeoutError';
	// fetch rejects with a TypeError on network failure.
	return error instanceof TypeError;
}

/**
 * claude.ai sends no rate-limit headers (docs/api-notes.md), so a 429 is the only signal.
 * Honour `Retry-After` when present, otherwise exponential backoff with "equal jitter".
 */
export function retryDelayMs(
	attempt: number,
	retryAfterMs: number | null,
	random: () => number = Math.random
): number {
	if (retryAfterMs !== null) return Math.min(retryAfterMs, MAX_DELAY_MS);
	const ceiling = Math.min(BASE_DELAY_MS * 2 ** attempt, MAX_DELAY_MS);
	return ceiling / 2 + random() * (ceiling / 2);
}

export const sleep: Sleep = (ms, signal) =>
	new Promise((resolve, reject) => {
		if (signal?.aborted) return reject(new DOMException('Aborted', 'AbortError'));
		const timer = setTimeout(resolve, ms);
		signal?.addEventListener(
			'abort',
			() => {
				clearTimeout(timer);
				reject(new DOMException('Aborted', 'AbortError'));
			},
			{ once: true }
		);
	});

export async function withRetry<T>(task: () => Promise<T>, options: RetryOptions = {}): Promise<T> {
	const { signal, sleep: wait = sleep, random } = options;
	for (let attempt = 0; ; attempt++) {
		try {
			return await task();
		} catch (error) {
			if (isAbortError(error) || !isRetryable(error) || attempt + 1 >= MAX_ATTEMPTS) throw error;
			const retryAfter = error instanceof HttpError ? error.retryAfterMs : null;
			await wait(retryDelayMs(attempt, retryAfter, random), signal);
		}
	}
}
