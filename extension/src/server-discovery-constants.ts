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
/**
 * Grace period before a "server lost" toast is shown after the server drops
 * below [MISS_THRESHOLD]. On flaky links (e.g. wifi debugging on a physical
 * device) the server flaps — it disappears for a scan or two and reappears.
 * Without this grace the user gets a "no longer responding" warning toast plus
 * a "detected" toast on every blip. The disconnect is already reflected in the
 * sidebar/status, so the toast is deferred: if the server reappears within this
 * window the pending warning is cancelled (and the matching "detected" toast
 * suppressed). One SEARCH_INTERVAL (30s) + margin so a rediscovery on the very
 * next searching scan still cancels the warning. A genuine outage still shows
 * the toast once the window elapses.
 */
export const LOST_NOTIFY_GRACE_MS = 35000;
