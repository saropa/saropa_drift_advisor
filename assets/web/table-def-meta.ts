/**
 * Table-definition meta columns + export tools — self-contained module.
 *
 * Adds three icon buttons to the `.table-definition-heading` toolbar rendered
 * by `buildTableDefinitionHtml` (table-view.ts):
 *   1. Toggle meta columns — profiling stats per column (fill rate, nulls,
 *      distinct/uniqueness, min/max, byte size).
 *   2. Copy table definition as JSON.
 *   3. Copy table definition as Flutter (Drift) table class.
 *
 * Profiling stats are computed on demand with a single full-table aggregate
 * query against `/api/sql` (one round trip per table) and cached in
 * `S.tableDefStats`. They are opt-in because that query scans the whole table —
 * too costly to run on every table view automatically.
 *
 * Wiring uses document-level event delegation so it works regardless of when
 * the panel HTML is injected. Heading clicks normally collapse the panel
 * (table-def-toggle.ts); the tool buttons call stopPropagation so a tool click
 * never also collapses the panel.
 *
 * DOM contract (from buildTableDefinitionHtml):
 *   .table-definition-wrap[data-table-name]  — outer container, carries table
 *   .table-def-tool[data-tdm-action]         — the three icon buttons
 */
import * as S from './state.ts';
import { vt } from './l10n.ts';
import { showCopyToast, schemaTableByName, buildTableDefinitionHtml } from './table-view.ts';

/**
 * Quotes a SQL identifier by wrapping in double quotes and doubling any
 * embedded double quote. Guards against column names with spaces/quotes
 * breaking the generated aggregate query.
 */
function quoteIdent(name: string): string {
  return '"' + String(name).replace(/"/g, '""') + '"';
}

/** True for SQLite types that hold binary data — MIN/MAX on them is not meaningful. */
function isBlobLikeType(rawType: string): boolean {
  return /BLOB|BINARY/.test((rawType || '').toUpperCase());
}

/** True for textual SQLite types — only these get an empty-string ("blank") count. */
function isTextLikeType(rawType: string): boolean {
  return /CHAR|TEXT|CLOB|STRING/.test((rawType || '').toUpperCase());
}

/**
 * Builds the per-column profiling SQL for one table and runs it.
 *
 * One aggregate row carries every column's stats, addressed by index-based
 * aliases (c0__nn, c0__d, …) so column names with odd characters never leak
 * into result keys. Returns a map keyed by column name plus `__total__`.
 */
async function buildStatsForTable(tableName: string): Promise<Record<string, any>> {
  const t = schemaTableByName(tableName);
  if (!t || !t.columns || t.columns.length === 0) return {};

  const selects: string[] = ['COUNT(*) AS "__total__"'];
  t.columns.forEach(function (c: any, i: number) {
    const col = quoteIdent(c.name);
    const rawType = c.type != null ? String(c.type) : '';
    // Non-null count and distinct cardinality apply to every column type.
    selects.push('COUNT(' + col + ') AS "c' + i + '__nn"');
    selects.push('COUNT(DISTINCT ' + col + ') AS "c' + i + '__d"');
    // LENGTH() on a BLOB returns its byte count, so total size works for all types.
    selects.push('SUM(LENGTH(' + col + ')) AS "c' + i + '__bytes"');
    // MIN/MAX are only useful for orderable values; binary columns are skipped.
    if (!isBlobLikeType(rawType)) {
      selects.push('MIN(' + col + ') AS "c' + i + '__min"');
      selects.push('MAX(' + col + ') AS "c' + i + '__max"');
    }
    // Empty-string ("blank") count is only meaningful for textual columns.
    if (isTextLikeType(rawType)) {
      selects.push('SUM(CASE WHEN ' + col + " = '' THEN 1 ELSE 0 END) AS \"c" + i + '__blank"');
    }
  });

  const sql = 'SELECT ' + selects.join(', ') + ' FROM ' + quoteIdent(tableName);
  const resp = await fetch('/api/sql', S.authOpts({
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ sql: sql }),
  }));
  const data = await resp.json();
  if (!resp.ok) throw new Error(data && data.error ? data.error : vt('viewer.table.def.statsQueryFailed'));

  const row = (data.rows && data.rows[0]) || {};
  const total = Number(row['__total__']) || 0;
  const out: Record<string, any> = { __total__: total };
  t.columns.forEach(function (c: any, i: number) {
    const nn = Number(row['c' + i + '__nn']) || 0;
    out[c.name] = {
      total: total,
      nonnull: nn,
      nulls: total - nn,
      distinct: Number(row['c' + i + '__d']) || 0,
      bytes: row['c' + i + '__bytes'] != null ? Number(row['c' + i + '__bytes']) : null,
      min: row['c' + i + '__min'] != null ? row['c' + i + '__min'] : null,
      max: row['c' + i + '__max'] != null ? row['c' + i + '__max'] : null,
      blank: row['c' + i + '__blank'] != null ? Number(row['c' + i + '__blank']) : null,
    };
  });
  return out;
}

/** Maps a SQLite column type to a Drift column getter (type + builder call). */
function driftColumnFor(rawType: string): { columnType: string; builder: string } {
  const t = (rawType || '').toUpperCase();
  if (/INT/.test(t)) return { columnType: 'IntColumn', builder: 'integer' };
  if (/BOOL/.test(t)) return { columnType: 'BoolColumn', builder: 'boolean' };
  if (/REAL|FLOA|DOUB|NUMERIC|DECIMAL/.test(t)) return { columnType: 'RealColumn', builder: 'real' };
  if (/BLOB|BINARY/.test(t)) return { columnType: 'BlobColumn', builder: 'blob' };
  if (/DATE|TIME/.test(t)) return { columnType: 'DateTimeColumn', builder: 'dateTime' };
  // CHAR/TEXT/CLOB/STRING and any unknown type default to text — the safest
  // round-trippable Drift column for arbitrary SQLite affinity.
  return { columnType: 'TextColumn', builder: 'text' };
}

/** PascalCase a table/identifier: user_profiles -> UserProfiles. */
function pascalCase(name: string): string {
  return String(name)
    .split(/[^a-zA-Z0-9]+/)
    .filter(Boolean)
    .map(function (p) { return p.charAt(0).toUpperCase() + p.slice(1); })
    .join('') || 'Table';
}

/** camelCase a column name for the Drift getter: created_at -> createdAt. */
function camelCase(name: string): string {
  const pascal = pascalCase(name);
  const camel = pascal.charAt(0).toLowerCase() + pascal.slice(1);
  // A leading digit is illegal in a Dart identifier — prefix with a letter.
  return /^[0-9]/.test(camel) ? 'c' + camel : camel;
}

/**
 * Returns FK metadata for a column from the cached FK map, or null.
 * Mirrors the lookup buildTableDefinitionHtml uses for FK badges.
 */
function fkForColumn(tableName: string, colName: string): any {
  const cachedFks = S.fkMetaCache[tableName] || [];
  for (let i = 0; i < cachedFks.length; i++) {
    if (cachedFks[i].fromColumn === colName) return cachedFks[i];
  }
  return null;
}

/** Builds the JSON representation of a table definition (+ stats when loaded). */
function buildDefinitionJson(tableName: string): string {
  const t = schemaTableByName(tableName);
  if (!t || !t.columns) return '{}';
  const stats = S.tableDefStats[tableName];
  const columns = t.columns.map(function (c: any) {
    const fk = fkForColumn(tableName, c.name);
    const entry: any = {
      name: c.name,
      type: c.type != null ? String(c.type) : '',
      primaryKey: !!c.pk,
      notNull: !!c.notnull,
      foreignKey: fk ? { table: fk.toTable, column: fk.toColumn } : null,
    };
    if (stats && stats[c.name]) entry.stats = stats[c.name];
    return entry;
  });
  const doc: any = { table: tableName, columns: columns };
  if (stats && stats.__total__ != null) doc.rowCount = stats.__total__;
  return JSON.stringify(doc, null, 2);
}

/**
 * Builds a Drift table class from a table definition. A single INTEGER primary
 * key becomes autoIncrement(); any other primary-key shape is declared with an
 * explicit `primaryKey` override so composite keys round-trip correctly.
 */
function buildFlutterDrift(tableName: string): string {
  const t = schemaTableByName(tableName);
  if (!t || !t.columns) return '// No columns for ' + tableName;

  const className = pascalCase(tableName);
  const pkCols = t.columns.filter(function (c: any) { return !!c.pk; });
  const singleIntAutoInc =
    pkCols.length === 1 && /INT/.test(String(pkCols[0].type || '').toUpperCase());

  const lines: string[] = [];
  lines.push('class ' + className + ' extends Table {');
  t.columns.forEach(function (c: any) {
    const drift = driftColumnFor(c.type != null ? String(c.type) : '');
    let chain = drift.builder + '()';
    // The single INTEGER PK uses autoIncrement and is never nullable.
    if (c.pk && singleIntAutoInc) {
      chain = drift.builder + '().autoIncrement()';
    } else if (!c.notnull && !c.pk) {
      // Non-PK columns without NOT NULL are nullable in the source schema.
      chain = drift.builder + '().nullable()';
    }
    lines.push('  ' + drift.columnType + ' get ' + camelCase(c.name) + ' => ' + chain + '();');
  });

  // Composite or non-integer primary keys can't use autoIncrement — declare them
  // explicitly so the generated schema matches the original table.
  if (pkCols.length > 0 && !singleIntAutoInc) {
    const set = pkCols.map(function (c: any) { return camelCase(c.name); }).join(', ');
    lines.push('');
    lines.push('  @override');
    lines.push('  Set<Column> get primaryKey => {' + set + '};');
  }

  lines.push('}');
  return lines.join('\n');
}

/** Copies text to the clipboard and shows a confirmation toast naming the item. */
function copyToClipboard(text: string, toastMessage: string): void {
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(text).then(function () {
      showCopyToast(toastMessage);
    }).catch(function () { /* clipboard denied — silent, matches copyCellValue */ });
  }
}

/**
 * Re-renders one table-definition panel in place (preserving expand state) by
 * regenerating its HTML from buildTableDefinitionHtml. Single source of truth:
 * the meta columns and tool state are rendered by that one function, so toggling
 * meta just rebuilds the panel rather than mutating cells by hand.
 */
function rerenderPanel(wrap: Element, tableName: string, expand: boolean): void {
  const tmp = document.createElement('div');
  tmp.innerHTML = buildTableDefinitionHtml(tableName);
  const fresh = tmp.firstElementChild;
  if (!fresh) return;
  // Turning meta on expands the panel so the new columns are immediately visible.
  if (expand) fresh.classList.remove('td-collapsed');
  wrap.replaceWith(fresh);
}

/** Initialises the table-definition meta/export tools. Call once from index.js. */
export function initTableDefMeta(): void {
  document.addEventListener('click', function (e: Event) {
    const target = e.target as Element;
    const btn = target && target.closest && target.closest('.table-def-tool');
    if (!btn) return;

    // A tool click must never bubble to the heading's collapse handler.
    e.stopPropagation();
    e.preventDefault();

    const wrap = btn.closest('.table-definition-wrap');
    if (!wrap) return;
    const tableName = wrap.getAttribute('data-table-name') || S.currentTableName || '';
    if (!tableName) return;

    const action = btn.getAttribute('data-tdm-action');

    if (action === 'copy-json') {
      copyToClipboard(buildDefinitionJson(tableName), vt('viewer.table.def.copiedJson'));
      return;
    }

    if (action === 'copy-flutter') {
      copyToClipboard(buildFlutterDrift(tableName), vt('viewer.table.def.copiedFlutter'));
      return;
    }

    if (action === 'toggle-meta') {
      const turningOn = !S.tableDefMetaOn;
      if (!turningOn) {
        // Turning meta off: just hide the columns, keep cached stats for next time.
        S.setTableDefMetaOn(false);
        rerenderPanel(wrap, tableName, false);
        return;
      }
      // Turning meta on: ensure stats are loaded (fetch once, then cache).
      S.setTableDefMetaOn(true);
      if (S.tableDefStats[tableName]) {
        rerenderPanel(wrap, tableName, true);
        return;
      }
      // Show a transient busy hint on the button while the query runs.
      btn.classList.add('is-busy');
      buildStatsForTable(tableName).then(function (stats) {
        S.tableDefStats[tableName] = stats;
        // The wrap may have been replaced by a full re-render while the query was
        // in flight — re-find the current panel for this table before rebuilding.
        const live = document.querySelector(
          '.table-definition-wrap[data-table-name="' + cssAttrEscape(tableName) + '"]'
        ) || wrap;
        rerenderPanel(live, tableName, true);
      }).catch(function (err) {
        S.setTableDefMetaOn(false);
        btn.classList.remove('is-busy');
        showCopyToast(vt('viewer.table.def.statsFailed', err && err.message ? err.message : vt('viewer.table.def.errorGeneric')));
      });
    }
  });
}

/** Escapes a value for safe use inside a CSS attribute selector ("..."). */
function cssAttrEscape(v: string): string {
  return String(v).replace(/["\\]/g, '\\$&');
}
