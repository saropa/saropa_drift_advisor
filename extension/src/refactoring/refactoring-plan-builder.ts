/**
 * Builds multi-step migration plans (SQL + Dart snippets) for refactoring
 * suggestions. Output is advisory: callers must review before applying.
 *
 * This file is the dispatcher: [MigrationPlanBuilder.buildFor] routes on the
 * suggestion type to the per-type plan functions in
 * [refactoring-plans-normalize-split] and [refactoring-plans-merge-extract].
 * The public per-type methods remain on the class as thin delegators so existing
 * call sites and tests are unchanged. Naming/quoting/code-gen helpers live in
 * [refactoring-plan-naming].
 */

import type { TableMetadata } from '../api-types';
import type { IRefactoringSuggestion, IMigrationPlan } from './refactoring-types';
import {
  buildNormalizationPlan,
  buildSplitPlan,
} from './refactoring-plans-normalize-split';
import {
  buildExtractPlan,
  buildMergePlan,
} from './refactoring-plans-merge-extract';

// Re-exported for existing importers (e.g. tests) that pull the naming helper
// from this module rather than reaching into refactoring-plan-naming.
export { pascalCaseFromSqlTable, camelCaseFromSqlColumn } from './refactoring-plan-naming';

/**
 * Generates [IMigrationPlan] payloads for a suggestion using live schema metadata.
 */
export class MigrationPlanBuilder {
  /**
   * Dispatches on [IRefactoringSuggestion.type] and returns an empty advisory plan
   * when metadata is insufficient (e.g. composite primary keys for split templates).
   */
  buildFor(suggestion: IRefactoringSuggestion, tablesMeta: TableMetadata[]): IMigrationPlan {
    switch (suggestion.type) {
      case 'normalize':
        if (suggestion.tables[0] && suggestion.columns[0]) {
          return this.buildNormalizationPlan(suggestion.tables[0], suggestion.columns[0]);
        }
        break;
      case 'split':
        if (suggestion.tables[0]) {
          return this.buildSplitPlan(suggestion.tables[0], tablesMeta);
        }
        break;
      case 'merge':
        if (suggestion.tables[0] && suggestion.tables[1] && suggestion.columns[0]) {
          return this.buildMergePlan(
            suggestion.tables[0],
            suggestion.tables[1],
            suggestion.columns[0],
            tablesMeta,
          );
        }
        break;
      case 'extract':
        if (suggestion.columns.length > 0 && suggestion.tables.length > 0) {
          return this.buildExtractPlan(suggestion.columns, suggestion.tables, tablesMeta);
        }
        break;
      default:
        break;
    }
    return {
      steps: [],
      dartCode: '',
      driftTableClass: '',
      preflightWarnings: ['Unable to build a migration plan for this suggestion (missing metadata).'],
    };
  }

  buildNormalizationPlan(table: string, column: string): IMigrationPlan {
    return buildNormalizationPlan(table, column);
  }

  buildSplitPlan(tableName: string, tablesMeta: TableMetadata[]): IMigrationPlan {
    return buildSplitPlan(tableName, tablesMeta);
  }

  buildMergePlan(
    fromTable: string,
    toTable: string,
    column: string,
    tablesMeta: TableMetadata[],
  ): IMigrationPlan {
    return buildMergePlan(fromTable, toTable, column, tablesMeta);
  }

  buildExtractPlan(
    columns: string[],
    sourceTables: string[],
    tablesMeta: TableMetadata[],
  ): IMigrationPlan {
    return buildExtractPlan(columns, sourceTables, tablesMeta);
  }
}
