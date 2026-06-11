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
  // includeForeignKeys=1 adds a per-table `foreignKeys` list so the NL
  // relationship engine can offer / build EXISTS predicates across tables.
  var r = await fetch('/api/schema/metadata?includeForeignKeys=1', S.authOpts());
  if (!r.ok) throw new Error('Failed to load schema metadata (HTTP ' + r.status + ')');
  var meta = await r.json();
  // Flatten the per-table foreignKeys (PRAGMA shape omits fromTable) into a
  // single top-level edge list {fromTable, fromColumn, toTable, toColumn} so
  // the converter can walk children/parents uniformly.
  if (meta && Array.isArray(meta.tables) && !Array.isArray(meta.foreignKeys)) {
    var edges: any[] = [];
    for (var i = 0; i < meta.tables.length; i++) {
      var t = meta.tables[i];
      var fks = t && t.foreignKeys;
      if (Array.isArray(fks)) {
        for (var j = 0; j < fks.length; j++) {
          var fk = fks[j];
          if (fk && fk.toTable && fk.fromColumn && fk.toColumn) {
            edges.push({ fromTable: t.name, fromColumn: fk.fromColumn, toTable: fk.toTable, toColumn: fk.toColumn });
          }
        }
      }
    }
    meta.foreignKeys = edges;
  }
  S.setSchemaMeta(meta);
  return S.schemaMeta;
}
