/**
 * Web-viewer English source strings — Views surface slice (System B, browser).
 *
 * Symbolic key → English text for the dedicated Views screen (views-screen.ts),
 * which lists the database's views and shows each view's CREATE VIEW definition
 * alongside a sample of its output. Render code passes these keys to `vt()`
 * ([../l10n.ts](../l10n.ts)); the English value here is the in-bundle fallback
 * until a per-locale overlay is installed.
 *
 * WHY a registry instead of inline literals: a hardcoded display string never
 * reaches the translation pipeline, so it ships English in every locale.
 * Declaring it here (and rendering via `vt('key')`) is what lets the toolchain
 * extract, translate, and overlay it. Runtime values use `{0}` placeholders —
 * never English string concatenation, which a translator cannot reorder.
 *
 * Registered in `WEB_STRING_REGISTRIES` in [../l10n.ts](../l10n.ts).
 */

/** Symbolic key → English source text for the Views web surface. */
export const stringsWebViews: Record<string, string> = {
  'viewer.views.loading': 'Loading…',
  'viewer.views.loadError': 'Could not load views.',
  // Shown when the database has no views at all.
  'viewer.views.empty': 'This database has no views.',
  // {0} is the number of views found.
  'viewer.views.count': '{0} views',
  'viewer.views.countOne': '1 view',
  'viewer.views.selectHint': 'Select a view to see its definition and output.',
  'viewer.views.definition': 'Definition',
  'viewer.views.output': 'Output',
  // Shown next to the Output label when results are capped. {0} is the row cap.
  'viewer.views.outputLimited': 'first {0} rows',
  'viewer.views.outputEmpty': 'This view returned no rows.',
  'viewer.views.outputError': 'Could not run this view.',
  // Shown in the definition box when sqlite_master stored no DDL for the view.
  'viewer.views.noDefinition': 'No stored definition for this view.',
};
