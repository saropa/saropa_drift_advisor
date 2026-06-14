import type { ILineageNode, ILineageResult } from './lineage-types';
import { t, getWebviewL10nMap } from '../l10n';
import { escapeHtml, jsonForScript } from '../shared-utils';

/** Build the HTML for the data lineage webview panel. */
export function buildLineageHtml(result: ILineageResult): string {
  const r = result.root;
  const title = `${esc(r.table)}.${esc(r.pkColumn)} = ${esc(String(r.pkValue))}`;

  const upstream = r.children.filter((c) => c.direction === 'upstream');
  const downstream = r.children.filter((c) => c.direction === 'downstream');

  const upHtml = upstream.length > 0
    ? sectionHtml('upstream', upstream)
    : `<p class="empty">${t('panel.schema.lineage.empty.upstream')}</p>`;

  const downHtml = downstream.length > 0
    ? sectionHtml('downstream', downstream)
    : `<p class="empty">${t('panel.schema.lineage.empty.downstream')}</p>`;

  const counts = [
    t('panel.schema.lineage.count.upstream', result.upstreamCount),
    t('panel.schema.lineage.count.downstream', result.downstreamCount),
  ].join(', ');

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<style>
${css()}
</style>
</head>
<body>
  <h2>${t('panel.schema.lineage.title', title)}</h2>

  <div class="controls">
    <label>${t('panel.schema.lineage.controls.depth')}
      <select id="depth">
        ${depthOptions(3)}
      </select>
    </label>
    <label class="radio"><input type="radio" name="dir" value="both" checked> ${t('panel.schema.lineage.controls.both')}</label>
    <label class="radio"><input type="radio" name="dir" value="up"> ${t('panel.schema.lineage.controls.upOnly')}</label>
    <label class="radio"><input type="radio" name="dir" value="down"> ${t('panel.schema.lineage.controls.downOnly')}</label>
    <button data-click="retrace">${t('panel.schema.lineage.btn.retrace')}</button>
  </div>

  <div class="root-preview">
    <strong>${esc(r.table)}</strong> ${previewHtml(r.preview)}
  </div>

  ${upHtml}
  ${downHtml}

  <p class="summary">${t('panel.schema.lineage.summary.total', esc(counts))}</p>

  <div class="actions">
    <button data-click="post" data-a0="exportJson">${t('panel.schema.lineage.btn.exportJson')}</button>
    <button data-click="post" data-a0="generateDelete">${t('panel.schema.lineage.btn.generateDelete')}</button>
  </div>

  <pre id="sqlOutput" class="sql-output" style="display:none"></pre>

  <script nonce="__CSP_NONCE__">
${clientScript(r.table, r.pkColumn, r.pkValue)}
  </script>
</body>
</html>`;
}

// `dir` is the machine direction ('upstream'|'downstream') used for the CSS class
// and to pick the localized heading + role subtitle.
function sectionHtml(
  dir: 'upstream' | 'downstream', nodes: ILineageNode[],
): string {
  const items = nodes.map((n) => nodeHtml(n, 0)).join('');
  const heading = dir === 'upstream'
    ? t('panel.schema.lineage.section.upstream')
    : t('panel.schema.lineage.section.downstream');
  const role = dir === 'upstream'
    ? t('panel.schema.lineage.section.upstream.role')
    : t('panel.schema.lineage.section.downstream.role');
  return `<div class="section ${dir}">
    <h3>${heading} (${role})</h3>
    <div class="tree">${items}</div>
  </div>`;
}

function nodeHtml(node: ILineageNode, depth: number): string {
  const indent = depth * 20;
  const fkLabel = node.fkColumn
    ? `<span class="fk-label">${t('panel.schema.lineage.via', esc(node.fkColumn))}</span>`
    : '';
  const pvw = previewHtml(node.preview);
  const kids = node.children.map((c) => nodeHtml(c, depth + 1)).join('');
  const pk = esc(String(node.pkValue));
  const tbl = esc(node.table);

  // data-click + the delegated dispatcher replace the inline onclick the C2b
  // nonce CSP blocks. The PK value rides as a plain string (data-a2); the host's
  // trace handler coerces it against the column type (audit H5), so passing it
  // un-typed here is correct and avoids re-introducing a JS-in-attribute sink.
  return `<div class="node" style="margin-left:${indent}px">
    <span class="node-header clickable" data-click="navigate" data-a0="${esc(node.table)}" data-a1="${esc(node.pkColumn)}" data-a2="${esc(String(node.pkValue))}">
      <strong>${tbl}</strong>.${esc(node.pkColumn)} = ${pk}
    </span>
    ${fkLabel}
    <span class="preview">${pvw}</span>
  </div>${kids}`;
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

function depthOptions(selected: number): string {
  return [1, 2, 3, 4, 5]
    .map((d) => `<option value="${d}"${d === selected ? ' selected' : ''}>${d}</option>`)
    .join('');
}

function css(): string {
  return `body { font-family: var(--vscode-font-family); color: var(--vscode-foreground);
           background: var(--vscode-editor-background); padding: 16px; }
  h2 { margin: 0 0 12px; font-size: 14px; }
  h3 { margin: 16px 0 6px; font-size: 13px; opacity: 0.9; }
  .controls { display: flex; gap: 12px; align-items: center; margin-bottom: 16px;
              flex-wrap: wrap; }
  .controls label { font-size: 12px; }
  .radio { display: flex; align-items: center; gap: 3px; }
  select { background: var(--vscode-input-background); color: var(--vscode-input-foreground);
           border: 1px solid var(--vscode-input-border); padding: 2px 4px; }
  .root-preview { padding: 6px 10px; margin-bottom: 12px;
                  background: rgba(100,100,255,0.08); border-radius: 4px; font-size: 12px; }
  .section { margin-bottom: 12px; }
  .upstream { border-left: 3px solid rgba(0,180,0,0.5); padding-left: 8px; }
  .downstream { border-left: 3px solid rgba(200,100,0,0.5); padding-left: 8px; }
  .tree { font-size: 12px; }
  .node { padding: 3px 0; }
  .node-header { cursor: pointer; }
  .clickable:hover { text-decoration: underline; }
  .fk-label { font-size: 11px; opacity: 0.6; margin-left: 6px; }
  .preview { font-size: 11px; opacity: 0.7; }
  .pv-key { font-weight: 600; }
  .summary { margin-top: 12px; font-size: 12px; opacity: 0.8; }
  .empty { font-size: 12px; opacity: 0.5; font-style: italic; }
  .actions { margin-top: 12px; display: flex; gap: 8px; }
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

function clientScript(
  table: string, pkColumn: string, pkValue: unknown,
): string {
  return `const vscode = acquireVsCodeApi();

    // __VT bridge (plan 75 §3.3): the host resolves this panel's keys to the active
    // display language and injects them here, because client-side render functions
    // have no host t(). vt() does the same {0}/{1} substitution as the host runtime,
    // fail-soft to the key. Only this panel's keys are shipped (prefix-filtered).
    const __VT = ${jsonForScript(getWebviewL10nMap(['panel.schema.lineage.']))};
    function vt(key) {
      const args = arguments;
      return (__VT[key] || key).replace(/\\{(\\d+)\\}/g, (m, d) => {
        const i = Number(d) + 1;
        return i < args.length ? args[i] : m;
      });
    }

    function post(cmd) { vscode.postMessage({ command: cmd }); }
    function navigate(tbl, col, val) {
      vscode.postMessage({ command: 'trace', table: tbl, pkColumn: col, pkValue: val,
        depth: Number(document.getElementById('depth').value),
        direction: document.querySelector('input[name="dir"]:checked').value });
    }
    function retrace() {
      vscode.postMessage({ command: 'trace',
        table: ${jsonForScript(table)},
        pkColumn: ${jsonForScript(pkColumn)},
        pkValue: ${jsonForScript(pkValue)},
        depth: Number(document.getElementById('depth').value),
        direction: document.querySelector('input[name="dir"]:checked').value });
    }
    window.addEventListener('message', function(e) {
      var msg = e.data;
      var out = document.getElementById('sqlOutput');
      if (msg.command === 'loading') {
        out.textContent = vt('panel.schema.lineage.client.tracing');
        out.style.display = 'block';
      }
      if (msg.command === 'deleteSql') {
        out.textContent = msg.sql;
        out.style.display = 'block';
      }
      if (msg.command === 'error') {
        out.textContent = vt('panel.schema.lineage.client.error', msg.message);
        out.style.display = 'block';
      }
    });`;
}

const esc = escapeHtml;
