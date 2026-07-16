import type { ISqlSnippet } from './snippet-types';
import { renderSnippetCard } from './snippet-card-html';
import { t, getWebviewL10nMap } from '../l10n';
import { escapeHtml } from '../shared-utils';

interface ILibraryData {
  snippets: ISqlSnippet[];
  categories: string[];
  tables: string[];
}

/** Build the HTML for the snippet library webview panel. */
export function buildSnippetLibraryHtml(data: ILibraryData): string {
  const grouped = groupByCategory(data.snippets);
  const categories = Object.keys(grouped).sort();
  const tableOptions = data.tables.map(
    (t) => `<option value="${esc(t)}">${esc(t)}</option>`,
  ).join('');

  const sections = categories.map((cat) => {
    const items = grouped[cat];
    const cards = items.map((s) => renderSnippetCard(s, tableOptions)).join('');
    return `<div class="category">
      <div class="cat-header" data-click="toggleCategory" data-a0="$this">
        <span class="arrow">&#9660;</span> ${esc(cat)}
        <span class="count">(${items.length})</span>
      </div>
      <div class="cat-body">${cards}</div>
    </div>`;
  }).join('');

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<style>
  body { font-family: var(--vscode-font-family); color: var(--vscode-foreground);
         background: var(--vscode-editor-background); padding: 12px; margin: 0; }
  h2 { margin: 0 0 10px; font-size: 14px; display: flex;
       align-items: center; justify-content: space-between; }
  .toolbar { display: flex; gap: 6px; }
  input[type="text"], textarea, select {
    background: var(--vscode-input-background); color: var(--vscode-input-foreground);
    border: 1px solid var(--vscode-input-border);
    padding: 4px 8px; border-radius: 2px; font-family: inherit; font-size: 12px; }
  textarea { resize: vertical; min-height: 60px; width: 100%; box-sizing: border-box; }
  .search { width: 100%; margin-bottom: 10px; box-sizing: border-box; }
  button { cursor: pointer; padding: 4px 10px; font-size: 12px;
           background: var(--vscode-button-background);
           color: var(--vscode-button-foreground); border: none;
           border-radius: 2px; white-space: nowrap; }
  button:hover { background: var(--vscode-button-hoverBackground); }
  button.secondary { background: var(--vscode-button-secondaryBackground, var(--surface-3));
                     color: var(--vscode-button-secondaryForeground, var(--text)); }
  button.secondary:hover { background: var(--vscode-button-secondaryHoverBackground); }
  button.danger { background: var(--vscode-errorForeground); color: #fff; }
  .category { margin-bottom: 8px; }
  .cat-header { cursor: pointer; font-weight: 600; padding: 6px 4px;
    border-bottom: 1px solid var(--vscode-widget-border); user-select: none; font-size: 13px; }
  .cat-header:hover { opacity: 0.8; }
  .arrow { display: inline-block; transition: transform 0.15s; font-size: 10px; }
  .cat-header.collapsed .arrow { transform: rotate(-90deg); }
  .count { opacity: 0.6; font-weight: normal; font-size: 11px; }
  .cat-body { padding: 4px 0 4px 12px; }
  .cat-header.collapsed + .cat-body { display: none; }
  .snippet { padding: 8px; margin: 4px 0;
             border: 1px solid var(--vscode-widget-border); border-radius: 3px; }
  .snippet-name { font-weight: 600; font-size: 13px; }
  .snippet-desc { font-size: 11px; opacity: 0.7; margin: 2px 0; }
  .snippet-sql { font-family: var(--vscode-editor-font-family); font-size: 11px; opacity: 0.8;
    margin: 4px 0; white-space: pre-wrap; word-break: break-all;
    background: var(--vscode-textCodeBlock-background); padding: 4px 6px; border-radius: 2px; }
  .snippet-actions { display: flex; gap: 4px; margin-top: 6px; }
  .snippet-meta { font-size: 10px; opacity: 0.5; margin-top: 4px; }
  .var-form { margin-top: 8px; padding: 8px; border: 1px solid var(--vscode-widget-border);
              border-radius: 3px; background: var(--vscode-textCodeBlock-background); }
  .var-row { display: flex; gap: 8px; align-items: center; margin: 4px 0; }
  .var-row label { min-width: 80px; font-size: 12px; font-weight: 600; }
  .var-row input, .var-row select { flex: 1; }
  .preview { font-family: var(--vscode-editor-font-family); font-size: 11px;
    margin: 6px 0; padding: 4px 6px; background: var(--vscode-editor-background);
    border: 1px solid var(--vscode-widget-border); border-radius: 2px;
    white-space: pre-wrap; word-break: break-all; }
  .result-table { width: 100%; border-collapse: collapse; margin-top: 8px; font-size: 11px; }
  .result-table th, .result-table td { text-align: left; padding: 3px 8px;
    border-bottom: 1px solid var(--vscode-widget-border); }
  .result-table th { font-weight: bold; opacity: 0.8; }
  .empty { text-align: center; padding: 24px; opacity: 0.6; }
  .form-overlay { margin: 10px 0; padding: 10px;
                  border: 1px solid var(--vscode-focusBorder); border-radius: 3px; }
  .form-row { display: flex; gap: 8px; align-items: center; margin: 6px 0; }
  .form-row label { min-width: 80px; font-size: 12px; }
  .form-row input, .form-row textarea, .form-row select { flex: 1; }
  .form-actions { display: flex; gap: 6px; margin-top: 8px; }
  .error { color: var(--vscode-errorForeground); font-size: 12px; margin: 4px 0; }
</style>
</head>
<body>
  <h2>
    ${t('panel.notes.library.title')}
    <span class="toolbar">
      <button data-click="showNewForm">${t('panel.notes.library.btn.new')}</button>
      <button class="secondary" data-click="post" data-a0="importFile">${t('panel.notes.library.btn.import')}</button>
      <button class="secondary" data-click="post" data-a0="exportAll">${t('panel.notes.library.btn.export')}</button>
    </span>
  </h2>
  <input type="text" class="search" placeholder="${esc(t('panel.notes.library.search.placeholder'))}"
         data-input="handleSearch" data-a0="$value" />
  <div id="newForm" style="display:none" class="form-overlay">
    <div class="form-row"><label>${t('panel.notes.library.form.name')}</label>
      <input type="text" id="formName" placeholder="${esc(t('panel.notes.library.form.name.placeholder'))}" /></div>
    <div class="form-row"><label>${t('panel.notes.library.form.category')}</label>
      <input type="text" id="formCategory" value="Uncategorized"
             list="catList" placeholder="${esc(t('panel.notes.library.form.category.placeholder'))}" />
      <datalist id="catList">
        ${data.categories.map((c) => `<option value="${esc(c)}">`).join('')}
      </datalist></div>
    <div class="form-row"><label>${t('panel.notes.library.form.description')}</label>
      <input type="text" id="formDesc" placeholder="${esc(t('panel.notes.library.form.description.placeholder'))}" /></div>
    <div class="form-row" style="align-items:flex-start"><label>${t('panel.notes.library.form.sql')}</label>
      <textarea id="formSql" placeholder="${esc(t('panel.notes.library.form.sql.placeholder'))}"></textarea></div>
    <div class="form-actions">
      <button data-click="submitNewForm">${t('panel.notes.library.btn.save')}</button>
      <button class="secondary" data-click="hideNewForm">${t('panel.notes.library.btn.cancel')}</button>
    </div>
  </div>
  <div id="snippetList">
    ${sections || `<p class="empty">${t('panel.notes.library.empty')}</p>`}
  </div>
  <script nonce="__CSP_NONCE__">
    const vscode = acquireVsCodeApi();

    // __VT bridge (plan 75 §3.3): the host resolves this panel's keys to the active
    // display language and injects them here, because client-side render functions
    // have no host t(). vt() does the same {0}/{1} substitution as the host runtime,
    // fail-soft to the key. Only this panel's keys are shipped (prefix-filtered).
    const __VT = ${JSON.stringify(getWebviewL10nMap(['panel.notes.library.']))};
    function vt(key) {
      const args = arguments;
      return (__VT[key] || key).replace(/\\{(\\d+)\\}/g, (m, d) => {
        const i = Number(d) + 1;
        return i < args.length ? args[i] : m;
      });
    }

    function post(cmd, data) { vscode.postMessage(Object.assign({ command: cmd }, data || {})); }
    function toggleCategory(el) { el.classList.toggle('collapsed'); }
    var _searchTimer;
    function handleSearch(q) {
      clearTimeout(_searchTimer);
      _searchTimer = setTimeout(function() { post('search', { query: q }); }, 250);
    }
    function showNewForm(s) {
      var f = document.getElementById('newForm'); f.style.display = 'block';
      document.getElementById('formName').value = s ? s.name : '';
      document.getElementById('formCategory').value = s ? s.category : 'Uncategorized';
      document.getElementById('formDesc').value = s ? (s.description || '') : '';
      document.getElementById('formSql').value = s ? s.sql : '';
      f.dataset.editId = s ? s.id : '';
    }
    function hideNewForm() { document.getElementById('newForm').style.display = 'none'; }
    function submitNewForm() {
      var name = document.getElementById('formName').value.trim();
      var sql = document.getElementById('formSql').value.trim();
      if (!name || !sql) return;
      post('saveSnippet', { snippet: {
        id: document.getElementById('newForm').dataset.editId || '',
        name: name, sql: sql,
        description: document.getElementById('formDesc').value.trim() || undefined,
        category: document.getElementById('formCategory').value.trim() || 'Uncategorized',
      } });
      hideNewForm();
    }
    function editSnippet(id) { post('getSnippet', { id: id }); }
    function deleteSnippet(id, name) {
      if (confirm(vt('panel.notes.library.confirm.delete', name))) post('deleteSnippet', { id: id });
    }
    function showRunForm(id) {
      var el = document.getElementById('run-' + id);
      if (el) el.style.display = el.style.display === 'none' ? 'block' : 'none';
    }
    // Primary "Run" action on a snippet card. hasVars is '1'/'0' (data-a1) so the
    // delegated dispatcher can pass it as a string; with variables, open the run
    // form, otherwise run immediately with no values.
    function runOrShow(id, hasVars) {
      if (hasVars === '1') showRunForm(id);
      else post('runSnippet', { id: id, values: {} });
    }
    function runSnippet(id) {
      var inputs = document.getElementById('run-' + id).querySelectorAll('[data-var]');
      var values = {};
      inputs.forEach(function(inp) { values[inp.dataset.var] = inp.value; });
      post('runSnippet', { id: id, values: values });
    }
    function updatePreview(id) {
      var form = document.getElementById('run-' + id);
      var sql = form.dataset.sql;
      form.querySelectorAll('[data-var]').forEach(function(inp) {
        sql = sql.split('$\{' + inp.dataset.var + '}').join(inp.value || '$\{' + inp.dataset.var + '}');
      });
      var prev = form.querySelector('.preview');
      if (prev) prev.textContent = sql;
    }
    // Escape ALL dynamic values before they reach innerHTML. cols/rows are live
    // DB column names + cell values and msg.message is SQLite error text (which
    // echoes table/column/value) — any of them can contain HTML. Without this,
    // a cell like <img src=x onerror=...> is stored XSS in the developer's
    // browser. See plans/history/2026.06/2026.06.12/full-codebase-audit-2026.06.12.md C2.
    function escHtml(v) {
      return String(v === null || v === undefined ? '' : v)
        .replace(/&/g, '&amp;').replace(/</g, '&lt;')
        .replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
    }
    function renderResultTable(cid, cols, rows) {
      var el = document.getElementById(cid); if (!el) return;
      var h = '<tr>' + cols.map(function(c) { return '<th>' + escHtml(c) + '</th>'; }).join('') + '</tr>';
      var b = rows.map(function(r) {
        return '<tr>' + r.map(function(v) { return '<td>' + (v === null ? '<em>NULL</em>' : escHtml(v)) + '</td>'; }).join('') + '</tr>';
      }).join('');
      el.innerHTML = '<table class="result-table"><thead>' + h + '</thead><tbody>' + b + '</tbody></table>';
    }
    window.addEventListener('message', function(event) {
      var msg = event.data;
      if (msg.command === 'editForm') showNewForm(msg.snippet);
      else if (msg.command === 'queryResult') renderResultTable('result-' + msg.snippetId, msg.columns, msg.rows);
      else if (msg.command === 'error') {
        var el = document.getElementById('result-' + msg.snippetId);
        if (el) el.innerHTML = '<p class="error">' + escHtml(msg.message) + '</p>';
      }
    });
  </script>
</body>
</html>`;
}

function groupByCategory(snippets: ISqlSnippet[]): Record<string, ISqlSnippet[]> {
  const grouped: Record<string, ISqlSnippet[]> = {};
  for (const s of snippets) {
    const cat = s.category || 'Uncategorized';
    if (!grouped[cat]) grouped[cat] = [];
    grouped[cat].push(s);
  }
  return grouped;
}

const esc = escapeHtml;
