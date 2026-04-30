/**
 * Merges persisted refactoring-advisor session data into health metrics so the
 * schema quality narrative reflects recent analysis and dismissals (Feature 66
 * Phase 3 — "feed outcomes into health-score explanation text").
 */

import type * as vscode from 'vscode';
import type { IHealthMetric } from './health-types';
import { readAdvisorSession } from '../refactoring/refactoring-advisor-state';

/**
 * Appends refactoring session lines to the **Schema Quality** metric `details`
 * and adds a one-click action to reopen the advisor when a session exists.
 *
 * Call after all metric scorers run and before [generateRecommendations].
 */
export function mergeRefactoringAdvisorIntoMetrics(
  metrics: IHealthMetric[],
  workspaceState: vscode.Memento | undefined,
): void {
  if (!workspaceState) return;
  const session = readAdvisorSession(workspaceState);
  if (!session || session.suggestionCount <= 0) return;

  const sq = metrics.find((m) => m.key === 'schemaQuality');
  if (!sq) return;

  const lines: string[] = [
    `Refactoring advisor: ${session.suggestionCount} suggestion(s) from last analysis (${session.tableCount} tables).`,
  ];
  if (session.dismissedCount > 0) {
    lines.push(
      `Refactoring advisor: ${session.dismissedCount} suggestion(s) dismissed in the panel this session.`,
    );
  }
  for (const t of session.topTitles.slice(0, 3)) {
    lines.push(`Refactoring hint: ${t}`);
  }
  sq.details = [...sq.details, ...lines];

  const actions = sq.actions ?? [];
  if (!actions.some((a) => a.command === 'driftViewer.suggestSchemaRefactorings')) {
    sq.actions = [
      ...actions,
      {
        label: 'Refactoring suggestions',
        icon: '🔧',
        command: 'driftViewer.suggestSchemaRefactorings',
      },
    ];
  }
}
