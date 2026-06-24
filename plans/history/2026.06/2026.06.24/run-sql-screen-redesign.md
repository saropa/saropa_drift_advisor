# Run SQL screen — controls redesign

The Run SQL screen in the web viewer rendered its query-building controls as two
flat wrapping toolbars in which the Fields `<select multiple>` had no fixed size,
so the browser expanded it into a tall narrow column that dominated the panel.
This change regroups those controls into an aligned card, constrains the Fields
list to a compact fixed-height scroll box, and raises the editor's default
height.

## Finish Report (2026-06-24)

### Defect

The `#panel-sql` controls were authored as two `<div class="sql-toolbar">` rows
of inline `label + control + button` items relying on `flex-wrap`. Two visible
problems resulted:

- The Fields picker (`<select id="sql-fields" multiple>`) carried no `size`
  attribute and no height cap. A `<select multiple>` with no size renders at the
  browser's default expanded height, which inside the flex row became a tall,
  narrow box — the dominant element on the screen.
- Inline labels (`Template:`, `Table:`, `Fields:`) wrapped onto their own lines
  at common widths, so the controls did not align and the two action rows read as
  an undifferentiated cluster.

The editor textarea also defaulted to `min-height: 5rem` (~3 lines), which
clipped a typical formatted multi-line query on open.

### Change

Markup ([lib/src/server/html_content.dart]) — the two `.sql-toolbar` rows for the
SQL run panel were replaced (the run-button row and the import panel keep
`.sql-toolbar`):

- A `.sql-builder` card holds a `.sql-builder-row` CSS grid with four cells:
  Template, Table, Fields, and an actions cell (lock toggle, Apply, History).
  Each cell is a stacked `label`-above-`control` group.
- The Fields select gained `size="4"`.
- A `.sql-subbar` strip holds the saved-queries dropdown, a `.sql-btn-group`
  cluster (Save/Del/Export/Import), and the "Show as" select pushed right via
  `.sql-subbar-right`.
- The "Apply template" button label was shortened to "Apply" (tooltip unchanged).
- Every control `id` is preserved, so `assets/web/sql-runner.ts` bindings are
  unaffected (verified: no JS selects the removed `.sql-toolbar` rows by class).

Styles — authored in the SCSS source of truth and the generated `style.css`
rebuilt with `npm run build:style` (sass):

- [assets/web/_sql-editor.scss]: new `.sql-builder` / `.sql-builder-row` /
  `.sql-field` / `.sql-field--fields` / `.sql-subbar` / `.sql-btn-group` rules
  using existing design tokens (`--space-*`, `--radius-*`, `--text-*`, color
  tokens). The Fields multiselect is capped at `height: 6rem` with internal
  scroll. The editor `min-height` was raised `5rem` → `9rem` (~7 lines);
  `resize: vertical` is retained. A narrow-viewport `@media (max-width: 640px)`
  block collapses the grid to two columns.
- [assets/web/_buttons.scss] and [assets/web/_sql-editor.scss]: the existing
  secondary-button and toolbar-select selector lists were extended with
  `.sql-builder` / `.sql-subbar` so the new containers inherit the established
  button/select appearance rather than duplicating values. The lock-toggle
  override re-asserts only `padding: 0` (the single property the generic
  builder-button rule clobbers); its square sizing still comes from
  `.sql-lock-btn`.

### Verification

- `npm run build:style` (sass) compiled clean; generated `style.css` contains the
  new rules and `min-height: 9rem`.
- Regression test added to [test/drift_debug_server_test.dart] ("GET / Run SQL
  builder uses the grouped card layout") pinning the `.sql-builder` /
  `.sql-subbar` wrappers, the Fields `size="4"` attribute, and presence of every
  control id the runner JS binds.
- Existing server HTML test ("serves HTML with SQL history UI") still passes —
  `id="sql-input"`, `id="sql-history-toggle"`, `id="history-sidebar"` all
  preserved.

### Not done / out of scope

- Visual rendering (theme variants, dark/showcase/midnight, contrast at
  breakpoints) was not confirmed in a running browser in this environment; the
  change is structural HTML + token-based CSS, validated by build + markup test.
- Web-viewer static HTML labels remain hardcoded English, consistent with the
  existing pattern in `html_content.dart` (the viewer's `vt()` i18n applies to
  JS-generated strings, not the static template). No new localization debt was
  introduced.
