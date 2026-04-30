// ---- Existing types (re-exported by api-client.ts) ----

export interface TableMetadata {
  name: string;
  columns: ColumnMetadata[];
  rowCount: number;
  /** Present when requested via `includeForeignKeys` on schema metadata. */
  foreignKeys?: ForeignKey[];
}

export interface ColumnMetadata {
  name: string;
  type: string; // INTEGER, TEXT, REAL, BLOB
  pk: boolean;
  notnull?: boolean;
}

export interface ForeignKey {
  fromColumn: string;
  toTable: string;
  toColumn: string;
}

export interface HealthResponse {
  ok: boolean;
  extensionConnected?: boolean;
  /** Present when server supports browser writes (writeQuery configured). */
  writeEnabled?: boolean;
}

export interface IndexSuggestion {
  table: string;
  column: string;
  reason: string;
  sql: string;
  priority: 'high' | 'medium' | 'low';
}

export interface Anomaly {
  message: string;
  severity: 'error' | 'warning' | 'info';
}

export interface QueryEntry {
  sql: string;
  durationMs: number;
  rowCount: number;
  at: string;
  /** Source file that issued this query (resolved from Dart stack trace). */
  callerFile?: string;
  /** Source line number that issued this query. */
  callerLine?: number;
  /** True when the query was issued by the extension itself (e.g.
   *  change-detection probes), not by the user's application code. */
  isInternal?: boolean;
}

export interface PerformanceData {
  totalQueries: number;
  totalDurationMs: number;
  avgDurationMs: number;
  slowQueries: QueryEntry[];
  recentQueries: QueryEntry[];
}

// ---- Schema diagram (GET /api/schema/diagram) ----

export interface IDiagramTable {
  name: string;
  columns: { name: string; type: string; pk: number }[];
}

export interface IDiagramForeignKey {
  fromTable: string;
  fromColumn: string;
  toTable: string;
  toColumn: string;
}

export interface IDiagramData {
  tables: IDiagramTable[];
  foreignKeys: IDiagramForeignKey[];
}

// ---- Database comparison (GET /api/compare/report) ----

export interface ITableCountDiff {
  table: string;
  countA: number;
  countB: number;
  diff: number;
  onlyInA: boolean;
  onlyInB: boolean;
}

export interface ICompareReport {
  schemaSame: boolean;
  schemaDiff: { a: string; b: string } | null;
  tablesOnlyInA: string[];
  tablesOnlyInB: string[];
  tableCounts: ITableCountDiff[];
  generatedAt: string;
}

// ---- Migration preview (GET /api/migration/preview) ----

export interface IMigrationPreview {
  migrationSql: string;
  changeCount: number;
  hasWarnings: boolean;
  generatedAt: string;
}

// ---- Size analytics (GET /api/analytics/size) ----

export interface ITableSizeInfo {
  table: string;
  rowCount: number;
  columnCount: number;
  indexCount: number;
  indexes: string[];
}

export interface ISizeAnalytics {
  pageSize: number;
  pageCount: number;
  totalSizeBytes: number;
  freeSpaceBytes: number;
  usedSizeBytes: number;
  journalMode: string;
  tableCount: number;
  tables: ITableSizeInfo[];
}

// ---- Data import (POST /api/import) ----

export interface IImportResult {
  imported: number;
  errors: string[];
  format: string;
  table: string;
}

// ---- Real-time mutation stream (GET /api/mutations) ----
export type MutationType = 'insert' | 'update' | 'delete';

export interface MutationEvent {
  id: number;
  type: MutationType;
  table: string;
  before: Record<string, unknown>[] | null;
  after: Record<string, unknown>[] | null;
  sql: string;
  timestamp: string;
}

export interface IMutationStreamResponse {
  events: MutationEvent[];
  cursor: number;
}

// ---- Sessions (POST /api/session/*) ----

export interface IAnnotation {
  text: string;
  author: string;
  at: string;
}

export interface ISessionShareResult {
  id: string;
  url: string;
  expiresAt: string;
}

export interface ISessionData {
  state: Record<string, unknown>;
  createdAt: string;
  expiresAt: string;
  annotations: IAnnotation[];
}

// ---- Query Replay DVR (GET/POST /api/dvr/*) ----

/** Shared versioned response envelope for DVR endpoints. */
export interface IDvrEnvelope<T> {
  schemaVersion: number;
  generatedAt: string;
  data: T;
  error?: string;
  message?: string;
}

/** Stable query event shape for the DVR timeline. */
export interface IRecordedQueryV1 {
  sessionId: string;
  id: number;
  sequence: number;
  sql: string;
  params: {
    positional: unknown[];
    named: Record<string, unknown>;
  };
  type: 'select' | 'insert' | 'update' | 'delete' | 'other';
  timestamp: string;
  durationMs: number;
  affectedRowCount: number;
  resultRowCount: number;
  table: string | null;
  beforeState: Array<Record<string, unknown>> | null;
  afterState: Array<Record<string, unknown>> | null;
  meta?: Record<string, unknown>;
}

/** Recorder status payload from `/api/dvr/status`. */
export interface IDvrStatus {
  recording: boolean;
  queryCount: number;
  sessionId: string;
  minAvailableId: number | null;
  maxAvailableId: number | null;
  /** Ring buffer capacity when the server includes it (DVR v1). */
  maxQueries?: number;
  /** Whether write snapshots are captured (server-dependent). */
  captureBeforeAfter?: boolean;
}

/** Paginated query listing payload from `/api/dvr/queries`. */
export interface IDvrQueriesPage {
  queries: IRecordedQueryV1[];
  total: number;
  sessionId: string;
  minAvailableId: number | null;
  maxAvailableId: number | null;
  nextCursor: number | null;
  prevCursor: number | null;
}
