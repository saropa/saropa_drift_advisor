/**
 * HTTP endpoints for data editing and change-detection state. Split out of
 * api-client-http-impl.ts and re-exported from there.
 */
import { fetchWithRetry, fetchWithTimeout } from './transport/fetch-utils';
import type { ApiHeaders } from './api-client-http';

/** Apply validated UPDATE/INSERT/DELETE batch in one server transaction. */
export async function httpApplyEditsBatch(
  baseUrl: string,
  headers: ApiHeaders,
  statements: string[],
): Promise<void> {
  const resp = await fetchWithTimeout(`${baseUrl}/api/edits/apply`, {
    method: 'POST',
    headers: { ...headers, 'Content-Type': 'application/json' },
    body: JSON.stringify({ statements }),
  });
  if (!resp.ok) {
    let detail = `Apply edits failed: ${resp.status}`;
    try {
      const j = (await resp.json()) as {
        error?: string;
        failedIndex?: number;
        failedStatement?: string;
      };
      if (typeof j?.error === 'string' && j.error.length > 0) {
        detail = `${detail} — ${j.error}`;
      }
      if (typeof j?.failedIndex === 'number') {
        detail += ` (failed statement index: ${j.failedIndex})`;
      }
      if (typeof j?.failedStatement === 'string' && j.failedStatement.trim().length > 0) {
        detail += `\nFailed SQL: ${j.failedStatement}`;
      }
    } catch {
      /* Response may be non-JSON. */
    }
    throw new Error(detail);
  }
}

/** Get change detection state. */
export async function httpGetChangeDetection(
  baseUrl: string,
  headers: ApiHeaders,
): Promise<boolean> {
  const resp = await fetchWithRetry(`${baseUrl}/api/change-detection`, {
    headers,
  });
  if (!resp.ok) throw new Error(`Get change detection failed: ${resp.status}`);
  const data = (await resp.json()) as { changeDetection?: boolean };
  return data?.changeDetection !== false;
}

/** Set change detection. */
export async function httpSetChangeDetection(
  baseUrl: string,
  headers: ApiHeaders,
  enabled: boolean,
): Promise<boolean> {
  const resp = await fetchWithRetry(`${baseUrl}/api/change-detection`, {
    method: 'POST',
    headers: { ...headers, 'Content-Type': 'application/json' },
    body: JSON.stringify({ enabled }),
  });
  if (!resp.ok) throw new Error(`Set change detection failed: ${resp.status}`);
  const data = (await resp.json()) as { changeDetection?: boolean };
  return data?.changeDetection !== false;
}
