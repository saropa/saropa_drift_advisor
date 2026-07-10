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
import { objectRowsToColumnar } from '../shared-utils';

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
  options?: { includeForeignKeys?: boolean },
): Promise<TableMetadata[]> {
  const params: Record<string, string> = {};
  if (options?.includeForeignKeys === true) {
    params.includeForeignKeys = 'true';
  }
  const raw = await request(`${EXT_PREFIX}getSchemaMetadata`, params);
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
  opts?: {
    internal?: boolean;
    args?: unknown[];
    namedArgs?: Record<string, unknown>;
  },
): Promise<{ columns: string[]; rows: unknown[][] }> {
  // VM service params are flat strings — serialize `internal` as "1" only
  // when set so older servers that don't know the flag just ignore it.
  // (Matches how httpSql omits the key in the default case.)
  const params: Record<string, string> = { sql };
  if (opts?.internal === true) params.internal = '1';
  if (opts?.args != null && opts.args.length > 0) {
    params.args = JSON.stringify(opts.args);
  }
  if (opts?.namedArgs != null) {
    const nk = Object.keys(opts.namedArgs);
    if (nk.length > 0) {
      params.namedArgs = JSON.stringify(opts.namedArgs);
    }
  }
  const raw = await request(`${EXT_PREFIX}runSql`, params);
  const obj = parseJson<{ error?: string; rows?: unknown[] }>(raw);
  if (obj?.error) throw new Error(String(obj.error));
  const rows = obj?.rows;
  if (!Array.isArray(rows)) {
    throw new Error('Invalid runSql response');
  }
  // The server returns object-rows ({col: value}); every result consumer in
  // the extension (notebook renderer, zipRow, CSV/JSON export) expects
  // positional array-rows aligned to `columns`. Deriving columns but leaving
  // the rows as objects made the notebook index them numerically — row[0] on
  // an object is undefined, so every cell rendered the literal "undefined"
  // (GitHub issue #32). Convert here so the {columns, rows[][]} contract holds.
  return objectRowsToColumnar(rows);
}

/**
 * Runs POST /api/edits/apply–equivalent batch via VM extension RPC.
 */
export async function apiApplyEditsBatch(
  request: ExtensionRequest,
  statements: string[],
): Promise<{ ok: boolean; count: number }> {
  const raw = await request(`${EXT_PREFIX}applyEditsBatch`, {
    statements: JSON.stringify(statements),
  });
  const obj = parseJson<{ error?: string; ok?: boolean; count?: number }>(raw);
  if (obj?.error) {
    throw new Error(String(obj.error));
  }
  if (obj?.ok !== true || typeof obj.count !== 'number') {
    throw new Error('Invalid applyEditsBatch response');
  }
  return { ok: true, count: obj.count };
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

/**
 * Global monitoring kill-switch state over VM transport. Both RPCs stay
 * reachable while the server is killed — setMonitoring is the resume path,
 * and on a VM-only connection (no reachable HTTP port) it is the ONLY way
 * to engage or release the switch.
 */
export async function apiGetMonitoring(
  request: ExtensionRequest,
): Promise<boolean> {
  const raw = await request(`${EXT_PREFIX}getMonitoring`, {});
  const obj = parseJson<{ monitoringEnabled?: boolean }>(raw);
  return obj?.monitoringEnabled !== false;
}

/** Flip the global monitoring kill switch over VM transport. */
export async function apiSetMonitoring(
  request: ExtensionRequest,
  enabled: boolean,
): Promise<boolean> {
  const raw = await request(`${EXT_PREFIX}setMonitoring`, {
    enabled: String(enabled),
  });
  const obj = parseJson<{ monitoringEnabled?: boolean }>(raw);
  return obj?.monitoringEnabled !== false;
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
