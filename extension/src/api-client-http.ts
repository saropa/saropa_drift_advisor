/**
 * HTTP implementation of Drift API endpoints.
 * Used by DriftApiClient when VM Service is not connected.
 */

import type {
  Anomaly,
  ForeignKey,
  HealthResponse,
  ICompareReport,
  IDiagramData,
  IMutationStreamResponse,
  MutationEvent,
  IMigrationPreview,
  IndexSuggestion,
  PerformanceData,
  TableMetadata,
} from './api-types';
import { fetchWithRetry, fetchWithTimeout } from './transport/fetch-utils';

export type ApiHeaders = Record<string, string>;

/** Health check. */
export async function httpHealth(
  baseUrl: string,
  headers: ApiHeaders,
): Promise<HealthResponse> {
  const resp = await fetchWithRetry(`${baseUrl}/api/health`, { headers });
  if (!resp.ok) throw new Error(`Health check failed: ${resp.status}`);
  return resp.json() as Promise<HealthResponse>;
}

/** Schema metadata (tables). */
export async function httpSchemaMetadata(
  baseUrl: string,
  headers: ApiHeaders,
): Promise<TableMetadata[]> {
  const resp = await fetchWithRetry(`${baseUrl}/api/schema/metadata`, {
    headers,
  });
  if (!resp.ok) throw new Error(`Schema metadata failed: ${resp.status}`);
  const data = (await resp.json()) as { tables?: TableMetadata[] };
  return Array.isArray(data?.tables) ? data.tables : (data as unknown as TableMetadata[]);
}

/** FK metadata for a table. */
export async function httpTableFkMeta(
  baseUrl: string,
  headers: ApiHeaders,
  tableName: string,
): Promise<ForeignKey[]> {
  const resp = await fetchWithRetry(
    `${baseUrl}/api/table/${encodeURIComponent(tableName)}/fk-meta`,
    { headers },
  );
  if (!resp.ok) throw new Error(`FK metadata failed: ${resp.status}`);
  return resp.json() as Promise<ForeignKey[]>;
}

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
      timeoutMs: 31000, // match server long-poll timeout behavior
    },
  );

  if (!resp.ok) throw new Error(`Mutation poll failed: ${resp.status}`);

  const data = (await resp.json()) as Partial<IMutationStreamResponse> & {
    events?: unknown;
  };
  const events: IMutationStreamResponse['events'] = Array.isArray(
    data.events,
  )
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

/** Run SQL. */
export async function httpSql(
  baseUrl: string,
  headers: ApiHeaders,
  query: string,
): Promise<{ columns: string[]; rows: unknown[][] }> {
  const resp = await fetchWithRetry(`${baseUrl}/api/sql`, {
    method: 'POST',
    headers: { ...headers, 'Content-Type': 'application/json' },
    body: JSON.stringify({ sql: query }),
  });
  if (!resp.ok) throw new Error(`SQL query failed: ${resp.status}`);
  return resp.json() as Promise<{ columns: string[]; rows: unknown[][] }>;
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

/** Schema diagram. */
export async function httpSchemaDiagram(
  baseUrl: string,
  headers: ApiHeaders,
): Promise<IDiagramData> {
  const resp = await fetchWithRetry(`${baseUrl}/api/schema/diagram`, {
    headers,
  });
  if (!resp.ok) throw new Error(`Schema diagram failed: ${resp.status}`);
  return resp.json() as Promise<IDiagramData>;
}

/** Schema dump (DDL). */
export async function httpSchemaDump(
  baseUrl: string,
  headers: ApiHeaders,
): Promise<string> {
  const resp = await fetchWithRetry(`${baseUrl}/api/schema/dump`, {
    headers,
  });
  if (!resp.ok) throw new Error(`Schema dump failed: ${resp.status}`);
  return resp.text();
}

/** Database file download. */
export async function httpDatabaseFile(
  baseUrl: string,
  headers: ApiHeaders,
): Promise<ArrayBuffer> {
  const resp = await fetchWithRetry(`${baseUrl}/api/database`, { headers });
  if (!resp.ok) throw new Error(`Database download failed: ${resp.status}`);
  return resp.arrayBuffer();
}

/** Compare report. */
export async function httpCompareReport(
  baseUrl: string,
  headers: ApiHeaders,
): Promise<ICompareReport> {
  const resp = await fetchWithRetry(`${baseUrl}/api/compare/report`, {
    headers,
  });
  if (!resp.ok) throw new Error(`Compare report failed: ${resp.status}`);
  return resp.json() as Promise<ICompareReport>;
}

/** Migration preview. */
export async function httpMigrationPreview(
  baseUrl: string,
  headers: ApiHeaders,
): Promise<IMigrationPreview> {
  const resp = await fetchWithRetry(`${baseUrl}/api/migration/preview`, {
    headers,
  });
  if (!resp.ok) throw new Error(`Migration preview failed: ${resp.status}`);
  return resp.json() as Promise<IMigrationPreview>;
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
