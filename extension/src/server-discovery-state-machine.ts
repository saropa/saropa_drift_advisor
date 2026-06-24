/**
 * Pure state machine for discovery's search cadence. Extracted from
 * server-discovery-core to keep files under the line cap and to make the
 * backoff transitions unit-testable in isolation (no timers, no I/O).
 *
 * Three states drive the poll interval:
 *   - `searching`  — fast scans while we expect a server soon.
 *   - `connected`  — relaxed scans while at least one server is alive.
 *   - `backoff`    — slow scans after a run of empty searches, then a periodic
 *                    return to `searching` to re-probe.
 */
import {
  BACKOFF_CYCLES,
  BACKOFF_INTERVAL,
  BACKOFF_THRESHOLD,
  CONNECTED_INTERVAL,
  SEARCH_INTERVAL,
} from './server-discovery-constants';
import type { DiscoveryState } from './server-discovery-ui-state';

/** The mutable counters that, together with the state, define a transition. */
export interface IDiscoveryStateCounters {
  state: DiscoveryState;
  /** Consecutive scans that found no server (drives entry into `backoff`). */
  emptyScans: number;
  /** Backoff-interval cycles elapsed (drives the periodic re-probe). */
  backoffPolls: number;
}

/**
 * Compute the next state/counters from the latest scan. [serverCount] is the
 * number of currently-tracked servers (after reconciliation); [aliveCount] is
 * how many ports responded this scan. Pure — returns fresh counters, never
 * mutates the input.
 */
export function nextDiscoveryState(
  prev: IDiscoveryStateCounters,
  serverCount: number,
  aliveCount: number,
): IDiscoveryStateCounters {
  // Any live server wins: snap to connected and clear the empty/backoff tallies.
  if (serverCount > 0) {
    return { state: 'connected', emptyScans: 0, backoffPolls: 0 };
  }
  // No servers AND nothing responded this scan: advance the empty-scan tally and
  // walk the searching↔backoff cycle. (A scan that responded but left no tracked
  // server — e.g. a dropped-then-readded flap — leaves the cadence unchanged.)
  if (aliveCount === 0) {
    const emptyScans = prev.emptyScans + 1;
    if (prev.state === 'backoff') {
      const backoffPolls = prev.backoffPolls + 1;
      // After enough slow cycles, return to fast searching to re-probe.
      if (backoffPolls >= BACKOFF_CYCLES) {
        return { state: 'searching', emptyScans: 0, backoffPolls: 0 };
      }
      return { state: 'backoff', emptyScans, backoffPolls: backoffPolls };
    }
    // Enough consecutive empties trips searching → backoff.
    const state: DiscoveryState =
      emptyScans >= BACKOFF_THRESHOLD ? 'backoff' : 'searching';
    return { state, emptyScans, backoffPolls: prev.backoffPolls };
  }
  return { ...prev };
}

/** Poll interval (ms) for the given discovery state. */
export function pollIntervalForState(state: DiscoveryState): number {
  switch (state) {
    case 'searching':
      return SEARCH_INTERVAL;
    case 'connected':
      return CONNECTED_INTERVAL;
    case 'backoff':
      return BACKOFF_INTERVAL;
  }
}
