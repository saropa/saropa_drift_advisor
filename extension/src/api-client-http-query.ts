/**
 * HTTP endpoints for query/generation/mutation traffic and SQL execution.
 * Split out of api-client-http-impl.ts; re-exported from there so callers
 * import from a single module.
 */
import type {
  IMutationStreamResponse,
  MutationEvent,
} from './api-types';
import { fetchWithRetry, fetchWithTimeout } from './transport/fetch-utils';
import type { ApiHeaders } from './api-client-http';

/** Generation poll. */
export async function httpGeneration(
  baseUrl: string,
  headers: ApiHeaders,
  since: number,
): Promise<number> {
  const resp = await fetchWithTimeout(
    `${baseUrl}/api/generation?since=${since}`,
    { headers },
  );
  if (!resp.ok) throw new Error(`Generation poll failed: ${resp.status}`);
  const data = (await resp.json()) as { generation: number };
  return data.generation;
}

/** Mutation stream (long-poll). */
export async function httpMutations(
  baseUrl: string,
  headers: ApiHeaders,
  since: number,
): Promise<IMutationStreamResponse> {
  const resp = await fetchWithTimeout(
    `${baseUrl}/api/mutations?since=${since}`,
    {
      headers,
      timeoutMs: 31000,
    },
  );
  if (!resp.ok) throw new Error(`Mutation poll failed: ${resp.status}`);
  const data = (await resp.json()) as Partial<IMutationStreamResponse> & {
    events?: unknown;
  };
  const events: IMutationStreamResponse['events'] = Array.isArray(data.events)
    ? (data.events as unknown[]).filter((e): e is MutationEvent => {
      return (
        typeof e === 'object' &&
        e !== null &&
        'id' in e &&
        'type' in e &&
        'table' in e &&
        'sql' in e &&
        'timestamp' in e
      );
    })
    : [];
  const cursor = typeof data.cursor === 'number' ? data.cursor : since;
  return { events, cursor };
}

/**
 * Run SQL.
 *
 * When `opts.internal` is true, the request body carries `internal: true`
 * so the server tags the timing record as extension-owned. Omitting the
 * option (the normal case) preserves the existing wire format — the
 * server still records the query as `isInternal: false`.
 */
export async function httpSql(
  baseUrl: string,
  headers: ApiHeaders,
  query: string,
  opts?: {
    internal?: boolean;
    args?: unknown[];
    namedArgs?: Record<string, unknown>;
  },
): Promise<{ columns: string[]; rows: unknown[][] }> {
  // Only emit the `internal` key when explicitly set. Older servers
  // that predate this flag simply ignore unknown keys, and avoiding
  // the key when false keeps the wire payload identical to v3.3.3.
  const body: Record<string, unknown> = { sql: query };
  if (opts?.internal === true) body.internal = true;
  if (opts?.args != null && opts.args.length > 0) {
    body.args = opts.args;
  }
  if (opts?.namedArgs != null && Object.keys(opts.namedArgs).length > 0) {
    body.namedArgs = opts.namedArgs;
  }
  const resp = await fetchWithRetry(`${baseUrl}/api/sql`, {
    method: 'POST',
    headers: { ...headers, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!resp.ok) throw new Error(`SQL query failed: ${resp.status}`);
  return resp.json() as Promise<{ columns: string[]; rows: unknown[][] }>;
}

/** Explain SQL. */
export async function httpExplainSql(
  baseUrl: string,
  headers: ApiHeaders,
  query: string,
): Promise<{ rows: Record<string, unknown>[]; sql: string }> {
  const resp = await fetchWithRetry(`${baseUrl}/api/sql/explain`, {
    method: 'POST',
    headers: { ...headers, 'Content-Type': 'application/json' },
    body: JSON.stringify({ sql: query }),
  });
  if (!resp.ok) throw new Error(`Explain failed: ${resp.status}`);
  return resp.json() as Promise<{
    rows: Record<string, unknown>[];
    sql: string;
  }>;
}
