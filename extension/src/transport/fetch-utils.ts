/**
 * Fetch utilities: per-request timeout and single-retry for transient errors.
 * Each call creates its own AbortController so timeouts are independent.
 */

/** Default timeout for API requests (ms). */
export const DEFAULT_FETCH_TIMEOUT_MS = 8000;

/** Short timeout for discovery health probes (ms). */
export const HEALTH_PROBE_TIMEOUT_MS = 4500;

/** Init options extended with an optional timeout. */
export type FetchWithTimeoutInit = RequestInit & { timeoutMs?: number };

/**
 * Fetch with an AbortController-based timeout. Creates its own controller
 * so each request is independently timed (no shared-controller bugs).
 * If the caller provides a signal, abort propagates inward.
 */
export async function fetchWithTimeout(
  url: string,
  init?: FetchWithTimeoutInit,
): Promise<Response> {
  const ms = init?.timeoutMs ?? DEFAULT_FETCH_TIMEOUT_MS;
  const controller = new AbortController();

  // Link caller signal → our controller (for external cancellation)
  const externalSignal = init?.signal;
  if (externalSignal) {
    if (externalSignal.aborted) {
      controller.abort(externalSignal.reason);
    } else {
      externalSignal.addEventListener(
        'abort',
        () => controller.abort(externalSignal.reason),
        { once: true },
      );
    }
  }

  const timer = setTimeout(() => controller.abort(), ms);
  try {
    // Strip timeoutMs before passing to native fetch
    const { timeoutMs: _, signal: __, ...rest } = init ?? {};
    return await fetch(url, { ...rest, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Returns true if the error looks transient (network glitch, timeout, 5xx).
 * Used to decide whether a single retry is worthwhile.
 */
export function isTransientError(err: unknown): boolean {
  if (err instanceof Error) {
    const msg = err.message.toLowerCase();
    return msg.includes('econnreset')
      || msg.includes('etimedout')
      || msg.includes('enotfound')
      || msg.includes('fetch failed')
      || msg.includes('aborted')
      || msg.includes('network')
      || msg.includes('server error:');
  }
  return false;
}

/**
 * Fetch with timeout + a single retry on transient errors.
 * Adds 200ms delay before retry to avoid hammering a recovering server.
 * Non-transient errors (4xx, parse failures) are thrown immediately.
 * Does not retry if the caller's signal was intentionally aborted.
 */
export async function fetchWithRetry(
  url: string,
  init?: FetchWithTimeoutInit,
): Promise<Response> {
  try {
    const resp = await fetchWithTimeout(url, init);
    if (resp.status >= 500) {
      throw new Error(`Server error: ${resp.status}`);
    }
    return resp;
  } catch (err) {
    // Don't retry if the caller intentionally aborted the request.
    if (init?.signal?.aborted) throw err;
    if (isTransientError(err)) {
      await new Promise((r) => setTimeout(r, 200));
      const resp = await fetchWithTimeout(url, init);
      if (resp.status >= 500) {
        throw new Error(`Server error: ${resp.status}`);
      }
      return resp;
    }
    throw err;
  }
}
