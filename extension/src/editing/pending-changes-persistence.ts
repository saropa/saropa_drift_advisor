/**
 * Persists pending data-edit drafts to workspace state so a reload can offer
 * restore. Debounced writes; clears storage when the pending list is empty.
 *
 * Also provides draft-conflict detection: on restore, cell-change `oldValue`s
 * are compared against the live DB so the user is warned when the underlying
 * data has changed since the draft was saved.
 */

import * as vscode from 'vscode';
import type { CellChange, PendingChange } from './change-tracker';
import { ChangeTracker } from './change-tracker';
import { sqlLiteral } from './sql-generator';

const STORAGE_KEY = 'driftViewer.pendingEditsDraft.v1';
const DEBOUNCE_MS = 450;

/**
 * Best-effort validation of JSON-deserialized pending changes before restore.
 */
export function deserializePendingChanges(json: string): PendingChange[] | null {
  try {
    const data = JSON.parse(json) as unknown;
    if (!Array.isArray(data) || data.length === 0) return null;
    const out: PendingChange[] = [];
    for (const item of data) {
      if (typeof item !== 'object' || item === null) return null;
      const o = item as Record<string, unknown>;
      const kind = o.kind;
      if (kind === 'cell') {
        if (
          typeof o.table !== 'string' ||
          typeof o.column !== 'string' ||
          typeof o.pkColumn !== 'string' ||
          typeof o.id !== 'string' ||
          typeof o.timestamp !== 'number'
        ) {
          return null;
        }
        out.push(item as PendingChange);
        continue;
      }
      if (kind === 'insert') {
        if (typeof o.table !== 'string' || typeof o.values !== 'object' || o.values === null) {
          return null;
        }
        out.push(item as PendingChange);
        continue;
      }
      if (kind === 'delete') {
        if (typeof o.table !== 'string' || typeof o.pkColumn !== 'string') return null;
        out.push(item as PendingChange);
        continue;
      }
      return null;
    }
    return out;
  } catch {
    return null;
  }
}

/**
 * Subscribes debounced saves of [ChangeTracker.changes] to [workspaceState].
 */
export function createPendingChangesPersistence(
  workspaceState: vscode.Memento,
  tracker: ChangeTracker,
): vscode.Disposable {
  let timer: ReturnType<typeof setTimeout> | undefined;

  const flush = (): void => {
    if (tracker.changeCount === 0) {
      void workspaceState.update(STORAGE_KEY, undefined);
      return;
    }
    try {
      void workspaceState.update(STORAGE_KEY, JSON.stringify(tracker.changes));
    } catch {
      /* Ignore quota or serialization errors so editing never breaks. */
    }
  };

  const sub = tracker.onDidChange(() => {
    if (timer !== undefined) clearTimeout(timer);
    timer = setTimeout(() => {
      timer = undefined;
      flush();
    }, DEBOUNCE_MS);
  });

  // Plain object so unit tests that stub `vscode` without a Disposable class still work.
  return {
    dispose(): void {
      sub.dispose();
      if (timer !== undefined) clearTimeout(timer);
    },
  };
}

/** A conflict found when validating a restored draft against live DB state. */
export interface DraftConflict {
  table: string;
  pkColumn: string;
  pkValue: unknown;
  column: string;
  /** The value the draft expected the DB to hold. */
  draftOldValue: unknown;
  /** The value actually in the DB now (`undefined` when the row is missing). */
  liveValue: unknown;
}

/**
 * Checks each cell-change `oldValue` against the live DB. Returns an array of
 * conflicts (empty when the draft is still consistent).
 *
 * Best-effort: if the query fails (server not connected, table dropped, etc.)
 * the change is silently skipped — the user can still choose to restore.
 */
export async function detectDraftConflicts(
  changes: readonly PendingChange[],
  runSql: (query: string) => Promise<{ columns: string[]; rows: unknown[][] }>,
): Promise<DraftConflict[]> {
  // Group cell changes by (table, pkColumn) so we issue one SELECT per table.
  const groups = new Map<string, CellChange[]>();
  for (const c of changes) {
    if (c.kind !== 'cell') continue;
    const key = `${c.table}\0${c.pkColumn}`;
    const list = groups.get(key);
    if (list) {
      list.push(c);
    } else {
      groups.set(key, [c]);
    }
  }

  const conflicts: DraftConflict[] = [];

  for (const [, cells] of groups) {
    const { table, pkColumn } = cells[0];
    // Collect unique PK values and unique edited columns.
    const pkValues = [...new Set(cells.map((c) => c.pkValue))];
    const editedCols = [...new Set(cells.map((c) => c.column))];

    // Build a SELECT for the affected rows and columns.
    // Escape identifiers (double-quote with internal " doubled per SQL standard).
    const qid = (n: string): string => `"${n.replace(/"/g, '""')}"`;
    const colList = [pkColumn, ...editedCols].map(qid).join(', ');
    // Use sqlLiteral for proper value escaping (prevents injection from crafted draft data).
    const placeholders = pkValues.map((v) => sqlLiteral(v)).join(', ');
    const query =
      `SELECT ${colList} FROM ${qid(table)} WHERE ${qid(pkColumn)} IN (${placeholders})`;

    let result: { columns: string[]; rows: unknown[][] };
    try {
      result = await runSql(query);
    } catch {
      // Server unavailable or table dropped — skip, best-effort.
      continue;
    }

    // Index live rows by PK value for fast lookup.
    const pkIdx = result.columns.indexOf(pkColumn);
    const liveRows = new Map<string, Record<string, unknown>>();
    for (const row of result.rows) {
      const pk = String(row[pkIdx]);
      const record: Record<string, unknown> = {};
      for (let i = 0; i < result.columns.length; i++) {
        record[result.columns[i]] = row[i];
      }
      liveRows.set(pk, record);
    }

    // Compare each cell change's oldValue against the live value.
    for (const cell of cells) {
      const pkStr = String(cell.pkValue);
      const liveRow = liveRows.get(pkStr);
      if (!liveRow) {
        // Row was deleted since the draft was saved.
        conflicts.push({
          table,
          pkColumn,
          pkValue: cell.pkValue,
          column: cell.column,
          draftOldValue: cell.oldValue,
          liveValue: undefined,
        });
        continue;
      }
      const liveVal = liveRow[cell.column];
      // Normalize to string for comparison (SQLite values may differ in JS type).
      if (String(liveVal ?? 'NULL') !== String(cell.oldValue ?? 'NULL')) {
        conflicts.push({
          table,
          pkColumn,
          pkValue: cell.pkValue,
          column: cell.column,
          draftOldValue: cell.oldValue,
          liveValue: liveVal,
        });
      }
    }
  }

  return conflicts;
}

/**
 * Formats a short summary of draft conflicts for display in a warning message.
 */
function formatConflictSummary(conflicts: DraftConflict[]): string {
  if (conflicts.length === 1) {
    const c = conflicts[0];
    const live = c.liveValue === undefined ? 'row deleted' : `now ${String(c.liveValue)}`;
    return `${c.table}.${c.column} (${c.pkColumn}=${String(c.pkValue)}): was ${String(c.draftOldValue ?? 'NULL')}, ${live}`;
  }
  // Multiple conflicts: summarize by count.
  const tables = [...new Set(conflicts.map((c) => c.table))];
  const deleted = conflicts.filter((c) => c.liveValue === undefined).length;
  let msg = `${conflicts.length} conflict(s) in ${tables.join(', ')}`;
  if (deleted > 0) {
    msg += ` (${deleted} in deleted rows)`;
  }
  return msg;
}

/**
 * If a non-empty draft exists and the tracker is empty, prompts to restore or
 * discard. When a SQL runner is provided, validates draft `oldValue`s against
 * live DB state and warns about conflicts before restoring.
 *
 * @param runSql - Optional function to query the DB for conflict detection.
 *   When omitted, drafts are restored without validation (best-effort).
 */
export async function offerRestoreDraft(
  workspaceState: vscode.Memento,
  tracker: ChangeTracker,
  runSql?: (query: string) => Promise<{ columns: string[]; rows: unknown[][] }>,
): Promise<void> {
  const raw = workspaceState.get<string>(STORAGE_KEY);
  if (!raw || tracker.changeCount > 0) return;

  const parsed = deserializePendingChanges(raw);
  if (!parsed || parsed.length === 0) {
    void workspaceState.update(STORAGE_KEY, undefined);
    return;
  }

  const answer = await vscode.window.showInformationMessage(
    `Saropa Drift Advisor: restore ${parsed.length} saved data edit(s) from a previous session?`,
    'Restore',
    'Discard saved draft',
  );

  if (answer === 'Restore') {
    // Check for conflicts if we can reach the DB.
    if (runSql) {
      try {
        const conflicts = await detectDraftConflicts(parsed, runSql);
        if (conflicts.length > 0) {
          const summary = formatConflictSummary(conflicts);
          const choice = await vscode.window.showWarningMessage(
            `Draft conflicts with current DB: ${summary}. Restore anyway?`,
            'Restore anyway',
            'Discard draft',
          );
          if (choice === 'Discard draft') {
            void workspaceState.update(STORAGE_KEY, undefined);
            return;
          }
          if (choice !== 'Restore anyway') {
            // Dismissed — leave draft in storage for next activation.
            return;
          }
        }
      } catch {
        // Conflict detection is best-effort; proceed with restore.
      }
    }
    tracker.replacePendingChanges(parsed);
  } else if (answer === 'Discard saved draft') {
    void workspaceState.update(STORAGE_KEY, undefined);
  }
}
