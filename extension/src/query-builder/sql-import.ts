/**
 * Best-effort import of a flat SQLite-style SELECT into the visual query model.
 *
 * The parsing now lives in the shared, self-contained [query-builder-core-import]
 * module so the extension and the debug web bundle share ONE importer instead of
 * hand-synced copies (Feature 21, Phase 1). This file is the extension's typed
 * adapter: it injects [createTableInstance] as the table factory (preserving the
 * extension's initials aliases and canvas `position`) and returns the strict
 * [IQueryModel] the webview consumes. On any hard error the result carries an
 * empty model, matching the previous contract.
 */
import type { ColumnMetadata, TableMetadata } from '../api-client';
import {
  createEmptyQueryModel,
  createTableInstance,
  type IQueryModel,
} from './query-model';
import type { CoreColumn, CoreModel, CoreTable } from './query-builder-core';
import { importSelectSqlToCoreModel } from './query-builder-core-import';

/** Result of attempting to parse SQL into [IQueryModel]. */
export interface ISqlImportResult {
  model: IQueryModel;
  errors: string[];
  warnings: string[];
}

/**
 * Parse `SELECT …` into a query model using `schema` for column metadata.
 * On hard [errors], [model] is an empty model.
 */
export function importSelectSqlToModel(
  rawSql: string,
  schema: TableMetadata[],
): ISqlImportResult {
  const result = importSelectSqlToCoreModel(rawSql, schema, {
    createEmpty: () => createEmptyQueryModel() as unknown as CoreModel,
    makeTable: (model: CoreModel, baseTable: string, columns: CoreColumn[], forcedAlias: string): CoreTable => {
      // Runtime objects are the extension's real IQueryModel/ColumnMetadata; the
      // core's loose types let one parser serve both surfaces, so cast back here.
      const typedModel = model as unknown as IQueryModel;
      const instance = createTableInstance(
        typedModel,
        baseTable,
        columns as unknown as ColumnMetadata[],
        { forcedAlias },
      );
      typedModel.tables.push(instance);
      return instance as unknown as CoreTable;
    },
  });
  if (!result.model) {
    return { model: createEmptyQueryModel(), errors: result.errors, warnings: result.warnings };
  }
  return {
    model: result.model as unknown as IQueryModel,
    errors: result.errors,
    warnings: result.warnings,
  };
}
