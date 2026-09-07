/** Parsed `Index()` / `UniqueIndex()` entry from a Drift table class. */
export interface IDartIndexDef {
  /** First string argument (SQLite index name). */
  name: string;
  /** Column getter names from `columns: [...]`. */
  columns: string[];
  /** True when declared with `UniqueIndex`. */
  unique: boolean;
}

/** A column parsed from a Drift table class. */
export interface IDartColumn {
  /** Dart getter name (camelCase). */
  dartName: string;
  /** SQL column name (snake_case, or from .named() override). */
  sqlName: string;
  /** Dart column type (e.g. 'IntColumn'). */
  dartType: string;
  /**
   * Static default SQL type from DART_TO_SQL_TYPE (e.g. 'INTEGER').
   * For DateTimeColumn this is always 'INTEGER' regardless of build.yaml's
   * `store_date_time_values_as_text` — the parser runs before the build
   * config is read. Consumers that need the config-aware type MUST call
   * {@link dartToSqlType} at check time instead of reading this field.
   */
  sqlType: string;
  /** Whether .nullable() was detected in the builder chain. */
  nullable: boolean;
  /** Whether .autoIncrement() was detected. */
  autoIncrement: boolean;
  /**
   * Whether a column-level default was declared (`.withDefault(...)` or
   * `.clientDefault(...)`). A defaulted column is null-by-design at the row
   * level — the value is supplied by the default, not by every insert — so the
   * data-quality null-rate rules treat it as expected-NULL and do not flag it.
   * Optional so existing test fixtures and non-parser constructors of this type
   * need not be touched; the Dart parser always populates it.
   */
  hasDefault?: boolean;
  /**
   * Whether `.named('...')` was used in the builder chain to explicitly set
   * the SQL column name. When true, the SQL name is an intentional override
   * and should NOT be flagged by getter-table-mismatch — `.named()` IS the
   * declaration of intentional Dart↔SQL name divergence. Optional so existing
   * test fixtures and non-parser constructors need not be touched; the Dart
   * parser always populates it.
   */
  hasNamedOverride?: boolean;
  /** Line number in the source file (0-based). */
  line: number;
}

/** A table class parsed from Dart source. */
export interface IDartTable {
  /** Dart class name (PascalCase). */
  dartClassName: string;
  /** SQL table name (snake_case, or from tableName getter override). */
  sqlTableName: string;
  /** Parsed columns. */
  columns: IDartColumn[];
  /** Non-unique and unique indexes from `List<Index> get indexes`. */
  indexes: IDartIndexDef[];
  /** Composite unique constraints from `List<Set<Column>> get uniqueKeys`. */
  uniqueKeys: string[][];
  /**
   * Dart getter names (camelCase) declared by a `@override Set<Column> get
   * primaryKey => {...}` override — Drift's idiom for a natural or composite
   * primary key. `undefined` when the table has no such override (the
   * common case: `autoIncrement()` is the primary-key signal instead).
   * Consumers must map these to SQL column names via `columns` before use —
   * kept as Dart names here for the same reason `IDartIndexDef.columns` and
   * `uniqueKeys` are (bug 010: a keyless `CREATE TABLE` was silently
   * generated because this field didn't exist and `autoIncrement` was the
   * only primary-key signal available downstream).
   */
  primaryKey?: string[];
  /** Source file URI string. */
  fileUri: string;
  /** Line number of the class declaration (0-based). */
  line: number;
}

/**
 * Map from Drift Dart column type to SQLite type.
 * DateTimeColumn defaults to INTEGER but can be TEXT when
 * `store_date_time_values_as_text` is enabled in build.yaml.
 * Use {@link dartToSqlType} for DateTimeColumn-aware lookups.
 */
export const DART_TO_SQL_TYPE: Record<string, string> = {
  IntColumn: 'INTEGER',
  TextColumn: 'TEXT',
  BoolColumn: 'INTEGER',
  DateTimeColumn: 'INTEGER',
  RealColumn: 'REAL',
  BlobColumn: 'BLOB',
  Int64Column: 'INTEGER',
};

/**
 * Resolve the SQLite type for a Drift Dart column type, accounting for
 * the `store_date_time_values_as_text` build option. When the option is
 * true, DateTimeColumn maps to TEXT (ISO-8601) instead of INTEGER (Unix
 * epoch). When `dateTimeAsText` is undefined (build.yaml absent or
 * unparseable), returns undefined for DateTimeColumn so the caller can
 * accept either type — a suppressed true positive beats one permanent
 * false positive per datetime column.
 */
export function dartToSqlType(
  dartType: string,
  dateTimeAsText: boolean | undefined,
): string | undefined {
  if (dartType === 'DateTimeColumn') {
    // undefined = build.yaml absent/unparseable — accept either type upstream
    if (dateTimeAsText === undefined) return undefined;
    // Explicit setting: TEXT when enabled, INTEGER when disabled
    return dateTimeAsText ? 'TEXT' : 'INTEGER';
  }
  return DART_TO_SQL_TYPE[dartType];
}
