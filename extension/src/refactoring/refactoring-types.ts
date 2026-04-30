/**
 * Shared types for the Drift Refactoring Engine (Feature 66).
 *
 * Suggestions are advisory only: the extension never executes generated SQL
 * against the user's database. Plans are meant for review and copy/paste.
 */

/** Categories of schema refactorings detected by the analyzer. */
export type RefactoringType = 'normalize' | 'split' | 'merge' | 'extract';

/** Expected effect on read/write queries after applying the suggestion. */
export type QueryComplexityHint = 'simpler' | 'same' | 'more-complex';

/** Heuristic severity for triage in the webview list. */
export type RefactoringSeverity = 'low' | 'medium' | 'high';

/** Rough migration risk for operator awareness (not a security rating). */
export type MigrationRisk = 'low' | 'medium' | 'high';

/** Structured impact hints shown next to each suggestion. */
export interface IRefactoringImpact {
  /** Optional byte estimate when meaningful (often unknown for v1). */
  spaceSaved?: number;
  integrityImproved: boolean;
  queryComplexity: QueryComplexityHint;
}

/** Top repeated values for preview (optional; may be omitted on large tables). */
export interface ITopValue {
  value: string;
  count: number;
}

/**
 * One refactoring opportunity derived from schema + sampled data.
 *
 * `id` is stable for the lifetime of an analysis run so the webview can
 * dismiss or request plans without index drift when filtering.
 */
export interface IRefactoringSuggestion {
  id: string;
  type: RefactoringType;
  title: string;
  description: string;
  tables: string[];
  columns: string[];
  evidence: string[];
  topValues?: ITopValue[];
  severity: RefactoringSeverity;
  impact: IRefactoringImpact;
  estimatedMigrationRisk: MigrationRisk;
  /** Model confidence in [0, 1]; suggestions below the analyzer threshold are dropped. */
  confidence: number;
}

/** A single step in a generated migration plan. */
export interface IMigrationStep {
  title: string;
  description: string;
  sql: string;
  reversible: boolean;
  /** True for lossy or version-sensitive operations (e.g. DROP COLUMN on old SQLite). */
  destructive?: boolean;
}

/**
 * Generated artifacts for a suggestion.
 *
 * `preflightWarnings` are shown in the panel before copying destructive SQL.
 */
export interface IMigrationPlan {
  steps: IMigrationStep[];
  /** Drift `onUpgrade` snippet using raw SQL strings (advisory template). */
  dartCode: string;
  /** Drift table class skeleton for new objects introduced by the plan. */
  driftTableClass: string;
  preflightWarnings: string[];
}
