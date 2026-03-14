/**
 * Orchestrates health scoring: prefetches API data and delegates to metric scorers.
 */

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

export class HealthScorer {
  static readonly WEIGHTS: Record<MetricKey, number> = HEALTH_WEIGHTS;

  async compute(client: DriftApiClient): Promise<IHealthScore> {
    const data = await this._prefetch(client);

    const metrics = await Promise.all([
      scoreIndexCoverage(data, HealthScorer.WEIGHTS.indexCoverage),
      scoreFkIntegrity(data, HealthScorer.WEIGHTS.fkIntegrity),
      scoreNullDensity(data, client, HealthScorer.WEIGHTS.nullDensity),
      scoreQueryPerformance(data, HealthScorer.WEIGHTS.queryPerformance),
      scoreTableBalance(data, HealthScorer.WEIGHTS.tableBalance),
      scoreSchemaQuality(data, HealthScorer.WEIGHTS.schemaQuality),
    ]);

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
    const [tables, suggestions, anomalies, performance, size] = await Promise.all([
      client.schemaMetadata(),
      client.indexSuggestions(),
      client.anomalies(),
      client.performance(),
      client.sizeAnalytics(),
    ]);

    const userTables = tables.filter((t: TableMetadata) => !t.name.startsWith('sqlite_'));

    const fkMap = new Map<string, ForeignKey[]>();
    await Promise.all(userTables.map(async (t: TableMetadata) => {
      fkMap.set(t.name, await client.tableFkMeta(t.name));
    }));

    return { tables, userTables, fkMap, suggestions, anomalies, performance, size };
  }
}

export { toGrade } from './health-utils';
