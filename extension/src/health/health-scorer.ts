/**
 * Orchestrates health scoring: prefetches API data and delegates to metric scorers.
 */

import type * as vscode from 'vscode';
import type { DriftApiClient } from '../api-client';
import type { ForeignKey, TableMetadata } from '../api-types';
import type { IHealthScore, MetricKey } from './health-types';
import {
  generateRecommendations,
  HEALTH_WEIGHTS,
  PrefetchedData,
  scoreFkIntegrity,
  scoreIndexCoverage,
  scoreNullDensity,
  scoreQueryPerformance,
  scoreSchemaQuality,
  scoreTableBalance,
} from './health-metrics';
import { toGrade } from './health-utils';
import { mergeRefactoringAdvisorIntoMetrics } from './health-refactoring-merge';

export class HealthScorer {
  static readonly WEIGHTS: Record<MetricKey, number> = HEALTH_WEIGHTS;

  /**
   * Computes the full health score. When [workspaceState] is provided, any
   * persisted refactoring-advisor session is merged into schema-quality details
   * so recommendations reflect recent dismiss/analysis activity.
   */
  async compute(
    client: DriftApiClient,
    workspaceState?: vscode.Memento,
  ): Promise<IHealthScore> {
    const data = await this._prefetch(client);

    const metrics = await Promise.all([
      scoreIndexCoverage(data, HealthScorer.WEIGHTS.indexCoverage),
      scoreFkIntegrity(data, HealthScorer.WEIGHTS.fkIntegrity),
      scoreNullDensity(data, client, HealthScorer.WEIGHTS.nullDensity),
      scoreQueryPerformance(data, HealthScorer.WEIGHTS.queryPerformance),
      scoreTableBalance(data, HealthScorer.WEIGHTS.tableBalance),
      scoreSchemaQuality(data, HealthScorer.WEIGHTS.schemaQuality),
    ]);

    mergeRefactoringAdvisorIntoMetrics(metrics, workspaceState);

    const overall = metrics.reduce((sum, m) => sum + m.score * m.weight, 0);
    const recommendations = generateRecommendations(metrics);

    return {
      overall: Math.round(overall),
      grade: toGrade(overall),
      metrics,
      recommendations,
    };
  }

  /** Fetch all shared API data once, including FK metadata per table. */
  private async _prefetch(client: DriftApiClient): Promise<PrefetchedData> {
    // Schema + performance can run together; index suggestions, anomaly scan,
    // and size analytics each walk every table on SQLite — running them
    // concurrently hogs the single-writer lock. Run those three sequentially.
    const [tables, performance] = await Promise.all([
      client.schemaMetadata({ includeForeignKeys: true }),
      client.performance(),
    ]);

    const suggestions = await client.indexSuggestions();
    const anomalies = await client.anomalies();
    const size = await client.sizeAnalytics();

    const userTables = tables.filter((t: TableMetadata) => !t.name.startsWith('sqlite_'));

    const fkMap = new Map<string, ForeignKey[]>();
    for (const t of userTables) {
      const embedded = t.foreignKeys;
      const fks =
        embedded !== undefined
          ? embedded
          : await client.tableFkMeta(t.name);
      fkMap.set(t.name, fks);
    }

    return { tables, userTables, fkMap, suggestions, anomalies, performance, size };
  }
}

export { toGrade } from './health-utils';
