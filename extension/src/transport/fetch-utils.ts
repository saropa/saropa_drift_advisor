/**
 * Fetch utilities: per-request timeout and single-retry for transient errors.
 * Each call creates its own AbortController so timeouts are independent.
 *
 * **Windows safety:** On some Windows Node.js builds, `AbortController.abort()`
 * does not reliably cancel an in-flight `fetch()` (undici bug). A second-layer
 * `Promise.race` safety timeout fires shortly after the abort timer, guaranteeing
 * that `fetchWithTimeout` always settles even when the signal is ignored.
 */

/** Default timeout for API requests (ms). */
export const DEFAULT_FETCH_TIMEOUT_MS = 8000;

/** Short timeout for discovery health probes (ms). */
export const HEALTH_PROBE_TIMEOUT_MS = 4500;

/**
 * Extra margin (ms) added beyond the AbortController timeout for the
 * `Promise.race` safety net. Keeps the safety out of the way when abort
 * works normally, but ensures the promise always settles on Windows when
 * `AbortController.abort()` is silently ignored by Node's undici layer.
 */
const SAFETY_MARGIN_MS = 2000;

/**
 * Init options extended with an optional timeout and an idempotency hint.
 *
 * `idempotent` controls whether {@link fetchWithRetry} may re-send the request
 * on a transient error. When omitted it is inferred from the HTTP method:
 * GET/HEAD/OPTIONS/PUT/DELETE are idempotent (safe to retry), POST/PATCH are
 * NOT. Set `idempotent: true` on a read-only or set-to-a-value POST (e.g.
 * `/api/sql`, `/api/change-detection`) to opt back into retry. Leave it unset on
 * a mutating POST (import, session create/annotate) so a connection drop after
 * the server applied the write does not duplicate it. See audit M4.
 */
export type FetchWithTimeoutInit = RequestInit & {
  timeoutMs?: number;
  idempotent?: boolean;
};

/**
 * Fetch with an AbortController-based timeout **plus** a `Promise.race`
 * safety net.
 *
 * Layer 1 — `AbortController`: fires after `ms` and aborts the request
 * (the normal, fast path on most platforms).
 *
 * Layer 2 — `Promise.race` safety: fires `ms + SAFETY_MARGIN_MS` later
 * and rejects unconditionally. This protects callers from the known
 * Windows/undici bug where `abort()` is silently ignored, which would
 * otherwise leave `_refreshing` stuck forever and deadlock the Database
 * tree (see `SchemaCache.FETCH_SAFETY_TIMEOUT_MS` for the same pattern).
 *
 * Both timers are cleaned up in the `finally` block regardless of
 * outcome (success, abort, safety, or external cancellation).
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

  // Layer 1: abort-signal timeout (normal path)
  const abortTimer = setTimeout(() => controller.abort(), ms);

  // Layer 2: unconditional reject if abort is silently ignored (Windows safety)
  let safetyTimer: ReturnType<typeof setTimeout> | undefined;
  const safety = new Promise<never>((_, reject) => {
    safetyTimer = setTimeout(
      () => reject(new Error('Fetch timed out (safety)')),
      ms + SAFETY_MARGIN_MS,
    );
  });

  try {
    // Strip our extra options before passing to native fetch
    const { timeoutMs: _, signal: __, idempotent: ___, ...rest } = init ?? {};
    return await Promise.race([
      fetch(url, { ...rest, signal: controller.signal }),
      safety,
    ]);
  } finally {
    clearTimeout(abortTimer);
    if (safetyTimer !== undefined) clearTimeout(safetyTimer);
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
 * True when an HTTP method is safe to retry (idempotent by HTTP semantics).
 * POST/PATCH are excluded — re-sending them can duplicate a server-side write.
 */
function methodIsIdempotent(method?: string): boolean {
  const m = (method ?? 'GET').toUpperCase();
  return (
    m === 'GET' || m === 'HEAD' || m === 'OPTIONS' || m === 'PUT' || m === 'DELETE'
  );
}

/**
 * Fetch with timeout + a single retry on transient errors.
 * Adds 200ms delay before retry to avoid hammering a recovering server.
 * Non-transient errors (4xx, parse failures) are thrown immediately.
 * Does not retry if the caller's signal was intentionally aborted.
 *
 * Retry is gated on idempotency: a non-idempotent request (POST/PATCH without
 * `idempotent: true`) is NEVER retried, because the first attempt may have
 * reached the server and applied a write before the connection dropped —
 * re-sending would duplicate it (audit M4).
 */
export async function fetchWithRetry(
  url: string,
  init?: FetchWithTimeoutInit,
): Promise<Response> {
  const canRetry = init?.idempotent ?? methodIsIdempotent(init?.method);
  try {
    const resp = await fetchWithTimeout(url, init);
    if (resp.status >= 500) {
      throw new Error(`Server error: ${resp.status}`);
    }
    return resp;
  } catch (err) {
    // Don't retry if the caller intentionally aborted the request.
    if (init?.signal?.aborted) throw err;
    // Don't retry a non-idempotent request — re-sending may duplicate a write.
    if (canRetry && isTransientError(err)) {
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
