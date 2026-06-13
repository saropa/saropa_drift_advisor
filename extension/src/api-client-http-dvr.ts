/**
 * HTTP endpoints for the Drift Query Recorder (DVR): status, start/stop/pause,
 * cursor-paged query listing, config, and single-query fetch. Split out of
 * api-client-http-impl.ts and re-exported from there.
 */
import type {
  IDvrQueriesPage,
  IDvrStatus,
  IRecordedQueryV1,
} from './api-types';
import {
  parseDvrEnvelope,
  parseDvrQueriesPageData,
  parseDvrStatusData,
  parseRecordedQueryV1,
  tryParseDvrQueryNotAvailable,
} from './dvr/dvr-client';
import { fetchWithRetry } from './transport/fetch-utils';
import type { ApiHeaders } from './api-client-http';

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
    // Stopping an already-stopped recorder is a no-op; safe to retry (audit M4).
    idempotent: true,
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
    // Pausing an already-paused recorder is a no-op; safe to retry (audit M4).
    idempotent: true,
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
    // Setting recorder options to fixed values is idempotent (audit M4).
    idempotent: true,
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
