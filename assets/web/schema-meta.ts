/**
 * Shared schema-metadata loader.
 *
 * Fetches `/api/schema/metadata` once and caches the result in shared
 * state. Extracted from app.js so that every module can import it
 * directly instead of relying on a global `declare`.
 */
import * as S from './state.ts';

/**
 * Returns the cached schema metadata, fetching it from the debug
 * server on first call. The result is stored in `S.schemaMeta` so
 * subsequent calls are free.
 */
export async function loadSchemaMeta(): Promise<any> {
  if (S.schemaMeta) return S.schemaMeta;
  var r = await fetch('/api/schema/metadata', S.authOpts());
  if (!r.ok) throw new Error('Failed to load schema metadata (HTTP ' + r.status + ')');
  S.setSchemaMeta(await r.json());
  return S.schemaMeta;
}
