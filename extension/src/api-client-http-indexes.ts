/**
 * HTTP endpoints for the bulk CREATE INDEX preview/apply flow
 * (`lib/src/server/index_batch_handler.dart`). Split out as its own module
 * because these two endpoints are a distinct domain (DDL batching) from the
 * data-editing endpoints in api-client-http-edits.ts.
 *
 * Bug 001: `driftViewer.createAllIndexes` used to post CREATE INDEX SQL to
 * `POST /api/sql`, which rejects all non-SELECT SQL — every index failed
 * silently. These functions call the endpoints the browser viewer already
 * uses (see bundle.js `/api/indexes/preview` and `/api/indexes/apply`).
 */
import { fetchWithRetry, fetchWithTimeout } from './transport/fetch-utils';
import type { ApiHeaders } from './api-client-http';

/** One rejected statement from a preview/apply call, with the server's reason. */
export interface IIndexRejection {
  index: number;
  sql: string;
  reason: string;
}

/** Response shape of `POST /api/indexes/preview`. */
export interface IIndexPreviewResult {
  valid: string[];
  rejected: IIndexRejection[];
}

/** One per-statement outcome from `POST /api/indexes/apply`. */
export interface IIndexApplyEntry {
  index: number;
  sql: string;
  ok: boolean;
  error?: string;
}

/** Response shape of `POST /api/indexes/apply`. */
export interface IIndexApplyResult {
  results: IIndexApplyEntry[];
  applied: number;
}

/**
 * Validate a batch of CREATE INDEX statements without writing anything.
 * Works on read-only servers (no `writeQuery` required) — preview only runs
 * `SqlValidator.isSingleCreateIndexSql` server-side.
 */
export async function httpIndexPreview(
  baseUrl: string,
  headers: ApiHeaders,
  indexSqls: string[],
): Promise<IIndexPreviewResult> {
  const resp = await fetchWithRetry(`${baseUrl}/api/indexes/preview`, {
    method: 'POST',
    // Preview never writes, so a retried request is harmless (audit M4).
    idempotent: true,
    headers: { ...headers, 'Content-Type': 'application/json' },
    body: JSON.stringify({ indexSqls }),
  });
  if (!resp.ok) {
    // Surface the server's error body (e.g. "server too old", bad JSON) rather
    // than a bare status code, so the user learns why preview failed.
    const detail = await _readErrorDetail(resp);
    throw new Error(`Index preview failed: ${resp.status}${detail}`);
  }
  return resp.json() as Promise<IIndexPreviewResult>;
}

/**
 * Best-effort apply of a batch of CREATE INDEX statements. Requires the host
 * app to have passed `writeQuery` to `DriftDebugServer.start()`; without it
 * the server returns 501 with an explanatory error, which this surfaces
 * rather than swallowing.
 */
export async function httpIndexApply(
  baseUrl: string,
  headers: ApiHeaders,
  indexSqls: string[],
): Promise<IIndexApplyResult> {
  // Not marked idempotent: CREATE INDEX is safe to retry only because of
  // IF NOT EXISTS, which callers are not guaranteed to include — treat apply
  // as a one-shot write like other mutation endpoints.
  const resp = await fetchWithTimeout(`${baseUrl}/api/indexes/apply`, {
    method: 'POST',
    headers: { ...headers, 'Content-Type': 'application/json' },
    body: JSON.stringify({ indexSqls }),
  });
  if (!resp.ok) {
    const detail = await _readErrorDetail(resp);
    throw new Error(`Index apply failed: ${resp.status}${detail}`);
  }
  return resp.json() as Promise<IIndexApplyResult>;
}

/** Best-effort extraction of the `{"error": "..."}` body VS Code errors carry. */
async function _readErrorDetail(resp: Response): Promise<string> {
  try {
    const j = (await resp.json()) as { error?: string };
    if (typeof j?.error === 'string' && j.error.length > 0) {
      return ` — ${j.error}`;
    }
  } catch {
    /* Response may be non-JSON (e.g. a proxy error page); fall back to bare status. */
  }
  return '';
}
