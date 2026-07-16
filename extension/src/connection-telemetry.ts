/**
 * Connection-state telemetry — candidate D of the connection-reliability
 * campaign (`plans/connection-reliability-ongoing.md`).
 *
 * **Problem this fixes.** Every reconnect debate in the connection history was
 * argued from anecdotes ("it feels flaky on Wi-Fi"). There was no measured
 * record of how often the connection actually dropped, how long recovery took,
 * or how long the first connect took after activation. Tuning candidates
 * (hysteresis thresholds, poll intervals) are explicitly gated on this data —
 * see wrong path W3 in the campaign skill: never tune intervals blind.
 *
 * **What it does.** Subscribes to {@link ConnectionStateMachine.onDidChange}
 * (which fires only on REAL phase transitions, never on no-op refreshes) and
 * records a timestamped transition log plus three derived metrics:
 *   - time-to-first-connect — session start to the first `connected` phase;
 *   - flap count — number of times the phase LEFT `connected` this session;
 *   - reconnect latencies — for each flap that later re-reached `connected`,
 *     the milliseconds the connection was down.
 * Each transition is also written to the Output channel as one machine-
 * readable line, so a session's connection story can be reconstructed from
 * the log alone.
 *
 * Log-only and additive: this class changes NO connection behavior. It is the
 * measurement instrument the campaign requires before any threshold tuning.
 */

import type { ConnectionPhase, ConnectionStateMachine } from './connection-state';

/** One recorded phase transition. */
export interface ConnectionTransition {
  /** Epoch milliseconds when the transition fired. */
  readonly atMs: number;
  readonly from: ConnectionPhase;
  readonly to: ConnectionPhase;
}

/** Derived session metrics, computed incrementally as transitions arrive. */
export interface ConnectionTelemetrySnapshot {
  /** Epoch ms when telemetry started observing (activation). */
  readonly sessionStartMs: number;
  /** ms from session start to the FIRST `connected` phase; undefined until it happens. */
  readonly timeToFirstConnectMs: number | undefined;
  /** How many times the phase left `connected` this session. */
  readonly flapCount: number;
  /** Down-time in ms for each drop that later re-reached `connected`, in order. */
  readonly reconnectLatenciesMs: readonly number[];
  /** The full transition log (bounded — oldest entries evicted past the cap). */
  readonly transitions: readonly ConnectionTransition[];
}

/** Minimal log sink (matches the Output-channel shape used across the extension). */
export interface TelemetryLogSink {
  appendLine(line: string): void;
}

/**
 * Transition-log cap. Transitions only fire on real phase changes, so even a
 * pathologically flapping session produces a few hundred entries; 200 keeps
 * hours of history while bounding memory. Small cap → plain array with
 * shift() is fine (the ListQueue rule applies to large or per-query caps).
 */
const MAX_TRANSITIONS = 200;

export class ConnectionTelemetry {
  private readonly _transitions: ConnectionTransition[] = [];
  private readonly _reconnectLatenciesMs: number[] = [];
  private readonly _sessionStartMs: number;
  private _timeToFirstConnectMs: number | undefined;
  private _flapCount = 0;
  /** Set when the phase leaves `connected`; cleared when it comes back. */
  private _downSinceMs: number | undefined;
  private _lastPhase: ConnectionPhase;
  private readonly _subscription: { dispose(): void };
  /**
   * Own guard in addition to the subscription disposal: disposal order during
   * deactivation is not guaranteed (the machine may fire while subscriptions
   * unwind), and the test vscode-mock's per-listener dispose is a no-op.
   */
  private _disposed = false;

  /**
   * @param machine — the Phase 1 single state authority; its `onDidChange`
   *   already suppresses no-op updates, so every callback here is a real
   *   transition and needs no dedup.
   * @param log — Output-channel sink for the per-transition line.
   * @param now — injectable clock for tests (defaults to Date.now).
   */
  constructor(
    machine: ConnectionStateMachine,
    private readonly log: TelemetryLogSink,
    private readonly now: () => number = () => Date.now(),
  ) {
    this._sessionStartMs = this.now();
    this._lastPhase = machine.phase;
    this._subscription = machine.onDidChange((phase) => this._onTransition(phase));
  }

  get snapshot(): ConnectionTelemetrySnapshot {
    return {
      sessionStartMs: this._sessionStartMs,
      timeToFirstConnectMs: this._timeToFirstConnectMs,
      flapCount: this._flapCount,
      reconnectLatenciesMs: [...this._reconnectLatenciesMs],
      transitions: [...this._transitions],
    };
  }

  private _onTransition(to: ConnectionPhase): void {
    if (this._disposed) return;
    const atMs = this.now();
    const from = this._lastPhase;
    this._lastPhase = to;

    this._transitions.push({ atMs, from, to });
    if (this._transitions.length > MAX_TRANSITIONS) {
      this._transitions.shift();
    }

    // Leaving `connected` is the flap signal; the drop clock starts here.
    // `connecting`/`offline`/`disconnected` are all "not working" for the
    // user, so any exit from `connected` counts.
    if (from === 'connected' && to !== 'connected') {
      this._flapCount += 1;
      this._downSinceMs = atMs;
    }

    let reconnectNote = '';
    if (to === 'connected') {
      if (this._timeToFirstConnectMs === undefined) {
        this._timeToFirstConnectMs = atMs - this._sessionStartMs;
      }
      // Re-reaching `connected` after a drop closes the reconnect-latency
      // measurement for that flap.
      if (this._downSinceMs !== undefined) {
        const latency = atMs - this._downSinceMs;
        this._reconnectLatenciesMs.push(latency);
        this._downSinceMs = undefined;
        reconnectNote = ` reconnect=${latency}ms`;
      }
    }

    // One machine-readable line per transition: a session's connection story
    // is reconstructable from the Output channel alone (the metric the
    // campaign's candidate F tuning is gated on).
    this.log.appendLine(
      `[${new Date(atMs).toISOString()}] Telemetry: phase ${from} → ${to} ` +
        `(+${atMs - this._sessionStartMs}ms since activation; flaps=${this._flapCount}${reconnectNote})`,
    );
  }

  dispose(): void {
    this._disposed = true;
    this._subscription.dispose();
  }
}
