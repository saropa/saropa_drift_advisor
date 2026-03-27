/**
 * Persists pending data-edit drafts to workspace state so a reload can offer
 * restore. Debounced writes; clears storage when the pending list is empty.
 */

import * as vscode from 'vscode';
import type { PendingChange } from './change-tracker';
import { ChangeTracker } from './change-tracker';

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

/**
 * If a non-empty draft exists and the tracker is empty, prompts to restore or discard.
 */
export async function offerRestoreDraft(
  workspaceState: vscode.Memento,
  tracker: ChangeTracker,
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
    tracker.replacePendingChanges(parsed);
  } else if (answer === 'Discard saved draft') {
    void workspaceState.update(STORAGE_KEY, undefined);
  }
}
