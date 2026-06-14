/**
 * Host-panel English source strings — Database Health Score panel
 * ([../health/health-html.ts](../health/health-html.ts)). Plan 75 §3.1.
 *
 * One registry slice per panel family (see `HOST_STRING_REGISTRIES` in
 * [../l10n.ts](../l10n.ts)). Each entry maps a SYMBOLIC KEY → its ENGLISH text;
 * the panel's HTML builder resolves the key via `t()` so the string reaches the
 * translation pipeline instead of shipping English in every locale.
 *
 * Runtime values (counts, grades, scores) are passed as `{0}`/`{1}` tokens, never
 * concatenated English — `vscode.l10n.t()` substitutes them so a translator can
 * reorder the sentence. Grades (A–F) and `n/100` score fractions are data, not
 * catalog strings, and stay rendered from the metric objects directly.
 */

/** Symbolic key → English source text for the health-score panel. */
export const stringsPanelHealth: Record<string, string> = {
  // --- Empty / header chrome ---
  'panel.health.empty': 'No metrics available.',
  'panel.health.title': 'Database Health Score',
  'panel.health.btn.refresh': 'Refresh',
  'panel.health.btn.copyReport': 'Copy Report',
  'panel.health.btn.saveSnapshot': 'Save Snapshot',
  'panel.health.btn.compare': 'Compare',
  // {0} = history snapshot count, shown only when > 0 (e.g. "Compare (3)").
  'panel.health.btn.compareCount': 'Compare ({0})',
  // {0} = overall score 0–100.
  'panel.health.overall.score': 'Score: {0}/100',

  // --- Recommendations section ---
  'panel.health.recs.title': 'Recommendations',
  'panel.health.recs.none': 'No issues found. Great job!',
  'panel.health.rec.fix': 'Fix',

  // --- Refactoring advisor (session) section ---
  'panel.health.advisor.title': 'Refactoring advisor (session)',
  // {0}/{1} carry the counts already wrapped in <strong> at the call site (so the
  // bold emphasis survives) — the sentence stays one reorderable unit.
  'panel.health.advisor.summary':
    'Last analysis: {0} suggestion(s) across {1} tables.',
  // {0} = dismissed count (pre-wrapped in <strong>); appended only when > 0.
  'panel.health.advisor.dismissed': 'You dismissed {0} in the panel.',
  // {0} = timestamp of the last advisor run. "Schema Quality" is a fixed panel
  // name; its <strong> emphasis is static markup kept inline in the value.
  'panel.health.advisor.updated':
    'Updated {0}. Same summary is merged into <strong>Schema Quality</strong> details when you refresh the health score.',
  'panel.health.advisor.open': 'Open refactoring panel',

  // --- Drift Health panel (cross-tool join, plan 67 R4) ---
  // Tool labels keep the brand name (identity) and translate only the lens
  // descriptor after the dash. Per-finding text is the producing tool's own
  // already-localized title/detail, so it is not re-translated here.
  'panel.driftHealth.title': 'Drift Health',
  'panel.driftHealth.intro':
    'Static code, live data, and runtime behavior for each table, joined across the Saropa suite.',
  // {0} = total finding count across every table.
  'panel.driftHealth.count': '{0} finding(s) across the suite',
  'panel.driftHealth.empty':
    'No suite findings yet. Start the debug server and run Saropa Lints / Saropa Log Capture to populate this view.',
  'panel.driftHealth.col.advisor': 'Drift Advisor — runtime',
  'panel.driftHealth.col.lints': 'Saropa Lints — static',
  'panel.driftHealth.col.logCapture': 'Saropa Log Capture — telemetry',
  'panel.driftHealth.untabled': 'Query-level (no table)',
  'panel.driftHealth.btn.refresh': 'Refresh',
  // Shown on a finding captured at a different commit than the current checkout
  // (plan 67 R6) — it may no longer reflect the code in front of you.
  'panel.driftHealth.stale': 'stale',
  // Toolbar: severity filter + sort (plan 67 R4 polish). {0} = matching count.
  'panel.driftHealth.filter.all': 'All ({0})',
  'panel.driftHealth.filter.errors': 'Errors ({0})',
  'panel.driftHealth.filter.warnings': 'Warnings ({0})',
  'panel.driftHealth.filter.info': 'Info ({0})',
  'panel.driftHealth.sort.label': 'Sort:',
  'panel.driftHealth.sort.count': 'Findings',
  'panel.driftHealth.sort.name': 'Table name',

  // --- Commit Timeline panel (cross-commit trend, plan 67 R6 / §6) ---
  'panel.commitTimeline.title': 'Suite Commit Timeline',
  'panel.commitTimeline.intro':
    'Suite finding counts per commit over time — see whether a checkout added or cleared issues.',
  // {0} = number of commits with a recorded snapshot.
  'panel.commitTimeline.count': '{0} commit(s) tracked',
  'panel.commitTimeline.empty':
    'No commit history yet. Counts are recorded per commit while the debug server runs — come back after a few sessions.',
  'panel.commitTimeline.btn.refresh': 'Refresh',
  // Badge on the row whose commit matches the current checkout.
  'panel.commitTimeline.current': 'current',
  // Short tool labels for the per-commit breakdown chips.
  'panel.commitTimeline.tool.advisor': 'Advisor',
  'panel.commitTimeline.tool.lints': 'Lints',
  'panel.commitTimeline.tool.logCapture': 'Log Capture',
  // {0} = error count, {1} = warning count for the commit.
  'panel.commitTimeline.severity': '{0} error(s), {1} warning(s)',
  // Delta vs the previous commit. {0} = absolute change in total findings.
  'panel.commitTimeline.delta.up': '+{0} vs previous',
  'panel.commitTimeline.delta.down': '-{0} vs previous',
  'panel.commitTimeline.delta.same': 'no change',
  // Shown against the oldest snapshot, which has no earlier commit to compare to.
  'panel.commitTimeline.delta.first': 'first recorded',
};
