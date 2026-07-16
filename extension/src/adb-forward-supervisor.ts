/**
 * adb-forward supervision — candidate E of the connection-reliability
 * campaign (`plans/connection-reliability-ongoing.md`).
 *
 * **Problem this fixes.** When the host reaches a device-hosted Drift server
 * through `adb forward tcp:<port> tcp:<port>`, that forward can silently die:
 * the device reconnects (USB replug, Wi-Fi debugging drop), the adb server
 * restarts (`adb kill-server`, Android Studio restarting it), or the editor
 * crashes mid-debug and the device re-attaches. Before this class, the only
 * recovery path was reactive: an EMPTY discovery scan while a debug session
 * is active triggers one re-forward, throttled to once per 60 s — so a dead
 * forward could take up to scan-interval + 60 s throttle to heal, during
 * which the sidebar shows a lost connection with no explanation.
 *
 * **What it does.** While a Dart/Flutter debug session is active, it polls
 * `adb forward --list` and checks for the expected `tcp:<port> tcp:<port>`
 * entry. It only acts on a DROP: the entry must have been OBSERVED at least
 * once this session before its absence counts as a failure — otherwise a
 * desktop-only debug session (no device, no forward ever) would trigger
 * pointless re-forward attempts every poll. On a detected drop it logs and
 * re-establishes via {@link tryAdbForwardAndRetry}, which preserves the two
 * hard contracts of the recovery path:
 *   - the 60 s re-forward throttle (workspace-state backed), and
 *   - `discovery.retry({ resetNotifyLatch: false })` — auto-recovery must
 *     NOT re-arm the once-per-session toast latch (wrong path W2).
 */

import { exec } from 'child_process';
import { promisify } from 'util';
import type * as vscode from 'vscode';
import { tryAdbForwardAndRetry } from './android-forward';
import type { ServerDiscovery } from './server-discovery';

const execAsync = promisify(exec);

/**
 * Poll cadence for `adb forward --list`. This is a LOCAL child-process call
 * (no network, no device round-trip beyond the host adb server), so it is not
 * governed by the discovery-interval rule (wrong path W3, which is about
 * network probes spamming the server). 15 s halves the worst-case detection
 * gap of the 30 s discovery scan while staying far from process-spawn churn.
 */
export const SUPERVISOR_POLL_MS = 15_000;

/** Minimal log sink (Output-channel shape). */
interface SupervisorLogSink {
  appendLine(line: string): void;
}

export interface AdbForwardSupervisorOptions {
  /** The port whose forward is supervised (the configured driftViewer.port). */
  port: number;
  discovery: ServerDiscovery;
  workspaceState: vscode.Memento;
  log: SupervisorLogSink;
  /** Test double for `adb forward --list`; resolves with stdout. */
  listForwardsOverride?: () => Promise<string>;
  /** Test double passed through to the re-forward exec. */
  forwardExecOverride?: (cmd: string) => Promise<void>;
}

export class AdbForwardSupervisor {
  private _timer: ReturnType<typeof setInterval> | undefined;
  /**
   * The forward must be seen alive once before its absence is treated as a
   * drop — this is what keeps desktop-only sessions (no device) silent.
   */
  private _observedForward = false;
  /** Prevents overlapping ticks when adb is slow to answer. */
  private _tickInFlight = false;

  constructor(private readonly opts: AdbForwardSupervisorOptions) {}

  /** True while the poll timer is running. */
  get isRunning(): boolean {
    return this._timer !== undefined;
  }

  /** Whether the expected forward has been observed alive this session (test/diagnostic hook). */
  get observedForward(): boolean {
    return this._observedForward;
  }

  /** Idempotent. Starts the poll loop; the first check runs after one interval. */
  start(): void {
    if (this._timer !== undefined) return;
    // A new supervision session starts blank: a forward observed during a
    // PREVIOUS debug session must not count as evidence for this one.
    this._observedForward = false;
    this._timer = setInterval(() => {
      void this._tick();
    }, SUPERVISOR_POLL_MS);
    this.opts.log.appendLine(
      `[${new Date().toISOString()}] adb-forward supervisor: watching tcp:${this.opts.port} every ${SUPERVISOR_POLL_MS / 1000}s`,
    );
  }

  /** Idempotent. Stops polling (debug session ended, or adb unusable). */
  stop(): void {
    if (this._timer === undefined) return;
    clearInterval(this._timer);
    this._timer = undefined;
  }

  dispose(): void {
    this.stop();
  }

  /** Exposed for tests so fake timers are not required to drive a check. */
  async _tick(): Promise<void> {
    if (this._tickInFlight) return;
    this._tickInFlight = true;
    try {
      let stdout: string;
      try {
        stdout = this.opts.listForwardsOverride
          ? await this.opts.listForwardsOverride()
          : (await execAsync('adb forward --list')).stdout;
      } catch {
        // adb missing from PATH or unusable: supervision is impossible, and
        // retrying every 15 s would spawn a failing process forever. Stop for
        // this session; the next debug session start()s a fresh supervisor.
        this.opts.log.appendLine(
          `[${new Date().toISOString()}] adb-forward supervisor: 'adb forward --list' failed — adb unavailable, supervision stopped for this session`,
        );
        this.stop();
        return;
      }

      // `adb forward --list` lines look like: `<serial> tcp:8642 tcp:8642`.
      // Match host AND device port so a half-matching forward (same host
      // port forwarded elsewhere) does not count as alive.
      const expected = `tcp:${this.opts.port} tcp:${this.opts.port}`;
      const present = stdout
        .split(/\r?\n/)
        .some((line) => line.includes(expected));

      if (present) {
        this._observedForward = true;
        return;
      }
      if (!this._observedForward) {
        // Never seen alive this session — likely a desktop run with no
        // device forward at all. Stay silent; the reactive empty-scan path
        // in extension-bootstrap still covers first-time establishment.
        return;
      }

      // Drop detected: the forward existed and is now gone. Re-establish via
      // the shared recovery helper so the 60 s throttle and the
      // resetNotifyLatch:false contract both hold.
      this.opts.log.appendLine(
        `[${new Date().toISOString()}] adb-forward supervisor: forward tcp:${this.opts.port} DROPPED (device reconnect / adb restart) — re-establishing`,
      );
      const ok = await tryAdbForwardAndRetry(
        this.opts.port,
        this.opts.discovery,
        this.opts.workspaceState,
        this.opts.forwardExecOverride,
      );
      this.opts.log.appendLine(
        `[${new Date().toISOString()}] adb-forward supervisor: re-forward ${ok ? 'succeeded — discovery retriggered' : 'skipped (throttled) or failed — will retry next poll'}`,
      );
      if (ok) {
        // The forward is live again; keep treating later absence as a drop.
        this._observedForward = true;
      }
    } finally {
      this._tickInFlight = false;
    }
  }
}
