/**
 * Pure, DOM-free logic for the Schema explorer (schema-explorer.ts).
 *
 * Kept separate from the rendering module so these functions can be unit-tested
 * without a DOM (the renderer reads document/fetch; this file reads only its
 * arguments). Same split as home-search.ts vs the Home tab wiring.
 */

/**
 * Normalizes a SQL column type to a base keyword for the type filter:
 * "VARCHAR(255)" → "VARCHAR", "integer" → "INTEGER". Empty/unspecified types
 * collapse to '' so they get no dropdown entry.
 */
export function baseType(raw: unknown): string {
  const s = raw == null ? '' : String(raw).trim();
  if (!s) return '';
  // Cut at the first non-letter (length/precision paren or a space, e.g.
  // "UNSIGNED BIG INT") and uppercase so the dropdown groups case variants.
  const m = s.match(/^[A-Za-z_]+/);
  return m ? m[0].toUpperCase() : s.toUpperCase();
}

/** Outgoing FK edges declared on a table (PRAGMA + manifest), as an array. */
export function tableFks(table: any): Array<{ fromColumn: string; toTable: string; toColumn: string }> {
  const fks = (table && table.foreignKeys) || [];
  return Array.isArray(fks) ? fks : [];
}

/** Collects the distinct base column types across all tables, sorted A→Z. */
export function collectTypes(meta: any): string[] {
  const set: Record<string, true> = {};
  const tables = (meta && meta.tables) || [];
  tables.forEach(function (t: any) {
    (t.columns || []).forEach(function (c: any) {
      const bt = baseType(c.type);
      if (bt) set[bt] = true;
    });
  });
  return Object.keys(set).sort();
}

/**
 * Maps each table → the incoming FK references pointing at it (which other
 * tables reference it), from the flattened top-level edge list the metadata
 * loader produces.
 */
export function buildIncomingFkMap(meta: any): Record<string, Array<{ fromTable: string; fromColumn: string }>> {
  const map: Record<string, Array<{ fromTable: string; fromColumn: string }>> = {};
  const edges = (meta && meta.foreignKeys) || [];
  if (Array.isArray(edges)) {
    edges.forEach(function (e: any) {
      if (e && e.toTable && e.fromTable) {
        (map[e.toTable] = map[e.toTable] || []).push({ fromTable: e.fromTable, fromColumn: e.fromColumn });
      }
    });
  }
  return map;
}

/**
 * True when a table passes the active search term and type filter. Search
 * matches the table name OR any column name (substring, case-insensitive);
 * the type filter requires at least one column of the selected base type.
 */
export function tableMatches(table: any, term: string, type: string): boolean {
  if (type) {
    const hasType = (table.columns || []).some(function (c: any) { return baseType(c.type) === type; });
    if (!hasType) return false;
  }
  if (!term) return true;
  const lower = term.toLowerCase();
  if (String(table.name || '').toLowerCase().includes(lower)) return true;
  return (table.columns || []).some(function (c: any) {
    return String(c.name || '').toLowerCase().includes(lower);
  });
}

/**
 * Builds a Markdown document describing every table and column (used by the
 * schema-level "Copy Markdown" button). Pure: takes the metadata, returns text.
 */
export function buildSchemaMarkdown(meta: any): string {
  const tables = (meta && meta.tables) || [];
  const out: string[] = ['# Schema', ''];
  tables.forEach(function (t: any) {
    out.push('## ' + t.name);
    const rc = typeof t.rowCount === 'number' ? t.rowCount.toLocaleString('en-US') : '0';
    out.push('_' + rc + ' rows_', '');
    out.push('| Column | Type | Constraints |');
    out.push('| --- | --- | --- |');
    (t.columns || []).forEach(function (c: any) {
      const cons: string[] = [];
      if (c.pk) cons.push('PK');
      if (c.notnull) cons.push('NOT NULL');
      out.push('| ' + c.name + ' | ' + (c.type || '') + ' | ' + (cons.join(', ') || '—') + ' |');
    });
    tableFks(t).forEach(function (fk) {
      out.push('', '- FK: `' + fk.fromColumn + '` → `' + fk.toTable + '.' + fk.toColumn + '`');
    });
    out.push('');
  });
  return out.join('\n');
}
