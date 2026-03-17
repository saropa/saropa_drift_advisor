/**
 * ext.saropa.drift.* VM Service extension method wrappers.
 * Parses JSON responses and validates shapes. Used by VmServiceClient.
 */

import type {
  Anomaly,
  ForeignKey,
  HealthResponse,
  IndexSuggestion,
  PerformanceData,
  TableMetadata,
} from '../api-types';

export const EXT_PREFIX = 'ext.saropa.drift.';

export type ExtensionRequest = (
  method: string,
  params: Record<string, string>,
) => Promise<unknown>;

function parseJson<T>(raw: unknown): T {
  const obj = typeof raw === 'string' ? JSON.parse(raw) : raw;
  return obj as T;
}

export async function apiGetHealth(
  request: ExtensionRequest,
): Promise<HealthResponse> {
  const raw = await request(`${EXT_PREFIX}getHealth`, {});
  return parseJson<HealthResponse>(raw);
}

export async function apiGetSchemaMetadata(
  request: ExtensionRequest,
): Promise<TableMetadata[]> {
  const raw = await request(`${EXT_PREFIX}getSchemaMetadata`, {});
  const obj = parseJson<{ tables?: TableMetadata[] }>(raw);
  if (!Array.isArray(obj.tables)) {
    throw new Error('Invalid getSchemaMetadata response');
  }
  return obj.tables;
}

export async function apiGetTableFkMeta(
  request: ExtensionRequest,
  tableName: string,
): Promise<ForeignKey[]> {
  const raw = await request(`${EXT_PREFIX}getTableFkMeta`, { tableName });
  const arr = parseJson<unknown>(raw);
  if (!Array.isArray(arr)) {
    throw new Error('Invalid getTableFkMeta response');
  }
  return arr as ForeignKey[];
}

export async function apiRunSql(
  request: ExtensionRequest,
  sql: string,
): Promise<{ columns: string[]; rows: unknown[][] }> {
  const raw = await request(`${EXT_PREFIX}runSql`, { sql });
  const obj = parseJson<{ error?: string; rows?: unknown[][] }>(raw);
  if (obj?.error) throw new Error(String(obj.error));
  const rows = obj?.rows as unknown[][];
  if (!Array.isArray(rows)) {
    throw new Error('Invalid runSql response');
  }
  const columns =
    rows.length > 0 && typeof rows[0] === 'object' && rows[0] !== null
      ? (Object.keys(rows[0] as object) as string[])
      : [];
  return { columns, rows };
}

export async function apiGetGeneration(
  request: ExtensionRequest,
): Promise<number> {
  const raw = await request(`${EXT_PREFIX}getGeneration`, {});
  const obj = parseJson<{ generation?: number }>(raw);
  if (typeof obj?.generation !== 'number') {
    throw new Error('Invalid getGeneration response');
  }
  return obj.generation;
}

export async function apiGetPerformance(
  request: ExtensionRequest,
): Promise<PerformanceData> {
  const raw = await request(`${EXT_PREFIX}getPerformance`, {});
  return parseJson<PerformanceData>(raw);
}

export async function apiClearPerformance(
  request: ExtensionRequest,
): Promise<void> {
  await request(`${EXT_PREFIX}clearPerformance`, {});
}

export async function apiGetAnomalies(
  request: ExtensionRequest,
): Promise<{ anomalies: Anomaly[] }> {
  const raw = await request(`${EXT_PREFIX}getAnomalies`, {});
  const obj = parseJson<{ anomalies?: Anomaly[] }>(raw);
  if (!Array.isArray(obj?.anomalies)) {
    throw new Error('Invalid getAnomalies response');
  }
  return { anomalies: obj.anomalies };
}

export async function apiExplainSql(
  request: ExtensionRequest,
  sql: string,
): Promise<{ rows: Record<string, unknown>[]; sql: string }> {
  const raw = await request(`${EXT_PREFIX}explainSql`, { sql });
  const obj = parseJson<{ error?: string; rows?: unknown[]; sql?: string }>(raw);
  if (obj?.error) throw new Error(String(obj.error));
  if (!Array.isArray(obj?.rows) || typeof obj?.sql !== 'string') {
    throw new Error('Invalid explainSql response');
  }
  return { rows: obj.rows as Record<string, unknown>[], sql: obj.sql };
}

export async function apiGetIndexSuggestions(
  request: ExtensionRequest,
): Promise<IndexSuggestion[]> {
  const raw = await request(`${EXT_PREFIX}getIndexSuggestions`, {});
  const arr = parseJson<unknown>(raw);
  if (!Array.isArray(arr)) {
    throw new Error('Invalid getIndexSuggestions response');
  }
  return arr as IndexSuggestion[];
}

export async function apiGetChangeDetection(
  request: ExtensionRequest,
): Promise<boolean> {
  const raw = await request(`${EXT_PREFIX}getChangeDetection`, {});
  const obj = parseJson<{ changeDetection?: boolean }>(raw);
  return obj?.changeDetection !== false;
}

export async function apiSetChangeDetection(
  request: ExtensionRequest,
  enabled: boolean,
): Promise<boolean> {
  const raw = await request(`${EXT_PREFIX}setChangeDetection`, {
    enabled: String(enabled),
  });
  const obj = parseJson<{ changeDetection?: boolean }>(raw);
  return obj?.changeDetection !== false;
}
