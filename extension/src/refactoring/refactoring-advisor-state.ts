/**
 * Persists lightweight refactoring-advisor session data for cross-feature use
 * (Feature 66 Phase 3 — health score panel reads the same workspace state).
 */

import type * as vscode from 'vscode';

/** Workspace key for last refactoring analysis summary (stable string). */
export const REFACTORING_ADVISOR_SESSION_KEY = 'driftViewer.refactoringAdvisorSessionV1';

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
 * @param dismissedCount — suggestions dismissed since this analyze in the panel.
 */
export function buildAdvisorSession(
  tableCount: number,
  suggestions: ReadonlyArray<{ title: string }>,
  dismissedCount: number,
): IRefactoringAdvisorSession {
  return {
    updatedAt: new Date().toISOString(),
    tableCount,
    suggestionCount: suggestions.length,
    dismissedCount,
    topTitles: suggestions.slice(0, 5).map((s) => s.title),
  };
}
