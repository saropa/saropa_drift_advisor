/**
 * Factory for the disk-backed "bulk state" memento used by heavy stores.
 *
 * Creates a DiskBackedMemento under context.storageUri and, on first run,
 * migrates existing heavy keys out of workspaceState so the renderer heap
 * is freed. A sentinel key in workspaceState tracks whether migration has
 * already run — idempotent across reloads.
 */

import * as vscode from 'vscode';
import * as path from 'path';
import { DiskBackedMemento } from './disk-backed-memento';

/** Sentinel key — present in workspaceState once migration is complete. */
const MIGRATION_DONE_KEY = 'driftViewer.bulkState.migrated';

/**
 * Keys that carry bulk data and must move from workspaceState to disk.
 * Lightweight keys (booleans, timestamps, short arrays) stay in workspaceState.
 */
const HEAVY_KEYS = [
  // BranchManager — full row snapshots, easily 1–4 MB.
  'driftViewer.branches',
  // SchemaTracker — up to 100 schema snapshots.
  'schema.timeline',
  // SchemaCache — full schema metadata.
  'driftViewer.lastKnownSchema',
  // AnalysisHistoryStore — 4 instances, 50 snapshots each.
  'driftViewer.analysisHistory.sizeAnalytics',
  'driftViewer.analysisHistory.indexSuggestions',
  'driftViewer.analysisHistory.anomalies',
  'driftViewer.analysisHistory.healthScore',
];

/**
 * Create (or reuse) the disk-backed memento for heavy stores.
 * On the first call after upgrade, migrates heavy keys from workspaceState
 * to the disk store and clears them from the in-memory memento.
 *
 * @param context Extension context — provides storageUri and workspaceState.
 * @param log     Output channel for migration diagnostics.
 */
export function createBulkState(
  context: vscode.ExtensionContext,
  log: vscode.OutputChannel,
): vscode.Memento {
  // storageUri is always available for installed extensions (VS Code ≥ 1.42).
  // In test mocks and unusual environments it may be undefined — fall back to
  // workspaceState so the extension still works (just without the OOM fix).
  const storageDir = context.storageUri?.fsPath
    ?? context.globalStorageUri?.fsPath;
  if (!storageDir) {
    log.appendLine('[bulk-state] No storageUri available — using workspaceState (test/fallback mode)');
    return context.workspaceState;
  }
  // Subdirectory keeps bulk-state files separate from any other storageUri use.
  const bulkDir = path.join(storageDir, 'bulk-state');
  let bulkState: DiskBackedMemento;
  try {
    bulkState = new DiskBackedMemento(bulkDir);
  } catch (err) {
    // storageUri exists but is not writable — fall back gracefully.
    log.appendLine(`[bulk-state] Cannot create disk store (${err}). Using workspaceState fallback.`);
    return context.workspaceState;
  }

  // Run one-time migration if not already done. Phase 1 (synchronous) populates
  // the in-memory cache so stores constructed later in the same tick see the
  // data. Phase 2 (async, fire-and-forget) flushes to disk and clears
  // workspaceState — ordered so disk writes complete before keys are cleared.
  if (!context.workspaceState.get<boolean>(MIGRATION_DONE_KEY, false)) {
    const pending = collectMigrationData(context.workspaceState);
    // Populate the in-memory cache synchronously — stores read from here.
    for (const { key, value } of pending) {
      bulkState.seedCache(key, value);
    }
    // Flush to disk and clear workspaceState async (ordered, crash-safe).
    // Catch here — an uncaught rejection in a fire-and-forget call would
    // otherwise surface as an unhandled promise rejection instead of a
    // diagnosable log line. Un-flushed keys stay in workspaceState and
    // re-migrate on next activation since the sentinel was never set.
    flushMigrationToDisk(context.workspaceState, bulkState, pending, log).catch((err: unknown) => {
      log.appendLine(`[bulk-state] migration flush failed: ${err}. Will retry on next activation.`);
    });
  }

  // Safety check: warn if workspaceState still holds unexpectedly large data.
  // Only run the heavy-key guard after migration is complete — during the
  // first activation, keys are still in workspaceState until flush finishes.
  const migrationDone = context.workspaceState.get<boolean>(MIGRATION_DONE_KEY, false);
  warnIfWorkspaceStateLarge(context.workspaceState, log, migrationDone);

  return bulkState;
}

/** A key-value pair collected from workspaceState during migration. */
interface MigrationEntry {
  key: string;
  value: unknown;
}

/**
 * Phase 1 (synchronous): read heavy keys from workspaceState and return them.
 * The caller seeds the in-memory cache synchronously before any store
 * constructor runs.
 */
function collectMigrationData(ws: vscode.Memento): MigrationEntry[] {
  const entries: MigrationEntry[] = [];
  for (const key of HEAVY_KEYS) {
    const value = ws.get(key);
    if (value !== undefined) {
      entries.push({ key, value });
    }
  }
  return entries;
}

/**
 * Phase 2 (async, fire-and-forget): flush collected data to disk, then clear
 * workspaceState keys. Ordered so each key is persisted on disk BEFORE it is
 * removed from workspaceState — a crash mid-flush cannot lose data from both
 * stores. The migration sentinel is set only after all writes succeed.
 */
async function flushMigrationToDisk(
  ws: vscode.Memento,
  disk: DiskBackedMemento,
  entries: MigrationEntry[],
  log: vscode.OutputChannel,
): Promise<void> {
  for (const { key, value } of entries) {
    // Persist to disk first — only clear workspaceState after disk confirms.
    await disk.update(key, value);
    await ws.update(key, undefined);
    log.appendLine(`[bulk-state] migrated key "${key}" to disk`);
  }
  // Mark migration complete only after all writes succeeded.
  await ws.update(MIGRATION_DONE_KEY, true);
  if (entries.length > 0) {
    log.appendLine(`[bulk-state] migration complete: ${entries.length} key(s) moved to storageUri`);
  }
}

/** Warn threshold for remaining workspaceState size (512 KB). */
const WARN_THRESHOLD_BYTES = 512 * 1024;

/**
 * Warn threshold for a single workspaceState key (100 KB). Catches bloat from
 * ANY key — not just the known HEAVY_KEYS list — so a future store that grows
 * large without being added to HEAVY_KEYS still gets flagged automatically.
 * This is the fix for the original bug's blind spot: the size guard only
 * checked known keys, so a new offender would silently reproduce the OOM.
 */
const WARN_THRESHOLD_PER_KEY_BYTES = 100 * 1024;

/**
 * Estimate the total size of all remaining workspaceState keys and log a
 * warning if it exceeds the threshold. VS Code itself warns at ~1 MB;
 * catching it earlier keeps us well under the danger zone. Also flags:
 * - any heavy key that was not migrated (wiring mistake), and
 * - any individual key (heavy or not) over WARN_THRESHOLD_PER_KEY_BYTES, so
 *   a new store that grows large gets caught before it reproduces the OOM,
 *   without needing to be added to HEAVY_KEYS first.
 */
function warnIfWorkspaceStateLarge(
  ws: vscode.Memento,
  log: vscode.OutputChannel,
  checkHeavyKeys: boolean,
): void {
  try {
    const keys = ws.keys();
    // Guard: flag any heavy key still in workspaceState after migration.
    // Skipped during first activation while async flush is still running.
    if (checkHeavyKeys) {
      for (const heavy of HEAVY_KEYS) {
        if (ws.get(heavy) !== undefined) {
          log.appendLine(
            `[bulk-state] WARNING: heavy key "${heavy}" still in workspaceState — ` +
            `should be using bulkState. Check wiring.`,
          );
        }
      }
    }
    let totalBytes = 0;
    for (const key of keys) {
      const value = ws.get(key);
      if (value === undefined) continue;
      const byteLen = JSON.stringify(value).length * 2; // UTF-16 worst case
      totalBytes += byteLen;
      // Per-key guard: catches new bloat from any key, known or not.
      if (byteLen > WARN_THRESHOLD_PER_KEY_BYTES && !HEAVY_KEYS.includes(key)) {
        const kb = (byteLen / 1024).toFixed(1);
        log.appendLine(
          `[bulk-state] WARNING: workspaceState key "${key}" is ~${kb} KB — ` +
          `consider moving it to bulkState (disk-backed storage).`,
        );
      }
    }
    if (totalBytes > WARN_THRESHOLD_BYTES) {
      const kb = (totalBytes / 1024).toFixed(1);
      log.appendLine(
        `[bulk-state] WARNING: workspaceState still holds ~${kb} KB across ${keys.length} key(s). ` +
        `Consider migrating additional keys to storageUri.`,
      );
    }
  } catch {
    // Non-critical diagnostic — never block activation.
  }
}
