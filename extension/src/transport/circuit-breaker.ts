/**
 * Per-endpoint circuit breakers for outbound requests to the Drift debug server.
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
 * **Per-endpoint isolation.** A {@link CircuitBreakerRegistry} manages one
 * {@link CircuitBreaker} per endpoint group (extracted from the URL path:
 * `/api/schema/metadata` → group `schema`). A single misbehaving endpoint
 * (e.g. analytics returning 500 due to a server bug) trips only its own
 * breaker — schema, DVR, and other groups continue unaffected. If the server
 * is genuinely down, all groups trip independently within seconds.
 *
 * Wired into {@link fetchWithTimeout} via {@link setGlobalBreakerRegistry}:
 * every outbound HTTP request looks up the group breaker before hitting the
 * network. Discovery health probes set `bypassCircuitBreaker: true` so they
 * can still run as the recovery mechanism.
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
// Per-endpoint registry
// ---------------------------------------------------------------------------

/**
 * Extract the endpoint group from a URL path. The group is the first path
 * segment after `/api/`: `/api/schema/metadata` → `schema`,
 * `/api/dvr/start` → `dvr`, `/api/sql` → `sql`.
 * Falls back to `'default'` if the path doesn't match `/api/<group>`.
 */
export function endpointGroupFromUrl(url: string): string {
  try {
    const path = new URL(url).pathname;
    const match = path.match(/^\/api\/([^/]+)/);
    return match ? match[1] : 'default';
  } catch {
    return 'default';
  }
}

/**
 * Manages one {@link CircuitBreaker} per endpoint group. Groups are auto-
 * extracted from the URL path by {@link endpointGroupFromUrl}. Each group
 * trips independently so a single failing endpoint category does not block
 * healthy ones.
 */
export class CircuitBreakerRegistry {
  private readonly _breakers = new Map<string, CircuitBreaker>();
  private readonly _onDidChange = new EventEmitter<{ group: string; state: BreakerState }>();
  readonly onDidChange: Event<{ group: string; state: BreakerState }> = this._onDidChange.event;

  /** Get (or lazily create) the breaker for an endpoint group. */
  getOrCreate(group: string): CircuitBreaker {
    let breaker = this._breakers.get(group);
    if (!breaker) {
      breaker = new CircuitBreaker();
      this._breakers.set(group, breaker);
      breaker.onDidChange((state) => this._onDidChange.fire({ group, state }));
    }
    return breaker;
  }

  /** Look up the breaker for a full URL (extracts the group automatically). */
  forUrl(url: string): CircuitBreaker {
    return this.getOrCreate(endpointGroupFromUrl(url));
  }

  /** Force-close all breakers (e.g. when the user clicks "Retry Discovery"). */
  resetAll(): void {
    for (const breaker of this._breakers.values()) {
      breaker.reset();
    }
  }

  /** All currently tracked groups and their states — for diagnostics/logging. */
  snapshot(): Array<{ group: string; state: BreakerState }> {
    return Array.from(this._breakers.entries()).map(
      ([group, b]) => ({ group, state: b.state }),
    );
  }

  dispose(): void {
    for (const breaker of this._breakers.values()) {
      breaker.dispose();
    }
    this._breakers.clear();
    this._onDidChange.dispose();
  }
}

// ---------------------------------------------------------------------------
// Module-level singleton wiring — keeps fetch-utils free of import cycles.
// ---------------------------------------------------------------------------

let _globalRegistry: CircuitBreakerRegistry | undefined;

/** Install the singleton registry that {@link fetchWithTimeout} checks. */
export function setGlobalBreakerRegistry(registry: CircuitBreakerRegistry): void {
  _globalRegistry = registry;
}

/** Read the singleton registry (returns `undefined` before activation wires it). */
export function getGlobalBreakerRegistry(): CircuitBreakerRegistry | undefined {
  return _globalRegistry;
}

// Backward-compat shims — used by tests that wire a single CircuitBreaker.
// Wraps the breaker in a single-group registry keyed as 'default'.

/** @deprecated Use {@link setGlobalBreakerRegistry} in production code. */
export function setGlobalCircuitBreaker(breaker: CircuitBreaker): void {
  const registry = new CircuitBreakerRegistry();
  // Inject the provided breaker as the 'default' group.
  (registry as unknown as { _breakers: Map<string, CircuitBreaker> })._breakers.set('default', breaker);
  _globalRegistry = registry;
}

/** @deprecated Use {@link getGlobalBreakerRegistry} in production code. */
export function getGlobalCircuitBreaker(): CircuitBreaker | undefined {
  return _globalRegistry?.getOrCreate('default');
}
