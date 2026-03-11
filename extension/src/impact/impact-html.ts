import type {
  IImpactBranch, IImpactResult, IImpactRow, IOutboundRef,
} from './impact-types';

/** Build the HTML for the row impact analysis webview panel. */
export function buildImpactHtml(result: IImpactResult): string {
  const r = result.root;
  const title = `${esc(r.table)}.${esc(r.pkColumn)} = ${esc(String(r.pkValue))}`;

  const outHtml = result.outbound.length > 0
    ? outboundSection(result.outbound)
    : '<p class="empty">No outbound dependencies (this row has no FK columns pointing elsewhere).</p>';

  const inHtml = result.inbound.length > 0
    ? inboundSection(result.inbound)
    : '<p class="empty">No inbound dependents (no other rows reference this row).</p>';

  const sumHtml = result.summary.totalRows > 0
    ? summarySection(result)
    : '';

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<style>
${css()}
</style>
</head>
<body>
  <h2>Row Impact Analysis &mdash; ${title}</h2>

  <div class="root-preview">
    <strong>${esc(r.table)}</strong> ${previewHtml(r.preview)}
  </div>

  <div class="section outbound">
    <h3>This row depends on (outbound FKs)</h3>
    ${outHtml}
  </div>

  <div class="section inbound">
    <h3>Rows that depend on this (inbound FKs)</h3>
    ${inHtml}
  </div>

  ${sumHtml}

  <div class="actions">
    <button onclick="post('generateDelete')">Generate DELETE SQL</button>
    <button onclick="post('exportJson')">Export JSON</button>
    <button onclick="post('refresh')">Refresh</button>
  </div>

  <pre id="sqlOutput" class="sql-output" style="display:none"></pre>

  <script>
${clientScript()}
  </script>
</body>
</html>`;
}

function outboundSection(refs: IOutboundRef[]): string {
  const items = refs.map((ref) => {
    const pvw = previewHtml(ref.preview);
    return `<div class="outbound-ref clickable" onclick="navigate('${escAttr(ref.table)}','${escAttr(ref.pkColumn)}',${escJs(ref.pkValue)})">
      <strong>${esc(ref.table)}</strong>.${esc(ref.pkColumn)} = ${esc(String(ref.pkValue))}
      <span class="fk-label">via ${esc(ref.fkColumn)}</span>
      <span class="preview">${pvw}</span>
    </div>`;
  });
  return `<div class="ref-list">${items.join('')}</div>`;
}

function inboundSection(branches: IImpactBranch[]): string {
  return branches.map((b) => branchHtml(b)).join('');
}

function branchHtml(branch: IImpactBranch): string {
  const rowWord = branch.totalCount === 1 ? 'row' : 'rows';
  const truncNote = branch.truncated
    ? ` <span class="truncated">[showing ${branch.rows.length}]</span>`
    : '';

  const rowItems = branch.rows.map((r) => impactRowHtml(r, branch.table)).join('');

  return `<details class="branch" open>
    <summary>
      <strong>${esc(branch.table)}</strong> (${branch.totalCount} ${rowWord})
      <span class="fk-label">via ${esc(branch.fkColumn)}</span>${truncNote}
    </summary>
    <div class="branch-rows">${rowItems}</div>
  </details>`;
}

function impactRowHtml(row: IImpactRow, table: string): string {
  const pvw = previewHtml(row.preview);
  const childHtml = row.children.map((b) => branchHtml(b)).join('');

  return `<div class="impact-row">
    <span class="row-header clickable" onclick="navigate('${escAttr(table)}','${escAttr(row.pkColumn)}',${escJs(row.pkValue)})">
      ${esc(row.pkColumn)}=${esc(String(row.pkValue))}
    </span>
    <span class="preview">${pvw}</span>
    ${childHtml}
  </div>`;
}

function summarySection(result: IImpactResult): string {
  const rows = result.summary.tables.map((t) =>
    `<tr><td>${esc(t.name)}</td><td class="count">${t.rowCount} ${t.rowCount === 1 ? 'row' : 'rows'}</td></tr>`,
  ).join('');

  const tblWord = result.summary.totalTables === 1 ? 'table' : 'tables';

  return `<div class="section summary-section">
    <h3>Cascade Delete Impact</h3>
    <table class="summary-table">
      ${rows}
      <tr class="total">
        <td>TOTAL</td>
        <td class="count">${result.summary.totalRows} rows across ${result.summary.totalTables} ${tblWord}</td>
      </tr>
    </table>
  </div>`;
}

function previewHtml(pv: Record<string, unknown>): string {
  const entries = Object.entries(pv);
  if (entries.length === 0) return '';
  const parts = entries.map(
    ([k, v]) => `<span class="pv-key">${esc(k)}:</span> ${esc(formatVal(v))}`,
  );
  return `<span class="pv">${parts.join(', ')}</span>`;
}

function formatVal(v: unknown): string {
  if (v === null) return 'NULL';
  if (v === undefined) return '';
  if (typeof v === 'string') return `"${v}"`;
  return String(v);
}

function css(): string {
  return `body { font-family: var(--vscode-font-family); color: var(--vscode-foreground);
           background: var(--vscode-editor-background); padding: 16px; }
  h2 { margin: 0 0 12px; font-size: 14px; }
  h3 { margin: 16px 0 6px; font-size: 13px; opacity: 0.9; }
  .root-preview { padding: 6px 10px; margin-bottom: 12px;
                  background: rgba(100,100,255,0.08); border-radius: 4px; font-size: 12px; }
  .section { margin-bottom: 16px; }
  .outbound { border-left: 3px solid rgba(0,180,0,0.5); padding-left: 8px; }
  .inbound { border-left: 3px solid rgba(200,100,0,0.5); padding-left: 8px; }
  .ref-list { font-size: 12px; }
  .outbound-ref { padding: 3px 0; cursor: pointer; }
  .outbound-ref:hover { text-decoration: underline; }
  .fk-label { font-size: 11px; opacity: 0.6; margin-left: 6px; }
  .preview { font-size: 11px; opacity: 0.7; }
  .pv-key { font-weight: 600; }
  .branch { margin: 4px 0; font-size: 12px; }
  details > summary { cursor: pointer; padding: 4px 0; list-style: none;
                      display: flex; align-items: center; gap: 6px; }
  summary::-webkit-details-marker { display: none; }
  summary::before { content: '\\25B6'; font-size: 10px; transition: transform 0.15s; }
  details[open] > summary::before { transform: rotate(90deg); }
  .truncated { font-size: 10px; opacity: 0.5; font-style: italic; }
  .branch-rows { margin-left: 16px; }
  .impact-row { padding: 2px 0; }
  .row-header { cursor: pointer; }
  .clickable:hover { text-decoration: underline; }
  .summary-section { margin-top: 16px; }
  .summary-table { border-collapse: collapse; font-size: 12px; width: auto; }
  .summary-table td { padding: 3px 12px 3px 0; }
  .summary-table .count { text-align: right; opacity: 0.8; }
  .summary-table .total { border-top: 1px solid var(--vscode-widget-border, #444);
                           font-weight: 600; }
  .empty { font-size: 12px; opacity: 0.5; font-style: italic; }
  .actions { margin-top: 16px; display: flex; gap: 8px; }
  button { cursor: pointer; padding: 4px 10px;
           background: var(--vscode-button-background);
           color: var(--vscode-button-foreground); border: none;
           border-radius: 2px; font-size: 12px; }
  button:hover { background: var(--vscode-button-hoverBackground); }
  .sql-output { margin-top: 12px; padding: 10px; font-size: 12px;
                background: var(--vscode-textBlockQuote-background);
                border: 1px solid var(--vscode-widget-border);
                white-space: pre-wrap; word-break: break-all; }`;
}

function clientScript(): string {
  return `const vscode = acquireVsCodeApi();
    function post(cmd) { vscode.postMessage({ command: cmd }); }
    function navigate(tbl, col, val) {
      vscode.postMessage({ command: 'navigate', table: tbl, pkColumn: col, pkValue: val });
    }
    window.addEventListener('message', function(e) {
      var msg = e.data;
      var out = document.getElementById('sqlOutput');
      if (msg.command === 'loading') {
        out.textContent = 'Analyzing impact\\u2026';
        out.style.display = 'block';
      }
      if (msg.command === 'deleteSql') {
        out.textContent = msg.sql;
        out.style.display = 'block';
      }
      if (msg.command === 'error') {
        out.textContent = 'Error: ' + msg.message;
        out.style.display = 'block';
      }
    });`;
}

function esc(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function escAttr(s: string): string {
  return s.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
}

function escJs(v: unknown): string {
  if (typeof v === 'number') return String(v);
  return `'${String(v).replace(/'/g, "\\'")}'`;
}
