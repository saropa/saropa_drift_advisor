import type { DriftApiClient } from '../api-client';
import type { IFkContext } from '../data-management/dataset-types';
import { DependencySorter } from '../data-management/dependency-sorter';
import { DataGenerator } from './data-generator';
import type { ITableSeederConfig, ITableSeedResult } from './seeder-types';

/** Orchestrates FK-aware seed data generation. */
export class SeedOrchestrator {
  private readonly _sorter = new DependencySorter();

  constructor(private readonly _client: DriftApiClient) {}

  /**
   * Generate seed data for all tables in FK-safe order.
   * Returns results in insertion order (parents first).
   */
  async generate(
    configs: ITableSeederConfig[],
  ): Promise<ITableSeedResult[]> {
    const fks = await this._collectFks(configs);
    const tableNames = configs.map((c) => c.table);
    const insertOrder = this._sorter.sortForInsert(tableNames, fks);
    const configMap = new Map(configs.map((c) => [c.table, c]));
    const generator = new DataGenerator();

    const results: ITableSeedResult[] = [];
    for (const table of insertOrder) {
      const config = configMap.get(table);
      if (!config) continue;
      await this._ensureParentPks(generator, config);
      const result = this._generateTable(generator, config);
      this._registerPks(generator, config, result.rows);
      results.push(result);
    }

    return results;
  }

  /**
   * Execute generated seed data via batch import per table.
   * Returns total rows inserted.
   */
  async execute(results: ITableSeedResult[]): Promise<number> {
    let total = 0;
    for (const { table, rows } of results) {
      if (rows.length === 0) continue;
      await this._client.importData(
        'json', table, JSON.stringify(rows),
      );
      total += rows.length;
    }
    return total;
  }

  /** Returns tables with circular FK dependencies (if any). */
  circularTables(
    configs: ITableSeederConfig[],
    fks: IFkContext[],
  ): string[] {
    const tables = configs.map((c) => c.table);
    if (!this._sorter.hasCircularDeps(tables, fks)) return [];
    const sorted = this._sorter.sortForInsert(tables, fks);
    return tables.filter((t) => !sorted.includes(t));
  }

  private async _collectFks(
    configs: ITableSeederConfig[],
  ): Promise<IFkContext[]> {
    const fks: IFkContext[] = [];
    for (const config of configs) {
      const tableFks = await this._client.tableFkMeta(config.table);
      for (const fk of tableFks) {
        fks.push({ fromTable: config.table, toTable: fk.toTable });
      }
    }
    return fks;
  }

  /**
   * If a parent table is not being seeded, query existing PKs from DB
   * so child FK columns can reference them.
   */
  private async _ensureParentPks(
    generator: DataGenerator,
    config: ITableSeederConfig,
  ): Promise<void> {
    for (const col of config.columns) {
      if (col.generator !== 'fk_reference') continue;
      const parentTable = col.params.toTable as string;
      if (generator.getParentPks(parentTable).length > 0) continue;

      const parentCol = col.params.toColumn as string;
      const result = await this._client.sql(
        `SELECT "${parentCol}" FROM "${parentTable}" LIMIT 1000`,
      );
      const pks = result.rows.map((r) => (r as unknown[])[0]);
      if (pks.length > 0) {
        generator.registerPks(parentTable, pks);
      }
    }
  }

  private _generateTable(
    generator: DataGenerator,
    config: ITableSeederConfig,
  ): ITableSeedResult {
    const rows: Record<string, unknown>[] = [];
    for (let i = 0; i < config.rowCount; i++) {
      rows.push(generator.generateRow(config.table, config.columns));
    }
    return { table: config.table, rows };
  }

  private _registerPks(
    generator: DataGenerator,
    config: ITableSeederConfig,
    rows: Record<string, unknown>[],
  ): void {
    const pkCol = config.columns.find((c) => c.isPk);
    if (!pkCol) return;
    const pks = rows.map((r) => r[pkCol.column]);
    generator.registerPks(config.table, pks);
  }
}
