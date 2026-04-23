/**
 * SQL runner tab — the Run SQL panel with template, history,
 * bookmarks, auto-explain, result display, and chart rendering.
 */
import * as S from './state.ts';
import { esc, setButtonBusy } from './utils.ts';
import { switchTab } from './tabs.ts';
import { loadSqlHistory, pushSqlHistory, loadBookmarks, refreshBookmarksDropdown, addBookmark, deleteBookmark, exportBookmarks, importBookmarks, bindDropdownToInput } from './sql-history.ts';
import { fetchHistory, togglePanelCollapsed as toggleHistorySidebar } from './history-sidebar.ts';
import { buildTableStatusBar } from './table-view.ts';

export function initSqlRunner(): void {
  const templateSel = document.getElementById('sql-template') as HTMLSelectElement | null;
  const tableSel = document.getElementById('sql-table') as HTMLSelectElement | null;
  const fieldsSel = document.getElementById('sql-fields') as HTMLSelectElement | null;
  const lockBtn = document.getElementById('sql-template-lock') as HTMLButtonElement | null;
  const applyBtn = document.getElementById('sql-apply-template') as HTMLButtonElement | null;
  const runBtn = document.getElementById('sql-run') as HTMLButtonElement | null;
  // History toggle: icon button that opens the History sidebar. Replaces
  // the old #sql-history <select> + "Recent" label, which duplicated data
  // the sidebar already shows and looked empty when nothing was picked.
  const historyToggleBtn = document.getElementById('sql-history-toggle') as HTMLButtonElement | null;
  const formatSel = document.getElementById('sql-result-format') as HTMLSelectElement | null;
  const inputEl = document.getElementById('sql-input') as HTMLTextAreaElement | null;
  const errorEl = document.getElementById('sql-error') as HTMLElement | null;
  const resultEl = document.getElementById('sql-result') as HTMLElement | null;
  const explainEl = document.getElementById('sql-explain-info') as HTMLElement | null;
  const bookmarksSel = document.getElementById('sql-bookmarks') as HTMLSelectElement | null;
  /** Client-side pagination for SQL result table: full row set and current page index. */
  let sqlResultAllRows: any[] = [];
  let sqlResultPage = 0;
  const SQL_RESULT_PAGE_SIZE = 100;
  const bookmarkSaveBtn = document.getElementById('sql-bookmark-save');
  const bookmarkDeleteBtn = document.getElementById('sql-bookmark-delete');
  const bookmarkExportBtn = document.getElementById('sql-bookmark-export');
  const bookmarkImportBtn = document.getElementById('sql-bookmark-import');
  loadSqlHistory();
  loadBookmarks();
  refreshBookmarksDropdown(bookmarksSel);
  bindDropdownToInput(bookmarksSel, S.sqlBookmarks, inputEl);
  // Wire the history-toggle icon button to open/close the History sidebar.
  // Same behavior as the toolbar-level #tb-history-toggle — we intentionally
  // share the toggle function so both controls stay in sync.
  if (historyToggleBtn) historyToggleBtn.addEventListener('click', toggleHistorySidebar);
  if (bookmarkSaveBtn) bookmarkSaveBtn.addEventListener('click', function() { addBookmark(inputEl, bookmarksSel); });
  if (bookmarkDeleteBtn) bookmarkDeleteBtn.addEventListener('click', function() { deleteBookmark(bookmarksSel); });
  if (bookmarkExportBtn) bookmarkExportBtn.addEventListener('click', exportBookmarks);
  if (bookmarkImportBtn) bookmarkImportBtn.addEventListener('click', function() { importBookmarks(bookmarksSel); });

  // ─── Template system ───────────────────────────────────────
  // All templates substitute selected fields when available,
  // except COUNT which always uses COUNT(*).

  const TEMPLATES: Record<string, (t: string, cols: string[]) => string> = {
    'select-star-limit': function(t, cols) {
      const list = (cols && cols.length) ? cols.map(c => '"' + c + '"').join(', ') : '*';
      return 'SELECT ' + list + ' FROM "' + t + '" LIMIT 10';
    },
    'select-star': function(t, cols) {
      const list = (cols && cols.length) ? cols.map(c => '"' + c + '"').join(', ') : '*';
      return 'SELECT ' + list + ' FROM "' + t + '"';
    },
    'count': function(t, _cols) { return 'SELECT COUNT(*) FROM "' + t + '"'; },
    'select-fields': function(t, cols) {
      const list = (cols && cols.length) ? cols.map(c => '"' + c + '"').join(', ') : '*';
      return 'SELECT ' + list + ' FROM "' + t + '" LIMIT 10';
    }
  };

  function getSelectedFields(): string[] {
    const opts = fieldsSel ? Array.from(fieldsSel.selectedOptions || []) : [];
    return opts.map(o => o.value).filter(Boolean);
  }

  function applyTemplate(): void {
    const table = (tableSel && tableSel.value) || '';
    const templateId = (templateSel && templateSel.value) || 'custom';
    if (templateId === 'custom') return;
    const fn = TEMPLATES[templateId];
    if (!fn) return;
    const cols = getSelectedFields();
    const sql = table ? fn(table, cols) : ('SELECT * FROM "' + (table || 'table_name') + '" LIMIT 10');
    if (inputEl) {
      inputEl.value = sql;
      // Trigger auto-explain after template is applied.
      scheduleAutoExplain();
    }
  }

  // ─── Lock toggle ───────────────────────────────────────────
  // When locked, changing table or field selection auto-applies
  // the current template. When unlocked, manual Apply is needed.
  let templateLocked = true;

  if (lockBtn) {
    lockBtn.addEventListener('click', function() {
      templateLocked = !templateLocked;
      lockBtn.classList.toggle('locked', templateLocked);
      const icon = lockBtn.querySelector('.material-symbols-outlined');
      if (icon) icon.textContent = templateLocked ? 'lock' : 'lock_open';
      lockBtn.title = templateLocked
        ? 'Lock: auto-apply template when table or fields change'
        : 'Unlocked: table/field changes won\u2019t auto-apply template';
    });
  }

  // Auto-apply when template dropdown changes (always).
  if (applyBtn) applyBtn.addEventListener('click', applyTemplate);
  if (templateSel) templateSel.addEventListener('change', applyTemplate);

  if (tableSel) {
    tableSel.addEventListener('change', function() {
      const name = this.value;
      if (fieldsSel) fieldsSel.innerHTML = '<option value="">—</option>';
      if (!name) return;
      if (fieldsSel) fieldsSel.innerHTML = '<option value="">Loading…</option>';
      const requestedTable = name;
      fetch('/api/table/' + encodeURIComponent(name) + '/columns', S.authOpts())
        .then(r => r.json())
        .then(cols => {
          if (tableSel.value !== requestedTable) return;
          if (Array.isArray(cols) && fieldsSel) {
            fieldsSel.innerHTML = '<option value="">—</option>' + cols.map(c => '<option value="' + esc(c) + '">' + esc(c) + '</option>').join('');
          } else if (fieldsSel) {
            fieldsSel.innerHTML = '<option value="">—</option>';
          }
          // Auto-apply template when locked.
          if (templateLocked) applyTemplate();
        })
        .catch(() => {
          if (tableSel.value !== requestedTable) return;
          if (fieldsSel) fieldsSel.innerHTML = '<option value="">—</option>';
        });
    });
  }

  // Auto-apply on field selection change when locked.
  if (fieldsSel) {
    fieldsSel.addEventListener('change', function() {
      if (templateLocked) applyTemplate();
    });
  }

  /** Renders the current page of SQL result table from in-memory sqlResultAllRows. */
  function renderSqlResultPage(): void {
    if (!resultEl) return;
    const rows = sqlResultAllRows;
    const pageSize = SQL_RESULT_PAGE_SIZE;
    const start = sqlResultPage * pageSize;
    const pageRows = rows.slice(start, start + pageSize);
    const keys = rows.length > 0 ? Object.keys(rows[0]) : [];
    const total = rows.length;
    let tableHtml = '<div class="data-table-scroll-wrap"><table><thead><tr>' + keys.map(function(k) { return '<th data-column-key="' + esc(k) + '">' + esc(k) + '</th>'; }).join('') + '</tr></thead><tbody>';
    pageRows.forEach(function(row) {
      tableHtml += '<tr>' + keys.map(function(k) { return '<td>' + esc(row[k] != null ? String(row[k]) : '') + '</td>'; }).join('') + '</tr>';
    });
    tableHtml += '</tbody></table></div>';
    const statusHtml = buildTableStatusBar(total, start, pageSize, pageRows.length, keys.length);
    const prevDisabled = sqlResultPage <= 0;
    const nextDisabled = (start + pageSize) >= total;
    const paginationHtml = '<div class="sql-result-pagination toolbar" style="margin-top:0.35rem;">' +
      '<button type="button" id="sql-result-prev"' + (prevDisabled ? ' disabled' : '') + '>Prev</button>' +
      '<button type="button" id="sql-result-next"' + (nextDisabled ? ' disabled' : '') + '>Next</button>' +
      '</div>';
    resultEl.innerHTML = '<p class="meta">' + total + ' row(s)</p>' + tableHtml + statusHtml + paginationHtml;
    const prevBtn = resultEl.querySelector('#sql-result-prev');
    const nextBtn = resultEl.querySelector('#sql-result-next');
    if (prevBtn) prevBtn.addEventListener('click', function() { sqlResultPage--; renderSqlResultPage(); });
    if (nextBtn) nextBtn.addEventListener('click', function() { sqlResultPage++; renderSqlResultPage(); });
  }

  // Shared: clear previous results and hide chart controls before any SQL operation.
  function clearSqlResults(): void {
    if (errorEl) { errorEl.style.display = 'none'; }
    if (resultEl) { resultEl.style.display = 'none'; resultEl.innerHTML = ''; }
    sqlResultAllRows = [];
    sqlResultPage = 0;
    const chartControls = document.getElementById('chart-controls');
    const chartContainer = document.getElementById('chart-container');
    if (chartControls) chartControls.style.display = 'none';
    if (chartContainer) chartContainer.style.display = 'none';
  }

  // ─── Auto-explain with debounce ────────────────────────────
  // Automatically runs EXPLAIN QUERY PLAN whenever the SQL input
  // changes, with a debounce to avoid hammering the server.
  let explainTimer: ReturnType<typeof setTimeout> | null = null;
  // Track the last SQL we explained to avoid redundant requests.
  let lastExplainedSql = '';
  // Abort controller for in-flight explain requests.
  let explainAbort: AbortController | null = null;
  const EXPLAIN_DEBOUNCE_MS = 1200;

  function scheduleAutoExplain(): void {
    if (explainTimer) clearTimeout(explainTimer);
    explainTimer = setTimeout(runAutoExplain, EXPLAIN_DEBOUNCE_MS);
  }

  function runAutoExplain(): void {
    if (!inputEl || !explainEl) return;
    const sql = String(inputEl.value || '').trim();
    if (!sql) {
      explainEl.style.display = 'none';
      lastExplainedSql = '';
      return;
    }
    // Skip if we already explained this exact SQL.
    if (sql === lastExplainedSql) return;
    lastExplainedSql = sql;

    // Cancel any in-flight explain request.
    if (explainAbort) explainAbort.abort();
    explainAbort = new AbortController();

    explainEl.style.display = 'block';
    explainEl.innerHTML = '<p class="meta explain-loading">Analyzing query\u2026</p>';

    fetch('/api/sql/explain', Object.assign({}, S.authOpts({
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sql: sql })
    }), { signal: explainAbort.signal }))
      .then(r => r.json().then(d => ({ ok: r.ok, data: d })))
      .then(({ ok, data }) => {
        if (!ok) {
          explainEl.innerHTML = '<p class="meta" style="color:#e57373;">' + esc(data.error || 'Explain failed') + '</p>';
          return;
        }
        renderExplainInfo(data);
      })
      .catch(e => {
        // Silently ignore aborted requests.
        if (e.name === 'AbortError') return;
        explainEl.innerHTML = '<p class="meta" style="color:#e57373;">' + esc(e.message || String(e)) + '</p>';
      });
  }

  // ─── Explain + index display ───────────────────────────────
  // Shows cost analysis and which indexes are applied/missing.
  function renderExplainInfo(data: any): void {
    if (!explainEl) return;
    const rows = data.rows || [];
    // Index map: { tableName: [{ name, columns, unique }] }
    const indexes: Record<string, Array<{ name: string; columns: string[]; unique: boolean }>> = data.indexes || {};

    // Parse EXPLAIN detail rows for scan/index usage.
    let scanCount = 0;
    let searchCount = 0;
    let subqueryCount = 0;
    let sortPresent = false;
    let tempPresent = false;
    // Track which indexes the query actually uses.
    const usedIndexNames = new Set<string>();
    // Track tables involved and their access method.
    const tableAccess: Record<string, 'scan' | 'index'> = {};

    rows.forEach(function(r: any) {
      const d = String(r.detail || '').trim();
      const scanMatch = d.match(/\bSCAN\s+(?:TABLE\s+)?(\S+)/i);
      if (scanMatch) {
        scanCount++;
        // A table with ANY full scan is marked 'scan' — never
        // downgraded to 'index' by a later SEARCH step.
        if (scanMatch[1]) tableAccess[scanMatch[1]] = 'scan';
      }
      // Match SEARCH TABLE ... USING INDEX idx_name or USING COVERING INDEX idx_name
      const searchMatch = d.match(/\bSEARCH\s+(?:TABLE\s+)?(\S+)\s+USING\s+(?:COVERING\s+)?INDEX\s+(\S+)/i);
      if (searchMatch) {
        searchCount++;
        // Only set 'index' if the table hasn't already been
        // flagged with a scan (scan is the worse access path).
        if (searchMatch[1] && tableAccess[searchMatch[1]] !== 'scan') tableAccess[searchMatch[1]] = 'index';
        if (searchMatch[2]) usedIndexNames.add(searchMatch[2]);
      } else if (/\bSEARCH\b/i.test(d) && /\bINDEX\b/i.test(d)) {
        // Fallback: generic SEARCH ... INDEX pattern
        searchCount++;
        const tblMatch = d.match(/\bSEARCH\s+(?:TABLE\s+)?(\S+)/i);
        if (tblMatch && tblMatch[1] && tableAccess[tblMatch[1]] !== 'scan') tableAccess[tblMatch[1]] = 'index';
        const idxMatch = d.match(/INDEX\s+(\S+)/i);
        if (idxMatch && idxMatch[1]) usedIndexNames.add(idxMatch[1]);
      } else if (/\bSEARCH\b/i.test(d)) {
        // SEARCH using INTEGER PRIMARY KEY or similar
        searchCount++;
        const tblMatch = d.match(/\bSEARCH\s+(?:TABLE\s+)?(\S+)/i);
        if (tblMatch && tblMatch[1] && tableAccess[tblMatch[1]] !== 'scan') tableAccess[tblMatch[1]] = 'index';
      }
      if (/\bSUBQUERY\b/i.test(d) || /\bCORRELATED\b/i.test(d)) subqueryCount++;
      if (/USE TEMP B-TREE.*ORDER/i.test(d)) sortPresent = true;
      if (/TEMP B-TREE|TEMP TABLE/i.test(d)) tempPresent = true;
    });

    // Cost rating
    const costScore = scanCount * 3 + subqueryCount * 2 + (sortPresent ? 1 : 0) + (tempPresent ? 1 : 0);
    let costLabel: string, costColor: string;
    if (costScore === 0) { costLabel = 'Low'; costColor = '#81c784'; }
    else if (costScore <= 3) { costLabel = 'Medium'; costColor = '#ffb74d'; }
    else { costLabel = 'High'; costColor = '#e57373'; }

    // Build cost summary
    let html = '<div class="explain-cost-bar">';
    html += '<strong>Estimated cost:</strong> <span style="color:' + costColor + ';font-weight:600;">' + costLabel + '</span>';
    const parts: string[] = [];
    if (scanCount > 0) parts.push(scanCount + ' full scan' + (scanCount > 1 ? 's' : ''));
    if (searchCount > 0) parts.push(searchCount + ' index lookup' + (searchCount > 1 ? 's' : ''));
    if (subqueryCount > 0) parts.push(subqueryCount + ' subquer' + (subqueryCount > 1 ? 'ies' : 'y'));
    if (sortPresent) parts.push('sort');
    if (tempPresent) parts.push('temp storage');
    if (parts.length > 0) html += ' &mdash; ' + esc(parts.join(', '));
    html += '</div>';

    // ─── Index report per table ────────────────────────────
    // For each table in the query, show which indexes are
    // applied (used) and which exist but are unused, plus
    // flag tables with full scans and no indexes.
    const tableNames = Object.keys(tableAccess);
    if (tableNames.length > 0) {
      html += '<div class="explain-index-report">';
      for (const tbl of tableNames) {
        const access = tableAccess[tbl];
        const tblIndexes = indexes[tbl] || [];
        html += '<div class="explain-table-row">';
        html += '<span class="explain-table-name">' + esc(tbl) + '</span>';

        if (access === 'scan') {
          html += ' <span class="explain-badge badge-scan">full scan</span>';
        }

        if (tblIndexes.length === 0) {
          // No indexes at all on this table.
          html += ' <span class="explain-badge badge-missing">no indexes</span>';
        } else {
          // Show each index with used/unused status.
          for (const idx of tblIndexes) {
            const isUsed = usedIndexNames.has(idx.name);
            const badge = isUsed ? 'badge-used' : 'badge-unused';
            const label = isUsed ? 'used' : 'available';
            html += ' <span class="explain-badge ' + badge + '" title="' +
              esc(idx.name) + ' (' + esc(idx.columns.join(', ')) + ')' +
              (idx.unique ? ' UNIQUE' : '') + '">';
            html += esc(idx.name) + ' <small>(' + label + ')</small></span>';
          }
        }

        html += '</div>';
      }
      html += '</div>';
    }

    // Collapsible full query plan detail.
    if (rows.length > 0) {
      html += '<details class="explain-details"><summary>Query plan detail (' + rows.length + ' step' + (rows.length > 1 ? 's' : '') + ')</summary><pre>';
      rows.forEach(function(r: any) { html += esc(String(r.detail || '').trim()) + '\n'; });
      html += '</pre></details>';
    }

    explainEl.innerHTML = html;
    explainEl.style.display = 'block';
  }

  // Wire up auto-explain on textarea input.
  if (inputEl) {
    inputEl.addEventListener('input', scheduleAutoExplain);
  }

  // ─── Run button ────────────────────────────────────────────
  if (runBtn && inputEl && errorEl && resultEl) {
    runBtn.addEventListener('click', function() {
      const sql = String(inputEl.value || '').trim();
      clearSqlResults();
      if (!sql) {
        errorEl.textContent = 'Enter a SELECT query.';
        errorEl.style.display = 'block';

   return;
      }
      const runBtnOrigText = runBtn.textContent;
      setButtonBusy(runBtn, true, 'Running\u2026');
      runBtn.disabled = true;
      fetch('/api/sql', S.authOpts({
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sql: sql })
      }))
        .then(r => r.json().then(data => ({ ok: r.ok, data: data })))
        .then(({ ok, data }) => {
          if (!ok) {
            errorEl.textContent = data.error || 'Request failed';
            errorEl.style.display = 'block';

   return;
          }
          const rows = data.rows || [];
          const asTable = formatSel && formatSel.value === 'table';
          if (asTable && rows.length > 0) {
            sqlResultAllRows = rows;
            sqlResultPage = 0;
            renderSqlResultPage();
          } else {
            resultEl.innerHTML = '<p class="meta">' + rows.length + ' row(s)</p><pre>' + esc(JSON.stringify(rows, null, 2)) + '</pre>';
          }
          resultEl.style.display = 'block';
          // Show chart controls when results available
          var chartControls = document.getElementById('chart-controls');
          if (rows.length > 0) {
            var keys2 = Object.keys(rows[0]);
            var xSel = document.getElementById('chart-x') as HTMLSelectElement;
            var ySel = document.getElementById('chart-y') as HTMLSelectElement;
            if (xSel) xSel.innerHTML = keys2.map(function(k) { return '<option>' + esc(k) + '</option>'; }).join('');
            if (ySel) ySel.innerHTML = keys2.map(function(k) { return '<option>' + esc(k) + '</option>'; }).join('');
            if (chartControls) chartControls.style.display = 'flex';
            (window as any)._chartRows = rows;
          } else {
            if (chartControls) chartControls.style.display = 'none';
            var cc = document.getElementById('chart-container');
            if (cc) cc.style.display = 'none';
          }
          pushSqlHistory(sql, rows.length);
          // Refresh the History sidebar so the new entry appears immediately.
          fetchHistory();
        })
        .catch(e => {
          errorEl.textContent = e.message || String(e);
          errorEl.style.display = 'block';
        })
        .finally(() => {
          runBtn.disabled = false;
          setButtonBusy(runBtn, false, runBtnOrigText);
        });
    });
  }

  // Deep link: ?sql=... (e.g. from Saropa Log Capture SQL history) opens Run SQL tab and pre-fills the editor.
  (function applySqlFromQueryString(): void {
    try {
      var params = new URLSearchParams(location.search);
      var sqlParam = params.get('sql');
      if (!sqlParam || !inputEl) return;
      var decoded = sqlParam;
      try { decoded = decodeURIComponent(sqlParam); } catch (e2) { /* use raw */ }
      inputEl.value = decoded;
      switchTab('sql');
      // Trigger auto-explain for deep-linked SQL.
      scheduleAutoExplain();
      try {
        var u = new URL(location.href);
        u.searchParams.delete('sql');
        history.replaceState(null, '', u.pathname + u.search + u.hash);
      } catch (e3) { /* ignore */ }
    } catch (e) { /* ignore */ }
  })();
}
