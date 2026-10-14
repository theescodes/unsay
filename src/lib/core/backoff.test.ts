import { afterEach, describe, expect, it, vi } from 'vitest';

import { isRetryable, MAX_ATTEMPTS, retryDelayMs, sleep, withRetry } from './backoff';
import { ApiChangedError, HttpError } from './errors';

const abortError = () => new DOMException('Aborted', 'AbortError');

describe('isRetryable', () => {
	it.each([429, 500, 502, 503])('retries HTTP %i', (status) => {
		expect(isRetryable(new HttpError(status, '/x'))).toBe(true);
	});

	it.each([400, 401, 403, 404])('gives up on HTTP %i', (status) => {
		expect(isRetryable(new HttpError(status, '/x'))).toBe(false);
	});

	it('retries network failures and timeouts', () => {
		expect(isRetryable(new TypeError('Failed to fetch'))).toBe(true);
		expect(isRetryable(new DOMException('Timed out', 'TimeoutError'))).toBe(true);
	});

	it('never retries a cancel or an API change', () => {
		expect(isRetryable(abortError())).toBe(false);
		expect(isRetryable(new ApiChangedError('/x', 'odd'))).toBe(false);
	});
});

describe('retryDelayMs', () => {
	it('doubles the ceiling per attempt, with jitter in its upper half', () => {
		expect(retryDelayMs(0, null, () => 0)).toBe(500);
		expect(retryDelayMs(0, null, () => 1)).toBe(1_000);
		expect(retryDelayMs(3, null, () => 0)).toBe(4_000);
		expect(retryDelayMs(3, null, () => 1)).toBe(8_000);
	});

	it('never waits longer than a minute', () => {
		expect(retryDelayMs(20, null, () => 1)).toBe(60_000);
		expect(retryDelayMs(0, 3_600_000)).toBe(60_000);
	});

	it('follows Retry-After when claude.ai sends one', () => {
		expect(retryDelayMs(0, 7_000, () => 1)).toBe(7_000);
	});
});

describe('withRetry', () => {
	const noWait = vi.fn(() => Promise.resolve());

	it('returns as soon as an attempt succeeds', async () => {
		const task = vi
			.fn<() => Promise<string>>()
			.mockRejectedValueOnce(new HttpError(503, '/x'))
			.mockResolvedValueOnce('ok');
		await expect(withRetry(task, { sleep: noWait })).resolves.toBe('ok');
		expect(task).toHaveBeenCalledTimes(2);
	});

	it(`stops after ${MAX_ATTEMPTS} attempts and throws the last error`, async () => {
		const task = vi.fn(() => Promise.reject(new HttpError(500, '/x')));
		await expect(withRetry(task, { sleep: noWait })).rejects.toThrow(HttpError);
		expect(task).toHaveBeenCalledTimes(MAX_ATTEMPTS);
	});

	it('does not retry an error that is final', async () => {
		const task = vi.fn(() => Promise.reject(new HttpError(404, '/x')));
		await expect(withRetry(task, { sleep: noWait })).rejects.toThrow(HttpError);
		expect(task).toHaveBeenCalledTimes(1);
	});

	it('waits as long as Retry-After says', async () => {
		const wait = vi.fn(() => Promise.resolve());
		const task = vi
			.fn<() => Promise<void>>()
			.mockRejectedValueOnce(new HttpError(429, '/x', 12_000))
			.mockResolvedValueOnce();
		await withRetry(task, { sleep: wait });
		expect(wait).toHaveBeenCalledWith(12_000, undefined);
	});

	it('stops waiting when cancelled, without another attempt', async () => {
		const controller = new AbortController();
		const task = vi.fn(() => Promise.reject(new HttpError(503, '/x')));
		const wait = vi.fn((_ms: number, signal?: AbortSignal) => {
			controller.abort();
			return signal?.aborted ? Promise.reject(abortError()) : Promise.resolve();
		});
		await expect(withRetry(task, { signal: controller.signal, sleep: wait })).rejects.toThrow(
			'Aborted'
		);
		expect(task).toHaveBeenCalledTimes(1);
	});
});

describe('sleep', () => {
	afterEach(() => {
		vi.useRealTimers();
	});

	it('resolves after the given time', async () => {
		vi.useFakeTimers();
		const done = vi.fn();
		void sleep(1_000).then(done);
		await vi.advanceTimersByTimeAsync(999);
		expect(done).not.toHaveBeenCalled();
		await vi.advanceTimersByTimeAsync(1);
		expect(done).toHaveBeenCalled();
	});

	it('rejects with an AbortError when cancelled, and clears its timer', async () => {
		vi.useFakeTimers();
		const controller = new AbortController();
		const waiting = sleep(60_000, controller.signal);
		controller.abort();
		await expect(waiting).rejects.toMatchObject({ name: 'AbortError' });
		expect(vi.getTimerCount()).toBe(0);
	});

	it('rejects at once when already cancelled', async () => {
		await expect(sleep(60_000, AbortSignal.abort())).rejects.toMatchObject({ name: 'AbortError' });
	});
});
