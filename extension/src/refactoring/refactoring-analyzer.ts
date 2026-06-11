/**
 * Heuristic analyzer for schema refactoring suggestions (Feature 66).
 *
 * This class is the orchestrator: it loads schema/FK metadata and runs the
 * detector modules ([refactoring-detectors-schema] for deterministic schema-only
 * passes, [refactoring-detectors-sql] for read-only SQL probes), then filters and
 * ranks the combined output. The detectors themselves and their shared
 * constants/helpers live in sibling modules.
 */

import type { DriftApiClient } from '../api-client';
import type { ForeignKey, TableMetadata } from '../api-types';
import type { IRefactoringSuggestion } from './refactoring-types';
import {
  CONFIDENCE_THRESHOLD,
  MERGE_MAX_TABLES,
} from './refactoring-analyzer-helpers';
import {
  detectExtractGroups,
  detectWideTables,
} from './refactoring-detectors-schema';
import {
  detectDuplicateColumns,
  detectNormalization,
} from './refactoring-detectors-sql';

/**
 * Produces ranked refactoring suggestions for the connected Drift database.
 */
export class RefactoringAnalyzer {
  constructor(private readonly _client: DriftApiClient) {}

  /**
   * Runs detectors over user tables (skips `sqlite_%`), returns sorted suggestions.
   *
   * Per-table SQL failures are swallowed so one broken table does not abort analysis.
   */
  async analyze(): Promise<IRefactoringSuggestion[]> {
    const suggestions: IRefactoringSuggestion[] = [];
    let tables: TableMetadata[] = [];
    try {
      tables = await this._client.schemaMetadata();
    } catch {
      return [];
    }
    const userTables = tables.filter((t) => !t.name.startsWith('sqlite_'));

    const fkCache = new Map<string, ForeignKey[]>();
    const loadFks = async (name: string): Promise<ForeignKey[]> => {
      const hit = fkCache.get(name);
      if (hit) return hit;
      const fks = await this._client.tableFkMeta(name).catch(() => [] as ForeignKey[]);
      fkCache.set(name, fks);
      return fks;
    };

    suggestions.push(...(await detectNormalization(this._client, userTables)));
    suggestions.push(...detectWideTables(userTables));
    suggestions.push(...detectExtractGroups(userTables));

    if (userTables.length <= MERGE_MAX_TABLES) {
      suggestions.push(...(await detectDuplicateColumns(this._client, userTables, loadFks)));
    }

    return suggestions
      .filter((s) => s.confidence > CONFIDENCE_THRESHOLD)
      .sort((a, b) => b.confidence - a.confidence || (a.id < b.id ? -1 : 1));
  }
}
