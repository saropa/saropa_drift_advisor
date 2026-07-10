/**
 * SQL runner tab — the Run SQL panel with template, history,
 * bookmarks, auto-explain, result display, and chart rendering.
 */
import * as S from './state.ts';
import { vt } from './l10n.ts';
import { esc, setButtonBusy } from './utils.ts';
import { switchTab } from './tabs.ts';
import { loadSqlHistory, pushSqlHistory, loadBookmarks, refreshBookmarksDropdown, addBookmark, deleteBookmark, exportBookmarks, importBookmarks, bindDropdownToInput } from './sql-history.ts';
import { fetchHistory } from './history-sidebar.ts';
import { selectPanel } from './sidebar-panels.ts';
import { buildTableStatusBar, showCopyToast, bindResultsToggle, isUnambiguousDriftBoolColumn } from './table-view.ts';
import { loadSchemaMeta } from './schema-meta.ts';
import { formatSqlSafe } from './sql-format.ts';

/** Stringifies a cell for text export: null/undefined → '', everything else String(). */
function cellText(v: unknown): string {
  return v == null ? '' : String(v);
}

/** Result rows → a pretty-printed JSON array string. */
export function rowsToJson(rows: any[]): string {
  return JSON.stringify(rows, null, 2);
}

/**
 * Result rows → RFC-4180 CSV. The header is the first row's keys; a value is
 * quote-wrapped only when it contains a comma, quote, or newline, with embedded
 * quotes doubled. CRLF line endings so the file opens cleanly in spreadsheets.
 */
export function rowsToCsv(rows: any[]): string {
  if (!rows.length) return '';
  const keys = Object.keys(rows[0]);
  const quote = function (s: string): string {
    return /[",\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  };
  const lines = [keys.map(quote).join(',')];
  rows.forEach(function (row) {
    lines.push(keys.map(function (k) { return quote(cellText(row[k])); }).join(','));
  });
  return lines.join('\r\n');
}

/**
 * Result rows → a GitHub-flavored Markdown table. Pipes and backslashes inside a
 * cell are escaped so they don't break the column layout; newlines become a
 * literal space so each row stays on one Markdown line.
 */
export function rowsToMarkdown(rows: any[]): string {
  if (!rows.length) return '';
  const keys = Object.keys(rows[0]);
  const cell = function (s: string): string {
    return s.replace(/\\/g, '\\\\').replace(/\|/g, '\\|').replace(/\r?\n/g, ' ');
  };
  const header = '| ' + keys.map(cell).join(' | ') + ' |';
  const divider = '| ' + keys.map(function () { return '---'; }).join(' | ') + ' |';
  const body = rows.map(function (row) {
    return '| ' + keys.map(function (k) { return cell(cellText(row[k])); }).join(' | ') + ' |';
  });
  return [header, divider].concat(body).join('\n');
}

export function initSqlRunner(): void {
  const templateSel = document.getElementById('sql-template') as HTMLSelectElement | null;
  const tableSel = document.getElementById('sql-table') as HTMLSelectElement | null;
  const fieldsSel = document.getElementById('sql-fields') as HTMLSelectElement | null;
  const lockBtn = document.getElementById('sql-template-lock') as HTMLButtonElement | null;
  const applyBtn = document.getElementById('sql-apply-template') as HTMLButtonElement | null;
  const runBtn = document.getElementById('sql-run') as HTMLButtonElement | null;
  const formatBtn = document.getElementById('sql-format') as HTMLButtonElement | null;
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
  // Show the History panel in the single sidebar — same destination as the
  // activity-bar History icon, so both controls land on the same panel.
  if (historyToggleBtn) historyToggleBtn.addEventListener('click', function () { selectPanel('history'); });
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
      // Auto-format the generated template SQL (item 2) so a one-line template
      // lands in the editor already pretty-printed.
      inputEl.value = formatSqlSafe(sql);
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
        ? vt('viewer.sql.template.lock.locked')
        : vt('viewer.sql.template.lock.unlocked');
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
      if (fieldsSel) fieldsSel.innerHTML = '<option value="">' + esc(vt('viewer.sql.fields.loading')) + '</option>';
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

    // Reuse the shared `.drift-table` styling (item 5) so the SQL result grid
    // matches the Tables / Search grids — sticky header, zebra rows, and a
    // footer status bar that joins the rounded scroll-wrap cleanly instead of
    // the old bare <table> with mismatched corners.
    // Resolve which result columns are Drift bools by name, once per render.
    // Custom SQL has no table context, so only names that are bool in EVERY
    // declaring table qualify; everything else stays raw. Copy/export is
    // untouched — it reads the raw rows, not this display formatting.
    const boolCols: Record<string, boolean> = {};
    keys.forEach(function(k) { boolCols[k] = isUnambiguousDriftBoolColumn(k); });

    let tableHtml = '<div class="data-table-scroll-wrap"><table class="drift-table"><thead><tr>' + keys.map(function(k) { return '<th data-column-key="' + esc(k) + '">' + esc(k) + '</th>'; }).join('') + '</tr></thead><tbody>';
    pageRows.forEach(function(row) {
      tableHtml += '<tr>' + keys.map(function(k) {
        const v = row[k];
        // 0/1 only — an expression result (SUM, COUNT) sharing the column name
        // can exceed 0/1 and must fall through to raw display.
        if (boolCols[k] && (v === 0 || v === 1 || v === '0' || v === '1')) {
          const label = (v === 1 || v === '1')
            ? vt('viewer.table.grid.boolTrue')
            : vt('viewer.table.grid.boolFalse');
          // Keep the raw value on hover, matching the data grid's raw-on-hover posture.
          return '<td title="' + esc(String(v)) + '">' + esc(label) + '</td>';
        }
        return '<td>' + esc(v != null ? String(v) : '') + '</td>';
      }).join('') + '</tr>';
    });
    tableHtml += '</tbody></table></div>';
    const statusHtml = buildTableStatusBar(total, start, pageSize, pageRows.length, keys.length);

    // Pagination only when the result spans more than one page (item 4). A
    // single page hides the bar entirely; two permanently-disabled buttons read
    // as broken controls.
    let paginationHtml = '';
    if (total > pageSize) {
      const prevDisabled = sqlResultPage <= 0;
      const nextDisabled = (start + pageSize) >= total;
      paginationHtml = '<div class="sql-result-pagination toolbar" style="margin-top:0.35rem;">' +
        '<button type="button" id="sql-result-prev"' + (prevDisabled ? ' disabled' : '') + '>' + esc(vt('viewer.sql.result.prev')) + '</button>' +
        '<button type="button" id="sql-result-next"' + (nextDisabled ? ' disabled' : '') + '>' + esc(vt('viewer.sql.result.next')) + '</button>' +
        '</div>';
    }

    // Copy/export toolbar (item 6): each button copies the FULL result set
    // (every page, not just the visible one) in the chosen format.
    const copyHtml = rows.length > 0
      ? '<div class="sql-result-copy toolbar" style="margin-top:0.35rem;">' +
          '<span class="sql-result-copy-label">' + esc(vt('viewer.sql.result.copy.label')) + '</span>' +
          '<button type="button" id="sql-copy-md"><span class="material-symbols-outlined" aria-hidden="true">content_copy</span> ' + esc(vt('viewer.sql.result.copy.markdown')) + '</button>' +
          '<button type="button" id="sql-copy-csv"><span class="material-symbols-outlined" aria-hidden="true">content_copy</span> ' + esc(vt('viewer.sql.result.copy.csv')) + '</button>' +
          '<button type="button" id="sql-copy-json"><span class="material-symbols-outlined" aria-hidden="true">content_copy</span> ' + esc(vt('viewer.sql.result.copy.json')) + '</button>' +
          '</div>'
      : '';

    const rowCountMeta = '<p class="meta">' + esc(vt('viewer.sql.result.rowCount', total)) + '</p>';
    // Wrap in the collapsible results expander (item 3), expanded by default;
    // the heading row count gives context when collapsed. bindResultsToggle()
    // wires the chevron toggle, matching the Tables-grid behavior.
    const headingKey = total === 1 ? 'viewer.sql.result.heading.one' : 'viewer.sql.result.heading.many';
    resultEl.innerHTML =
      '<div class="results-table-wrap" role="region" aria-label="' + esc(vt('viewer.sql.result.regionLabel')) + '">' +
        '<div class="results-table-heading">' + esc(vt(headingKey, total)) + '</div>' +
        '<div class="results-table-body">' + rowCountMeta + copyHtml + tableHtml + statusHtml + paginationHtml + '</div>' +
      '</div>';
    bindResultsToggle();

    const prevBtn = resultEl.querySelector('#sql-result-prev');
    const nextBtn = resultEl.querySelector('#sql-result-next');
    if (prevBtn) prevBtn.addEventListener('click', function() { sqlResultPage--; renderSqlResultPage(); });
    if (nextBtn) nextBtn.addEventListener('click', function() { sqlResultPage++; renderSqlResultPage(); });

    // Copy buttons operate on the complete row set, never the current page only.
    const copyMd = resultEl.querySelector('#sql-copy-md');
    const copyCsv = resultEl.querySelector('#sql-copy-csv');
    const copyJson = resultEl.querySelector('#sql-copy-json');
    if (copyMd) copyMd.addEventListener('click', function() { copyResult('markdown'); });
    if (copyCsv) copyCsv.addEventListener('click', function() { copyResult('csv'); });
    if (copyJson) copyJson.addEventListener('click', function() { copyResult('json'); });
  }

  /** Copies the full SQL result set to the clipboard in the requested format. */
  function copyResult(kind: 'markdown' | 'csv' | 'json'): void {
    const rows = sqlResultAllRows;
    if (!rows || rows.length === 0) { showCopyToast(vt('viewer.sql.result.copy.empty')); return; }
    let text: string;
    let doneKey: string;
    if (kind === 'json') { text = rowsToJson(rows); doneKey = 'viewer.sql.result.copy.done.json'; }
    else if (kind === 'csv') { text = rowsToCsv(rows); doneKey = 'viewer.sql.result.copy.done.csv'; }
    else { text = rowsToMarkdown(rows); doneKey = 'viewer.sql.result.copy.done.markdown'; }
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text)
        .then(function() { showCopyToast(vt(doneKey)); })
        .catch(function() { showCopyToast(vt('viewer.sql.result.copy.failed')); });
    } else {
      showCopyToast(vt('viewer.sql.result.copy.failed'));
    }
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
    explainEl.innerHTML = '<p class="meta explain-loading">' + esc(vt('viewer.sql.explain.analyzing')) + '</p>';

    fetch('/api/sql/explain', Object.assign({}, S.authOpts({
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sql: sql })
    }), { signal: explainAbort.signal }))
      .then(r => r.json().then(d => ({ ok: r.ok, data: d })))
      .then(({ ok, data }) => {
        if (!ok) {
          explainEl.innerHTML = '<p class="meta" style="color:#e57373;">' + esc(data.error || vt('viewer.sql.explain.failed')) + '</p>';
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
    if (costScore === 0) { costLabel = vt('viewer.sql.explain.cost.low'); costColor = '#81c784'; }
    else if (costScore <= 3) { costLabel = vt('viewer.sql.explain.cost.medium'); costColor = '#ffb74d'; }
    else { costLabel = vt('viewer.sql.explain.cost.high'); costColor = '#e57373'; }

    // Collapsible cost section (item 3): the cost summary is the always-visible
    // <summary>; the index report and plan detail tuck inside the open body so
    // the panel can be folded away without losing the headline estimate.
    let html = '<details class="explain-collapsible" open><summary class="explain-cost-bar">';
    html += '<strong>' + esc(vt('viewer.sql.explain.estimatedCost')) + '</strong> <span style="color:' + costColor + ';font-weight:600;">' + esc(costLabel) + '</span>';
    // Each part picks a singular/plural key so plural agreement is the
    // translator's, never English suffix concatenation ('s'/'ies').
    const parts: string[] = [];
    if (scanCount > 0) parts.push(vt(scanCount > 1 ? 'viewer.sql.explain.part.scan.many' : 'viewer.sql.explain.part.scan.one', scanCount));
    if (searchCount > 0) parts.push(vt(searchCount > 1 ? 'viewer.sql.explain.part.lookup.many' : 'viewer.sql.explain.part.lookup.one', searchCount));
    if (subqueryCount > 0) parts.push(vt(subqueryCount > 1 ? 'viewer.sql.explain.part.subquery.many' : 'viewer.sql.explain.part.subquery.one', subqueryCount));
    if (sortPresent) parts.push(vt('viewer.sql.explain.part.sort'));
    if (tempPresent) parts.push(vt('viewer.sql.explain.part.tempStorage'));
    if (parts.length > 0) html += ' &mdash; ' + esc(parts.join(', '));
    html += '</summary><div class="explain-collapsible-body">';

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
          html += ' <span class="explain-badge badge-scan">' + esc(vt('viewer.sql.explain.badge.fullScan')) + '</span>';
        }

        if (tblIndexes.length === 0) {
          // No indexes at all on this table.
          html += ' <span class="explain-badge badge-missing">' + esc(vt('viewer.sql.explain.badge.noIndexes')) + '</span>';
        } else {
          // Show each index with used/unused status.
          for (const idx of tblIndexes) {
            const isUsed = usedIndexNames.has(idx.name);
            const badge = isUsed ? 'badge-used' : 'badge-unused';
            const label = isUsed ? vt('viewer.sql.explain.badge.used') : vt('viewer.sql.explain.badge.available');
            html += ' <span class="explain-badge ' + badge + '" title="' +
              esc(idx.name) + ' (' + esc(idx.columns.join(', ')) + ')' +
              (idx.unique ? ' UNIQUE' : '') + '">';
            html += esc(idx.name) + ' <small>(' + esc(label) + ')</small></span>';
          }
        }

        html += '</div>';
      }
      html += '</div>';
    }

    // Collapsible full query plan detail.
    if (rows.length > 0) {
      html += '<details class="explain-details"><summary>' + esc(vt(rows.length > 1 ? 'viewer.sql.explain.steps.many' : 'viewer.sql.explain.steps.one', rows.length)) + '</summary><pre>';
      rows.forEach(function(r: any) { html += esc(String(r.detail || '').trim()) + '\n'; });
      html += '</pre></details>';
    }

    // Close the collapsible body + <details> opened with the cost summary.
    html += '</div></details>';

    explainEl.innerHTML = html;
    explainEl.style.display = 'block';
  }

  // Wire up auto-explain on textarea input.
  if (inputEl) {
    inputEl.addEventListener('input', scheduleAutoExplain);
  }

  // Format button (item 2): pretty-print the editor's current SQL on demand.
  // Auto-formatting on every keystroke is hostile (the caret jumps), so manual
  // formatting + the on-set/on-run formatting below cover the "automatic" goal
  // without fighting the user mid-type.
  if (formatBtn && inputEl) {
    formatBtn.addEventListener('click', function() {
      const formatted = formatSqlSafe(inputEl.value);
      if (formatted !== inputEl.value) { inputEl.value = formatted; scheduleAutoExplain(); }
    });
  }

  // ─── Run button ────────────────────────────────────────────
  if (runBtn && inputEl && errorEl && resultEl) {
    runBtn.addEventListener('click', function() {
      const sql = String(inputEl.value || '').trim();
      clearSqlResults();
      if (!sql) {
        errorEl.textContent = vt('viewer.sql.run.emptyQuery');
        errorEl.style.display = 'block';

   return;
      }
      // Tidy the editor on run (item 2): running is the natural moment to
      // normalize layout; the formatted text is semantically identical SQL.
      const formattedOnRun = formatSqlSafe(sql);
      if (formattedOnRun !== inputEl.value) inputEl.value = formattedOnRun;
      const runBtnOrigText = runBtn.textContent;
      setButtonBusy(runBtn, true, vt('viewer.sql.run.busy'));
      runBtn.disabled = true;
      fetch('/api/sql', S.authOpts({
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sql: sql })
      }))
        .then(r => r.json().then(data => ({ ok: r.ok, data: data })))
        .then(({ ok, data }) => {
          if (!ok) {
            errorEl.textContent = data.error || vt('viewer.sql.run.requestFailed');
            errorEl.style.display = 'block';

   return;
          }
          const rows = data.rows || [];
          const asTable = formatSel && formatSel.value === 'table';
          if (asTable && rows.length > 0) {
            sqlResultAllRows = rows;
            sqlResultPage = 0;
            // Ensure the schema metadata powering exact bool formatting is
            // cached before the first render: a deep-linked `?sql=` run can
            // reach this tab before any other surface has fetched it, which
            // would silently render bools as 0/1 with no recovery until the
            // next run. Results must still render if the fetch fails —
            // formatting is a display nicety, never a gate.
            loadSchemaMeta().catch(function() {}).then(function() { renderSqlResultPage(); });
          } else {
            resultEl.innerHTML = '<p class="meta">' + esc(vt('viewer.sql.result.rowCount', rows.length)) + '</p><pre>' + esc(JSON.stringify(rows, null, 2)) + '</pre>';
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
            // Default X to the first (label) column and Y to a DIFFERENT column —
            // the first numeric-valued one if any, else the second column (item
            // 8). Without this both selects defaulted to the first column, so the
            // Y axis duplicated the X axis label ("week_start" on both axes).
            if (xSel) xSel.selectedIndex = 0;
            if (ySel && keys2.length > 1) {
              var firstRow = rows[0];
              var numericIdx = -1;
              for (var ki = 0; ki < keys2.length; ki++) {
                if (ki === 0) continue; // never pick the X column as the default Y
                var cell = firstRow[keys2[ki]];
                if (cell != null && cell !== '' && isFinite(Number(cell))) { numericIdx = ki; break; }
              }
              ySel.selectedIndex = numericIdx >= 0 ? numericIdx : 1;
            }
            if (chartControls) chartControls.style.display = 'flex';
            (window as any)._chartRows = rows;
            // Auto-configure + draw the chart for an NL series (item 11). The X/Y
            // defaults were just set above (item 8), so we only pick the chart
            // type (line for a time series, bar for a breakdown) and render.
            var autoChart = (window as any)._nlAutoChart;
            if (autoChart) {
              (window as any)._nlAutoChart = null;
              var typeSel = document.getElementById('chart-type') as HTMLSelectElement | null;
              if (typeSel) typeSel.value = autoChart.type || 'bar';
              var renderBtn = document.getElementById('chart-render') as HTMLButtonElement | null;
              if (renderBtn) renderBtn.click();
            }
          } else {
            if (chartControls) chartControls.style.display = 'none';
            (window as any)._nlAutoChart = null;
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
      // Auto-format deep-linked SQL (item 2) — incoming queries from Log Capture
      // history are often single-line; format so the editor opens readable.
      inputEl.value = formatSqlSafe(decoded);
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
