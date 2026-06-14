/**
 * HTML template for the Schema Diff webview panel.
 * Uses VS Code theme CSS variables for light/dark support.
 */

import {
  hasDifferences,
  ISchemaDiffResult,
  ITableColumnDiff,
} from './schema-diff';
import { IDartTable } from './dart-schema';
import { TableMetadata } from '../api-client';
import { highlightSql, sqlHighlightCss } from '../sql-highlight';
import { t } from '../l10n';
import { escapeHtml } from '../shared-utils';

const esc = escapeHtml;

function renderSummary(diff: ISchemaDiffResult): string {
  const matched = diff.tableDiffs.length;
  const codeOnly = diff.tablesOnlyInCode.length;
  const dbOnly = diff.tablesOnlyInDb.length;
  const mismatches = diff.tableDiffs.reduce(
    (n, d) => n + d.typeMismatches.length
      + d.columnsOnlyInCode.length + d.columnsOnlyInDb.length,
    0,
  );

  return `<div class="summary">
  <span class="badge ok">${t('panel.schema.diff.badge.matched', matched)}</span>
  ${codeOnly ? `<span class="badge warn">${t('panel.schema.diff.badge.codeOnly', codeOnly)}</span>` : ''}
  ${dbOnly ? `<span class="badge err">${t('panel.schema.diff.badge.dbOnly', dbOnly)}</span>` : ''}
  ${mismatches ? `<span class="badge warn">${mismatches !== 1 ? t('panel.schema.diff.badge.issues', mismatches) : t('panel.schema.diff.badge.issue', mismatches)}</span>` : ''}
</div>`;
}

function navLink(label: string, fileUri: string, line: number): string {
  return `<a href="#" class="nav-link" `
    + `data-file="${esc(fileUri)}" data-line="${line}">${esc(label)}</a>`;
}

function renderMatchedTable(td: ITableColumnDiff): string {
  const hasIssues = td.columnsOnlyInCode.length > 0
    || td.columnsOnlyInDb.length > 0
    || td.typeMismatches.length > 0;
  const cls = hasIssues ? 'row-warn' : 'row-ok';
  const status = hasIssues
    ? t('panel.schema.diff.row.status.issues')
    : t('panel.schema.diff.row.status.ok');
  const codeColCount = td.codeTable.columns.length;
  const dbColCount = td.matchedColumns
    + td.columnsOnlyInDb.length;

  const details: string[] = [];

  // Pre-built nav-link markup is passed as {0} so it survives translation intact.
  for (const c of td.columnsOnlyInCode) {
    details.push(
      `<div class="detail warn">${t(
        'panel.schema.diff.detail.codeOnly',
        navLink(c.sqlName, td.codeTable.fileUri, c.line),
        esc(c.sqlType),
      )}</div>`,
    );
  }
  for (const c of td.columnsOnlyInDb) {
    details.push(
      `<div class="detail err">${t(
        'panel.schema.diff.detail.dbOnly',
        esc(c.name),
        esc(c.type),
      )}</div>`,
    );
  }
  for (const m of td.typeMismatches) {
    details.push(
      `<div class="detail warn">${t(
        'panel.schema.diff.detail.typeMismatch',
        navLink(m.columnName, td.codeTable.fileUri, m.dartColumn.line),
        esc(m.codeType),
        esc(m.dbType),
      )}</div>`,
    );
  }

  const inner = details.length > 0
    ? `<div class="details">${details.join('\n')}</div>`
    : '';

  return `<details class="${cls}"${hasIssues ? ' open' : ''}>
  <summary>
    ${navLink(td.tableName, td.codeTable.fileUri, td.codeTable.line)}
    <span class="col-count">${t('panel.schema.diff.row.colCount', codeColCount, dbColCount)}</span>
    <span class="status">${status}</span>
  </summary>
  ${inner}
</details>`;
}

function renderCodeOnlyTable(table: IDartTable): string {
  const cols = table.columns
    .map((c) => `<div class="detail">${esc(c.sqlName)} ${esc(c.sqlType)}</div>`)
    .join('\n');
  return `<div class="row-err">
  ${navLink(table.sqlTableName, table.fileUri, table.line)}
  <span class="col-count">${t('panel.schema.diff.codeOnly.colCount', table.columns.length)}</span>
  <span class="status">${t('panel.schema.diff.codeOnly.status')}</span>
  ${cols ? `<div class="details">${cols}</div>` : ''}
</div>`;
}

function renderDbOnlyTable(table: TableMetadata): string {
  return `<div class="row-err">
  <span class="table-name">${esc(table.name)}</span>
  <span class="col-count">${t('panel.schema.diff.dbOnly.colCount', table.columns.length)}</span>
  <span class="status">${t('panel.schema.diff.dbOnly.status')}</span>
</div>`;
}

// `title` is an already-localized SQL-block heading; it is also interpolated into
// the "Copy {0}" button label so the verb+noun stays one reorderable unit.
function renderSqlBlock(title: string, action: string, sql: string): string {
  return `<h3>${esc(title)}</h3>`
    + `<div class="toolbar"><button class="copy-btn" data-action="${esc(action)}">`
    + `${t('panel.schema.diff.sql.copy', esc(title))}</button></div>`
    + `<pre class="sql-block">${highlightSql(sql)}</pre>`;
}

/** Build self-contained HTML for the schema diff panel. */
export function buildSchemaDiffHtml(
  diff: ISchemaDiffResult,
  migrationSql: string,
  fullSchemaSql: string,
): string {
  const sections: string[] = [];

  // Summary
  sections.push(renderSummary(diff));

  // Matched tables
  if (diff.tableDiffs.length > 0) {
    sections.push(`<h3>${t('panel.schema.diff.section.matched')}</h3>`);
    sections.push(
      diff.tableDiffs.map((td) => renderMatchedTable(td)).join('\n'),
    );
  }

  // Code-only tables
  if (diff.tablesOnlyInCode.length > 0) {
    sections.push(`<h3>${t('panel.schema.diff.section.codeOnly')}</h3>`);
    sections.push(
      diff.tablesOnlyInCode
        .map((tbl) => renderCodeOnlyTable(tbl)).join('\n'),
    );
  }

  // DB-only tables
  if (diff.tablesOnlyInDb.length > 0) {
    sections.push(`<h3>${t('panel.schema.diff.section.dbOnly')}</h3>`);
    sections.push(
      diff.tablesOnlyInDb
        .map((tbl) => renderDbOnlyTable(tbl)).join('\n'),
    );
  }

  // Generate Migration Code button (when diff has changes)
  if (hasDifferences(diff)) {
    sections.push(
      '<div class="toolbar" style="margin-top:16px">'
      + '<button class="copy-btn" data-action="generateMigration">'
      + `${t('panel.schema.diff.btn.generateMigration')}</button></div>`,
    );
  }

  // SQL blocks
  if (migrationSql) {
    sections.push(renderSqlBlock(t('panel.schema.diff.sql.migration.title'), 'copyMigrationSql', migrationSql));
  }
  if (fullSchemaSql) {
    sections.push(renderSqlBlock(t('panel.schema.diff.sql.fullSchema.title'), 'copyFullSchemaSql', fullSchemaSql));
  }

  // No differences
  if (
    diff.tableDiffs.length === 0
    && diff.tablesOnlyInCode.length === 0
    && diff.tablesOnlyInDb.length === 0
  ) {
    sections.push(
      `<p class="empty">${t('panel.schema.diff.empty')}</p>`,
    );
  }

  const body = `<h2>${t('panel.schema.diff.title')}</h2>\n${sections.join('\n')}`;
  return wrapHtml(body);
}

function wrapHtml(body: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<style>
  body {
    font-family: var(--vscode-font-family, sans-serif);
    color: var(--vscode-editor-foreground, #ccc);
    background: var(--vscode-editor-background, #1e1e1e);
    padding: 16px;
    line-height: 1.4;
  }
  h2 { margin-top: 0; }
  h3 { margin-top: 20px; }
  .summary { margin-bottom: 16px; }
  .badge { display:inline-block; padding:3px 10px; border-radius:10px; font-size:12px; font-weight:600; margin-right:8px; }
  .badge.ok { background: rgba(40,167,69,0.15); color: #28a745; }
  .badge.warn { background: rgba(255,193,7,0.25); color: #e0a800; }
  .badge.err { background: rgba(220,53,69,0.15); color: #dc3545; }
  .toolbar { margin-bottom: 8px; }
  .copy-btn { background:var(--vscode-button-background,#0e639c); color:var(--vscode-button-foreground,#fff); border:none; padding:4px 10px; border-radius:3px; cursor:pointer; font-size:12px; }
  .copy-btn:hover { background: var(--vscode-button-hoverBackground, #1177bb); }
  .sql-block { background:var(--vscode-editor-inactiveSelectionBackground,#333); padding:8px 12px; border-radius:4px; font-family:var(--vscode-editor-font-family,monospace); font-size:13px; white-space:pre-wrap; word-break:break-word; }
  ${sqlHighlightCss}
  details { margin: 4px 0; padding: 8px 12px; border-radius: 4px; }
  summary { cursor:pointer; font-family:var(--vscode-editor-font-family,monospace); font-size:13px; }
  .row-ok { border-left: 4px solid #28a745; background: rgba(40,167,69,0.08); }
  .row-warn { border-left: 4px solid #e0a800; background: rgba(224,168,0,0.08); }
  .row-err { border-left:4px solid #dc3545; background:rgba(220,53,69,0.08); padding:8px 12px; border-radius:4px; margin:4px 0; font-family:var(--vscode-editor-font-family,monospace); font-size:13px; }
  .col-count { opacity: 0.6; margin-left: 12px; font-size: 12px; }
  .status { float: right; font-size: 12px; font-weight: 600; }
  .details { margin-top: 6px; padding-left: 16px; }
  .detail { font-size:12px; margin:2px 0; font-family:var(--vscode-editor-font-family,monospace); }
  .detail.warn { color: #e0a800; }
  .detail.err { color: #dc3545; }
  .nav-link { color:var(--vscode-textLink-foreground,#3794ff); text-decoration:none; cursor:pointer; }
  .nav-link:hover { text-decoration: underline; }
  .table-name { font-family: var(--vscode-editor-font-family, monospace); }
  .empty { opacity: 0.6; font-style: italic; }
</style>
</head>
<body>
${body}
<script nonce="__CSP_NONCE__">
  const vscode = acquireVsCodeApi();
  document.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-action]');
    if (btn) {
      vscode.postMessage({ command: btn.dataset.action });
      return;
    }
    const link = e.target.closest('.nav-link');
    if (link) {
      e.preventDefault();
      vscode.postMessage({
        command: 'navigate',
        fileUri: link.dataset.file,
        line: Number(link.dataset.line),
      });
    }
  });
</script>
</body>
</html>`;
}
