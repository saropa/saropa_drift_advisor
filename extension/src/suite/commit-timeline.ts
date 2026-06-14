/**
 * Saropa suite integration — commit timeline view model (plan 67 R6 / §6).
 *
 * Shapes the accumulated per-commit history into rows for the timeline panel:
 * newest capture first, each carrying the delta in total findings versus the
 * previous (older) capture so a developer can see, at a glance, which commits
 * added or cleared issues. Pure (no vscode, no I/O) and exported for testing.
 */
import type { CommitHistory } from './commit-history';

/** One commit row in the timeline. */
export interface TimelineRow {
  commitSha: string;
  /** First 7 chars, for compact display. */
  shortSha: string;
  generatedAt: string;
  total: number;
  errors: number;
  warnings: number;
  advisor: number;
  lints: number;
  logCapture: number;
  /**
   * Change in total findings versus the previous (older) capture; null for the
   * oldest snapshot, which has nothing to compare against. Positive means this
   * commit had MORE findings than the one before it (regression); negative means
   * fewer (improvement).
   */
  deltaTotal: number | null;
  /** True when this snapshot's commit matches the current checkout. */
  isCurrent: boolean;
}

/** The rendered timeline model. */
export interface TimelineModel {
  /** Rows newest capture first. */
  rows: TimelineRow[];
  /** Largest `total` across all snapshots — the bar-scaling denominator. */
  maxTotal: number;
  commitCount: number;
}

/**
 * Builds the timeline model from [history]. [currentCommit], when known, marks
 * the matching row as current. Deltas are computed in chronological (capture)
 * order, then the rows are reversed so the newest sits first.
 */
export function buildCommitTimeline(
  history: CommitHistory,
  currentCommit?: string,
): TimelineModel {
  const snaps = history.snapshots;
  const maxTotal = snaps.reduce((max, s) => Math.max(max, s.total), 0);

  // Delta is each snapshot's total minus the previous one in capture order.
  const chronological: TimelineRow[] = snaps.map((s, i) => {
    const prev = i > 0 ? snaps[i - 1] : undefined;
    return {
      commitSha: s.commitSha,
      shortSha: s.commitSha.slice(0, 7),
      generatedAt: s.generatedAt,
      total: s.total,
      errors: s.errors,
      warnings: s.warnings,
      advisor: s.advisor,
      lints: s.lints,
      logCapture: s.logCapture,
      deltaTotal: prev ? s.total - prev.total : null,
      isCurrent: Boolean(currentCommit && s.commitSha === currentCommit),
    };
  });

  return {
    rows: chronological.reverse(),
    maxTotal,
    commitCount: snaps.length,
  };
}
