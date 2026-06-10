/**
 * Merges persisted refactoring-advisor session data into health metrics so the
 * schema quality narrative reflects recent analysis and dismissals (Feature 66
 * Phase 3 — "feed outcomes into health-score explanation text").
 */

import type * as vscode from 'vscode';
import type { IHealthMetric } from './health-types';
import { readAdvisorSession } from '../refactoring/refactoring-advisor-state';
import { toGrade } from './health-utils';

/** Points removed from Schema Quality per undismissed high-severity suggestion. */
const REFACTORING_PENALTY_PER_HIGH = 5;
/**
 * Hard cap on the total Schema Quality penalty (Feature 70). Keeps the advisor's
 * influence bounded — at most a point-and-a-half of grade — so a noisy analysis
 * run can never sink the metric, and the dominant signal stays the deterministic
 * `scoreSchemaQuality` checks.
 */
const REFACTORING_PENALTY_MAX = 15;

/**
 * Appends refactoring session lines to the **Schema Quality** metric `details`,
 * applies a bounded numeric penalty for high-severity suggestions the user has
 * not dismissed (Feature 70), and adds a one-click action to reopen the advisor.
 *
 * The penalty is disjoint from [scoreSchemaQuality], which scores only
 * missing-primary-key tables; refactoring suggestions are
 * normalize/split/merge/extract structural hints, so no underlying issue is
 * counted twice. Dismissing a high-severity suggestion drops it from
 * `remainingBySeverity.high`, restoring the points on the next recompute.
 *
 * Call after all metric scorers run and before [generateRecommendations] so the
 * adjusted score feeds the overall total and the recommendation list.
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

  // Bounded numeric adjustment. A missing histogram (older session) reads as
  // zero remaining, so the score is untouched and the baseline grade holds.
  const remainingHigh = session.remainingBySeverity?.high ?? 0;
  if (remainingHigh > 0) {
    const penalty = Math.min(REFACTORING_PENALTY_MAX, remainingHigh * REFACTORING_PENALTY_PER_HIGH);
    const applied = Math.min(penalty, sq.score); // never below 0
    if (applied > 0) {
      sq.score -= applied;
      sq.grade = toGrade(sq.score);
      lines.push(
        `Schema Quality reduced ${applied} point(s): ${remainingHigh} high-severity refactoring ` +
          'suggestion(s) remain unaddressed — open the advisor to act on or dismiss them.',
      );
    }
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
