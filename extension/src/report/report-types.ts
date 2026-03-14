import type { Anomaly, ColumnMetadata } from '../api-types';

/** Configuration for report generation, sourced from settings + QuickPick. */
export interface IReportConfig {
  /** Table names selected by the user. */
  tables: string[];
  /** Maximum rows to fetch per table. */
  maxRows: number;
  /** Whether to include CREATE TABLE SQL. */
  includeSchema: boolean;
  /** Whether to include anomaly data. */
  includeAnomalies: boolean;
}

/** A single table's data for the report. */
export interface IReportTable {
  name: string;
  columns: ColumnMetadata[];
  /** Row data as column-keyed objects. */
  rows: Record<string, unknown>[];
  /** Actual total row count in the database. */
  totalRowCount: number;
  /** True when totalRowCount > rows.length (i.e. maxRows was hit). */
  truncated: boolean;
}

/** Schema SQL for a single table. */
export interface IReportSchema {
  table: string;
  sql: string;
}

/** Complete collected data for building the report HTML. */
export interface IReportData {
  generatedAt: string;
  serverUrl: string;
  tables: IReportTable[];
  schema?: IReportSchema[];
  anomalies?: Anomaly[];
}
