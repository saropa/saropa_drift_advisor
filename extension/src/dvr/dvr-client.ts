/**
 * DVR HTTP response parsing: versioned envelopes, legacy field mapping, and
 * structured errors for missing ring-buffer entries.
 */

import type { IDvrEnvelope, IDvrQueriesPage, IDvrStatus, IRecordedQueryV1 } from '../api-types';

/** Thrown when GET `/api/dvr/query/...` returns 404 QUERY_NOT_AVAILABLE. */
export class DvrQueryNotAvailableError extends Error {
  readonly code = 'QUERY_NOT_AVAILABLE' as const;

  constructor(
    message: string,
    readonly details: {
      sessionId: string;
      requestedId: number;
      minAvailableId: number | null;
      maxAvailableId: number | null;
    },
  ) {
    super(message);
    this.name = 'DvrQueryNotAvailableError';
  }
}

function asRecord(v: unknown): Record<string, unknown> | null {
  return v !== null && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
}

/**
 * Parses a DVR envelope and rejects unknown major schema versions.
 */
export function parseDvrEnvelope<T>(raw: unknown, context: string): IDvrEnvelope<T> {
  const root = asRecord(raw);
  if (root === null) {
    throw new Error(`${context}: expected JSON object`);
  }
  const sv = root.schemaVersion;
  if (typeof sv !== 'number' || sv !== 1) {
    throw new Error(`${context}: unsupported schemaVersion (got ${String(sv)})`);
  }
  if (!('data' in root)) {
    throw new Error(`${context}: missing data`);
  }
  return root as unknown as IDvrEnvelope<T>;
}

/**
 * Normalizes a single recorded query from JSON, tolerating a legacy `rowCount` field.
 */
export function parseRecordedQueryV1(row: unknown): IRecordedQueryV1 {
  const o = asRecord(row);
  if (o === null) {
    throw new Error('Recorded query: expected object');
  }
  const rawSid = o.sessionId;
  const sessionId =
    typeof rawSid === 'string' && rawSid.length > 0
      ? rawSid
      : 'legacy-session';
  const id = typeof o.id === 'number' ? o.id : Number(o.id);
  const sequence = typeof o.sequence === 'number' ? o.sequence : Number(o.sequence);
  if (!Number.isFinite(id) || !Number.isFinite(sequence)) {
    throw new Error('Recorded query: invalid id/sequence');
  }
  const sql = typeof o.sql === 'string' ? o.sql : '';
  const type = o.type;
  if (
    type !== 'select' &&
    type !== 'insert' &&
    type !== 'update' &&
    type !== 'delete' &&
    type !== 'other'
  ) {
    throw new Error(`Recorded query: invalid type ${String(type)}`);
  }
  const timestamp = typeof o.timestamp === 'string' ? o.timestamp : '';
  const durationMs = typeof o.durationMs === 'number' ? o.durationMs : Number(o.durationMs);
  let affectedRowCount =
    typeof o.affectedRowCount === 'number' ? o.affectedRowCount : Number(o.affectedRowCount ?? 0);
  let resultRowCount =
    typeof o.resultRowCount === 'number' ? o.resultRowCount : Number(o.resultRowCount ?? 0);
  const legacyRow = o.rowCount;
  if (typeof legacyRow === 'number' && Number.isFinite(legacyRow)) {
    if (type === 'select') {
      resultRowCount = legacyRow;
    } else {
      affectedRowCount = legacyRow;
    }
  }
  const table = o.table === null || typeof o.table === 'string' ? (o.table as string | null) : null;
  const paramsRaw = o.params;
  let params: { positional: unknown[]; named: Record<string, unknown> };
  if (paramsRaw !== null && typeof paramsRaw === 'object' && !Array.isArray(paramsRaw)) {
    const pr = paramsRaw as Record<string, unknown>;
    const pos = Array.isArray(pr.positional) ? pr.positional : [];
    const named =
      pr.named !== null && typeof pr.named === 'object' && !Array.isArray(pr.named)
        ? (pr.named as Record<string, unknown>)
        : {};
    params = { positional: pos, named };
  } else {
    params = { positional: [], named: {} };
  }
  const beforeState = Array.isArray(o.beforeState)
    ? (o.beforeState as Array<Record<string, unknown>>)
    : o.beforeState === null
      ? null
      : null;
  const afterState = Array.isArray(o.afterState)
    ? (o.afterState as Array<Record<string, unknown>>)
    : o.afterState === null
      ? null
      : null;
  const meta =
    o.meta !== null && typeof o.meta === 'object' && !Array.isArray(o.meta)
      ? (o.meta as Record<string, unknown>)
      : undefined;
  return {
    sessionId,
    id,
    sequence,
    sql,
    params,
    type,
    timestamp,
    durationMs,
    affectedRowCount,
    resultRowCount,
    table,
    beforeState,
    afterState,
    meta,
  };
}

/**
 * Parses `/api/dvr/queries` envelope `data` into a typed page.
 */
export function parseDvrQueriesPageData(data: unknown): IDvrQueriesPage {
  const o = asRecord(data);
  if (o === null) {
    throw new Error('DVR queries page: expected object');
  }
  const queriesRaw = o.queries;
  const queries = Array.isArray(queriesRaw)
    ? queriesRaw.map((q) => parseRecordedQueryV1(q))
    : [];
  return {
    queries,
    total: typeof o.total === 'number' ? o.total : Number(o.total ?? 0),
    sessionId: typeof o.sessionId === 'string' ? o.sessionId : '',
    minAvailableId: o.minAvailableId === null || typeof o.minAvailableId === 'number' ? (o.minAvailableId as number | null) : null,
    maxAvailableId: o.maxAvailableId === null || typeof o.maxAvailableId === 'number' ? (o.maxAvailableId as number | null) : null,
    nextCursor: o.nextCursor === null || typeof o.nextCursor === 'number' ? (o.nextCursor as number | null) : null,
    prevCursor: o.prevCursor === null || typeof o.prevCursor === 'number' ? (o.prevCursor as number | null) : null,
  };
}

/**
 * Parses `/api/dvr/status` envelope `data`.
 */
export function parseDvrStatusData(data: unknown): IDvrStatus {
  const o = asRecord(data);
  if (o === null) {
    throw new Error('DVR status: expected object');
  }
  return {
    recording: Boolean(o.recording),
    queryCount: typeof o.queryCount === 'number' ? o.queryCount : Number(o.queryCount ?? 0),
    sessionId: typeof o.sessionId === 'string' ? o.sessionId : '',
    minAvailableId: o.minAvailableId === null || typeof o.minAvailableId === 'number' ? (o.minAvailableId as number | null) : null,
    maxAvailableId: o.maxAvailableId === null || typeof o.maxAvailableId === 'number' ? (o.maxAvailableId as number | null) : null,
    maxQueries: typeof o.maxQueries === 'number' ? o.maxQueries : undefined,
    captureBeforeAfter: typeof o.captureBeforeAfter === 'boolean' ? o.captureBeforeAfter : undefined,
  };
}

/**
 * Parses a 404 DVR query response body; returns a structured error or null.
 */
export function tryParseDvrQueryNotAvailable(
  raw: unknown,
  sessionId: string,
  requestedId: number,
): DvrQueryNotAvailableError | null {
  const root = asRecord(raw);
  if (root === null || root.error !== 'QUERY_NOT_AVAILABLE') {
    return null;
  }
  const data = asRecord(root.data);
  const minAvailableId =
    data && (data.minAvailableId === null || typeof data.minAvailableId === 'number')
      ? (data.minAvailableId as number | null)
      : null;
  const maxAvailableId =
    data && (data.maxAvailableId === null || typeof data.maxAvailableId === 'number')
      ? (data.maxAvailableId as number | null)
      : null;
  const msg = typeof root.message === 'string' ? root.message : 'Query not available';
  return new DvrQueryNotAvailableError(msg, {
    sessionId,
    requestedId,
    minAvailableId,
    maxAvailableId,
  });
}
