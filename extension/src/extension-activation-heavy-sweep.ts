/**
 * Heavy DB sweep scheduling: row counts, null-rate scans, and timeline auto-capture.
 * Deferred past the app's startup query burst to avoid freezing launch.
 */
import * as vscode from 'vscode';
import { isMonitoringKilled } from './monitoring/monitoring-kill-switch';
import type { FinalPhaseDeps } from './extension-activation-final';

export const STARTUP_SWEEP_GRACE_MS = 6000;

/**
 * Creates a heavy-sweep scheduler that defers DB sweeps until after the app's
 * startup query burst. Multiple sweep requests are deduped into a single execution.
 *
 * Heavy sweeps include:
 * - DataQualityProvider null-rate scans
 * - Per-table row counts
 * - LIMIT-1000 timeline auto-capture
 *
 * These are deferred to avoid piling onto the app's single live connection and
 * freezing launch (see plans/history/2026.06/2026.06.17/BUG_STARTUP_HANG.md).
 */
export function createHeavySweepScheduler(d: FinalPhaseDeps) {
  let startupGraceUntil = 0;
  let deferredSweepTimer: ReturnType<typeof setTimeout> | undefined;

  const runHeavySweep = (): void => {
    // Global kill switch: the heavy sweep IS the background monitoring the
    // switch exists to stop — no diagnostics collection, no row counts, no
    // timeline capture while it is engaged. (DiagnosticManager also
    // self-gates; this check saves the row-count and capture work too.)
    if (isMonitoringKilled()) return;
    d.diagnostics?.diagnosticManager.refresh().catch(() => {});
    if (d.providers) {
      void d.providers.codeLensProvider.refreshRowCounts();
      // Timeline auto-capture re-dumps every physical table (length()-projected,
      // never raw blob bytes — see blob-safe-select.ts) on every data change. OFF by
      // default so that automatic re-dump is opt-in, not a surprise; the fallback
      // when the key is absent must match package.json's `false` default.
      // requestCapture carries its own trailing-edge debounce.
      if (
        vscode.workspace
          .getConfiguration('driftViewer')
          .get<boolean>('timeline.autoCapture', false)
      ) {
        d.providers.snapshotStore.requestCapture(d.cachedClient);
      }
    }
  };

  // Run the heavy sweep after [delayMs]. A single shared timer dedupes the two
  // connect-time requesters — the connect handler and the watcher's initial
  // post-connect poll both ask for the sweep, and only the last schedule wins.
  const scheduleHeavySweep = (delayMs: number): void => {
    if (deferredSweepTimer) clearTimeout(deferredSweepTimer);
    deferredSweepTimer = setTimeout(() => {
      deferredSweepTimer = undefined;
      runHeavySweep();
    }, delayMs);
  };

  d.context.subscriptions.push({
    dispose: () => {
      if (deferredSweepTimer) clearTimeout(deferredSweepTimer);
    },
  });

  return {
    runHeavySweep,
    scheduleHeavySweep,
    getStartupGraceUntil: () => startupGraceUntil,
    setStartupGraceUntil: (ms: number) => {
      startupGraceUntil = ms;
    },
  };
}

export type HeavySweepScheduler = ReturnType<typeof createHeavySweepScheduler>;
