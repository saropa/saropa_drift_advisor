/**
 * Web-viewer English source strings (System B, browser surface) — plan 75 §3.1.
 *
 * Single source of truth for every user-facing string the standalone web viewer
 * (`assets/web/`) renders. Each entry maps a SYMBOLIC KEY → its ENGLISH text.
 * The symbolic key is what render code passes to `vt()` ([../l10n.ts](../l10n.ts));
 * the English value here is the in-bundle fallback shown until a translation
 * overlay (`assets/web/l10n/web.<locale>.json`) is installed for the active locale.
 *
 * WHY a registry instead of inline literals: a hardcoded display string never
 * reaches the translation pipeline, so it ships English in every locale. Declaring
 * it here (and rendering via `vt('key')`) is what lets the toolchain extract,
 * translate, and overlay it. See plan 75 §5.1 for the add-a-string workflow.
 *
 * Keys are namespaced by surface (`viewer.toolbar.*`, `nl.modal.*`, `msg.*`) so
 * collisions across modules are not expected. Use `{0}`, `{1}` placeholders for
 * runtime values — never English string concatenation, which cannot be reordered
 * by a translator.
 *
 * Keep this file under the 300-line limit; when it grows, extract a cohesive slice
 * into the next `strings-web-<letter>.ts` and add it to `WEB_STRING_REGISTRIES` in
 * [../l10n.ts](../l10n.ts) (the merge list is explicit because esbuild bundles, so
 * there is no runtime glob).
 *
 * SCOPE NOTE: this is the framework seed, not the full string sweep (plan 75
 * Phase 3). It carries a representative handful of real keys to establish the
 * convention; the bulk migration of `assets/web/*.ts` call sites follows.
 */

/** Symbolic key → English source text for the web viewer. */
export const webStrings: Record<string, string> = {
  // --- Toolbar (assets/web/toolbar.ts) ---
  'viewer.toolbar.sidebar.toggle': 'Toggle sidebar',
  'viewer.toolbar.history.toggle': 'Toggle query history',
  'viewer.toolbar.mask.toggle': 'Mask PII',
  'viewer.toolbar.theme.label': 'Theme',
  'viewer.toolbar.share.label': 'Share session',

  // --- Natural-language modal (assets/web/nl-modal.ts) ---
  'nl.modal.title': 'Ask in English',
  'nl.modal.placeholder': 'Describe the rows you want, in plain English…',
  'nl.modal.use': 'Use',
  'nl.modal.cancel': 'Cancel',
  'nl.modal.dictate': 'Dictate',
  'nl.modal.copySql': 'Copy SQL',
  'nl.modal.preview': 'Preview results',

  // --- Generic status / feedback messages (assets/web/utils.ts consumers) ---
  // {0} is the concrete value (e.g. a SQL snippet, a count) — keep it a token,
  // never concatenated English, so word order can change per locale.
  'msg.copied': 'Copied to clipboard',
  'msg.sqlCopied': 'SQL copied to clipboard',
  'msg.errorCopied': 'Error copied to clipboard',
  'msg.rowsAffected': '{0} rows affected',
};
