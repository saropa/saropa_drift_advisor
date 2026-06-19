/**
 * Web-viewer English source strings — SQL runner, history, and natural-language
 * surfaces (System B, browser app) — plan 75 §3.1.
 *
 * Slice of the web string registry covering the Run SQL panel
 * ([../sql-runner.ts](../sql-runner.ts)), SQL history + bookmarks
 * ([../sql-history.ts](../sql-history.ts)), the NL→SQL converter narration
 * ([../nl-to-sql.ts](../nl-to-sql.ts)), and the Ask-in-English panel
 * ([../nl-modal.ts](../nl-modal.ts)). Each entry maps a SYMBOLIC KEY → its
 * ENGLISH text; render code passes the key to `vt()` ([../l10n.ts](../l10n.ts)).
 *
 * Keys are namespaced `viewer.sql.<area>.<name>`. `{0}`/`{1}` are positional
 * runtime values (a count, a table name, a temporal phrase) — never English
 * concatenation, which a translator cannot reorder. if/ternary branches and
 * singular/plural forms get SEPARATE keys so each variant is independently
 * translatable.
 *
 * Strings whose English already exists in the seed registry
 * ([./strings-web.ts](./strings-web.ts)) are NOT redefined here — the render
 * code reuses `nl.modal.*` / `msg.*` directly. This slice only adds keys not
 * already covered.
 *
 * Registered in `WEB_STRING_REGISTRIES` ([../l10n.ts](../l10n.ts)); kept under
 * the 300-line limit (overflow → `strings-web-sql-b.ts`).
 */

/** Symbolic key → English source text for the SQL / NL web surfaces. */
export const stringsWebSql: Record<string, string> = {
  // --- Run SQL panel: template lock toggle (sql-runner.ts) ---
  'viewer.sql.template.lock.locked': 'Lock: auto-apply template when table or fields change',
  'viewer.sql.template.lock.unlocked': 'Unlocked: table/field changes won’t auto-apply template',

  // --- Run SQL panel: column dropdown placeholders (sql-runner.ts) ---
  // The em-dash option is the "no field selected" placeholder; "Loading…" shows
  // while columns are fetched for the chosen table.
  'viewer.sql.fields.loading': 'Loading…',

  // --- Run SQL panel: result table + pagination (sql-runner.ts) ---
  'viewer.sql.result.prev': 'Prev',
  'viewer.sql.result.next': 'Next',
  // {0} is the row count; "row(s)" stays inside the value so plural handling is
  // the translator's, not English concatenation's.
  'viewer.sql.result.rowCount': '{0} row(s)',
  // Collapsible results-section heading; {0} is the total row count (singular /
  // plural separate so the translator controls agreement).
  'viewer.sql.result.heading.one': 'Results ({0} row)',
  'viewer.sql.result.heading.many': 'Results ({0} rows)',
  // ARIA label for the results region.
  'viewer.sql.result.regionLabel': 'Query results',

  // --- Run SQL panel: copy / export result table (sql-runner.ts) ---
  'viewer.sql.result.copy.label': 'Copy table:',
  'viewer.sql.result.copy.markdown': 'Markdown',
  'viewer.sql.result.copy.csv': 'CSV',
  'viewer.sql.result.copy.json': 'JSON',
  // Toast confirmations name the exact format copied.
  'viewer.sql.result.copy.done.markdown': 'Copied table as Markdown',
  'viewer.sql.result.copy.done.csv': 'Copied table as CSV',
  'viewer.sql.result.copy.done.json': 'Copied table as JSON',
  'viewer.sql.result.copy.empty': 'No rows to copy.',
  'viewer.sql.result.copy.failed': 'Could not copy to the clipboard.',

  // --- Run SQL panel: run button + errors (sql-runner.ts) ---
  'viewer.sql.run.busy': 'Running…',
  'viewer.sql.run.emptyQuery': 'Enter a SELECT query.',
  'viewer.sql.run.requestFailed': 'Request failed',

  // --- Run SQL panel: auto-explain (sql-runner.ts) ---
  'viewer.sql.explain.analyzing': 'Analyzing query…',
  'viewer.sql.explain.failed': 'Explain failed',
  'viewer.sql.explain.estimatedCost': 'Estimated cost:',
  // Cost rating words shown next to the estimate.
  'viewer.sql.explain.cost.low': 'Low',
  'viewer.sql.explain.cost.medium': 'Medium',
  'viewer.sql.explain.cost.high': 'High',
  // Cost-summary parts; {0} is the count. Singular / plural are separate keys.
  'viewer.sql.explain.part.scan.one': '{0} full scan',
  'viewer.sql.explain.part.scan.many': '{0} full scans',
  'viewer.sql.explain.part.lookup.one': '{0} index lookup',
  'viewer.sql.explain.part.lookup.many': '{0} index lookups',
  'viewer.sql.explain.part.subquery.one': '{0} subquery',
  'viewer.sql.explain.part.subquery.many': '{0} subqueries',
  'viewer.sql.explain.part.sort': 'sort',
  'viewer.sql.explain.part.tempStorage': 'temp storage',
  // Index-report badges per table.
  'viewer.sql.explain.badge.fullScan': 'full scan',
  'viewer.sql.explain.badge.noIndexes': 'no indexes',
  'viewer.sql.explain.badge.used': 'used',
  'viewer.sql.explain.badge.available': 'available',
  // Collapsible plan-detail summary; {0} is the step count (singular / plural).
  'viewer.sql.explain.steps.one': 'Query plan detail ({0} step)',
  'viewer.sql.explain.steps.many': 'Query plan detail ({0} steps)',

  // --- SQL history + bookmarks dropdowns (sql-history.ts) ---
  'viewer.sql.history.recent': '— Recent —',
  // {0} is the number of saved queries.
  'viewer.sql.bookmarks.saved': '— Saved queries ({0}) —',
  // Prompt shown when naming a query to bookmark.
  'viewer.sql.bookmarks.namePrompt': 'Name for this query:',
  // {0} is the saved-query name being deleted.
  'viewer.sql.bookmarks.deleteConfirm': 'Delete saved query “{0}”?',
  'viewer.sql.bookmarks.exportEmpty': 'No saved queries to export.',
  'viewer.sql.bookmarks.importExpectedArray': 'Expected JSON array',
  // {0} = newly imported count, {1} = skipped duplicate count.
  'viewer.sql.bookmarks.importResult': 'Imported {0} new saved query(s). {1} duplicate(s) skipped.',
  // {0} is the underlying error message.
  'viewer.sql.bookmarks.importInvalid': 'Invalid file: {0}',

  // --- Ask panel: refinement chip tooltips (nl-modal.ts) ---
  // {0} is the chip's NL phrase. The phrase stays English: it is appended to the
  // question and re-parsed by the English-only converter (a functional token,
  // like a SQL keyword), so only the action verb here is localized.
  'viewer.sql.nl.chip.add': 'Add: {0}',
  'viewer.sql.nl.chip.remove': 'Remove: {0}',

  // --- Ask panel: refine-in-English hint (nl-modal.ts) ---
  // {0} is the combined refined question text.
  'viewer.sql.nl.refineHint': 'Refining last query: {0}',

  // --- Ask panel: dictation errors (nl-modal.ts) ---
  'viewer.sql.nl.mic.blocked': 'Microphone access was blocked. Allow it in your browser to dictate.',
  'viewer.sql.nl.mic.noSpeech': 'No speech detected. Tap the mic and try again.',
  // {0} is the speech-recognition error code.
  'viewer.sql.nl.mic.error': 'Speech recognition error: {0}',

  // --- Ask panel: clarifier hint (nl-modal.ts) ---
  // {0} is the guessed table name.
  'viewer.sql.nl.clarify.guessed': 'Guessed “{0}” — pick a table if that’s wrong',

  // --- Ask panel: status / error messages (nl-modal.ts) ---
  'viewer.sql.nl.convertFailed': 'Could not convert to SQL.',
  'viewer.sql.nl.noQuestion': 'I heard you, but I didn’t catch a question — try “how many contacts were added last week?”',
  'viewer.sql.nl.enterQuestion': 'Enter a question first.',
  // {0} is the underlying error message.
  'viewer.sql.nl.error': 'Error: {0}',
  'viewer.sql.nl.copyEmpty': 'Nothing to copy yet — enter a question first.',
  'viewer.sql.nl.copyFailed': 'Could not copy to the clipboard.',
  'viewer.sql.nl.previewNeedsSql': 'Enter a question to generate SQL first.',
  'viewer.sql.nl.previewFailed': 'Preview failed.',
  // {0} is the underlying error message.
  'viewer.sql.nl.previewError': 'Preview error: {0}',
  'viewer.sql.nl.preview.busy': 'Running…',

  // --- Ask panel: preview-result rows (nl-modal.ts) ---
  'viewer.sql.nl.results.empty': 'Query ran — 0 rows.',
  // {0} is the number of rows shown.
  'viewer.sql.nl.results.firstRows': 'First {0} row(s)',

  // --- NL narration: generic fallback nouns (nl-to-sql.ts) ---
  // Substituted into the narration sentences when the table / aggregate column
  // name is unknown, so the sentence stays grammatical instead of blank.
  'viewer.sql.narrate.fallback.rows': 'rows',
  'viewer.sql.narrate.fallback.value': 'value',

  // --- NL narration: spoken-style answers (nl-to-sql.ts) ---
  // Verb-keyed count sentences: {0} = number, {1} = table, {2} = temporal
  // qualifier (verbatim user phrase, may be empty). Three verbs → three keys so
  // each reads naturally and is independently translatable.
  'viewer.sql.narrate.count.has': 'Your database has {0} {1}{2}.',
  'viewer.sql.narrate.count.added': 'Your database added {0} {1}{2}.',
  'viewer.sql.narrate.count.changed': 'Your database changed {0} {1}{2}.',
  // Aggregate sentences: {0} = column, {1} = table, {2} = qualifier, {3} = value.
  'viewer.sql.narrate.sum': 'The total {0} across {1}{2} is {3}.',
  'viewer.sql.narrate.avg': 'The average {0} for {1}{2} is {3}.',
  'viewer.sql.narrate.max': 'The highest {0} for {1}{2} is {3}.',
  'viewer.sql.narrate.min': 'The lowest {0} for {1}{2} is {3}.',
  // Distinct / duplicate: {0} = count, {1} = column. Singular / plural separate.
  'viewer.sql.narrate.distinct.one': 'Found {0} distinct {1} value.',
  'viewer.sql.narrate.distinct.many': 'Found {0} distinct {1} values.',
  'viewer.sql.narrate.duplicate.one': 'Found {0} {1} value that repeat.',
  'viewer.sql.narrate.duplicate.many': 'Found {0} {1} values that repeat.',
  // Group: {0} = count, {1} = table, {2} = qualifier. Singular / plural separate.
  'viewer.sql.narrate.group.one': '{0} group of {1}{2}.',
  'viewer.sql.narrate.group.many': '{0} groups of {1}{2}.',
  // Rows / latest / oldest fallback: {0} = count, {1} = table, {2} = qualifier.
  'viewer.sql.narrate.found': 'Found {0} {1}{2}.',

  // --- NL converter errors (nl-to-sql.ts) ---
  'viewer.sql.nl.noTables': 'No tables in the schema to query.',
};
