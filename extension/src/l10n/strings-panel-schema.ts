/**
 * Host-panel English source strings — schema-visualization panel family:
 * Schema Diagram ([../diagram/diagram-html.ts](../diagram/diagram-html.ts)),
 * ER Diagram ([../er-diagram/er-diagram-html.ts](../er-diagram/er-diagram-html.ts)),
 * Schema Diff ([../schema-diff/schema-diff-html.ts](../schema-diff/schema-diff-html.ts)),
 * Schema Timeline ([../schema-timeline/schema-timeline-html.ts](../schema-timeline/schema-timeline-html.ts)),
 * Data Lineage ([../lineage/lineage-html.ts](../lineage/lineage-html.ts)). Plan 75 §3.1.
 *
 * One registry slice per panel family (see `HOST_STRING_REGISTRIES` in
 * [../l10n.ts](../l10n.ts)). Each entry maps a SYMBOLIC KEY → its ENGLISH text;
 * the panel's HTML builder resolves the key via `t()` so the string reaches the
 * translation pipeline instead of shipping English in every locale.
 *
 * Runtime values (counts, table names, types) are passed as `{0}`/`{1}` tokens,
 * never concatenated English — `vscode.l10n.t()` substitutes them so a translator
 * can reorder the sentence. Brands/acronyms (SQL, FK, PK, ER, JSON, DB) inside a
 * value stay as written; the pipeline shields them later.
 */

/** Symbolic key → English source text for the schema-visualization panels. */
export const stringsPanelSchema: Record<string, string> = {
  // --- Schema Diagram (diagram-html) ---
  'panel.schema.diagram.empty': 'No tables found.',

  // --- ER Diagram (er-diagram-html) ---
  'panel.schema.er.empty': 'No tables in schema.',
  'panel.schema.er.title': 'ER Diagram',
  'panel.schema.er.layout.auto': 'Auto Layout',
  'panel.schema.er.layout.hierarchical': 'Hierarchical',
  'panel.schema.er.layout.clustered': 'Clustered',
  'panel.schema.er.btn.fit': 'Fit',
  'panel.schema.er.export.placeholder': 'Export…',
  'panel.schema.er.export.svg': 'SVG',
  'panel.schema.er.export.png': 'PNG',
  'panel.schema.er.export.mermaid': 'Mermaid',
  'panel.schema.er.menu.viewData': 'View Data',
  'panel.schema.er.menu.seed': 'Seed Test Data',
  'panel.schema.er.menu.profile': 'Profile Columns',

  // --- Schema Diff (schema-diff-html) ---
  'panel.schema.diff.title': 'Code vs Runtime Schema Diff',
  // {0} = count of tables present in both code and DB.
  'panel.schema.diff.badge.matched': '{0} matched',
  // {0} = count of tables only in code.
  'panel.schema.diff.badge.codeOnly': '{0} code-only',
  // {0} = count of tables only in the DB.
  'panel.schema.diff.badge.dbOnly': '{0} db-only',
  // {0} = issue count (singular form, used when exactly 1).
  'panel.schema.diff.badge.issue': '{0} issue',
  // {0} = issue count (plural form, used when not 1).
  'panel.schema.diff.badge.issues': '{0} issues',
  'panel.schema.diff.section.matched': 'Matched Tables',
  'panel.schema.diff.section.codeOnly': 'Only in Code (needs migration)',
  'panel.schema.diff.section.dbOnly': 'Only in Database (orphaned?)',
  'panel.schema.diff.btn.generateMigration': 'Generate Migration Code',
  'panel.schema.diff.empty': 'No tables found to compare.',
  // SQL block titles + their copy buttons.
  'panel.schema.diff.sql.migration.title': 'Migration SQL',
  'panel.schema.diff.sql.fullSchema.title': 'Full Schema SQL',
  // {0} = SQL block title (e.g. "Migration SQL") — the copy button label.
  'panel.schema.diff.sql.copy': 'Copy {0}',
  // Matched-table row status labels (issues vs clean).
  'panel.schema.diff.row.status.issues': 'issues',
  'panel.schema.diff.row.status.ok': 'OK',
  // {0} = code column count, {1} = DB column count.
  'panel.schema.diff.row.colCount': '{0} code / {1} db cols',
  // {0} = navigable column link, {1} = SQL type — column present only in code.
  'panel.schema.diff.detail.codeOnly': '+ Column {0} ({1}) — only in code',
  // {0} = column name, {1} = DB type — column present only in the DB.
  'panel.schema.diff.detail.dbOnly': '- Column "{0}" ({1}) — only in DB',
  // {0} = navigable column link, {1} = code type, {2} = DB type — type mismatch.
  'panel.schema.diff.detail.typeMismatch': '~ {0}: code={1}, db={2}',
  // {0} = column count for a code-only (to-be-created) table.
  'panel.schema.diff.codeOnly.colCount': '{0} columns',
  'panel.schema.diff.codeOnly.status': 'CREATE TABLE needed',
  // {0} = column count for a DB-only (possibly orphaned) table.
  'panel.schema.diff.dbOnly.colCount': '{0} columns',
  'panel.schema.diff.dbOnly.status': 'may need DROP TABLE',

  // --- Schema Timeline (schema-timeline-html) ---
  'panel.schema.timeline.empty.title': 'No schema snapshots yet',
  'panel.schema.timeline.empty.body':
    'Schema snapshots are captured automatically when the database '
    + 'generation changes. Start your app and modify the schema to see '
    + 'the timeline.',
  'panel.schema.timeline.title': 'Schema Evolution Timeline',
  'panel.schema.timeline.btn.export': 'Export',
  'panel.schema.timeline.btn.export.title': 'Copy timeline as JSON',
  // Marks the most recent snapshot in the timeline.
  'panel.schema.timeline.label.current': '(current)',
  // First snapshot has no predecessor to diff against.
  'panel.schema.timeline.delta.initial': 'Initial',
  // {0} = database generation number for this snapshot.
  'panel.schema.timeline.gen': 'Gen {0}',
  // {0} = table count, {1} = comma-joined table names — initial snapshot.
  'panel.schema.timeline.initial': '{0} tables: {1}',
  'panel.schema.timeline.change.none': 'No schema changes (data only)',
  // Change-type labels; each is followed at the call site by the table name.
  'panel.schema.timeline.change.tableAdded': 'Added table',
  'panel.schema.timeline.change.tableDropped': 'Dropped table',
  'panel.schema.timeline.change.columnAdded': 'Added column in',
  'panel.schema.timeline.change.columnRemoved': 'Removed column in',
  'panel.schema.timeline.change.columnTypeChanged': 'Type changed in',
  'panel.schema.timeline.change.fkAdded': 'Added FK in',
  'panel.schema.timeline.change.fkRemoved': 'Removed FK in',
  // Summary fragments joined with ", " — singular/plural pairs per quantity.
  // {0} = table count added.
  'panel.schema.timeline.summary.tableAdded': '{0} table added',
  'panel.schema.timeline.summary.tablesAdded': '{0} tables added',
  // {0} = dropped table count.
  'panel.schema.timeline.summary.dropped': '{0} dropped',
  // {0} = column-change count.
  'panel.schema.timeline.summary.columnChange': '{0} column change',
  'panel.schema.timeline.summary.columnChanges': '{0} column changes',
  // {0} = FK-change count.
  'panel.schema.timeline.summary.fkChange': '{0} FK change',
  'panel.schema.timeline.summary.fkChanges': '{0} FK changes',
  'panel.schema.timeline.summary.noChanges': 'No changes',
  // {0} = total snapshot count, {1} = joined change summary (or "No changes").
  'panel.schema.timeline.summary.text': '{0} snapshots — {1}',

  // --- Data Lineage (lineage-html) ---
  // {0} = root row identity (table.pk = value), pre-built at the call site.
  'panel.schema.lineage.title': 'Data Lineage — {0}',
  'panel.schema.lineage.controls.depth': 'Depth:',
  'panel.schema.lineage.controls.both': 'Both',
  'panel.schema.lineage.controls.upOnly': 'Up only',
  'panel.schema.lineage.controls.downOnly': 'Down only',
  'panel.schema.lineage.btn.retrace': 'Re-trace',
  'panel.schema.lineage.section.upstream': 'Upstream',
  'panel.schema.lineage.section.downstream': 'Downstream',
  // Section subtitles (parenthetical role of the related rows).
  'panel.schema.lineage.section.upstream.role': 'parents',
  'panel.schema.lineage.section.downstream.role': 'dependents',
  'panel.schema.lineage.empty.upstream': 'No upstream parents found.',
  'panel.schema.lineage.empty.downstream': 'No downstream dependents found.',
  // {0} = FK column name linking child to parent (e.g. "via author_id").
  'panel.schema.lineage.via': 'via {0}',
  // {0} = upstream node count.
  'panel.schema.lineage.count.upstream': '{0} upstream',
  // {0} = downstream node count.
  'panel.schema.lineage.count.downstream': '{0} downstream',
  // {0} = comma-joined upstream/downstream counts.
  'panel.schema.lineage.summary.total': 'Total: {0}',
  'panel.schema.lineage.btn.exportJson': 'Copy as JSON',
  'panel.schema.lineage.btn.generateDelete': 'Generate DELETE SQL',
};
