/**
 * Web-viewer English source strings — settings, FK-nav, and diagram surfaces.
 *
 * Slice of the System B web-viewer registry (plan 75 §3.1) covering the
 * standalone-browser modules `settings.ts`, `fk-nav.ts`, and `diagram.ts`.
 * Each entry maps a SYMBOLIC KEY → its ENGLISH text; render code passes the
 * key to `vt()` ([../l10n.ts](../l10n.ts)) and the English value here is the
 * in-bundle fallback shown until a per-locale overlay is installed.
 *
 * WHY a registry instead of inline literals: a hardcoded display string never
 * reaches the translation pipeline, so it ships English in every locale.
 * Declaring it here (and rendering via `vt('key')`) is what lets the toolchain
 * extract, translate, and overlay it. See plan 75 §5.1 for the workflow.
 *
 * Keys are namespaced `viewer.settings.*` and grouped by `// --- <area> ---`
 * headers. Use `{0}`, `{1}` placeholders for runtime values — never English
 * string concatenation, which a translator cannot reorder. Singular/plural and
 * if/ternary variants are SEPARATE keys, never an `if` choosing between two
 * hardcoded English strings.
 *
 * Registered in `WEB_STRING_REGISTRIES` in [../l10n.ts](../l10n.ts).
 */

/** Symbolic key → English source text for the settings/fk-nav/diagram surfaces. */
export const stringsWebSettings: Record<string, string> = {
  // --- Settings panel: group titles (assets/web/settings.ts) ---
  'viewer.settings.group.storage': 'Storage & History',
  'viewer.settings.group.tableDefaults': 'Table Defaults',
  'viewer.settings.group.performance': 'Performance',
  'viewer.settings.group.dataFormatting': 'Data Formatting',
  'viewer.settings.group.ask': 'Ask in English',

  // --- Settings panel: storage & history ---
  'viewer.settings.storage.sqlHistoryMax': 'SQL history max entries',
  'viewer.settings.storage.maxAnalyses': 'Max saved analyses',
  'viewer.settings.storage.clearAll': 'Clear all stored data',
  'viewer.settings.storage.clearAllHint':
    'Removes pinned tables, table states, navigation history, SQL history, bookmarks, and saved analyses. Theme and sidebar preferences are kept.',
  // Transient confirmation shown on the Clear button after the data is cleared.
  'viewer.settings.storage.cleared': 'Cleared!',

  // --- Settings panel: table defaults ---
  'viewer.settings.table.defaultPageSize': 'Default page size',
  'viewer.settings.table.defaultDisplayFormat': 'Default display format',
  'viewer.settings.table.displayFormat.raw': 'Raw',
  'viewer.settings.table.displayFormat.formatted': 'Formatted',
  'viewer.settings.table.nullDisplay': 'NULL display',
  'viewer.settings.table.nullDisplaySub':
    'How SQL NULLs render in table cells (always shown dimmed)',
  // The dash option label keeps the literal dash glyph plus a clarifying word.
  'viewer.settings.table.nullDisplay.dash': '- (dash)',
  'viewer.settings.table.onlyMatching': 'Show only matching rows',
  'viewer.settings.table.onlyMatchingSub':
    'When a row filter is active, hide non-matching rows instead of highlighting them',

  // --- Settings panel: performance ---
  'viewer.settings.perf.slowQueryThreshold': 'Slow query threshold',
  'viewer.settings.perf.slowQueryThresholdSub':
    'Queries exceeding this duration (ms) are flagged in the Perf tab',
  'viewer.settings.perf.autoRefresh': 'Auto-refresh polling',
  'viewer.settings.perf.autoRefreshSub':
    'Automatically detect and reload when database data changes',

  // --- Settings panel: data formatting ---
  'viewer.settings.format.epochDetection': 'Auto-detect epoch timestamps',
  'viewer.settings.format.epochDetectionSub':
    'Automatically format large integers as dates when column names suggest timestamps',
  'viewer.settings.format.confirmNavigate': 'Confirm before leaving page',
  'viewer.settings.format.confirmNavigateSub':
    'Show a browser confirmation dialog when navigating away or closing the tab',

  // --- Settings panel: Ask in English (voice / keyword commands) ---
  'viewer.settings.ask.keywords': 'Voice command keywords',
  'viewer.settings.ask.keywordsSub':
    'Treat spoken phrases like "clear", "run again", and "what about last year" as commands instead of typing them into the question',

  // --- Settings panel: footer + confirm dialogs ---
  'viewer.settings.footer.resetAll': 'Reset all to defaults',
  'viewer.settings.confirm.clearAll':
    'Clear all stored project data? Theme and sidebar preferences will be kept.',
  'viewer.settings.confirm.resetAll': 'Reset all settings to their default values?',

  // --- FK navigation breadcrumb (assets/web/fk-nav.ts) ---
  // The arrow glyph (←) is a symbol prepended in code; only the word is here.
  'viewer.settings.fknav.back': 'Back',
  'viewer.settings.fknav.backTitle': 'Go back to previous table',
  'viewer.settings.fknav.clearPath': 'Clear path',
  'viewer.settings.fknav.clearPathTitle': 'Clear navigation trail',
  // {0} is the target table name — a token so word order can change per locale.
  'viewer.settings.fknav.jumpTitle': 'Jump to {0}',

  // --- ER diagram (assets/web/diagram.ts) ---
  'viewer.settings.diagram.noTables': 'No tables.',
  'viewer.settings.diagram.loading': 'Loading…',
  // {0} is the error text — kept a token so the prefix can be reordered.
  'viewer.settings.diagram.loadFailed': 'Failed to load diagram: {0}',
  // Soft-relationship "how it was inferred" descriptions (s.rule branch).
  'viewer.settings.diagram.rule.nounId': 'id-name convention',
  'viewer.settings.diagram.rule.sharedUuid': 'shared UUID column',
  // Column primary-key badge shown inside each table box.
  'viewer.settings.diagram.pk': 'PK',
  // Screen-reader text-alternative section headings.
  'viewer.settings.diagram.alt.tableList': 'Schema table list',
  'viewer.settings.diagram.alt.fkHeading': 'Foreign key relationships',
  'viewer.settings.diagram.alt.softHeading': 'Inferred (undeclared) relationships',
  // Soft-relationship suffix appended to an A.b → C.d edge line. {0} is the
  // "how" phrase (rule.nounId / rule.sharedUuid). The full edge string is
  // assembled at the call site with the arrow glyph as static markup.
  'viewer.settings.diagram.alt.softInferred': '(inferred from {0}, not declared)',

  // --- ER diagram: SVG aria-labels (singular/plural are separate keys) ---
  // {0} = table count. Singular vs plural picked by code, not an inline if.
  'viewer.settings.diagram.aria.tablesOne': '{0} table',
  'viewer.settings.diagram.aria.tablesMany': '{0} tables',
  // {0} = foreign-key relationship count.
  'viewer.settings.diagram.aria.fksOne': '{0} foreign key relationship',
  'viewer.settings.diagram.aria.fksMany': '{0} foreign key relationships',
  // {0} = inferred-relationship count. Leading conjunction included because it
  // joins onto the FK clause in the same aria sentence.
  'viewer.settings.diagram.aria.softOne': ' and {0} inferred (undeclared) relationship',
  'viewer.settings.diagram.aria.softMany': ' and {0} inferred (undeclared) relationships',
  // Full schema-diagram aria-label. {0} = tables clause, {1} = FK clause,
  // {2} = soft clause (may be empty). Joined with "and" inside the value so a
  // translator controls the phrasing around the three counts.
  'viewer.settings.diagram.aria.summary': 'Schema diagram showing {0} and {1}{2}',

  // --- ER diagram: per-table aria-label (singular/plural columns) ---
  // {0} = table name, {1} = column count. Two count variants; the optional
  // primary-key clause ({2}) is appended by code only when a PK exists.
  'viewer.settings.diagram.aria.tableOne': '{0} table, {1} column{2}',
  'viewer.settings.diagram.aria.tableMany': '{0} table, {1} columns{2}',
  // Appended to the per-table aria-label. {0} = comma-joined PK column names.
  'viewer.settings.diagram.aria.pkClause': ', primary key: {0}',

  // --- ER diagram: text-alternative per-table line (singular/plural) ---
  // {0} = table name (pre-wrapped <strong>), {1} = column count, {2} = column list.
  'viewer.settings.diagram.alt.tableOne': '{0} ({1} column): {2}',
  'viewer.settings.diagram.alt.tableMany': '{0} ({1} columns): {2}',
  // Primary-key marker appended to a column name in the text alternative.
  'viewer.settings.diagram.alt.pkMark': ' (PK)',
};
