/**
 * Web-viewer English source strings — Heartbeat surface slice (System B, browser).
 *
 * Symbolic key → English text for the Heartbeat screen (heartbeat-screen.ts):
 * the live table-activity board with the ECG-style monitor. Render code passes
 * these keys to `vt()` ([../l10n.ts](../l10n.ts)); the English value here is
 * the in-bundle fallback until a per-locale overlay is installed.
 *
 * WHY a registry instead of inline literals: a hardcoded display string never
 * reaches the translation pipeline, so it ships English in every locale.
 * Runtime values use `{0}` placeholders — never English string concatenation,
 * which a translator cannot reorder.
 *
 * Registered in `WEB_STRING_REGISTRIES` in [../l10n.ts](../l10n.ts).
 */

/** Symbolic key → English source text for the Heartbeat web surface. */
export const stringsWebHeartbeat: Record<string, string> = {
  // One-line intro under the tab title.
  'viewer.heartbeat.lead':
    'Live database activity. Tables light up as they are read and written; the monitor traces every event.',
  // Calm empty state — shown over the flatlining monitor until the first event.
  'viewer.heartbeat.waiting': 'Waiting for database activity…',
  'viewer.heartbeat.reads': 'Reads',
  'viewer.heartbeat.writes': 'Writes',
  // REQUIRED COPY: host-app writes are inferred from row-count diffs, never
  // fully observed — so this channel must say "detected", not claim capture.
  'viewer.heartbeat.detectedChanges': 'Detected changes',
  'viewer.heartbeat.detectedChanges.tooltip':
    'Changes made by the app itself, inferred from row-count differences. In-place updates that keep the row count are not visible.',
  'viewer.heartbeat.reads.tooltip': 'Read queries observed for this table.',
  'viewer.heartbeat.writes.tooltip': 'Write statements observed for this table.',
  // {0} is the cached row count for the table card.
  'viewer.heartbeat.rowCount': '{0} rows',
  'viewer.heartbeat.rowCountOne': '1 row',
  // Accessible name (and hover tooltip) for a card's per-table sparkline
  // canvas. {0} is the table name — the announcement must be tied to a
  // specific item, never a generic "activity chart".
  'viewer.heartbeat.sparkline.aria': 'Last 30 seconds of activity for {0}',
  // Vital readout label next to the live number on the monitor.
  'viewer.heartbeat.vitalLabel': 'events/min',
  // Accessible summary of the monitor for screen readers. {0} is events/min.
  'viewer.heartbeat.vitalSummary': 'Database activity: {0} events per minute',
  // Kill switch (server returned 403): monitoring is disabled server-side.
  'viewer.heartbeat.disabled': 'Server monitoring is disabled — activity is not being recorded.',
  // The /api/activity endpoint is missing (older server) — quiet degradation.
  'viewer.heartbeat.unavailable': 'This server does not provide the activity feed.',
  // Poll failed; retrying with backoff. Complements the global connection banner.
  'viewer.heartbeat.reconnecting': 'Connection lost — retrying…',
};
