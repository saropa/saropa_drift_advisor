/**
 * SQL runner tab — the Run SQL panel with template, history,
 * bookmarks, explain, result display, and chart rendering.
 */
import * as S from './state.ts';
import { esc, setButtonBusy, highlightSqlSafe, formatTableRowCountDisplay, syncFeatureCardExpanded } from './utils.ts';
import { switchTab } from './tabs.ts';
import { getDisplayValue, isPiiMaskEnabled, isPiiColumn } from './pii.ts';
import { loadSqlHistory, saveSqlHistory, pushSqlHistory, refreshHistoryDropdown, loadBookmarks, saveBookmarks, refreshBookmarksDropdown, addBookmark, deleteBookmark, exportBookmarks, importBookmarks, bindDropdownToInput } from './sql-history.ts';
import { renderBarChart, renderStackedBarChart, renderPieChart, renderLineChart, renderAreaChart, renderScatterChart, renderHistogram, exportChartPng, exportChartSvg, exportChartCopy, applyChartUI, getChartSize } from './charts.ts';
import { showCopyToast, buildDataTableHtml, wrapDataTableInScroll, buildTableStatusBar, getVisibleColumnCount } from './table-view.ts';
import { getColumnConfig } from './persistence.ts';

export function initSqlRunner(): void {
  const toggle = document.getElementById('sql-runner-toggle');
  const collapsible = document.getElementById('sql-runner-collapsible');
  const templateSel = document.getElementById('sql-template');
  const tableSel = document.getElementById('sql-table');
  const fieldsSel = document.getElementById('sql-fields');
  const applyBtn = document.getElementById('sql-apply-template');
  const runBtn = document.getElementById('sql-run');
  const explainBtn = document.getElementById('sql-explain');
  const historySel = document.getElementById('sql-history');
  const formatSel = document.getElementById('sql-result-format');
  const inputEl = document.getElementById('sql-input');
  const errorEl = document.getElementById('sql-error');
  const resultEl = document.getElementById('sql-result');
  const bookmarksSel = document.getElementById('sql-bookmarks');
  /** Client-side pagination for SQL result table: full row set and current page index. */
  let sqlResultAllRows = [];
  let sqlResultPage = 0;
  const SQL_RESULT_PAGE_SIZE = 100;
  const bookmarkSaveBtn = document.getElementById('sql-bookmark-save');
  const bookmarkDeleteBtn = document.getElementById('sql-bookmark-delete');
  const bookmarkExportBtn = document.getElementById('sql-bookmark-export');
  const bookmarkImportBtn = document.getElementById('sql-bookmark-import');
  loadSqlHistory();
  refreshHistoryDropdown(historySel);
  loadBookmarks();
  refreshBookmarksDropdown(bookmarksSel);
  bindDropdownToInput(historySel, S.sqlHistory, inputEl);
  bindDropdownToInput(bookmarksSel, S.sqlBookmarks, inputEl);
  if (bookmarkSaveBtn) bookmarkSaveBtn.addEventListener('click', function() { addBookmark(inputEl, bookmarksSel); });
  if (bookmarkDeleteBtn) bookmarkDeleteBtn.addEventListener('click', function() { deleteBookmark(bookmarksSel); });
  if (bookmarkExportBtn) bookmarkExportBtn.addEventListener('click', exportBookmarks);
  if (bookmarkImportBtn) bookmarkImportBtn.addEventListener('click', function() { importBookmarks(bookmarksSel); });

  if (!toggle || !collapsible) return;

  toggle.addEventListener('click', function() {
    const isCollapsed = collapsible.classList.contains('collapsed');
    collapsible.classList.toggle('collapsed', !isCollapsed);
    syncFeatureCardExpanded(collapsible);
  });

  const TEMPLATES = {
    'select-star-limit': function(t, cols) { return 'SELECT * FROM "' + t + '" LIMIT 10'; },
    'select-star': function(t, cols) { return 'SELECT * FROM "' + t + '"'; },
    'count': function(t, cols) { return 'SELECT COUNT(*) FROM "' + t + '"'; },
    'select-fields': function(t, cols) {
      const list = (cols && cols.length) ? cols.map(c => '"' + c + '"').join(', ') : '*';
      return 'SELECT ' + list + ' FROM "' + t + '" LIMIT 10';
    }
  };

  function getSelectedFields() {
    const opts = fieldsSel ? Array.from(fieldsSel.selectedOptions || []) : [];
    return opts.map(o => o.value).filter(Boolean);
  }

  function applyTemplate() {
    const table = (tableSel && tableSel.value) || '';
    const templateId = (templateSel && templateSel.value) || 'custom';
    if (templateId === 'custom') return;
    const fn = TEMPLATES[templateId];
    if (!fn) return;
    const cols = getSelectedFields();
    const sql = table ? fn(table, cols) : ('SELECT * FROM "' + (table || 'table_name') + '" LIMIT 10');
    if (inputEl) inputEl.value = sql;
  }

  if (applyBtn) applyBtn.addEventListener('click', applyTemplate);
  if (templateSel) templateSel.addEventListener('change', applyTemplate);

  if (tableSel) {
    tableSel.addEventListener('change', function() {
      const name = this.value;
      fieldsSel.innerHTML = '<option value="">—</option>';
      if (!name) return;
      fieldsSel.innerHTML = '<option value="">Loading…</option>';
      const requestedTable = name;
      fetch('/api/table/' + encodeURIComponent(name) + '/columns', S.authOpts())
        .then(r => r.json())
        .then(cols => {
          if (tableSel.value !== requestedTable) return;
          if (Array.isArray(cols)) {
            fieldsSel.innerHTML = '<option value="">—</option>' + cols.map(c => '<option value="' + esc(c) + '">' + esc(c) + '</option>').join('');
          } else {
            fieldsSel.innerHTML = '<option value="">—</option>';
          }
        })
        .catch(() => {
          if (tableSel.value !== requestedTable) return;
          fieldsSel.innerHTML = '<option value="">—</option>';
        });
    });
  }

  /** Renders the current page of SQL result table from in-memory sqlResultAllRows. */
  function renderSqlResultPage() {
    const rows = sqlResultAllRows;
    const pageSize = SQL_RESULT_PAGE_SIZE;
    const start = sqlResultPage * pageSize;
    const pageRows = rows.slice(start, start + pageSize);
    const keys = rows.length > 0 ? Object.keys(rows[0]) : [];
    const total = rows.length;
    let tableHtml = '<div class="data-table-scroll-wrap"><table><thead><tr>' + keys.map(function(k) { return '<th>' + esc(k) + '</th>'; }).join('') + '</tr></thead><tbody>';
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
  function clearSqlResults() {
    errorEl.style.display = 'none';
    resultEl.style.display = 'none';
    resultEl.innerHTML = '';
    sqlResultAllRows = [];
    sqlResultPage = 0;
    document.getElementById('chart-controls').style.display = 'none';
    document.getElementById('chart-container').style.display = 'none';
  }
  // Shared: disable both Run and Explain buttons to prevent concurrent requests.
  function setSqlButtonsDisabled(disabled) {
    if (runBtn) runBtn.disabled = disabled;
    if (explainBtn) explainBtn.disabled = disabled;
  }

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
      setSqlButtonsDisabled(true);
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
            var xSel = document.getElementById('chart-x');
            var ySel = document.getElementById('chart-y');
            xSel.innerHTML = keys2.map(function(k) { return '<option>' + esc(k) + '</option>'; }).join('');
            ySel.innerHTML = keys2.map(function(k) { return '<option>' + esc(k) + '</option>'; }).join('');
            chartControls.style.display = 'flex';
            window._chartRows = rows;
          } else {
            chartControls.style.display = 'none';
            document.getElementById('chart-container').style.display = 'none';
          }
          pushSqlHistory(sql, rows.length);
          refreshHistoryDropdown(historySel);
        })
        .catch(e => {
          errorEl.textContent = e.message || String(e);
          errorEl.style.display = 'block';
        })
        .finally(() => {
          setSqlButtonsDisabled(false);
          setButtonBusy(runBtn, false, runBtnOrigText);
        });
    });
  }

  if (explainBtn && inputEl && errorEl && resultEl) {
    explainBtn.addEventListener('click', function() {
      const sql = String(inputEl.value || '').trim();
      clearSqlResults();
      if (!sql) {
        errorEl.textContent = 'Enter a SELECT query.';
        errorEl.style.display = 'block';
     
   return;
      }
      const explainOrigText = explainBtn.textContent;
      setButtonBusy(explainBtn, true, 'Explaining\u2026');
      setSqlButtonsDisabled(true);
      fetch('/api/sql/explain', S.authOpts({
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sql: sql })
      }))
        .then(r => r.json().then(d => ({ ok: r.ok, data: d })))
        .then(({ ok, data }) => {
          if (!ok) {
            errorEl.textContent = data.error || 'Request failed';
            errorEl.style.display = 'block';

   return;
          }
          const rows = data.rows || [];
          var hasScan = false;
          var scanTable = null;
          var hasIndex = false;
          // Cost-analysis counters (populated in the same pass as scan/index detection)
          var scanCount = 0;
          var searchCount = 0;
          var subqueryCount = 0;
          var sortPresent = false;
          var tempPresent = false;
          // Single pass: interpret SQLite EXPLAIN detail for both plain-English
          // message and cost analysis (SCAN = full table scan, SEARCH/USING INDEX = index lookup).
          rows.forEach(function(r) {
            var d = String(r.detail || '').trim();
            if (/\bSCAN\s+(?:TABLE\s+)?([^\s\n]+)/i.test(d)) {
              hasScan = true;
              scanCount++;
              if (scanTable == null) {
                var m = d.match(/\bSCAN\s+(?:TABLE\s+)?([^\s\n]+)/i);
                if (m) scanTable = m[1];
              }
            } else if (/\bSEARCH\b.*\bINDEX\b/.test(d) || /\bUSING\b.*\bINDEX\b/.test(d)) {
              hasIndex = true;
              searchCount++;
            }
            if (/\bSUBQUERY\b/i.test(d) || /\bCORRELATED\b/i.test(d)) subqueryCount++;
            if (/USE TEMP B-TREE.*ORDER/i.test(d)) sortPresent = true;
            if (/TEMP B-TREE|TEMP TABLE/i.test(d)) tempPresent = true;
          });
          // Cost rating: Low (index only), Medium (some scans or sorts), High (multiple scans/subqueries)
          var costScore = scanCount * 3 + subqueryCount * 2 + (sortPresent ? 1 : 0) + (tempPresent ? 1 : 0);
          var costLabel, costColor;
          if (costScore === 0) { costLabel = 'Low'; costColor = '#81c784'; }
          else if (costScore <= 3) { costLabel = 'Medium'; costColor = '#ffb74d'; }
          else { costLabel = 'High'; costColor = '#e57373'; }

          var msg;
          if (hasScan) {
            msg = 'This query reads every row of ' + (scanTable ? '<strong>' + esc(scanTable) + '</strong>' : 'the table') + '. ';
            msg += 'For large tables, add a WHERE on an indexed column or create an index.';
          } else if (hasIndex) {
            msg = 'This query uses an index for efficient lookup.';
          } else {
            msg = rows.length ? 'Plan: ' + esc(String(rows[0].detail || '').trim() || '—') : 'No plan.';
          }

          // Build cost analysis summary below the main message
          var costHtml = '<div class="explain-cost-bar" style="margin-top:0.4rem;font-size:12px;line-height:1.6;">';
          costHtml += '<strong>Estimated cost:</strong> <span style="color:' + costColor + ';font-weight:600;">' + costLabel + '</span>';
          var parts = [];
          if (scanCount > 0) parts.push(scanCount + ' full scan' + (scanCount > 1 ? 's' : ''));
          if (searchCount > 0) parts.push(searchCount + ' index lookup' + (searchCount > 1 ? 's' : ''));
          if (subqueryCount > 0) parts.push(subqueryCount + ' subquer' + (subqueryCount > 1 ? 'ies' : 'y'));
          if (sortPresent) parts.push('sort');
          if (tempPresent) parts.push('temp storage');
          if (parts.length > 0) costHtml += ' &mdash; ' + esc(parts.join(', '));
          costHtml += '</div>';

          // Show the full EXPLAIN QUERY PLAN detail rows for transparency
          var detailHtml = '';
          if (rows.length > 0) {
            detailHtml = '<details style="margin-top:0.3rem;font-size:12px;"><summary style="cursor:pointer;color:var(--muted);">Query plan detail (' + rows.length + ' step' + (rows.length > 1 ? 's' : '') + ')</summary><pre style="margin:0.2rem 0;white-space:pre-wrap;">';
            rows.forEach(function(r) { detailHtml += esc(String(r.detail || '').trim()) + '\n'; });
            detailHtml += '</pre></details>';
          }

          let html = '<p class="meta" style="line-height:1.5;">' + (hasScan ? '<span style="color:#e57373;">' + msg + '</span>' : (hasIndex ? '<span style="color:#81c784;">' + msg + '</span>' : msg)) + '</p>';
          html += costHtml + detailHtml;
          resultEl.innerHTML = html;
          resultEl.style.display = 'block';
        })
        .catch(e => {
          errorEl.textContent = e.message || String(e);
          errorEl.style.display = 'block';
        })
        .finally(() => {
          setSqlButtonsDisabled(false);
          setButtonBusy(explainBtn, false, explainOrigText);
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
      if (collapsible) {
        collapsible.classList.remove('collapsed');
        syncFeatureCardExpanded(collapsible);
      }
      try {
        var u = new URL(location.href);
        u.searchParams.delete('sql');
        history.replaceState(null, '', u.pathname + u.search + u.hash);
      } catch (e3) { /* ignore */ }
    } catch (e) { /* ignore */ }
  })();
}
