/**
 * Saropa suite integration — per-commit findings history (plan 67 R6, §6).
 *
 * The commit-correlation core (R6) stamps each finding with the commit it was
 * captured at and flags stale ones. This module is the richer §6 form: it
 * accumulates a small per-commit snapshot of the suite's finding counts over
 * time, so a developer can see whether a checkout ADDED or CLEARED issues —
 * "at commit X the suite had N findings; the next commit cleared 3."
 *
 * The accumulated history is persisted to `.saropa/diagnostics/history.json`
 * (the store module owns the I/O). This file holds only the pure data model and
 * its malformed-safe parse / upsert — no vscode, no I/O — so it is fully unit
 * testable.
 */
import type { SuiteFindingsSummary } from './drift-health';

/** One commit's recorded finding counts. Counts only; no per-finding detail. */
export interface CommitSnapshot {
  /** The commit the counts were captured at (full sha). */
  commitSha: string;
  /** ISO 8601 capture time — when this snapshot was recorded, not commit time. */
  generatedAt: string;
  total: number;
  errors: number;
  warnings: number;
  advisor: number;
  lints: number;
  logCapture: number;
}

/** The persisted history document. */
export interface CommitHistory {
  version: 1;
  /** Snapshots in capture order (oldest first), one per commit (latest wins). */
  snapshots: CommitSnapshot[];
}

export const COMMIT_HISTORY_VERSION = 1 as const;

/**
 * Cap on retained snapshots. The timeline is a trend view, not an audit log;
 * keeping the newest 200 commits bounds the file size while covering far more
 * history than anyone scrolls. Oldest snapshots fall off first.
 */
export const MAX_COMMIT_SNAPSHOTS = 200;

/** A fresh, empty history. Used as the malformed / missing-file fallback. */
export function emptyCommitHistory(): CommitHistory {
  return { version: COMMIT_HISTORY_VERSION, snapshots: [] };
}

/** True when [value] has the shape of a usable snapshot (commit + numeric total). */
function isCommitSnapshot(value: unknown): value is CommitSnapshot {
  if (typeof value !== 'object' || value === null) return false;
  const s = value as Partial<CommitSnapshot>;
  return (
    typeof s.commitSha === 'string'
    && s.commitSha.length > 0
    && typeof s.total === 'number'
  );
}

/** Coerces a possibly-missing numeric field to a finite number (0 otherwise). */
function num(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

/**
 * Parses history JSON, dropping anything malformed rather than throwing — a
 * corrupt or hand-edited file degrades to an empty history (the timeline shows
 * its empty state), never breaking the panel. Each surviving snapshot has its
 * numeric fields coerced so a partially-written entry cannot render `NaN`.
 */
export function parseCommitHistory(text: string): CommitHistory {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return emptyCommitHistory();
  }
  if (typeof parsed !== 'object' || parsed === null) return emptyCommitHistory();
  const raw = (parsed as { snapshots?: unknown }).snapshots;
  if (!Array.isArray(raw)) return emptyCommitHistory();

  const snapshots: CommitSnapshot[] = [];
  for (const entry of raw) {
    if (!isCommitSnapshot(entry)) continue;
    snapshots.push({
      commitSha: entry.commitSha,
      generatedAt: typeof entry.generatedAt === 'string' ? entry.generatedAt : '',
      total: num(entry.total),
      errors: num(entry.errors),
      warnings: num(entry.warnings),
      advisor: num(entry.advisor),
      lints: num(entry.lints),
      logCapture: num(entry.logCapture),
    });
  }
  return { version: COMMIT_HISTORY_VERSION, snapshots };
}

/** Builds a snapshot from a finding summary at [commitSha], captured [generatedAt]. */
export function snapshotFromSummary(
  commitSha: string,
  generatedAt: string,
  summary: SuiteFindingsSummary,
): CommitSnapshot {
  return {
    commitSha,
    generatedAt,
    total: summary.total,
    errors: summary.errors,
    warnings: summary.warnings,
    advisor: summary.advisor,
    lints: summary.lints,
    logCapture: summary.logCapture,
  };
}

/**
 * Inserts or replaces the snapshot for a commit. Re-scanning the same checkout
 * (every generation tick during a session) must NOT create duplicate rows, and
 * the freshest counts for a commit should win — so any existing snapshot with
 * the same `commitSha` is removed and the new one appended at the end (most
 * recent capture). The result is capped to the newest [MAX_COMMIT_SNAPSHOTS] so
 * the file can never grow without bound. Returns a new history (no mutation).
 */
export function upsertCommitSnapshot(
  history: CommitHistory,
  snapshot: CommitSnapshot,
): CommitHistory {
  const kept = history.snapshots.filter((s) => s.commitSha !== snapshot.commitSha);
  kept.push(snapshot);
  return {
    version: COMMIT_HISTORY_VERSION,
    snapshots: kept.slice(-MAX_COMMIT_SNAPSHOTS),
  };
}
