import type { ICompareReport } from '../api-types';
import { highlightSql, sqlHighlightCss } from '../sql-highlight';
import { t } from '../l10n';

/** Build the HTML for the database comparison webview panel. */
export function buildCompareHtml(report: ICompareReport): string {
  const schemaBadge = report.schemaSame
    ? `<span class="badge ok">${t('panel.compare.db.badge.match')}</span>`
    : `<span class="badge warn">${t('panel.compare.db.badge.differs')}</span>`;

  const schemaDiffBlock = report.schemaDiff
    ? `<details class="schema-diff">
        <summary>${t('panel.compare.db.schemaDiff')}</summary>
        <div class="diff-pair">
          <div><h4>${t('panel.compare.db.databaseA')}</h4><pre>${highlightSql(report.schemaDiff.a)}</pre></div>
          <div><h4>${t('panel.compare.db.databaseB')}</h4><pre>${highlightSql(report.schemaDiff.b)}</pre></div>
        </div>
       </details>`
    : '';

  // Loop variable `tbl` (not `t`) avoids shadowing the imported `t()` translator.
  const onlyInA = report.tablesOnlyInA.length > 0
    ? `<section><h3>${t('panel.compare.db.onlyInA', report.tablesOnlyInA.length)}</h3>
       <ul>${report.tablesOnlyInA.map((tbl) => `<li>${esc(tbl)}</li>`).join('')}</ul></section>`
    : '';

  const onlyInB = report.tablesOnlyInB.length > 0
    ? `<section><h3>${t('panel.compare.db.onlyInB', report.tablesOnlyInB.length)}</h3>
       <ul>${report.tablesOnlyInB.map((tbl) => `<li>${esc(tbl)}</li>`).join('')}</ul></section>`
    : '';

  // Loop variable `tc` (not `t`) avoids shadowing the imported `t()` translator.
  const rows = report.tableCounts
    .filter((tc) => !tc.onlyInA && !tc.onlyInB)
    .map((tc) => {
      const cls = tc.diff > 0 ? 'pos' : tc.diff < 0 ? 'neg' : '';
      const sign = tc.diff > 0 ? '+' : '';
      return `<tr>
        <td>${esc(tc.table)}</td>
        <td class="num">${tc.countA}</td>
        <td class="num">${tc.countB}</td>
        <td class="num ${cls}">${sign}${tc.diff}</td>
      </tr>`;
    })
    .join('');

  const countTable = rows
    ? `<table>
        <thead><tr><th>${t('panel.compare.db.th.table')}</th><th>${t('panel.compare.db.th.a')}</th><th>${t('panel.compare.db.th.b')}</th><th>${t('panel.compare.db.th.diff')}</th></tr></thead>
        <tbody>${rows}</tbody>
       </table>`
    : `<p>${t('panel.compare.db.empty')}</p>`;

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<style>
  body { font-family: var(--vscode-font-family); color: var(--vscode-foreground);
         background: var(--vscode-editor-background); padding: 16px; }
  .badge { padding: 4px 10px; border-radius: 4px; font-weight: bold; }
  .ok { background: var(--vscode-testing-iconPassed); color: #fff; }
  .warn { background: var(--vscode-testing-iconFailed); color: #fff; }
  table { width: 100%; border-collapse: collapse; margin-top: 12px; }
  th, td { text-align: left; padding: 6px 10px;
           border-bottom: 1px solid var(--vscode-widget-border); }
  .num { text-align: right; font-variant-numeric: tabular-nums; }
  .pos { color: var(--vscode-testing-iconFailed); }
  .neg { color: var(--vscode-charts-blue); }
  .schema-diff { margin-top: 12px; }
  .diff-pair { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
  pre { white-space: pre-wrap; font-size: 12px;
        background: var(--vscode-textCodeBlock-background); padding: 8px; }
  ${sqlHighlightCss}
  h3 { margin-top: 16px; }
  ul { margin: 4px 0; }
  .footer { margin-top: 16px; font-size: 11px; opacity: 0.7; }
  button { cursor: pointer; padding: 4px 10px; margin-top: 8px; }
</style>
</head>
<body>
  <h2>${t('panel.compare.db.title')} ${schemaBadge}</h2>
  ${schemaDiffBlock}
  ${onlyInA}
  ${onlyInB}
  <h3>${t('panel.compare.db.rowCounts')}</h3>
  ${countTable}
  <div class="footer">${t('panel.compare.db.generated', esc(report.generatedAt))}</div>
  <div style="display:flex;gap:8px;margin-top:8px;">
    <button onclick="post('copyReport')">${t('panel.compare.db.btn.copyReport')}</button>
    <button onclick="post('copyMigrationSql')">${t('panel.compare.db.btn.copyMigrationSql')}</button>
  </div>
  <script>
    const vscode = acquireVsCodeApi();
    function post(cmd) { vscode.postMessage({ command: cmd }); }
  </script>
</body>
</html>`;
}

function esc(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
