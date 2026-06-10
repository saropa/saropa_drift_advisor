/**
 * Persists lightweight refactoring-advisor session data for cross-feature use
 * (Feature 66 Phase 3 — health score panel reads the same workspace state).
 */

import type * as vscode from 'vscode';
import type { RefactoringSeverity } from './refactoring-types';

/** Workspace key for last refactoring analysis summary (stable string). */
export const REFACTORING_ADVISOR_SESSION_KEY = 'driftViewer.refactoringAdvisorSessionV1';

/** Count of still-undismissed suggestions bucketed by heuristic severity. */
export interface IRemainingBySeverity {
  high: number;
  medium: number;
  low: number;
}

/** Snapshot written after each successful analyze and updated on dismiss. */
export interface IRefactoringAdvisorSession {
  /** ISO timestamp of last analyze that populated this record. */
  updatedAt: string;
  /** Table count passed to the analyzer for context. */
  tableCount: number;
  /** Total suggestions returned before user dismissals in this session. */
  suggestionCount: number;
  /** Number of suggestions the user dismissed in the current panel session. */
  dismissedCount: number;
  /** Up to five titles for quick scanning in the health panel. */
  topTitles: string[];
  /**
   * Severity histogram of the suggestions NOT yet dismissed. Optional so older
   * persisted sessions (written before Feature 70) deserialize cleanly and
   * apply no score adjustment — the health scorer treats a missing field as
   * zero remaining, leaving the baseline grade unchanged.
   */
  remainingBySeverity?: IRemainingBySeverity;
}

/** Reads persisted advisor session, if any. */
export function readAdvisorSession(ws: vscode.Memento): IRefactoringAdvisorSession | undefined {
  return ws.get<IRefactoringAdvisorSession>(REFACTORING_ADVISOR_SESSION_KEY);
}

/** Writes advisor session (fire-and-forget friendly). */
export function writeAdvisorSession(ws: vscode.Memento, session: IRefactoringAdvisorSession): Thenable<void> {
  // `Memento.update` is key + value only (unlike `WorkspaceConfiguration.update`).
  return ws.update(REFACTORING_ADVISOR_SESSION_KEY, session);
}

/**
 * Builds a session object from the latest analyzer output.
 *
 * @param dismissedIds — ids the user dismissed in the panel; drives both the
 *   dismissed count and the remaining-by-severity histogram (dismissed
 *   suggestions are excluded so dismissing a high-severity item restores the
 *   health-score points it cost).
 */
export function buildAdvisorSession(
  tableCount: number,
  suggestions: ReadonlyArray<{ id: string; title: string; severity: RefactoringSeverity }>,
  dismissedIds: ReadonlySet<string>,
): IRefactoringAdvisorSession {
  const remainingBySeverity: IRemainingBySeverity = { high: 0, medium: 0, low: 0 };
  for (const s of suggestions) {
    if (dismissedIds.has(s.id)) continue;
    remainingBySeverity[s.severity]++;
  }
  return {
    updatedAt: new Date().toISOString(),
    tableCount,
    suggestionCount: suggestions.length,
    dismissedCount: dismissedIds.size,
    topTitles: suggestions.slice(0, 5).map((s) => s.title),
    remainingBySeverity,
  };
}
