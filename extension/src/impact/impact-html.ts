import type {
  IImpactBranch, IImpactResult, IImpactRow, IOutboundRef,
} from './impact-types';
import { t, getWebviewL10nMap } from '../l10n';
import { jsonForScript } from '../shared-utils';

/** Build the HTML for the row impact analysis webview panel. */
export function buildImpactHtml(result: IImpactResult): string {
  const r = result.root;
  const title = `${esc(r.table)}.${esc(r.pkColumn)} = ${esc(String(r.pkValue))}`;

  const outHtml = result.outbound.length > 0
    ? outboundSection(result.outbound)
    : `<p class="empty">${t('panel.quality.impact.outbound.empty')}</p>`;

  const inHtml = result.inbound.length > 0
    ? inboundSection(result.inbound)
    : `<p class="empty">${t('panel.quality.impact.inbound.empty')}</p>`;

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
  <h2>${t('panel.quality.impact.title', title)}</h2>

  <div class="root-preview">
    <strong>${esc(r.table)}</strong> ${previewHtml(r.preview)}
  </div>

  <div class="section outbound">
    <h3>${t('panel.quality.impact.outbound.heading')}</h3>
    ${outHtml}
  </div>

  <div class="section inbound">
    <h3>${t('panel.quality.impact.inbound.heading')}</h3>
    ${inHtml}
  </div>

  ${sumHtml}

  <div class="actions">
    <button data-click="post" data-a0="generateDelete">${t('panel.quality.impact.btn.generateDelete')}</button>
    <button data-click="post" data-a0="exportJson">${t('panel.quality.impact.btn.exportJson')}</button>
    <button data-click="post" data-a0="refresh">${t('panel.quality.impact.btn.refresh')}</button>
  </div>

  <pre id="sqlOutput" class="sql-output" style="display:none"></pre>

  <script nonce="__CSP_NONCE__">
${clientScript()}
  </script>
</body>
</html>`;
}

function outboundSection(refs: IOutboundRef[]): string {
  const items = refs.map((ref) => {
    const pvw = previewHtml(ref.preview);
    return `<div class="outbound-ref clickable" data-click="navigate" data-a0="${esc(ref.table)}" data-a1="${esc(ref.pkColumn)}" data-a2="${esc(String(ref.pkValue))}">
      <strong>${esc(ref.table)}</strong>.${esc(ref.pkColumn)} = ${esc(String(ref.pkValue))}
      <span class="fk-label">${t('panel.quality.impact.via', esc(ref.fkColumn))}</span>
      <span class="preview">${pvw}</span>
    </div>`;
  });
  return `<div class="ref-list">${items.join('')}</div>`;
}

function inboundSection(branches: IImpactBranch[]): string {
  return branches.map((b) => branchHtml(b)).join('');
}

function branchHtml(branch: IImpactBranch): string {
  // Singular/plural "(N row[s])" count is one whole key, not "N" + separate word.
  const countPhrase = branch.totalCount === 1
    ? t('panel.quality.impact.branch.countOne', branch.totalCount)
    : t('panel.quality.impact.branch.countMany', branch.totalCount);
  const truncNote = branch.truncated
    ? ` <span class="truncated">${t('panel.quality.impact.truncated', branch.rows.length)}</span>`
    : '';

  const rowItems = branch.rows.map((r) => impactRowHtml(r, branch.table)).join('');

  return `<details class="branch" open>
    <summary>
      <strong>${esc(branch.table)}</strong> (${countPhrase})
      <span class="fk-label">${t('panel.quality.impact.via', esc(branch.fkColumn))}</span>${truncNote}
    </summary>
    <div class="branch-rows">${rowItems}</div>
  </details>`;
}

function impactRowHtml(row: IImpactRow, table: string): string {
  const pvw = previewHtml(row.preview);
  const childHtml = row.children.map((b) => branchHtml(b)).join('');

  return `<div class="impact-row">
    <span class="row-header clickable" data-click="navigate" data-a0="${esc(table)}" data-a1="${esc(row.pkColumn)}" data-a2="${esc(String(row.pkValue))}">
      ${esc(row.pkColumn)}=${esc(String(row.pkValue))}
    </span>
    <span class="preview">${pvw}</span>
    ${childHtml}
  </div>`;
}

function summarySection(result: IImpactResult): string {
  // `tbl` is a summary-table entry (name + rowCount), NOT the l10n helper — the
  // helper is imported as `t`, so the map param is renamed to avoid shadowing it.
  const rows = result.summary.tables.map((tbl) => {
    const cell = tbl.rowCount === 1
      ? t('panel.quality.impact.summary.rowOne', tbl.rowCount)
      : t('panel.quality.impact.summary.rowMany', tbl.rowCount);
    return `<tr><td>${esc(tbl.name)}</td><td class="count">${cell}</td></tr>`;
  }).join('');

  // Singular/plural table fragment is pre-wrapped, then embedded as {1} in the line.
  const tblPhrase = result.summary.totalTables === 1
    ? t('panel.quality.impact.summary.tableOne', result.summary.totalTables)
    : t('panel.quality.impact.summary.tableMany', result.summary.totalTables);

  return `<div class="section summary-section">
    <h3>${t('panel.quality.impact.summary.heading')}</h3>
    <table class="summary-table">
      ${rows}
      <tr class="total">
        <td>${t('panel.quality.impact.summary.total')}</td>
        <td class="count">${t('panel.quality.impact.summary.totalLine', result.summary.totalRows, tblPhrase)}</td>
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

    // __VT bridge (plan 75 §3.3): the host resolves this panel's keys to the active
    // display language and injects them here, because client-side render functions
    // have no host t(). vt() does the same {0}/{1} substitution as the host runtime,
    // fail-soft to the key. Only this panel's keys are shipped (prefix-filtered).
    const __VT = ${jsonForScript(getWebviewL10nMap(['panel.quality.impact.']))};
    function vt(key) {
      const args = arguments;
      return (__VT[key] || key).replace(/\\{(\\d+)\\}/g, (m, d) => {
        const i = Number(d) + 1;
        return i < args.length ? args[i] : m;
      });
    }

    function post(cmd) { vscode.postMessage({ command: cmd }); }
    function navigate(tbl, col, val) {
      vscode.postMessage({ command: 'navigate', table: tbl, pkColumn: col, pkValue: val });
    }
    window.addEventListener('message', function(e) {
      var msg = e.data;
      var out = document.getElementById('sqlOutput');
      if (msg.command === 'loading') {
        out.textContent = vt('panel.quality.impact.client.analyzing');
        out.style.display = 'block';
      }
      if (msg.command === 'deleteSql') {
        out.textContent = msg.sql;
        out.style.display = 'block';
      }
      if (msg.command === 'error') {
        out.textContent = vt('panel.quality.impact.client.error', msg.message);
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
