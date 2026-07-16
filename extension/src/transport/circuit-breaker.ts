/**
 * Global circuit breaker for outbound requests to the Drift debug server.
 *
 * When the server is genuinely down, each subsystem (discovery, schema cache,
 * generation watcher, mutation poller) retries independently — fanning out
 * uncapped requests against a dead endpoint. The breaker collapses all of them
 * into a single backoff cadence:
 *
 *  closed  → consecutive failures reach FAILURE_THRESHOLD → open
 *  open    → cooldown elapses                             → half-open (one probe)
 *  half-open → probe succeeds                             → closed
 *  half-open → probe fails                                → open (restart cooldown)
 *
 * Wired into {@link fetchWithTimeout} via {@link setGlobalCircuitBreaker}: every
 * outbound HTTP request checks the breaker first. Discovery health probes set
 * `bypassCircuitBreaker: true` so they can still run as the recovery mechanism.
 *
 * Phase 3 of the connection reliability plan
 * (see `plans/connection-reliability-ongoing.md`, gap 3).
 */

import type { Event } from 'vscode';
import { EventEmitter } from 'vscode';

export type BreakerState = 'closed' | 'open' | 'half-open';

/** Consecutive transient failures before the breaker trips open. */
export const FAILURE_THRESHOLD = 5;

/**
 * Milliseconds to wait in `open` state before allowing a single half-open
 * probe. Matches the discovery `SEARCH_INTERVAL` (30s) so the first recovery
 * probe aligns with the next discovery scan rather than adding traffic.
 */
export const COOLDOWN_MS = 30_000;

export class CircuitBreaker {
  private _state: BreakerState = 'closed';
  private _consecutiveFailures = 0;
  private _lastFailureTime = 0;
  /** Guards half-open so only one concurrent probe passes; the rest are rejected. */
  private _halfOpenProbeInFlight = false;

  private readonly _onDidChange = new EventEmitter<BreakerState>();
  /** Fires only on state transitions (closed→open, open→half-open, etc.). */
  readonly onDidChange: Event<BreakerState> = this._onDidChange.event;

  get state(): BreakerState {
    return this._state;
  }

  /**
   * Check whether a request may proceed. Returns `true` if it may.
   *
   * In `open` state, requests are rejected immediately — except when the
   * cooldown has elapsed, which auto-transitions to `half-open` and allows
   * exactly one probe through to test recovery. Concurrent callers during
   * half-open are rejected until that single probe resolves.
   */
  mayAttempt(): boolean {
    if (this._state === 'closed') return true;
    if (this._state === 'half-open') {
      // Only one probe at a time — concurrent callers are rejected so the
      // recovery test isn't fanned out across every subsystem simultaneously.
      if (this._halfOpenProbeInFlight) return false;
      this._halfOpenProbeInFlight = true;
      return true;
    }
    // open: check cooldown
    if (Date.now() - this._lastFailureTime >= COOLDOWN_MS) {
      this._transition('half-open');
      this._halfOpenProbeInFlight = true;
      return true;
    }
    return false;
  }

  /** Call after a successful response. Closes the breaker and resets the counter. */
  recordSuccess(): void {
    this._consecutiveFailures = 0;
    this._halfOpenProbeInFlight = false;
    // A late success arriving after the breaker already reopened (from a
    // concurrent probe's failure) must NOT close the breaker — the failure
    // is the authoritative signal, not this stale success.
    if (this._state === 'half-open') {
      this._transition('closed');
    } else if (this._state === 'closed') {
      // Already closed — no-op (normal steady-state success).
    }
    // If state is 'open', a stale success is ignored — the reopen wins.
  }

  /** Call after a transient failure. Increments the counter and may trip the breaker. */
  recordFailure(): void {
    this._consecutiveFailures++;
    this._lastFailureTime = Date.now();
    this._halfOpenProbeInFlight = false;
    if (this._state === 'closed' && this._consecutiveFailures >= FAILURE_THRESHOLD) {
      this._transition('open');
    } else if (this._state === 'half-open') {
      // Half-open probe failed — back to open, restart cooldown.
      this._transition('open');
    }
  }

  /** Force-reset to closed (e.g. when the user clicks "Retry Discovery"). */
  reset(): void {
    this._consecutiveFailures = 0;
    this._lastFailureTime = 0;
    this._halfOpenProbeInFlight = false;
    if (this._state !== 'closed') {
      this._transition('closed');
    }
  }

  dispose(): void {
    this._onDidChange.dispose();
  }

  private _transition(next: BreakerState): void {
    if (next === this._state) return;
    this._state = next;
    this._onDidChange.fire(next);
  }
}

/**
 * Error thrown when the circuit breaker is open and a request is rejected
 * without hitting the network. Callers can check `instanceof` to distinguish
 * breaker rejections from real network errors.
 */
export class CircuitBreakerOpenError extends Error {
  constructor() {
    super('Circuit breaker is open — server unreachable, request suppressed');
    this.name = 'CircuitBreakerOpenError';
  }
}

// ---------------------------------------------------------------------------
// Module-level singleton wiring — keeps fetch-utils free of import cycles.
// ---------------------------------------------------------------------------

let _globalBreaker: CircuitBreaker | undefined;

/** Install the singleton breaker that {@link fetchWithTimeout} checks. */
export function setGlobalCircuitBreaker(breaker: CircuitBreaker): void {
  _globalBreaker = breaker;
}

/** Read the singleton (returns `undefined` before activation wires it). */
export function getGlobalCircuitBreaker(): CircuitBreaker | undefined {
  return _globalBreaker;
}
