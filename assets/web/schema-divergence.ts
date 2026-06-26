/**
 * Pure code-vs-runtime schema diff (Feature 71, divergence view).
 *
 * Compares the host's code-declared Drift schema (`GET /api/schema/declared`,
 * shape `{name, columns:[{name, sqlType, nullable, isPk}]}`) against the live
 * runtime schema (`GET /api/schema/metadata`, shape
 * `{name, columns:[{name, type, notnull, pk}]}`) and reports where they drift:
 * tables/columns present on one side only, and per-column type / nullability /
 * primary-key mismatches.
 *
 * Kept DOM-free and side-effect-free so it can be unit-tested directly (see
 * assets/web/test/schema-divergence.test.mjs); declared-schema.ts renders the
 * findings it returns.
 */

import { vt } from './l10n.ts';

/** A single drift finding between the code and runtime schemas. */
export interface DivergenceFinding {
  /** Table the finding belongs to. */
  table: string;
  /** What kind of drift this is. */
  kind:
    | 'missing-table' // declared in code, absent from the live DB
    | 'extra-table' // present in the live DB, not declared in code
    | 'missing-column' // declared column absent from the live table
    | 'extra-column' // live column not declared in code
    | 'type-mismatch'
    | 'nullable-mismatch'
    | 'pk-mismatch';
  /** Column the finding concerns (omitted for table-level findings). */
  column?: string;
  /** Human-readable explanation, e.g. "code TEXT vs database INTEGER". */
  detail: string;
}

interface DeclaredColumn {
  name: string;
  sqlType?: string;
  nullable?: boolean;
  isPk?: boolean;
}
interface DeclaredTable {
  name: string;
  columns?: DeclaredColumn[];
}
interface RuntimeColumn {
  name: string;
  type?: string;
  notnull?: boolean;
  pk?: boolean;
}
interface RuntimeTable {
  name: string;
  columns?: RuntimeColumn[];
}

/**
 * Normalizes a SQLite column type to its storage affinity so cosmetically
 * different spellings (`INT`/`INTEGER`, `VARCHAR`/`TEXT`) don't read as drift.
 * Follows SQLite's affinity rules (https://sqlite.org/datatype3.html §3.1).
 */
export function typeAffinity(raw: string | undefined): string {
  const t = (raw || '').toUpperCase();
  if (t.length === 0) return 'BLOB'; // no declared type → BLOB affinity
  if (t.includes('INT')) return 'INTEGER';
  if (t.includes('CHAR') || t.includes('CLOB') || t.includes('TEXT')) {
    return 'TEXT';
  }
  if (t.includes('BLOB')) return 'BLOB';
  if (t.includes('REAL') || t.includes('FLOA') || t.includes('DOUB')) {
    return 'REAL';
  }
  return 'NUMERIC';
}

/** True for SQLite-internal tables that no app schema would declare. */
function isInternalTable(name: string): boolean {
  return name.toLowerCase().startsWith('sqlite_');
}

function indexColumns(
  cols: { name: string }[] | undefined,
): Map<string, { name: string }> {
  const m = new Map<string, { name: string }>();
  for (const c of cols || []) {
    if (c && typeof c.name === 'string') m.set(c.name, c);
  }
  return m;
}

/**
 * Diffs declared (code) vs runtime (live) tables and returns every divergence.
 * An empty result means the two schemas agree on every table, column, type,
 * nullability, and primary-key flag this check can see.
 *
 * Internal `sqlite_*` tables are never reported as "extra" — they are engine
 * objects, not app drift.
 */
export function computeSchemaDivergence(
  declared: DeclaredTable[] | undefined,
  runtime: RuntimeTable[] | undefined,
): DivergenceFinding[] {
  const findings: DivergenceFinding[] = [];
  const declaredByName = new Map<string, DeclaredTable>();
  for (const t of declared || []) {
    if (t && typeof t.name === 'string') declaredByName.set(t.name, t);
  }
  const runtimeByName = new Map<string, RuntimeTable>();
  for (const t of runtime || []) {
    if (t && typeof t.name === 'string') runtimeByName.set(t.name, t);
  }

  // Stable, deterministic order: every declared table (sorted), then runtime-
  // only tables (sorted). Keeps the rendered list and the tests order-stable.
  const declaredNames = [...declaredByName.keys()].sort();
  const runtimeOnly = [...runtimeByName.keys()]
    .filter((n) => !declaredByName.has(n) && !isInternalTable(n))
    .sort();

  for (const name of declaredNames) {
    const d = declaredByName.get(name)!;
    const r = runtimeByName.get(name);
    if (!r) {
      findings.push({
        table: name,
        kind: 'missing-table',
        detail: vt('viewer.schema.divergence.missingTable'),
      });
      continue;
    }
    compareColumns(name, d, r, findings);
  }

  for (const name of runtimeOnly) {
    findings.push({
      table: name,
      kind: 'extra-table',
      detail: vt('viewer.schema.divergence.extraTable'),
    });
  }

  return findings;
}

/** Appends column-level findings for a table present on both sides. */
function compareColumns(
  table: string,
  declared: DeclaredTable,
  runtime: RuntimeTable,
  out: DivergenceFinding[],
): void {
  const dCols = declared.columns || [];
  const rCols = indexColumns(runtime.columns) as Map<string, RuntimeColumn>;
  const dColNames = indexColumns(dCols);

  // A single-column INTEGER PRIMARY KEY is a SQLite rowid alias: PRAGMA
  // table_info always reports notnull=0 for it even though it cannot store NULL
  // (https://sqlite.org/lang_createtable.html, "ROWID and INTEGER PRIMARY KEY").
  // Drift's autoIncrement() PK is declared NOT NULL, so the runtime notnull=0
  // would otherwise fire a false nullable-mismatch on every such column. Count
  // declared PK columns once to distinguish this single-column case from a real
  // composite PK (where the notnull quirk does not apply).
  const declaredPkCount = dCols.filter(
    (c) => c && c.isPk === true,
  ).length;

  for (const dc of dCols) {
    if (!dc || typeof dc.name !== 'string') continue;
    const rc = rCols.get(dc.name);
    if (!rc) {
      out.push({
        table,
        column: dc.name,
        kind: 'missing-column',
        detail: vt('viewer.schema.divergence.missingColumn'),
      });
      continue;
    }
    const dAff = typeAffinity(dc.sqlType);
    const rAff = typeAffinity(rc.type);
    if (dAff !== rAff) {
      out.push({
        table,
        column: dc.name,
        kind: 'type-mismatch',
        detail: vt('viewer.schema.divergence.typeMismatch', dAff, rAff),
      });
    }
    // Runtime nullability is the inverse of PRAGMA's NOT NULL flag.
    const dNullable = dc.nullable !== false; // default nullable when unset
    const rNullable = rc.notnull !== true;
    // Suppress the rowid-alias false positive: a single-column INTEGER PK reports
    // runtime notnull=0 (PRAGMA quirk) despite being NOT NULL, so skip the check
    // rather than report drift that does not exist.
    const isRowidPk =
      dc.isPk === true &&
      declaredPkCount === 1 &&
      typeAffinity(dc.sqlType) === 'INTEGER';
    if (!isRowidPk && dNullable !== rNullable) {
      out.push({
        table,
        column: dc.name,
        kind: 'nullable-mismatch',
        detail: vt(
          'viewer.schema.divergence.nullableMismatch',
          vt(dNullable ? 'viewer.schema.divergence.nullable' : 'viewer.schema.divergence.notNull'),
          vt(rNullable ? 'viewer.schema.divergence.nullable' : 'viewer.schema.divergence.notNull'),
        ),
      });
    }
    const dPk = dc.isPk === true;
    const rPk = rc.pk === true;
    if (dPk !== rPk) {
      out.push({
        table,
        column: dc.name,
        kind: 'pk-mismatch',
        detail: vt(
          'viewer.schema.divergence.pkMismatch',
          vt(dPk ? 'viewer.schema.divergence.primaryKey' : 'viewer.schema.divergence.notAKey'),
          vt(rPk ? 'viewer.schema.divergence.primaryKey' : 'viewer.schema.divergence.notAKey'),
        ),
      });
    }
  }

  for (const rc of runtime.columns || []) {
    if (!rc || typeof rc.name !== 'string') continue;
    if (!dColNames.has(rc.name)) {
      out.push({
        table,
        column: rc.name,
        kind: 'extra-column',
        detail: vt('viewer.schema.divergence.extraColumn'),
      });
    }
  }
}
