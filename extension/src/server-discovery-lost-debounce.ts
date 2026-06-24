/**
 * Debounces "server lost" warnings during discovery so a flaky link (Wi-Fi
 * debugging) that drops and recovers within a scan or two produces no popups.
 *
 * Extracted from server-discovery-core to keep files under the line cap. The
 * owner ([ServerDiscovery]) still removes the server from its map immediately
 * (sidebar/status-bar disconnect is unchanged) — only the toast is deferred and
 * collapsed here.
 *
 * Two debounce rules cooperate:
 *   1. Per-port grace window: a loss schedules the warning after the grace
 *      delay; a rediscovery inside that window cancels the timer (and suppresses
 *      the matching "detected" toast) so a single flap is silent end to end.
 *   2. Once-per-session latch: after the first warning fires, every further
 *      found/lost toast is suppressed until discovery restarts. On a flaky link
 *      the server flaps repeatedly; the user wants one warning, not one per flap.
 */

/** Collaborators the debouncer reads/calls; supplied by [ServerDiscovery]. */
export interface ILostDebounceDeps {
  /** True while discovery is running — a scheduled timer no-ops once stopped. */
  isRunning(): boolean;
  /** How long a loss must persist before the warning is allowed to fire. */
  graceMs: number;
  /** Emit the single "server lost" warning for [port]. */
  notifyLost(port: number): void;
}

export class ServerLostDebouncer {
  /**
   * Per-port deferred "server lost" timers. A loss schedules the warning; a
   * rediscovery within the grace window clears the timer (and suppresses the
   * matching "detected" toast) so transient flaps produce no popups.
   */
  private readonly _pending = new Map<number, ReturnType<typeof setTimeout>>();

  /**
   * Once a "server lost" warning has been shown this discovery session, all
   * further found/lost toasts are suppressed until discovery restarts. Reset via
   * [reset] on a fresh [ServerDiscovery.start].
   */
  private _notifiedThisSession = false;

  constructor(private readonly _deps: ILostDebounceDeps) {}

  /** True once the single per-session warning has fired (gates "found" toasts). */
  get hasNotified(): boolean {
    return this._notifiedThisSession;
  }

  /** Re-arm the once-per-session warning for a new discovery session. */
  reset(): void {
    this._notifiedThisSession = false;
  }

  /**
   * Schedule the deferred warning for [port]. Replaces any timer already pending
   * for the port (a re-loss restarts the grace window). The timer no-ops if
   * discovery has stopped, and removes itself from the map once it fires so a
   * later rediscovery is treated as a genuine "found".
   */
  scheduleLost(port: number): void {
    // Once per session: after the first warning, never schedule another. The
    // server is still removed by the caller — only the toast is suppressed.
    if (this._notifiedThisSession) return;
    const existing = this._pending.get(port);
    if (existing !== undefined) clearTimeout(existing);
    const timer = setTimeout(() => {
      this._pending.delete(port);
      if (!this._deps.isRunning() || this._notifiedThisSession) return;
      // Latch BEFORE notifying so any concurrent port's grace timer that fires
      // in the same tick stays silent — the user gets exactly one warning.
      this._notifiedThisSession = true;
      this._deps.notifyLost(port);
    }, this._deps.graceMs);
    this._pending.set(port, timer);
  }

  /**
   * Cancel any pending warning for [port] (called when the port is rediscovered).
   * Returns true when a timer was actually pending — i.e. the loss never
   * surfaced a toast, so the caller should also stay silent on the recovery
   * rather than announcing it as a fresh "found".
   */
  cancelPending(port: number): boolean {
    const timer = this._pending.get(port);
    if (timer === undefined) return false;
    clearTimeout(timer);
    this._pending.delete(port);
    return true;
  }

  /** Cancel and drop all deferred timers (called on stop). */
  clearAll(): void {
    for (const timer of this._pending.values()) clearTimeout(timer);
    this._pending.clear();
  }
}
