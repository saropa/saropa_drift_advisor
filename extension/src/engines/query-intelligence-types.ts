/**
 * Type definitions for QueryIntelligence (pattern analysis and index suggestions).
 * Extracted for modularization (plan: under 300 lines per file).
 */

/** Pattern extracted from SQL queries. */
export interface IQueryPattern {
  pattern: string;
  tables: string[];
  whereColumns: string[];
  joinColumns: string[];
  orderByColumns: string[];
  executionCount: number;
  totalDurationMs: number;
  avgDurationMs: number;
  lastSeen: number;
}

/** Index suggestion based on query patterns. */
export interface IPatternIndexSuggestion {
  table: string;
  column: string;
  reason: string;
  usageCount: number;
  potentialSavingsMs: number;
  sql: string;
}

/** Frequent table join pattern for autocomplete. */
export interface IJoinPattern {
  fromTable: string;
  toTable: string;
  joinClause: string;
  usageCount: number;
}
