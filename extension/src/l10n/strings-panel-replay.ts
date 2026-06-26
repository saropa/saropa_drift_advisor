/**
 * Host-panel English source strings — replay / time-machine panel family:
 * Query Replay DVR ([../dvr/dvr-html.ts](../dvr/dvr-html.ts)),
 * Time-Travel Data Slider ([../time-travel/time-travel-html.ts](../time-travel/time-travel-html.ts)),
 * Mutation Stream ([../mutation-stream/mutation-stream-html.ts](../mutation-stream/mutation-stream-html.ts)),
 * Watch panel ([../watch/watch-html.ts](../watch/watch-html.ts)),
 * Data Sampling Explorer ([../sampling/sampling-html.ts](../sampling/sampling-html.ts)).
 * Plan 75 §3.1.
 *
 * One registry slice per panel family (see `HOST_STRING_REGISTRIES` in
 * [../l10n.ts](../l10n.ts)). Each entry maps a SYMBOLIC KEY → its ENGLISH text;
 * the panel's HTML builder resolves the key via `t()` so the string reaches the
 * translation pipeline instead of shipping English in every locale.
 *
 * Runtime values (counts, table names, positions, timestamps) are passed as
 * `{0}`/`{1}` tokens, never concatenated English — `vscode.l10n.t()` substitutes
 * them so a translator can reorder the sentence. Table names, SQL, row data,
 * grades and `n/100`-style fractions are data, not catalog strings, and stay
 * rendered from the source objects directly.
 *
 * Strings inside a panel's client `<script>` block (rendered in the browser,
 * not by host `t()`) are NOT here — they carry a `// TODO(l10n): client-script
 * string` at their site pending the `vt()` webview bridge.
 */

/** Symbolic key → English source text for the replay / time-machine panels. */
export const stringsPanelReplay: Record<string, string> = {
  // --- DVR: toolbar ---
  'panel.replay.dvr.btn.start': 'Start',
  'panel.replay.dvr.btn.pause': 'Pause',
  'panel.replay.dvr.btn.stop': 'Stop',
  'panel.replay.dvr.btn.refresh': 'Refresh',
  'panel.replay.dvr.btn.export': 'Export JSON',
  'panel.replay.dvr.btn.openSql': 'Open SQL (editor)',
  'panel.replay.dvr.btn.openNotebook': 'Open in SQL Notebook',
  'panel.replay.dvr.btn.analyzeCost': 'Query Cost',
  'panel.replay.dvr.btn.snapshotDiff': 'Snapshot diff',
  'panel.replay.dvr.btn.snapshotDiff.title': 'Opens Saropa snapshot diff (timeline)',
  'panel.replay.dvr.btn.schemaRollback': 'Schema rollback…',
  'panel.replay.dvr.btn.schemaRollback.title': 'Schema snapshots → migration rollback wizard',

  // --- DVR: timeline ---
  'panel.replay.dvr.timeline.label': 'Timeline:',
  // {0} = current position, {1} = total (e.g. "3 of 12").
  'panel.replay.dvr.timeline.pos': '{0} of {1}',

  // --- DVR: filters ---
  'panel.replay.dvr.filter.search': 'Search',
  'panel.replay.dvr.filter.search.placeholder': 'SQL substring',
  'panel.replay.dvr.filter.kind': 'Kind',
  'panel.replay.dvr.filter.kind.all': 'All',
  'panel.replay.dvr.filter.kind.reads': 'Reads',
  'panel.replay.dvr.filter.kind.writes': 'Writes',
  'panel.replay.dvr.filter.table': 'Table',
  'panel.replay.dvr.filter.table.placeholder': 'table name',
  'panel.replay.dvr.filter.apply': 'Apply',

  // --- DVR: status / empty / detail ---
  'panel.replay.dvr.empty': 'No queries match the current filters.',
  'panel.replay.dvr.status.recording': 'Recording',
  'panel.replay.dvr.status.stopped': 'Stopped',
  // {0} = recording/stopped status, {1} = session id, {2} = captured count,
  // {3} = max-queries cap, {4} = capture-before-after flag.
  'panel.replay.dvr.status.line':
    'Status: {0} · session={1} · count={2} · maxQueries={3} · captureBeforeAfter={4}',
  'panel.replay.dvr.detail.title': 'Selection detail',

  // --- Time-travel: controls ---
  'panel.replay.timeTravel.table': 'Table:',
  'panel.replay.timeTravel.speed': 'Speed:',
  'panel.replay.timeTravel.prev.title': 'Previous snapshot',
  'panel.replay.timeTravel.playPause.title': 'Play / pause',
  'panel.replay.timeTravel.next.title': 'Next snapshot',
  'panel.replay.timeTravel.position.empty': 'No snapshots',
  // "Create Branch Here" (Feature 60 Phase 5): branch the snapshot at the slider position.
  'panel.replay.timeTravel.branch.label': 'Create Branch Here',
  'panel.replay.timeTravel.branch.title':
    'Save this snapshot as a data branch you can diff, merge to SQL, or restore',

  // --- Time-travel: client-script strings (resolved in-browser via the __VT
  //     bridge, since renderState() runs client-side). {0}/{1}/{2} tokens carry
  //     the position index, total, formatted time and table name — never English
  //     concatenation, so a translator can reorder the sentence. ---
  // {0} = current snapshot (1-based), {1} = total snapshots, {2} = formatted time.
  'panel.replay.timeTravel.position.snapshot': 'Snapshot {0} of {1} — {2}',
  'panel.replay.timeTravel.position.none': 'No snapshots captured yet',
  // {0} = table name (already HTML-escaped at the call site).
  'panel.replay.timeTravel.grid.empty': 'No rows for "{0}" at this snapshot.',

  // --- Mutation stream ---
  'panel.replay.mutation.title': 'Mutation Stream',
  'panel.replay.mutation.loading': 'Loading schema…',
  'panel.replay.mutation.loading.aria': 'Loading',
  'panel.replay.mutation.status.paused': 'Paused',
  'panel.replay.mutation.status.live': 'Live',
  // {0} = paused/live status. Trailing sentence describes what the stream shows.
  'panel.replay.mutation.subtitle':
    '{0} — filter and inspect semantic INSERT/UPDATE/DELETE events.',
  'panel.replay.mutation.filter.table': 'Table',
  'panel.replay.mutation.filter.table.all': 'All tables',
  'panel.replay.mutation.filter.operation': 'Operation',
  'panel.replay.mutation.filter.op.all': 'All operations',
  'panel.replay.mutation.filter.mode': 'Filter',
  'panel.replay.mutation.filter.mode.freeText': 'Free-text Search',
  'panel.replay.mutation.filter.mode.columnValue': 'Column value',
  'panel.replay.mutation.filter.search': 'Search',
  'panel.replay.mutation.filter.search.placeholder': 'Search values…',
  'panel.replay.mutation.filter.column': 'Column',
  'panel.replay.mutation.filter.column.none': 'No columns available',
  'panel.replay.mutation.filter.value': 'Value',
  'panel.replay.mutation.filter.value.placeholder': 'Match value…',
  'panel.replay.mutation.btn.pause': 'Pause',
  'panel.replay.mutation.btn.resume': 'Resume',
  'panel.replay.mutation.btn.export': 'Export JSON',
  'panel.replay.mutation.card.viewRow': 'View Row',
  'panel.replay.mutation.empty': 'No events yet (or filtered out).',

  // --- Watch panel: empty state ---
  'panel.replay.watch.empty.title': 'No active watches',
  // "Watch Table" is the literal context-menu item; its <b> emphasis is static
  // markup kept inline in the value so the sentence stays one reorderable unit.
  'panel.replay.watch.empty.hint':
    'Right-click a table in the Database explorer and select <b>Watch Table</b>',

  // --- Watch panel: client-script strings (resolved in-browser via the __VT
  //     bridge, since the panel's render functions run client-side). {0} tokens
  //     carry counts / formatted times — never English concatenation. ---
  'panel.replay.watch.rows': '{0} rows',
  // Leading separator + label prepended to the card meta line: "5 rows · changed 3s ago".
  'panel.replay.watch.changedSuffix': ' · changed {0}',
  'panel.replay.watch.resume': 'Resume',
  'panel.replay.watch.pause': 'Pause',
  'panel.replay.watch.clear': 'Clear',
  'panel.replay.watch.remove': 'Remove',
  'panel.replay.watch.summary.added': '{0} added',
  'panel.replay.watch.summary.removed': '{0} removed',
  'panel.replay.watch.summary.changed': '{0} changed',
  'panel.replay.watch.summary.unchanged': '{0} unchanged',
  'panel.replay.watch.time.justNow': 'just now',
  'panel.replay.watch.time.seconds': '{0}s ago',
  'panel.replay.watch.time.minutes': '{0}m ago',

  // --- Sampling: header / form ---
  // {0} = table name (kept literal, passed as a token).
  'panel.replay.sampling.title': 'Data Sampling — {0}',
  // {0} = total row count (already locale-formatted at the call site).
  'panel.replay.sampling.badge.rows': '{0} rows',
  'panel.replay.sampling.mode': 'Mode:',
  'panel.replay.sampling.mode.random': 'Random',
  'panel.replay.sampling.mode.stratified': 'Stratified',
  'panel.replay.sampling.mode.percentile': 'Percentile',
  'panel.replay.sampling.mode.cohort': 'Cohort',
  'panel.replay.sampling.size': 'Size:',
  'panel.replay.sampling.groupBy': 'Group by:',
  'panel.replay.sampling.column': 'Column:',
  'panel.replay.sampling.range': 'Range:',
  'panel.replay.sampling.btn.sample': 'Sample',
  'panel.replay.sampling.searching': 'Sampling…',

  // --- Sampling: results ---
  'panel.replay.sampling.result.empty': 'No rows returned.',
  // {0} = sampled row count, {1} = percentage of total, {2} = total rows,
  // {3} = query duration in ms (e.g. "50 rows (1.2% of 4000) in 8ms").
  'panel.replay.sampling.result.summary': '{0} rows ({1}% of {2}) in {3}ms',
  'panel.replay.sampling.btn.exportCsv': 'Export CSV',
  'panel.replay.sampling.btn.copySql': 'Copy SQL',
  // {0} = shown row count (200), {1} = total available rows.
  'panel.replay.sampling.truncated':
    'Showing {0} of {1} rows. Export CSV for full data.',

  // --- Sampling: cohort table headers ---
  'panel.replay.sampling.cohort.col.cohort': 'Cohort',
  'panel.replay.sampling.cohort.col.count': 'Count',
  'panel.replay.sampling.cohort.col.percent': '%',
  // {0} = numeric column name, for the per-cohort aggregate headers.
  'panel.replay.sampling.cohort.col.avg': 'Avg {0}',
  'panel.replay.sampling.cohort.col.min': 'Min {0}',
  'panel.replay.sampling.cohort.col.max': 'Max {0}',
};
