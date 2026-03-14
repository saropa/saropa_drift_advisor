import type { DriftApiClient } from '../api-client';
import { q, zipRow } from '../shared-utils';
import type {
  IReportConfig, IReportData, IReportSchema, IReportTable,
} from './report-types';

/** Collects database data for the portable report. */
export class ReportCollector {
  constructor(private readonly _client: DriftApiClient) {}

  /** Gather all data according to the given config. */
  async collect(config: IReportConfig): Promise<IReportData> {
    const meta = await this._client.schemaMetadata();
    const tables: IReportTable[] = [];

    for (const tableName of config.tables) {
      const tableMeta = meta.find((t) => t.name === tableName);
      const result = await this._client.sql(
        `SELECT * FROM ${q(tableName)} LIMIT ${config.maxRows}`,
      );
      const rows = result.rows.map((r) =>
        zipRow(result.columns, r as unknown[]),
      );
      const totalRowCount = tableMeta?.rowCount ?? rows.length;

      tables.push({
        name: tableName,
        columns: tableMeta?.columns ?? [],
        rows,
        totalRowCount,
        truncated: totalRowCount > rows.length,
      });
    }

    let schema: IReportSchema[] | undefined;
    if (config.includeSchema) {
      schema = await this._collectSchema(config.tables);
    }

    const anomalies = config.includeAnomalies
      ? await this._client.anomalies()
      : undefined;

    return {
      generatedAt: new Date().toISOString(),
      serverUrl: this._client.baseUrl,
      tables,
      schema,
      anomalies,
    };
  }

  /** Parse the full schema dump and extract statements for selected tables. */
  private async _collectSchema(
    tableNames: string[],
  ): Promise<IReportSchema[]> {
    const dump = await this._client.schemaDump();
    return parseSchemaStatements(dump, tableNames);
  }
}

/** Extract individual CREATE TABLE statements from a full SQL dump. */
export function parseSchemaStatements(
  dump: string, tableNames: string[],
): IReportSchema[] {
  const results: IReportSchema[] = [];
  const nameSet = new Set(tableNames);
  const stmts = dump.split(/(?=CREATE\s+TABLE)/i);
  for (const stmt of stmts) {
    const trimmed = stmt.trim();
    if (!trimmed) continue;
    const match = trimmed.match(
      /CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?(?:"([^"]+)"|(\w+))/i,
    );
    if (match) {
      const name = match[1] ?? match[2];
      if (nameSet.has(name)) {
        results.push({ table: name, sql: trimmed });
      }
    }
  }
  return results;
}
