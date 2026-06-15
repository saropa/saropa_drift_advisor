/**
 * Themed HTML for the bulk-edit dashboard webview (no external assets). Split out
 * of bulk-edit-panel.ts to follow the repo convention of keeping webview markup
 * in a dedicated `*-html.ts` and the panel controller separate.
 */

import { t, getWebviewL10nMap } from '../l10n';

/**
 * Builds minimal themed HTML for the bulk-edit dashboard (no external assets).
 */
export function bulkEditHtml(): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <!-- CSP applied centrally by secureWebviewHtml (audit C2b): a per-render
    nonce locks script-src, replacing the old unsafe-inline policy. -->
  <title>${t('panel.data.bulk.docTitle')}</title>
  <style>
    body {
      font-family: var(--vscode-font-family);
      font-size: var(--vscode-font-size);
      color: var(--vscode-foreground);
      padding: 1rem 1.25rem;
      line-height: 1.45;
      max-width: 72rem;
    }
    h1 { font-size: 1.1rem; font-weight: 600; margin: 0 0 0.75rem; }
    p { margin: 0.5rem 0; opacity: 0.92; }
    .count { font-weight: 600; color: var(--vscode-textLink-foreground); }
    .row { display: flex; flex-wrap: wrap; gap: 0.5rem; margin-top: 1rem; }
    .meta { opacity: 0.75; margin-top: 0.25rem; }
    .grid-wrap { margin-top: 1rem; border: 1px solid var(--vscode-editorWidget-border); border-radius: 4px; overflow: hidden; }
    table { width: 100%; border-collapse: collapse; }
    th, td { text-align: left; padding: 0.4rem 0.5rem; border-bottom: 1px solid var(--vscode-editorWidget-border); vertical-align: top; }
    th { background: var(--vscode-editorWidget-background); font-weight: 600; position: sticky; top: 0; z-index: 1; }
    td.sql { font-family: var(--vscode-editor-font-family); font-size: 0.9em; }
    .pager { display: flex; gap: 0.5rem; align-items: center; margin-top: 0.6rem; }
    button {
      background: var(--vscode-button-background);
      color: var(--vscode-button-foreground);
      border: none;
      padding: 0.35rem 0.75rem;
      border-radius: 2px;
      cursor: pointer;
      font-size: var(--vscode-font-size);
    }
    button.secondary {
      background: var(--vscode-button-secondaryBackground, var(--surface-3));
      color: var(--vscode-button-secondaryForeground, var(--text));
    }
    .grid-wrap:focus { outline: 1px solid var(--vscode-focusBorder); outline-offset: 2px; }
    tr.pending-row-selected { background: var(--vscode-list-inactiveSelectionBackground); }
    .keyboard-hint { font-size: 0.78rem; opacity: 0.8; margin-top: 0.35rem; max-width: 48rem; }
  </style>
</head>
<body>
  <h1>${t('panel.data.bulk.title')}</h1>
  <p>${t('panel.data.bulk.pending', '<span class="count" id="c">0</span>')}</p>
  <p class="meta" id="pageMeta"></p>
  <p>${t('panel.data.bulk.instructions', `<strong>${t('panel.data.bulk.instructions.viewer')}</strong>`, '<code>writeQuery</code>')}</p>
  <div class="row">
    <button type="button" id="openViewer">${t('panel.data.bulk.btn.openViewer')}</button>
    <button type="button" id="preview" class="secondary">${t('panel.data.bulk.btn.preview')}</button>
    <button type="button" id="commit">${t('panel.data.bulk.btn.commit')}</button>
  </div>
  <div class="row">
    <button type="button" id="undo" class="secondary">${t('panel.data.bulk.btn.undo')}</button>
    <button type="button" id="redo" class="secondary">${t('panel.data.bulk.btn.redo')}</button>
    <button type="button" id="discard" class="secondary">${t('panel.data.bulk.btn.discard')}</button>
  </div>
  <div class="row">
    <button type="button" id="invariants" class="secondary">${t('panel.data.bulk.btn.invariants')}</button>
    <button type="button" id="clipboardImport" class="secondary">${t('panel.data.bulk.btn.clipboardImport')}</button>
    <button type="button" id="openDvr" class="secondary">${t('panel.data.bulk.btn.openDvr')}</button>
    <button type="button" id="captureSnapshot" class="secondary" title="${t('panel.data.bulk.captureSnapshot.title')}">${t('panel.data.bulk.btn.captureSnapshot')}</button>
  </div>
  <p class="keyboard-hint" id="gridHint">${t('panel.data.bulk.gridHint')}</p>
  <div class="grid-wrap" id="gridWrap" tabindex="0" role="region" aria-labelledby="gridHint">
    <table>
      <thead><tr><th>${t('panel.data.bulk.col.kind')}</th><th>${t('panel.data.bulk.col.table')}</th><th>${t('panel.data.bulk.col.details')}</th><th>${t('panel.data.bulk.col.when')}</th></tr></thead>
      <tbody id="gridBody"><tr><td colspan="4">${t('panel.data.bulk.grid.empty')}</td></tr></tbody>
    </table>
  </div>
  <div class="pager">
    <button type="button" id="prevPage" class="secondary">${t('panel.data.bulk.pager.prev')}</button>
    <span id="pageInfo">${t('panel.data.bulk.pager.pageInfo', 1, 1)}</span>
    <button type="button" id="nextPage" class="secondary">${t('panel.data.bulk.pager.next')}</button>
  </div>
  <script nonce="__CSP_NONCE__">
    (function() {
      var vscode = acquireVsCodeApi();
      // __VT bridge (plan 75 §3.3): the host resolves this panel's keys to the active
      // display language and injects them here, because client-side render functions
      // have no host t(). vt() does the same {0}/{1} substitution as the host runtime,
      // fail-soft to the key. Only this panel's keys are shipped (prefix-filtered).
      const __VT = ${JSON.stringify(getWebviewL10nMap(['panel.data.bulk.']))};
      function vt(key) {
        const args = arguments;
        return (__VT[key] || key).replace(/\\{(\\d+)\\}/g, (m, d) => {
          const i = Number(d) + 1;
          return i < args.length ? args[i] : m;
        });
      }
      var page = 0;
      var pageSize = 20;
      var rows = [];
      /** Absolute index into [rows] for keyboard/mouse selection (-1 = none). */
      var selectedAbs = -1;
      function send(cmd) { vscode.postMessage({ command: cmd }); }
      function esc(v) {
        return String(v)
          .replace(/&/g, '&amp;')
          .replace(/</g, '&lt;')
          .replace(/>/g, '&gt;')
          .replace(/"/g, '&quot;')
          .replace(/'/g, '&#39;');
      }
      function fmt(v) {
        if (v === null || v === undefined) return 'NULL';
        if (typeof v === 'string') return '"' + v + '"';
        try { return JSON.stringify(v); } catch (_e) { return String(v); }
      }
      function detail(change) {
        if (change.kind === 'cell') {
          return '<span class="sql">' + esc(change.column) + ': ' + esc(fmt(change.oldValue)) + ' -> ' + esc(fmt(change.newValue)) + '</span>';
        }
        if (change.kind === 'delete') {
          return '<span class="sql">where ' + esc(change.pkColumn) + ' = ' + esc(fmt(change.pkValue)) + '</span>';
        }
        var vals = Object.keys(change.values || {}).slice(0, 5).map(function(k) {
          return esc(k) + '=' + esc(fmt(change.values[k]));
        }).join(', ');
        return '<span class="sql">' + vals + '</span>';
      }
      /** Keep keyboard focus on the grid region so Arrow/Enter/Escape stay predictable. */
      function focusSelectedRow() {
        if (selectedAbs < 0) return;
        var gw = document.getElementById('gridWrap');
        if (gw) gw.focus();
      }
      function renderGrid() {
        var body = document.getElementById('gridBody');
        var pageInfo = document.getElementById('pageInfo');
        var pageMeta = document.getElementById('pageMeta');
        var totalPages = Math.max(1, Math.ceil(rows.length / pageSize));
        if (page >= totalPages) page = totalPages - 1;
        var start = page * pageSize;
        var end = Math.min(rows.length, start + pageSize);
        pageInfo.textContent = vt('panel.data.bulk.pager.pageInfo', page + 1, totalPages);
        pageMeta.textContent = rows.length > 0
          ? vt('panel.data.bulk.pageMeta.showing', start + 1, end, rows.length)
          : vt('panel.data.bulk.grid.empty');
        document.getElementById('prevPage').disabled = page <= 0;
        document.getElementById('nextPage').disabled = page >= totalPages - 1;
        if (rows.length === 0) {
          selectedAbs = -1;
          body.innerHTML = '<tr><td colspan="4">' + vt('panel.data.bulk.grid.empty') + '</td></tr>';
          return;
        }
        if (selectedAbs >= rows.length) selectedAbs = rows.length - 1;
        body.innerHTML = rows.slice(start, end).map(function(change, i) {
          var abs = start + i;
          var when = change.timestamp ? new Date(change.timestamp).toLocaleTimeString() : '';
          var sel = abs === selectedAbs ? ' pending-row-selected' : '';
          return '<tr class="pending-row' + sel + '" data-abs-index="' + abs + '">'
            + '<td>' + esc(change.kind) + '</td>'
            + '<td>' + esc(change.table || '') + '</td>'
            + '<td>' + detail(change) + '</td>'
            + '<td>' + esc(when) + '</td>'
            + '</tr>';
        }).join('');
        requestAnimationFrame(focusSelectedRow);
      }
      function moveSelection(delta) {
        if (rows.length === 0) return;
        if (selectedAbs < 0) {
          selectedAbs = page * pageSize;
        } else {
          selectedAbs += delta;
          if (selectedAbs < 0) selectedAbs = 0;
          if (selectedAbs >= rows.length) selectedAbs = rows.length - 1;
        }
        var newPage = Math.floor(selectedAbs / pageSize);
        if (newPage !== page) page = newPage;
        renderGrid();
      }
      document.getElementById('openViewer').onclick = function() { send('openViewer'); };
      document.getElementById('preview').onclick = function() { send('preview'); };
      document.getElementById('commit').onclick = function() { send('commit'); };
      document.getElementById('undo').onclick = function() { send('undo'); };
      document.getElementById('redo').onclick = function() { send('redo'); };
      document.getElementById('discard').onclick = function() { send('discard'); };
      document.getElementById('invariants').onclick = function() { send('invariants'); };
      document.getElementById('clipboardImport').onclick = function() { send('clipboardImport'); };
      document.getElementById('openDvr').onclick = function() { send('openDvr'); };
      document.getElementById('captureSnapshot').onclick = function() { send('captureSnapshot'); };
      document.getElementById('prevPage').onclick = function() { page = Math.max(0, page - 1); renderGrid(); };
      document.getElementById('nextPage').onclick = function() { page += 1; renderGrid(); };
      var gridWrap = document.getElementById('gridWrap');
      var gridBody = document.getElementById('gridBody');
      gridBody.addEventListener('click', function(e) {
        var tr = e.target.closest('tr[data-abs-index]');
        if (!tr) return;
        selectedAbs = parseInt(tr.getAttribute('data-abs-index'), 10);
        renderGrid();
        gridWrap.focus();
      });
      gridWrap.addEventListener('keydown', function(ev) {
        if (ev.key === 'ArrowDown') { ev.preventDefault(); moveSelection(1); return; }
        if (ev.key === 'ArrowUp') { ev.preventDefault(); moveSelection(-1); return; }
        if (ev.key === 'Home' && !ev.ctrlKey) {
          ev.preventDefault();
          selectedAbs = page * pageSize;
          renderGrid();
          return;
        }
        if (ev.key === 'End' && !ev.ctrlKey) {
          ev.preventDefault();
          selectedAbs = Math.min(rows.length - 1, (page + 1) * pageSize - 1);
          renderGrid();
          return;
        }
        if (ev.key === 'Enter' && !ev.ctrlKey) {
          ev.preventDefault();
          send('openViewer');
          return;
        }
        if (ev.key === 'Escape') {
          ev.preventDefault();
          if (selectedAbs >= 0) {
            selectedAbs = -1;
            renderGrid();
          }
          return;
        }
      });
      window.addEventListener('keydown', function(ev) {
        if (ev.key === 'Enter' && ev.ctrlKey) send('commit');
      });
      window.addEventListener('message', function(ev) {
        var m = ev.data;
        if (m && m.command === 'state' && typeof m.count === 'number') {
          document.getElementById('c').textContent = String(m.count);
          rows = Array.isArray(m.changes) ? m.changes : [];
          selectedAbs = -1;
          renderGrid();
        }
      });
    })();
  </script>
</body>
</html>`;
}
