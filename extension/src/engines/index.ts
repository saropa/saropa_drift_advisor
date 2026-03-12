/**
 * Shared intelligence engines for feature integration.
 *
 * These services provide centralized caching and derived insights
 * that multiple features can consume.
 */

export { SchemaIntelligence } from './schema-intelligence';
export type {
  IColumnInsight, ISchemaIndex, ISchemaInsights, ITableInsight,
} from './schema-intelligence';

export { QueryIntelligence } from './query-intelligence';
export type {
  IJoinPattern, IPatternIndexSuggestion, IQueryPattern,
} from './query-intelligence';

export { RelationshipEngine } from './relationship-engine';
export type {
  IAffectedTable, IDeletePlan, IRelationshipChain, IRelationshipNode,
} from './relationship-engine';
