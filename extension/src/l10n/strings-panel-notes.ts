/**
 * Host-panel English source strings — Notes & Snippets family: the Annotate form
 * ([../annotations/annotate-form-html.ts](../annotations/annotate-form-html.ts)),
 * the Annotations & Bookmarks panel
 * ([../annotations/annotation-panel-html.ts](../annotations/annotation-panel-html.ts)),
 * the Snapshot Changelog form
 * ([../changelog/changelog-form-html.ts](../changelog/changelog-form-html.ts)),
 * the SQL snippet card ([../snippets/snippet-card-html.ts](../snippets/snippet-card-html.ts)),
 * and the SQL snippet library ([../snippets/snippet-library-html.ts](../snippets/snippet-library-html.ts)).
 * Plan 75 §3.1.
 *
 * One registry slice per panel family (see `HOST_STRING_REGISTRIES` in
 * [../l10n.ts](../l10n.ts)). Each entry maps a SYMBOLIC KEY → its ENGLISH text;
 * the panel's HTML builder resolves the key via `t()` so the string reaches the
 * translation pipeline instead of shipping English in every locale.
 *
 * Runtime values (counts, table/column names, dates) are passed as `{0}`/`{1}`
 * tokens, never concatenated English — `vscode.l10n.t()` substitutes them so a
 * translator can reorder the sentence. Entity names, SQL, grades, and `data-*`
 * machine values stay rendered from the source objects directly.
 *
 * Client-side `<script>` strings inside each panel webview are NOT in this slice —
 * they run with no host `t()` and are left literal with a TODO(l10n) marker pending
 * the `__VT` webview bridge (plan 75 §3.3).
 */

/** Symbolic key → English source text for the notes / snippets panel family. */
export const stringsPanelNotes: Record<string, string> = {
  // --- Annotate form (annotate-form-html.ts) ---
  'panel.notes.annotate.title': 'Add Annotation',
  // {0} = entity kind ('table' / 'column'), {1} = target name (e.g. "users.email").
  'panel.notes.annotate.target': '{0}: {1}',
  'panel.notes.annotate.field.type': 'Type',
  'panel.notes.annotate.field.note': 'Note',
  'panel.notes.annotate.note.placeholder': 'e.g. "Unused column — candidate for removal"',
  'panel.notes.annotate.btn.submit': 'Add Annotation',
  'panel.notes.annotate.btn.cancel': 'Cancel',

  // --- Annotation icon type names (radio labels) ---
  'panel.notes.icon.note': 'note',
  'panel.notes.icon.warning': 'warning',
  'panel.notes.icon.bug': 'bug',
  'panel.notes.icon.star': 'star',
  'panel.notes.icon.pin': 'pin',
  'panel.notes.icon.todo': 'todo',
  'panel.notes.icon.bookmark': 'bookmark',

  // --- Annotations & Bookmarks panel (annotation-panel-html.ts) ---
  'panel.notes.panel.title': 'Annotations',
  'panel.notes.panel.copyJson.title': 'Copy as JSON',
  'panel.notes.panel.btn.copyJson': 'Copy JSON',
  'panel.notes.panel.btn.edit': 'Edit',
  'panel.notes.panel.btn.remove': 'Remove',
  'panel.notes.panel.empty.title': 'No annotations yet.',
  'panel.notes.panel.empty.hint':
    'Right-click a table or column in the Database Explorer to add an annotation.',

  // --- Snapshot Changelog form (changelog-form-html.ts) ---
  'panel.notes.changelog.title': 'Snapshot Changelog',
  'panel.notes.changelog.from.label': 'From (older snapshot)',
  'panel.notes.changelog.from.hint': 'The baseline snapshot to compare from',
  'panel.notes.changelog.to.label': 'To (newer snapshot)',
  'panel.notes.changelog.to.hint': 'The target snapshot to compare against',
  'panel.notes.changelog.sameError': 'Please select two different snapshots',
  'panel.notes.changelog.btn.submit': 'Generate Changelog',
  'panel.notes.changelog.btn.cancel': 'Cancel',

  // --- SQL snippet card (snippet-card-html.ts) ---
  'panel.notes.snippet.table.placeholder': '-- select table --',
  'panel.notes.snippet.btn.run': 'Run',
  'panel.notes.snippet.btn.cancel': 'Cancel',
  'panel.notes.snippet.btn.edit': 'Edit',
  'panel.notes.snippet.btn.delete': 'Delete',
  // {0} = use count (>= 1). The "(s)" plural is resolved by vscode.l10n at runtime
  // per the active locale's plural rules, so a single key carries both forms.
  'panel.notes.snippet.used': 'Used {0} time(s)',

  // --- SQL snippet library (snippet-library-html.ts) ---
  'panel.notes.library.title': 'SQL Snippet Library',
  'panel.notes.library.btn.new': '+ New',
  'panel.notes.library.btn.import': 'Import',
  'panel.notes.library.btn.export': 'Export',
  'panel.notes.library.search.placeholder': 'Search snippets...',
  'panel.notes.library.form.name': 'Name',
  'panel.notes.library.form.name.placeholder': 'Snippet name',
  'panel.notes.library.form.category': 'Category',
  'panel.notes.library.form.category.placeholder': 'Category',
  'panel.notes.library.form.description': 'Description',
  'panel.notes.library.form.description.placeholder': 'Optional description',
  'panel.notes.library.form.sql': 'SQL',
  'panel.notes.library.form.sql.placeholder': 'SELECT * FROM ...',
  'panel.notes.library.btn.save': 'Save',
  'panel.notes.library.btn.cancel': 'Cancel',
  'panel.notes.library.empty': 'No snippets yet. Click "+ New" to create one.',

  // --- SQL snippet library: client-script strings (resolved in-browser via the
  //     __VT bridge, since deleteSnippet()'s confirm() runs client-side). {0}
  //     carries the snippet name — never English concatenation. ---
  // {0} = snippet name being deleted (raw, shown inside a confirm() dialog).
  'panel.notes.library.confirm.delete': 'Delete snippet "{0}"?',
};
