/**
 * Inline JS for rendering query results as a sortable, filterable HTML
 * table in the SQL Notebook webview.
 *
 * Features:
 * - Column sorting (click header) with ascending/descending toggle
 * - Row filtering with text search and matching-vs-all toggle
 * - Column visibility chooser (hide/show individual columns)
 * - Copy JSON / Copy CSV of the full result set
 *
 * Injected into the HTML scaffold by {@link getNotebookHtml}.
 */
export function getResultsJs(): string {
  return `
  // --- Result Table Rendering ---

  function handleQueryResult(msg) {
    setQueryBusy(false);
    var tab = tabs.find(function (t) { return t.id === msg.tabId; });
    if (!tab) return;
    tab.results = msg.rows;
    tab.columns = msg.columns;
    tab.error = null;
    tab.explain = null;
    if (tab.id === activeTabId) {
      sortColumn = -1;
      sortAsc = true;
      filterText = '';
      hiddenColumns = new Set();
      renderResults(tab);
      setStatus(msg.rows.length + ' rows (' + msg.elapsed + 'ms)');
      enableExportButtons(true);
    }
    addToHistory(tab.sql, msg.rows.length, msg.elapsed);
  }

  function handleQueryError(msg) {
    setQueryBusy(false);
    var tab = tabs.find(function (t) { return t.id === msg.tabId; });
    if (!tab) return;
    tab.error = msg.error;
    tab.results = null;
    tab.columns = null;
    tab.explain = null;
    if (tab.id === activeTabId) {
      renderError(tab.error);
      setStatus('Error');
      enableExportButtons(false);
    }
    addToHistory(tab.sql, 0, 0, msg.error);
  }

  var sortColumn = -1;
  var sortAsc = true;
  var filterText = '';
  /** Set of column indexes currently hidden by the user. */
  var hiddenColumns = new Set();
  /** True when the filter shows only matching rows; false shows all rows. */
  var showOnlyFilterMatches = true;

  function renderResults(tab) {
    var area = resultArea();
    if (!tab.results || !tab.columns) { area.innerHTML = ''; return; }

    // --- Filter bar: text input + toggle button + column visibility button ---
    var toggleLabel = showOnlyFilterMatches ? 'Matching' : 'All';
    var toggleTitle = showOnlyFilterMatches
      ? 'Showing only matching rows. Click to show all rows.'
      : 'Showing all rows. Click to show only matching rows.';
    var hiddenCount = hiddenColumns.size;
    var colBtnLabel = hiddenCount > 0 ? 'Columns (' + hiddenCount + ' hidden)' : 'Columns';
    var html = '<div class="filter-bar">'
      + '<input type="text" id="result-filter" class="result-filter" '
      + 'placeholder="Filter rows..." value="' + esc(filterText) + '">'
      + '<button id="filter-toggle" class="filter-toggle-btn" title="' + toggleTitle + '">' + toggleLabel + '</button>'
      + '<button id="col-visibility-btn" class="col-visibility-btn" title="Toggle column visibility">' + colBtnLabel + '</button>'
      + '</div>';

    // --- Column chooser dropdown (hidden until toggled) ---
    html += '<div id="col-chooser" class="col-chooser" style="display:none;">';
    for (var ci = 0; ci < tab.columns.length; ci++) {
      var checked = hiddenColumns.has(ci) ? '' : ' checked';
      html += '<label class="col-chooser-item">'
        + '<input type="checkbox" data-col-idx="' + ci + '"' + checked + '> '
        + esc(tab.columns[ci]) + '</label>';
    }
    html += '<div class="col-chooser-actions">'
      + '<button id="col-show-all" class="col-chooser-action">Show All</button>'
      + '<button id="col-chooser-close" class="col-chooser-action">Close</button>'
      + '</div></div>';

    // --- Determine visible column indexes ---
    var visibleCols = [];
    for (var vi = 0; vi < tab.columns.length; vi++) {
      if (!hiddenColumns.has(vi)) visibleCols.push(vi);
    }

    html += '<div class="table-wrap"><table class="result-table"><thead><tr>';
    for (var hi = 0; hi < visibleCols.length; hi++) {
      var colIdx = visibleCols[hi];
      var arrow = sortColumn === colIdx ? (sortAsc ? ' \\u25B2' : ' \\u25BC') : '';
      html += '<th data-col="' + colIdx + '">' + esc(tab.columns[colIdx]) + arrow + '</th>';
    }
    html += '</tr></thead><tbody>';

    var rows = tab.results.slice();
    if (filterText && showOnlyFilterMatches) {
      // Only filter when toggle is set to "Matching" to avoid unnecessary allocation
      var lower = filterText.toLowerCase();
      rows = rows.filter(function (row) {
        for (var c = 0; c < row.length; c++) {
          if (String(row[c] != null ? row[c] : '').toLowerCase().indexOf(lower) >= 0) return true;
        }
        return false;
      });
    }
    if (sortColumn >= 0) {
      var col = sortColumn;
      var asc = sortAsc;
      rows.sort(function (a, b) {
        var av = a[col], bv = b[col];
        if (av == null && bv == null) return 0;
        if (av == null) return asc ? -1 : 1;
        if (bv == null) return asc ? 1 : -1;
        if (typeof av === 'number' && typeof bv === 'number') return asc ? av - bv : bv - av;
        var sa = String(av), sb = String(bv);
        return asc ? sa.localeCompare(sb) : sb.localeCompare(sa);
      });
    }

    for (var r = 0; r < rows.length; r++) {
      html += '<tr>';
      for (var vc = 0; vc < visibleCols.length; vc++) {
        var c = visibleCols[vc];
        var cell = rows[r][c];
        var s = cell === null ? 'NULL' : String(cell);
        var display = s.length > 100 ? s.substring(0, 100) + '\\u2026' : s;
        var nullClass = cell === null ? ' class="null-cell"' : '';
        html += '<td' + nullClass + ' title="' + esc(s) + '">' + esc(display) + '</td>';
      }
      html += '</tr>';
    }
    html += '</tbody></table></div>';
    area.innerHTML = html;

    // --- Sort on header click ---
    area.querySelectorAll('th[data-col]').forEach(function (th) {
      th.addEventListener('click', function () {
        var c = Number(th.dataset.col);
        if (sortColumn === c) { sortAsc = !sortAsc; }
        else { sortColumn = c; sortAsc = true; }
        renderResults(tab);
      });
    });

    // --- Filter input ---
    var filterInput = document.getElementById('result-filter');
    if (filterInput) {
      filterInput.addEventListener('input', function (e) {
        filterText = e.target.value;
        renderResults(tab);
      });
      filterInput.focus();
    }

    // --- Row filter toggle (matching vs all) ---
    var filterToggle = document.getElementById('filter-toggle');
    if (filterToggle) {
      filterToggle.addEventListener('click', function () {
        showOnlyFilterMatches = !showOnlyFilterMatches;
        renderResults(tab);
      });
    }

    // --- Column chooser toggle ---
    var colBtn = document.getElementById('col-visibility-btn');
    var colChooser = document.getElementById('col-chooser');
    if (colBtn && colChooser) {
      colBtn.addEventListener('click', function () {
        colChooser.style.display = colChooser.style.display === 'none' ? 'block' : 'none';
      });
    }

    // --- Column checkbox changes ---
    area.querySelectorAll('#col-chooser input[data-col-idx]').forEach(function (cb) {
      cb.addEventListener('change', function () {
        var idx = Number(cb.dataset.colIdx);
        if (cb.checked) { hiddenColumns.delete(idx); }
        else { hiddenColumns.add(idx); }
        renderResults(tab);
      });
    });

    // --- Show All columns ---
    var showAllBtn = document.getElementById('col-show-all');
    if (showAllBtn) {
      showAllBtn.addEventListener('click', function () {
        hiddenColumns.clear();
        renderResults(tab);
      });
    }

    // --- Close column chooser ---
    var closeChooserBtn = document.getElementById('col-chooser-close');
    if (closeChooserBtn) {
      closeChooserBtn.addEventListener('click', function () {
        if (colChooser) colChooser.style.display = 'none';
      });
    }
  }

  function renderError(error) {
    resultArea().innerHTML = '<div class="error-message">' + esc(error) + '</div>';
  }

  // --- Copy JSON ---
  document.getElementById('btn-copy-json').addEventListener('click', function () {
    var tab = getActiveTab();
    if (!tab || !tab.results || !tab.columns) return;
    var objs = tab.results.map(function (row) {
      var obj = {};
      for (var i = 0; i < tab.columns.length; i++) {
        obj[tab.columns[i]] = row[i];
      }
      return obj;
    });
    vscode.postMessage({ command: 'copyToClipboard', text: JSON.stringify(objs, null, 2) });
  });

  // --- Copy CSV ---
  document.getElementById('btn-copy-csv').addEventListener('click', function () {
    var tab = getActiveTab();
    if (!tab || !tab.results || !tab.columns) return;
    function csvCell(v) {
      if (v === null || v === undefined) return '';
      var s = String(v);
      if (s.indexOf(',') >= 0 || s.indexOf('"') >= 0 || s.indexOf('\\n') >= 0) {
        return '"' + s.replace(/"/g, '""') + '"';
      }
      return s;
    }
    var header = tab.columns.map(csvCell).join(',');
    var rows = tab.results.map(function (r) { return r.map(csvCell).join(','); });
    vscode.postMessage({ command: 'copyToClipboard', text: header + '\\n' + rows.join('\\n') });
  });

  function enableExportButtons(enabled) {
    document.getElementById('btn-chart').disabled = !enabled;
    document.getElementById('btn-copy-json').disabled = !enabled;
    document.getElementById('btn-copy-csv').disabled = !enabled;
  }

  function resultArea() { return document.getElementById('result-area'); }

  function setStatus(text) {
    document.getElementById('status-bar').textContent = text;
  }

  function esc(s) {
    return String(s != null ? s : '')
      .replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }
`;
}
