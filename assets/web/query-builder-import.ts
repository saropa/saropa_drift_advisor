/**
 * SQL → visual graph import for the debug web viewer (Feature 21).
 *
 * Thin adapter over the shared, self-contained [query-builder-core-import] parser
 * (in the extension tree, bundled into the web build by esbuild). It injects a
 * web table factory (`tN` aliases, no canvas position) and returns the
 * [WebQbModel] consumed by query-builder-multi.ts, so a pasted `SELECT`
 * reconstructs the multi-table visual graph and re-renders identical SQL through
 * the shared renderer. The extension and web now share ONE importer instead of
 * hand-synced copies.
 *
 * Supported subset (enforced by the core): quoted/bare identifiers, AS aliases,
 * INNER/LEFT/RIGHT JOIN … ON equality (incl. self-joins), WHERE with
 * =,!=,<,>,<=,>=,LIKE,IN,IS [NOT] NULL, GROUP BY, ORDER BY, LIMIT. WITH/CTE,
 * UNION, and subqueries surface as errors rather than a wrong graph.
 */
import type { WebQbModel, WebQbTable } from './query-builder-multi.ts';
import type { CoreColumn, CoreModel, CoreTable } from '../../extension/src/query-builder/query-builder-core.ts';
import { importSelectSqlToCoreModel } from '../../extension/src/query-builder/query-builder-core-import.ts';

/** Schema table shape from `/api/schema/metadata` (see schema-meta.ts). */
interface SchemaTable {
  name: string;
  columns?: Array<{ name: string; type?: string; pk?: boolean }>;
}

/** Outcome of attempting to import SQL into a [WebQbModel]. */
export interface WebSqlImportResult {
  /** Built model, or null when [errors] is non-empty. */
  model: WebQbModel | null;
  errors: string[];
  warnings: string[];
}

function makeId(prefix: string): string {
  return `${prefix}_${Math.random().toString(36).slice(2, 10)}`;
}

/** Unique alias: prefer the SQL alias when free, else a fresh `tN`. */
function pickAlias(used: Set<string>, forced: string, count: number): string {
  if (forced && !used.has(forced)) return forced;
  let idx = count;
  let alias = `t${idx}`;
  while (used.has(alias)) {
    idx++;
    alias = `t${idx}`;
  }
  return alias;
}

/**
 * Parse a flat `SELECT …` into a [WebQbModel]. Returns `{ model: null, errors }`
 * on any hard failure so the caller keeps the existing builder state instead of
 * loading a partial graph.
 */
export function importSelectSqlToWebModel(
  rawSql: string,
  schemaTables: SchemaTable[],
): WebSqlImportResult {
  const result = importSelectSqlToCoreModel(rawSql, schemaTables, {
    createEmpty: (): CoreModel => ({
      modelVersion: 1,
      tables: [],
      joins: [],
      selectedColumns: [],
      filters: [],
      groupBy: [],
      orderBy: [],
      limit: 200,
    }),
    makeTable: (model: CoreModel, baseTable: string, columns: CoreColumn[], forcedAlias: string): CoreTable => {
      const used = new Set(model.tables.map((t) => t.alias));
      const inst: WebQbTable = {
        id: makeId('tb'),
        baseTable,
        alias: pickAlias(used, forcedAlias, model.tables.length),
        columns: columns.map((c) => ({ name: c.name, type: c.type, pk: c.pk })),
      };
      model.tables.push(inst);
      return inst;
    },
  });
  return {
    model: (result.model as unknown as WebQbModel | null) ?? null,
    errors: result.errors,
    warnings: result.warnings,
  };
}
