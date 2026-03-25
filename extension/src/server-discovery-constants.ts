/**
 * Constants for server discovery polling and state machine.
 */

// Polling schedule: 3s while searching → 10s once connected → 30s during backoff.
export const SEARCH_INTERVAL = 3000;
export const CONNECTED_INTERVAL = 10000;
export const BACKOFF_INTERVAL = 30000;
/** Consecutive missed polls before removing a server from the active list (2 × 10s = ~20s). */
export const MISS_THRESHOLD = 2;
/** Empty scans before entering backoff state (5 scans × 3s = 15s of no servers). */
export const BACKOFF_THRESHOLD = 5;
/** After this many backoff polls (~90s at 30s intervals), reset to searching for auto-recovery. */
export const BACKOFF_CYCLES = 3;
export const NOTIFY_THROTTLE_MS = 60000;
