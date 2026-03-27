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
  /** Mapped SQL type (e.g. 'INTEGER'). */
  sqlType: string;
  /** Whether .nullable() was detected in the builder chain. */
  nullable: boolean;
  /** Whether .autoIncrement() was detected. */
  autoIncrement: boolean;
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
  /** Source file URI string. */
  fileUri: string;
  /** Line number of the class declaration (0-based). */
  line: number;
}

/** Map from Drift Dart column type to SQLite type. */
export const DART_TO_SQL_TYPE: Record<string, string> = {
  IntColumn: 'INTEGER',
  TextColumn: 'TEXT',
  BoolColumn: 'INTEGER',
  DateTimeColumn: 'INTEGER',
  RealColumn: 'REAL',
  BlobColumn: 'BLOB',
  Int64Column: 'INTEGER',
};
