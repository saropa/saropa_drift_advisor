/**
 * HTTP endpoints for queries, mutations, analytics, and editing operations.
 * Schema/health/database endpoints live in api-client-http-schema.ts.
 */
import type {
  Anomaly,
  IDvrQueriesPage,
  IDvrStatus,
  IRecordedQueryV1,
  IMutationStreamResponse,
  IndexSuggestion,
  MutationEvent,
  PerformanceData,
} from './api-types';
import {
  parseDvrEnvelope,
  parseDvrQueriesPageData,
  parseDvrStatusData,
  parseRecordedQueryV1,
  tryParseDvrQueryNotAvailable,
} from './dvr/dvr-client';
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

/** Index suggestions. */
export async function httpIndexSuggestions(
  baseUrl: string,
  headers: ApiHeaders,
): Promise<IndexSuggestion[]> {
  const resp = await fetchWithRetry(`${baseUrl}/api/index-suggestions`, {
    headers,
  });
  if (!resp.ok) throw new Error(`Index suggestions failed: ${resp.status}`);
  const data = (await resp.json()) as { suggestions?: IndexSuggestion[] } | IndexSuggestion[];
  if (Array.isArray(data)) return data;
  return Array.isArray(data?.suggestions) ? data.suggestions : [];
}

/** Anomalies. */
export async function httpAnomalies(
  baseUrl: string,
  headers: ApiHeaders,
): Promise<Anomaly[]> {
  const resp = await fetchWithRetry(`${baseUrl}/api/analytics/anomalies`, {
    headers,
  });
  if (!resp.ok) throw new Error(`Anomaly scan failed: ${resp.status}`);
  const data = (await resp.json()) as { anomalies?: Anomaly[] } | Anomaly[];
  if (Array.isArray(data)) return data;
  return Array.isArray(data.anomalies) ? data.anomalies : [];
}

/** Performance data. */
export async function httpPerformance(
  baseUrl: string,
  headers: ApiHeaders,
): Promise<PerformanceData> {
  const resp = await fetchWithRetry(`${baseUrl}/api/analytics/performance`, {
    headers,
  });
  if (!resp.ok) throw new Error(`Performance query failed: ${resp.status}`);
  return resp.json() as Promise<PerformanceData>;
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

/** Clear performance data. */
export async function httpClearPerformance(
  baseUrl: string,
  headers: ApiHeaders,
): Promise<void> {
  const resp = await fetchWithRetry(`${baseUrl}/api/analytics/performance`, {
    method: 'DELETE',
    headers,
  });
  if (!resp.ok) throw new Error(`Clear performance failed: ${resp.status}`);
}

/** Size analytics. */
export async function httpSizeAnalytics(
  baseUrl: string,
  headers: ApiHeaders,
): Promise<import('./api-types').ISizeAnalytics> {
  const resp = await fetchWithRetry(`${baseUrl}/api/analytics/size`, {
    headers,
  });
  if (!resp.ok) throw new Error(`Size analytics failed: ${resp.status}`);
  return resp.json() as Promise<import('./api-types').ISizeAnalytics>;
}

/** DVR status from `/api/dvr/status`. */
export async function httpDvrStatus(
  baseUrl: string,
  headers: ApiHeaders,
): Promise<IDvrStatus> {
  const resp = await fetchWithRetry(`${baseUrl}/api/dvr/status`, { headers });
  if (!resp.ok) throw new Error(`DVR status failed: ${resp.status}`);
  const envelope = parseDvrEnvelope<unknown>(await resp.json(), 'DVR status');
  return parseDvrStatusData(envelope.data);
}

/** Starts DVR recording via `/api/dvr/start`. */
export async function httpDvrStart(
  baseUrl: string,
  headers: ApiHeaders,
): Promise<IDvrStatus> {
  const resp = await fetchWithRetry(`${baseUrl}/api/dvr/start`, {
    method: 'POST',
    headers,
  });
  if (!resp.ok) throw new Error(`DVR start failed: ${resp.status}`);
  const envelope = parseDvrEnvelope<{
    recording: boolean;
    sessionId: string;
  }>(await resp.json(), 'DVR start');
  return {
    recording: envelope.data.recording,
    sessionId: envelope.data.sessionId,
    queryCount: 0,
    minAvailableId: null,
    maxAvailableId: null,
  };
}

/** Stops DVR recording via `/api/dvr/stop`. */
export async function httpDvrStop(
  baseUrl: string,
  headers: ApiHeaders,
): Promise<IDvrStatus> {
  const resp = await fetchWithRetry(`${baseUrl}/api/dvr/stop`, {
    method: 'POST',
    headers,
  });
  if (!resp.ok) throw new Error(`DVR stop failed: ${resp.status}`);
  const envelope = parseDvrEnvelope<{
    recording: boolean;
    sessionId: string;
  }>(await resp.json(), 'DVR stop');
  return {
    recording: envelope.data.recording,
    sessionId: envelope.data.sessionId,
    queryCount: 0,
    minAvailableId: null,
    maxAvailableId: null,
  };
}

/** Pauses DVR recording via `/api/dvr/pause`. */
export async function httpDvrPause(
  baseUrl: string,
  headers: ApiHeaders,
): Promise<IDvrStatus> {
  const resp = await fetchWithRetry(`${baseUrl}/api/dvr/pause`, {
    method: 'POST',
    headers,
  });
  if (!resp.ok) throw new Error(`DVR pause failed: ${resp.status}`);
  const envelope = parseDvrEnvelope<{
    recording: boolean;
    sessionId: string;
  }>(await resp.json(), 'DVR pause');
  return {
    recording: envelope.data.recording,
    sessionId: envelope.data.sessionId,
    queryCount: 0,
    minAvailableId: null,
    maxAvailableId: null,
  };
}

/** Cursor page from `/api/dvr/queries`. */
export async function httpDvrQueries(
  baseUrl: string,
  headers: ApiHeaders,
  options?: {
    cursor?: number;
    limit?: number;
    direction?: 'forward' | 'backward';
  },
): Promise<IDvrQueriesPage> {
  const params = new URLSearchParams();
  if (typeof options?.cursor === 'number') params.set('cursor', String(options.cursor));
  if (typeof options?.limit === 'number') params.set('limit', String(options.limit));
  if (options?.direction) params.set('direction', options.direction);
  const query = params.toString();
  const resp = await fetchWithRetry(
    `${baseUrl}/api/dvr/queries${query ? `?${query}` : ''}`,
    { headers },
  );
  if (!resp.ok) throw new Error(`DVR queries failed: ${resp.status}`);
  const envelope = parseDvrEnvelope<unknown>(await resp.json(), 'DVR queries');
  return parseDvrQueriesPageData(envelope.data);
}

/** POST `/api/dvr/config` — updates recorder buffer options. */
export async function httpDvrConfig(
  baseUrl: string,
  headers: ApiHeaders,
  body: { maxQueries?: number; captureBeforeAfter?: boolean },
): Promise<{ maxQueries: number; captureBeforeAfter: boolean; queryCount: number; sessionId: string }> {
  const resp = await fetchWithRetry(`${baseUrl}/api/dvr/config`, {
    method: 'POST',
    headers: { ...headers, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!resp.ok) throw new Error(`DVR config failed: ${resp.status}`);
  const envelope = parseDvrEnvelope<{
    maxQueries: number;
    captureBeforeAfter: boolean;
    queryCount: number;
    sessionId: string;
  }>(await resp.json(), 'DVR config');
  return envelope.data;
}

/** Single query from `/api/dvr/query/:sessionId/:id`. */
export async function httpDvrQuery(
  baseUrl: string,
  headers: ApiHeaders,
  sessionId: string,
  id: number,
): Promise<IRecordedQueryV1> {
  const resp = await fetchWithRetry(`${baseUrl}/api/dvr/query/${encodeURIComponent(sessionId)}/${id}`, {
    headers,
  });
  const raw = await resp.json();
  if (!resp.ok) {
    const notAvail = tryParseDvrQueryNotAvailable(raw, sessionId, id);
    if (notAvail) {
      throw notAvail;
    }
    throw new Error(`DVR query fetch failed: ${resp.status}`);
  }
  const envelope = parseDvrEnvelope<unknown>(raw, 'DVR query');
  return parseRecordedQueryV1(envelope.data);
}
