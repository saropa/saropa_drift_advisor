/**
 * HTTP endpoints for schema, health, and database-level operations.
 * Extracted from api-client-http-impl to keep files under the line cap.
 */
import type {
  ForeignKey,
  HealthResponse,
  ICompareReport,
  IDiagramData,
  IMigrationPreview,
  TableMetadata,
} from './api-types';
import { fetchWithRetry } from './transport/fetch-utils';
import type { ApiHeaders } from './api-client-http';

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
  options?: { includeForeignKeys?: boolean },
): Promise<TableMetadata[]> {
  const q =
    options?.includeForeignKeys === true ? '?includeForeignKeys=1' : '';
  const resp = await fetchWithRetry(`${baseUrl}/api/schema/metadata${q}`, {
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
