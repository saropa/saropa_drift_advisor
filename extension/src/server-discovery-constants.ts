/**
 * Constants for server discovery polling and state machine.
 */

// Polling schedule: 30s while searching → 10s once connected → 60s during backoff.
export const SEARCH_INTERVAL = 30000;
export const CONNECTED_INTERVAL = 10000;
export const BACKOFF_INTERVAL = 60000;
/** Consecutive missed polls before removing a server from the active list (2 × 10s = ~20s). */
export const MISS_THRESHOLD = 2;
/** Empty scans before entering backoff state (5 scans × 30s = 150s of no servers). */
export const BACKOFF_THRESHOLD = 5;
/** After this many backoff polls (~3min at 60s intervals), reset to searching for auto-recovery. */
export const BACKOFF_CYCLES = 3;
export const NOTIFY_THROTTLE_MS = 60000;
