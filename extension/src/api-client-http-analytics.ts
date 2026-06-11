/**
 * HTTP endpoints for analytics: index suggestions, anomalies, performance data
 * (read + clear), and size analytics. Split out of api-client-http-impl.ts and
 * re-exported from there.
 */
import type {
  Anomaly,
  IndexSuggestion,
  PerformanceData,
} from './api-types';
import { fetchWithRetry } from './transport/fetch-utils';
import type { ApiHeaders } from './api-client-http';

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
