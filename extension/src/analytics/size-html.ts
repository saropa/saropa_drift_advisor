import type { ISizeAnalytics } from '../api-types';
import { t } from '../l10n';
import { escapeHtml } from '../shared-utils';

/** Build the HTML for the size analytics webview panel. */
export function buildSizeHtml(data: ISizeAnalytics, historyCount: number = 0): string {
  const used = formatBytes(data.usedSizeBytes);
  const free = formatBytes(data.freeSpaceBytes);
  const total = formatBytes(data.totalSizeBytes);
  const pct = data.totalSizeBytes > 0
    ? Math.round((data.usedSizeBytes / data.totalSizeBytes) * 100)
    : 0;

  // Local map params renamed to `tbl`/`idx` so they do not shadow the imported `t()` l10n helper.
  const maxRows = Math.max(...data.tables.map((tbl) => tbl.rowCount), 1);
  const tableRows = data.tables.map((tbl) => {
    const barW = Math.max(1, Math.round((tbl.rowCount / maxRows) * 100));
    const idxList = tbl.indexes.length > 0
      ? tbl.indexes.map((idx) => esc(idx)).join(', ')
      : `<span class="dim">${t('panel.size.idx.none')}</span>`;
    return `<tr>
      <td>${esc(tbl.table)}</td>
      <td class="num">${tbl.rowCount.toLocaleString()}</td>
      <td class="num">${tbl.columnCount}</td>
      <td class="num">${tbl.indexCount}</td>
      <td class="bar-cell"><div class="bar" style="width:${barW}%"></div></td>
      <td class="idx">${idxList}</td>
    </tr>`;
  }).join('');

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<style>
  body { font-family: var(--vscode-font-family); color: var(--vscode-foreground);
         background: var(--vscode-editor-background); padding: 16px; }
  .summary { display: grid; grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
             gap: 12px; margin-bottom: 20px; }
  .card { padding: 12px; border: 1px solid var(--vscode-widget-border);
          border-radius: 6px; text-align: center; }
  .card-value { font-size: 20px; font-weight: bold; }
  .card-label { font-size: 11px; opacity: 0.7; margin-top: 4px; }
  .usage-bar { height: 8px; background: var(--vscode-input-background);
               border-radius: 4px; overflow: hidden; margin-top: 8px; }
  .usage-fill { height: 100%; background: var(--vscode-charts-blue);
                border-radius: 4px; }
  table { width: 100%; border-collapse: collapse; }
  th, td { text-align: left; padding: 6px 10px;
           border-bottom: 1px solid var(--vscode-widget-border); }
  .num { text-align: right; font-variant-numeric: tabular-nums; }
  .bar-cell { width: 120px; }
  .bar { height: 12px; background: var(--vscode-charts-blue); border-radius: 2px; }
  .idx { font-size: 11px; opacity: 0.7; max-width: 200px;
         overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .dim { opacity: 0.5; }
  h2 { margin-top: 0; }
  button { cursor: pointer; padding: 4px 10px; margin-top: 12px; }
</style>
</head>
<body>
  <h2>${t('panel.size.title')}</h2>
  <div class="summary">
    <div class="card">
      <div class="card-value">${total}</div>
      <div class="card-label">${t('panel.size.card.total')}</div>
      <div class="usage-bar"><div class="usage-fill" style="width:${pct}%"></div></div>
    </div>
    <div class="card">
      <div class="card-value">${used}</div>
      <div class="card-label">${t('panel.size.card.used')}</div>
    </div>
    <div class="card">
      <div class="card-value">${free}</div>
      <div class="card-label">${t('panel.size.card.free')}</div>
    </div>
    <div class="card">
      <div class="card-value">${data.tableCount}</div>
      <div class="card-label">${t('panel.size.card.tables')}</div>
    </div>
    <div class="card">
      <div class="card-value">${data.pageCount.toLocaleString()}</div>
      <div class="card-label">${t('panel.size.card.pages', formatBytes(data.pageSize))}</div>
    </div>
    <div class="card">
      <div class="card-value">${esc(data.journalMode)}</div>
      <div class="card-label">${t('panel.size.card.journalMode')}</div>
    </div>
  </div>

  <h3>${t('panel.size.tablesHeading')}</h3>
  <table>
    <thead><tr>
      <th>${t('panel.size.col.table')}</th><th>${t('panel.size.col.rows')}</th><th>${t('panel.size.col.cols')}</th>
      <th>${t('panel.size.col.indexes')}</th><th></th><th>${t('panel.size.col.indexNames')}</th>
    </tr></thead>
    <tbody>${tableRows}</tbody>
  </table>

  <div style="display:flex;gap:6px;margin-top:12px;">
    <button data-click="post" data-a0="copyReport">${t('panel.size.btn.copyJson')}</button>
    <button data-click="post" data-a0="saveSnapshot">${t('panel.size.btn.saveSnapshot')}</button>
    <button data-click="post" data-a0="compareHistory">${historyCount > 0 ? t('panel.size.btn.compareCount', historyCount) : t('panel.size.btn.compare')}</button>
  </div>
  <script nonce="__CSP_NONCE__">
    const vscode = acquireVsCodeApi();
    function post(cmd) { vscode.postMessage({ command: cmd }); }
  </script>
</body>
</html>`;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

const esc = escapeHtml;
