/**
 * Saropa suite integration — commit-history persistence (plan 67 R6 / §6).
 *
 * The I/O half of the per-commit timeline: reads and appends to
 * `.saropa/diagnostics/history.json`. The pure model (parse / upsert) lives in
 * commit-history.ts; this module is the thin glue that snapshots the current
 * on-disk suite state at the current commit and accumulates it.
 *
 * Best-effort throughout, mirroring the diagnostics mirror: any failure (no
 * workspace, unresolved commit, unreadable/unwritable file) skips the record
 * rather than throwing — a missed snapshot is harmless, a thrown error in a
 * generation-tick handler is not.
 */
import * as vscode from 'vscode';
import { buildDriftHealth, summarizeDriftHealth } from './drift-health';
import { readAllSuiteDiagnostics } from './suite-diagnostics';
import { resolveWorkspaceCommit } from './workspace-commit';
import {
  type CommitHistory,
  emptyCommitHistory,
  parseCommitHistory,
  snapshotFromSummary,
  upsertCommitSnapshot,
} from './commit-history';

const HISTORY_DIR = '.saropa/diagnostics';
const HISTORY_FILE = 'history.json';

/** Reads the accumulated commit history, or an empty one when absent/malformed. */
export async function readCommitHistory(): Promise<CommitHistory> {
  const folder = vscode.workspace.workspaceFolders?.[0];
  if (!folder) return emptyCommitHistory();
  const uri = vscode.Uri.joinPath(
    folder.uri,
    ...HISTORY_DIR.split('/'),
    HISTORY_FILE,
  );
  try {
    const bytes = await vscode.workspace.fs.readFile(uri);
    return parseCommitHistory(new TextDecoder().decode(bytes));
  } catch {
    // Absent file is the normal first-run case.
    return emptyCommitHistory();
  }
}

/**
 * Records a snapshot of the current suite finding counts against the current
 * commit, accumulating into the history file. Reads all three on-disk mirrors
 * (Advisor + siblings) — so it must run AFTER the Advisor mirror has been
 * written for the counts to be current. Skips (returns false) when there is no
 * workspace or the commit can't be resolved: a snapshot with no commit can't be
 * keyed onto the timeline, and bucketing it under "unknown" would be misleading.
 *
 * [now] is injectable for tests; defaults to the current time.
 */
export async function recordCommitSnapshot(
  now: string = new Date().toISOString(),
): Promise<boolean> {
  const folder = vscode.workspace.workspaceFolders?.[0];
  if (!folder) return false;

  const commitSha = await resolveWorkspaceCommit();
  if (!commitSha) return false;

  const diagnostics = await readAllSuiteDiagnostics();
  const summary = summarizeDriftHealth(buildDriftHealth(diagnostics));
  const snapshot = snapshotFromSummary(commitSha, now, summary);

  const history = await readCommitHistory();
  const next = upsertCommitSnapshot(history, snapshot);

  const dirUri = vscode.Uri.joinPath(folder.uri, ...HISTORY_DIR.split('/'));
  const fileUri = vscode.Uri.joinPath(dirUri, HISTORY_FILE);
  try {
    await vscode.workspace.fs.createDirectory(dirUri);
    const bytes = new TextEncoder().encode(JSON.stringify(next, null, 2));
    await vscode.workspace.fs.writeFile(fileUri, bytes);
    return true;
  } catch {
    return false;
  }
}
