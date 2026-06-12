/**
 * Web-viewer navigation strings (System B, browser surface) — plan 75 §3.1.
 *
 * Cohesive slice for the standalone web viewer's navigation chrome: tabs
 * (assets/web/tabs.ts), the query-history sidebar (history-sidebar.ts), and the
 * Home launcher (home-screen.ts). Each entry maps a SYMBOLIC KEY → its ENGLISH
 * source text; render code resolves it through `vt()` ([../l10n.ts](../l10n.ts)),
 * and the English value here is the in-bundle fallback shown until a translation
 * overlay is installed for the active locale.
 *
 * WHY a registry instead of inline literals: a hardcoded display string never
 * reaches the translation pipeline, so it ships English in every locale. See
 * the seed registry [./strings-web.ts](./strings-web.ts) for the convention and
 * plan 75 §5.1 for the add-a-string workflow.
 *
 * Keys are namespaced `viewer.nav.*`. Use `{0}`, `{1}` placeholders for runtime
 * values — never English string concatenation, which a translator cannot
 * reorder. Singular/plural and if/ternary branches get separate keys.
 *
 * This slice is registered in `WEB_STRING_REGISTRIES` in [../l10n.ts](../l10n.ts)
 * (the merge list is explicit because esbuild bundles — there is no runtime glob).
 */

/** Symbolic key → English source text for the web viewer's navigation chrome. */
export const stringsWebNav: Record<string, string> = {
  // --- Tabs (assets/web/tabs.ts) ---
  'viewer.nav.tab.close': 'Close tab',
  // {0} is the tab's label — keep it a token so word order can vary per locale.
  'viewer.nav.tab.closeNamed': 'Close {0}',
  // Default Home tab label, used when the TOOL_LABELS lookup has no entry.
  'viewer.nav.tab.home': 'Home',
  // Bulk-close confirmation — singular vs plural are separate keys; {0} is the count.
  'viewer.nav.tab.closeOthers.one': 'Close {0} other tab?',
  'viewer.nav.tab.closeOthers.many': 'Close {0} other tabs?',

  // --- Query history sidebar (assets/web/history-sidebar.ts) ---
  'viewer.nav.history.empty': 'No queries yet.',
  // Row-count suffix in a history entry's meta line; {0} is the count.
  'viewer.nav.history.rows': '{0} row(s)',
  // Error marker shown in a history row / occurrences table when a run failed.
  'viewer.nav.history.errorMark': 'ERR',
  // (n) count badge tooltip; {0} is how many times the identical SQL ran.
  'viewer.nav.history.runsTooltip': 'Show all {0} runs of this query',
  // Occurrences dialog accessible name and title; {0} is the run count.
  'viewer.nav.history.dialog.ariaLabel': 'Query run history',
  'viewer.nav.history.dialog.title': 'Query runs ({0})',
  'viewer.nav.history.dialog.close': 'Close',
  // Occurrences table column headers.
  'viewer.nav.history.col.source': 'Source',
  'viewer.nav.history.col.time': 'Time',
  'viewer.nav.history.col.duration': 'Duration',
  'viewer.nav.history.dialog.copy': 'Copy',
  // Copy-success toast; {0} is the number of runs copied.
  'viewer.nav.history.copied': 'Copied {0} runs',
  // Clear-history confirmation.
  'viewer.nav.history.clearConfirm': 'Clear all query history?',
  // Relative-time phrases for a history entry's timestamp. Separate keys per unit
  // so each can be translated independently; {0} is the elapsed count.
  'viewer.nav.history.time.justNow': 'just now',
  'viewer.nav.history.time.seconds': '{0} s ago',
  'viewer.nav.history.time.minutes': '{0} m ago',
  'viewer.nav.history.time.hours': '{0} h ago',
  'viewer.nav.history.time.days': '{0} d ago',

  // --- Home launcher (assets/web/home-screen.ts) ---
  // Tool-card hover tooltip: "{0}" is the tool label, "{1}" its blurb. The em-dash
  // separator is fixed punctuation; both surrounding values are tokens so a
  // translator can reorder them.
  'viewer.nav.home.cardTooltip': '{0} — {1}',
};
