/**
 * Single authority for "are we connected and working" — Phase 1 of the connection
 * reliability plan (see `plans/connection-reliability-ongoing.md`, gap 1).
 *
 * **Problem this fixes.** `driftViewer.serverConnected`, `driftViewer.databaseTreeEmpty`,
 * `isDriftUiConnected`, the tree provider's own state, and the Schema Search state were
 * all separate booleans, set from different places at different times. They could
 * disagree, producing the two contradictions the history documents:
 *   - "connected but no data" (serverConnected=true while the tree is empty), and
 *   - "disconnected but server running" (serverConnected=false while a transport is live).
 *
 * **The model.** There are exactly four underlying SIGNALS. Everything else is DERIVED
 * from them in one place:
 *   - `httpServerSelected` — HTTP discovery has adopted a port (ServerManager.activeServer).
 *   - `vmServiceActive`    — the Dart VM Service transport is attached.
 *   - `schemaLoaded`       — the Database tree has a live table list from REST.
 *   - `offlineSchema`      — the tree repopulated from last-known persisted/cached schema.
 *
 * From those we compute ONE {@link ConnectionPhase}. The VS Code context flags are pure
 * functions of that phase ({@link deriveConnectionContexts}), so the contradictions are
 * not representable: `serverConnected` and the phase derive from the SAME transport signal,
 * and the `connected` phase REQUIRES `schemaLoaded`. There is no way to set the two flags
 * independently any more — {@link ConnectionStateMachine} is the only writer of both keys.
 *
 * **Workaround preserved (reliability constraint).** The Database tree always returns real
 * `TreeItem` command rows in every state, so `databaseTreeEmpty` is intentionally always
 * `false` (the `viewsWelcome` markdown-`command:` overlay is unreliable in some VS Code
 * forks). {@link deriveConnectionContexts} keeps that invariant rather than re-enabling the
 * overlay; this phase unifies WHO sets the flag, it does not change the tree's behavior.
 */

import * as vscode from 'vscode';

/** The four independent inputs. Everything user-visible is derived from these. */
export interface ConnectionSignals {
  /** HTTP discovery has selected a server (ServerManager.activeServer !== undefined). */
  httpServerSelected: boolean;
  /** The Dart VM Service transport is attached (DriftApiClient.usingVmService). */
  vmServiceActive: boolean;
  /** The Database tree has loaded a live table list from the REST API. */
  schemaLoaded: boolean;
  /** The tree is showing last-known persisted/cached schema because the server is unreachable. */
  offlineSchema: boolean;
}

/**
 * The single derived state. Replaces the scattered booleans as the thing surfaces read.
 *
 * - `disconnected` — no transport, no offline schema. Nothing to show but guidance.
 * - `connecting`   — a transport is up but the schema has not loaded yet (this is the
 *                    state the old code mislabeled "connected but no data").
 * - `connected`    — a transport is up AND the schema loaded. The working state.
 * - `offline`      — no transport, but cached schema is on screen.
 */
export type ConnectionPhase = 'disconnected' | 'connecting' | 'connected' | 'offline';

/** A transport (HTTP or VM) is live in these phases and only these. */
export function phaseHasTransport(phase: ConnectionPhase): boolean {
  return phase === 'connected' || phase === 'connecting';
}

/**
 * The ONE definition of the connection phase. Pure; total over all 16 signal combinations.
 *
 * Order matters: a live transport wins over offline schema (if we can reach the server we
 * are not "offline" even if a stale cache is also present), and within a live transport the
 * schema-loaded bit is what separates `connected` from `connecting`.
 */
export function computeConnectionPhase(signals: ConnectionSignals): ConnectionPhase {
  const transport = signals.httpServerSelected || signals.vmServiceActive;
  if (transport) {
    return signals.schemaLoaded ? 'connected' : 'connecting';
  }
  return signals.offlineSchema ? 'offline' : 'disconnected';
}

/** The VS Code context flags, derived from the phase in exactly one place. */
export interface ConnectionContextFlags {
  /**
   * `driftViewer.serverConnected` — true iff a transport is live. Derived from the same
   * signal as the phase, so it can never contradict the phase.
   */
  serverConnected: boolean;
  /**
   * `driftViewer.databaseTreeEmpty` — always false: the tree returns real command rows in
   * every state (the `viewsWelcome` overlay is unreliable across hosts). Kept here so both
   * context keys have a single writer and cannot drift apart.
   */
  databaseTreeEmpty: boolean;
}

/** Pure derivation of the context flags from a phase. */
export function deriveConnectionContexts(phase: ConnectionPhase): ConnectionContextFlags {
  return {
    serverConnected: phaseHasTransport(phase),
    databaseTreeEmpty: false,
  };
}

const SERVER_CONNECTED_KEY = 'driftViewer.serverConnected';
const DATABASE_TREE_EMPTY_KEY = 'driftViewer.databaseTreeEmpty';

/**
 * The single authority. Holds the four signals, derives the phase, and is the ONLY writer
 * of the two context keys. Surfaces update signals through the typed setters and read the
 * phase / {@link connected} / {@link working} — never their own private boolean.
 */
export class ConnectionStateMachine {
  private _signals: ConnectionSignals = {
    httpServerSelected: false,
    vmServiceActive: false,
    schemaLoaded: false,
    offlineSchema: false,
  };
  private _phase: ConnectionPhase = 'disconnected';

  private readonly _onDidChange = new vscode.EventEmitter<ConnectionPhase>();
  /** Fires when the derived phase changes (not on every no-op signal write). */
  readonly onDidChange = this._onDidChange.event;

  /** Current derived phase. */
  get phase(): ConnectionPhase {
    return this._phase;
  }

  /** A transport (HTTP or VM) is live. Equivalent to the `serverConnected` context flag. */
  get connected(): boolean {
    return phaseHasTransport(this._phase);
  }

  /** Transport is live AND schema loaded — the genuinely-working state. */
  get working(): boolean {
    return this._phase === 'connected';
  }

  /** Snapshot of the underlying signals (copy, so callers cannot mutate internal state). */
  get signals(): Readonly<ConnectionSignals> {
    return { ...this._signals };
  }

  /**
   * Merge new signal values, recompute the phase, and — only if the phase changed — push
   * both context flags and fire {@link onDidChange}. Pushing both flags from one site is
   * what makes the two keys impossible to set independently.
   */
  update(partial: Partial<ConnectionSignals>): void {
    const next = { ...this._signals, ...partial };
    const nextPhase = computeConnectionPhase(next);
    const phaseChanged = nextPhase !== this._phase;
    this._signals = next;
    this._phase = nextPhase;
    // Re-push contexts on EVERY update, not only on change: the existing "delayed sync
    // backup" workaround (extension-activation-final) re-runs the refresh to win races where
    // a view evaluated its `when` clause before the context landed. Skipping the re-push when
    // the phase is unchanged would silently weaken that workaround. Idempotent setContext is
    // cheap and matches the pre-machine behavior (every refresh pushed serverConnected).
    this._pushContexts();
    // The change EVENT, by contrast, fires only on a real phase transition so listeners do
    // not churn on no-op refreshes.
    if (phaseChanged) {
      this._onDidChange.fire(nextPhase);
    }
  }

  /** Push the current derived flags. Try/catch-isolated per key so one failure cannot block the other. */
  private _pushContexts(): void {
    const flags = deriveConnectionContexts(this._phase);
    try {
      void vscode.commands.executeCommand('setContext', SERVER_CONNECTED_KEY, flags.serverConnected);
    } catch {
      /* setContext is best-effort; a failure here must not block the other key. */
    }
    try {
      void vscode.commands.executeCommand('setContext', DATABASE_TREE_EMPTY_KEY, flags.databaseTreeEmpty);
    } catch {
      /* see above */
    }
  }

  /** Force a context re-push (e.g. after VS Code re-evaluates `when` clauses on view focus). */
  syncContexts(): void {
    this._pushContexts();
  }

  dispose(): void {
    this._onDidChange.dispose();
  }
}
