/**
 * Web-viewer English source strings — session / connection / persistence /
 * performance / pagination slice (System B, browser surface) — plan 75.
 *
 * Single source of truth for the user-facing strings rendered by
 * `assets/web/connection.ts`, `session.ts`, `performance.ts`, and
 * `pagination.ts`. Each entry maps a SYMBOLIC KEY (`viewer.session.*`) → its
 * ENGLISH text; render code passes the key to `vt()` ([../l10n.ts](../l10n.ts))
 * and the English value here is the in-bundle fallback until a locale overlay
 * is installed.
 *
 * `{0}`/`{1}` placeholders carry runtime values (counts, seconds, error text,
 * SQL snippets) so word order can be reordered per locale — never English
 * string concatenation around the dynamic part.
 *
 * Registered in `WEB_STRING_REGISTRIES` in [../l10n.ts](../l10n.ts) (the merge
 * list is explicit because esbuild bundles — no runtime glob). Keep under the
 * 300-line limit; overflow extracts into `strings-web-session-b.ts`.
 */

/** Symbolic key → English source text for the session slice. */
export const stringsWebSession: Record<string, string> = {
  // --- Connection banner (assets/web/connection.ts) ---
  // The decorative bullet/em-dash/ellipsis punctuation stays inside each value
  // because it belongs to the sentence, not to code. {0} is the dynamic count
  // (seconds, interval, attempt number) kept as a token so it can be reordered.
  'viewer.session.banner.reconnecting': 'Reconnecting…',
  'viewer.session.banner.restoring': 'Restoring connection…',
  'viewer.session.banner.lost.checking': 'Connection lost — checking…',
  'viewer.session.banner.lost.nextRetry': 'Connection lost — next retry in {0}s',
  'viewer.session.banner.lost.reconnecting': 'Connection lost — reconnecting…',
  'viewer.session.banner.attempt': 'Attempt {0}',
  'viewer.session.banner.retryingEvery': 'Retrying every {0}s',
  'viewer.session.banner.maxInterval': '(max interval)',

  // --- Session share / restore (assets/web/session.ts) ---
  // {0} is the share URL or the localized expiry timestamp; {1} keeps a second
  // dynamic value where two appear in one prompt/alert.
  'viewer.session.share.copied': 'Share URL copied to clipboard!\n\n{0}\n\nExpires: {1}',
  'viewer.session.share.promptCopy': 'Copy this share URL:',
  'viewer.session.share.promptNote': 'Add a note for your team (optional):\n\nSession will expire in 1 hour.',
  'viewer.session.share.busy': 'Sharing…',
  'viewer.session.share.menuLabel': 'Share',
  'viewer.session.share.failed': 'Failed to create share: {0}',
  // {0} = HTTP status code; surfaced to the user inside the share-failed alert.
  'viewer.session.share.serverError': 'Server error {0}',

  // --- Session expired / restore banners (assets/web/session.ts) ---
  'viewer.session.expired.title': 'Session Expired',
  'viewer.session.expired.body': 'The shared session you are trying to access has expired or was not found.',
  'viewer.session.expired.hint': 'Sessions expire after 1 hour. Ask the person who shared the link to create a new one.',

  // --- Session countdown / extend (assets/web/session.ts) ---
  // {0} = minutes, {1} = seconds where both appear.
  'viewer.session.countdown.expired': 'EXPIRED',
  'viewer.session.countdown.expiresInMinSec': 'Expires in {0}m {1}s',
  'viewer.session.countdown.expiresInMin': 'Expires in {0} min',
  'viewer.session.countdown.warning': 'Warning: This session expires in less than 10 minutes. Click "Extend" to add more time.',
  'viewer.session.extend.label': 'Extend',
  'viewer.session.extend.title': 'Extend session by 1 hour',
  'viewer.session.extend.busy': 'Extending…',
  'viewer.session.extend.done': 'Session extended!',
  'viewer.session.extend.failed': 'Failed to extend session: {0}',
  // Surfaced as the {0} inside extend.failed when the server rejects the request.
  'viewer.session.extend.serverError': 'Failed to extend session',

  // --- Session info bar (assets/web/session.ts) ---
  // info bar text: "Shared session" with optional note then created timestamp.
  // {0} = escaped note, {1} = localized created timestamp.
  'viewer.session.info.shared': 'Shared session',
  'viewer.session.info.sharedWithNote': 'Shared session: "{0}"',
  'viewer.session.info.created': ' (created {0})',
  'viewer.session.annotations.heading': 'Annotations:',

  // --- Performance tab (assets/web/performance.ts) ---
  // {0} carries an escaped error message or SQL snippet; numeric stats are
  // pre-escaped at the call site and injected via {0}.
  'viewer.session.perf.loading': 'Loading…',
  'viewer.session.perf.update': 'Update',
  'viewer.session.perf.empty': 'No queries recorded yet. Browse some tables, then update.',
  'viewer.session.perf.emptySaved': 'No queries recorded (saved run).',
  'viewer.session.perf.noData': 'No data.',
  'viewer.session.perf.noQueriesInRun': 'No queries in this run.',
  'viewer.session.perf.error': 'Error: {0}',
  'viewer.session.perf.cleared': 'Performance history cleared.',
  'viewer.session.perf.clearing': 'Clearing…',
  'viewer.session.perf.clear': 'Clear',
  'viewer.session.perf.saved': 'Saved',
  'viewer.session.perf.saveFailed': 'Save failed (storage may be full)',
  'viewer.session.perf.requestFailed': 'Request failed',
  'viewer.session.perf.clearFailed': 'Clear failed',
  'viewer.session.perf.compareLabel': 'Query performance',
  // Summary line stats: {0} = total queries, total ms, avg ms.
  'viewer.session.perf.summary.total': 'Total: {0} queries',
  'viewer.session.perf.summary.totalTime': 'Total time: {0} ms',
  'viewer.session.perf.summary.avg': 'Avg: {0} ms',
  // Slow-query section. {0} = threshold ms.
  'viewer.session.perf.slow.heading': 'Slow queries (&gt;{0}ms):',
  'viewer.session.perf.patterns.heading': 'Most time-consuming patterns:',
  'viewer.session.perf.recent.heading': 'Recent queries (newest first):',
  // Compare summary: {0} = before count, {1} = after count.
  'viewer.session.perf.compareSummary': 'Before: {0} queries · After: {1} queries',
  // Table column headers.
  'viewer.session.perf.col.duration': 'Duration',
  'viewer.session.perf.col.rows': 'Rows',
  'viewer.session.perf.col.time': 'Time',
  'viewer.session.perf.col.sql': 'SQL',
  'viewer.session.perf.col.totalMs': 'Total ms',
  'viewer.session.perf.col.count': 'Count',
  'viewer.session.perf.col.avgMs': 'Avg ms',
  'viewer.session.perf.col.maxMs': 'Max ms',
  'viewer.session.perf.col.pattern': 'Pattern',
  'viewer.session.perf.col.ms': 'ms',

  // --- Pagination bar (assets/web/pagination.ts) ---
  // {0}=from, {1}=to, {2}=total in the range readout; {0}=page elsewhere.
  'viewer.session.pagination.zeroRows': '0 rows',
  'viewer.session.pagination.showingRange': 'Showing {0}–{1} of {2} rows',
  'viewer.session.pagination.pageUnknownTotal': 'Page {0} (total unknown)',
  'viewer.session.pagination.pageLabel': 'Page ',
  'viewer.session.pagination.currentPageAria': 'Current page',
  'viewer.session.pagination.of': ' of {0}',
  'viewer.session.column.unpin': 'Unpin',
  'viewer.session.column.pin': 'Pin',
  'viewer.session.column.unpin.title': 'Unpin this column',
  'viewer.session.column.pin.title': 'Pin this column to the left',
};
