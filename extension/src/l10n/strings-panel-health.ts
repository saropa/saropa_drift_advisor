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
};
