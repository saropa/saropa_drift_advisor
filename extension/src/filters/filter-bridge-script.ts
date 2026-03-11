/**
 * Inline JS injected into the Saropa Drift Advisor webview for saved-filter
 * management. Extracted to its own file to keep filter-bridge.ts concise.
 */
export const FILTER_BRIDGE_SCRIPT = `
(function() {
  var vscodeApi = window._vscodeApi || (window._vscodeApi = acquireVsCodeApi());
  var currentTable = '';
  var savedFilters = [];
  var filterBarAdded = false;

  function esc(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  // Detect current table name (same approach as editing bridge getTableMeta)
  function detectTableName() {
    var el = document.querySelector('[data-table-name]');
    if (el) return el.dataset.tableName || '';
    // Fallback: parse heading text
    var h = document.querySelector('h1, h2, h3');
    return h ? h.textContent.trim() : '';
  }

  function requestFilters() {
    var name = detectTableName();
    if (!name) return;
    if (name !== currentTable || !filterBarAdded) {
      currentTable = name;
      vscodeApi.postMessage({ command: 'getFilters', table: currentTable });
    }
  }

  function renderFilterBar() {
    var bar = document.getElementById('drift-filter-bar');
    if (!bar) {
      bar = document.createElement('div');
      bar.id = 'drift-filter-bar';
      bar.style.cssText =
        'position:sticky;top:0;z-index:90;padding:6px 12px;' +
        'font-size:13px;font-family:var(--vscode-font-family,system-ui,sans-serif);' +
        'display:flex;align-items:center;gap:8px;flex-wrap:wrap;' +
        'border-bottom:1px solid var(--vscode-panel-border,rgba(128,128,128,0.3));' +
        'background:var(--vscode-editor-background,#1e1e1e);';
      var fkBar = document.getElementById('fk-breadcrumbs');
      if (fkBar && fkBar.parentNode) {
        fkBar.parentNode.insertBefore(bar, fkBar);
      } else {
        document.body.prepend(bar);
      }
    }
    filterBarAdded = true;

    var html = '<label style="color:var(--vscode-descriptionForeground,#aaa);' +
      'font-weight:600;">Filter:</label>';

    // Dropdown of saved filters
    html += '<select id="drift-filter-select" style="' +
      'background:var(--vscode-input-background,#2d2d2d);' +
      'color:var(--vscode-input-foreground,#ccc);' +
      'border:1px solid var(--vscode-input-border,#555);' +
      'border-radius:3px;padding:2px 6px;font-size:12px;">';
    html += '<option value="">(none)</option>';
    savedFilters.forEach(function(f) {
      html += '<option value="' + esc(f.id) + '">' + esc(f.name) + '</option>';
    });
    html += '</select>';

    // Apply button
    html += '<button id="drift-filter-apply" style="' +
      'background:var(--vscode-button-background,#1976d2);' +
      'color:var(--vscode-button-foreground,#fff);border:none;border-radius:3px;' +
      'padding:3px 10px;cursor:pointer;font-size:12px;">Apply</button>';

    // Save current button
    html += '<button id="drift-filter-save" style="' +
      'background:#2e7d32;color:#fff;border:none;border-radius:3px;' +
      'padding:3px 10px;cursor:pointer;font-size:12px;">Save As\\u2026</button>';

    // Clear button
    html += '<button id="drift-filter-clear" style="' +
      'background:var(--vscode-button-secondaryBackground,#555);' +
      'color:var(--vscode-button-secondaryForeground,#fff);border:none;border-radius:3px;' +
      'padding:3px 10px;cursor:pointer;font-size:12px;">Clear</button>';

    // Delete button (hidden until a filter is selected)
    html += '<button id="drift-filter-delete" style="' +
      'background:#d32f2f;color:#fff;border:none;border-radius:3px;' +
      'padding:3px 10px;cursor:pointer;font-size:12px;display:none;">Delete</button>';

    bar.innerHTML = html;

    // --- Event handlers ---

    var select = document.getElementById('drift-filter-select');
    var deleteBtn = document.getElementById('drift-filter-delete');

    select.addEventListener('change', function() {
      deleteBtn.style.display = select.value ? 'inline-block' : 'none';
    });

    document.getElementById('drift-filter-apply').addEventListener('click', function() {
      var id = select.value;
      if (id) {
        vscodeApi.postMessage({ command: 'applyFilter', filterId: id });
      }
    });

    document.getElementById('drift-filter-save').addEventListener('click', function() {
      var name = prompt('Filter name:');
      if (!name) return;
      var where = prompt('WHERE clause (leave empty for all rows):', '');
      var orderBy = prompt('ORDER BY clause (leave empty for default):', '');
      var columnsStr = prompt('Visible columns (comma-separated, leave empty for all):', '');
      var columns = columnsStr
        ? columnsStr.split(',').map(function(c) { return c.trim(); }).filter(Boolean)
        : undefined;

      vscodeApi.postMessage({
        command: 'saveFilter',
        filter: {
          id: '',
          name: name,
          table: currentTable,
          where: where || undefined,
          orderBy: orderBy || undefined,
          columns: columns,
          createdAt: 0,
          updatedAt: 0,
        },
      });
    });

    document.getElementById('drift-filter-clear').addEventListener('click', function() {
      vscodeApi.postMessage({ command: 'clearFilter' });
      select.value = '';
      deleteBtn.style.display = 'none';
    });

    deleteBtn.addEventListener('click', function() {
      var id = select.value;
      if (id && confirm('Delete this saved filter?')) {
        vscodeApi.postMessage({ command: 'deleteFilter', filterId: id });
      }
    });
  }

  // --- Receive messages from extension ---

  window.addEventListener('message', function(event) {
    var msg = event.data;
    if (msg.command === 'filters') {
      savedFilters = msg.filters || [];
      renderFilterBar();
    }
    if (msg.command === 'filterApplied') {
      renderFilteredTable(msg.filter, msg.columns, msg.rows);
    }
    if (msg.command === 'filterError') {
      var errOverlay = document.getElementById('drift-filter-overlay');
      if (!errOverlay) {
        errOverlay = document.createElement('div');
        errOverlay.id = 'drift-filter-overlay';
        errOverlay.style.cssText =
          'position:absolute;top:0;left:0;right:0;min-height:100vh;z-index:50;' +
          'background:var(--vscode-editor-background,#1e1e1e);padding:16px;' +
          'padding-top:60px;';
        document.body.style.position = 'relative';
        document.body.appendChild(errOverlay);
      }
      errOverlay.style.display = 'block';
      errOverlay.innerHTML =
        '<p style="color:#d32f2f;font-size:14px;' +
        'font-family:var(--vscode-font-family,system-ui);">' +
        'Filter query failed: ' + esc(msg.error) + '</p>';
    }
    if (msg.command === 'filterCleared') {
      var overlay = document.getElementById('drift-filter-overlay');
      if (overlay) overlay.style.display = 'none';
    }
  });

  function renderFilteredTable(filter, columns, rows) {
    var overlay = document.getElementById('drift-filter-overlay');
    if (!overlay) {
      overlay = document.createElement('div');
      overlay.id = 'drift-filter-overlay';
      overlay.style.cssText =
        'position:absolute;top:0;left:0;right:0;min-height:100vh;z-index:50;' +
        'background:var(--vscode-editor-background,#1e1e1e);padding:16px;' +
        'padding-top:60px;';
      document.body.style.position = 'relative';
      document.body.appendChild(overlay);
    }
    overlay.style.display = 'block';

    var html = '<h3 style="color:var(--vscode-editor-foreground,#ccc);' +
      'margin:0 0 12px;font-family:var(--vscode-font-family,system-ui);">' +
      esc(filter.table) + ' \\u2014 ' + esc(filter.name);
    if (filter.where) {
      html += ' <small style="color:var(--vscode-descriptionForeground,#888);">' +
        'WHERE ' + esc(filter.where) + '</small>';
    }
    html += '</h3>';
    html += '<table data-table-name="' + esc(filter.table) +
      '" style="border-collapse:collapse;width:100%;' +
      'color:var(--vscode-editor-foreground,#ccc);font-size:13px;">';
    html += '<thead><tr>';
    columns.forEach(function(c) {
      html += '<th style="text-align:left;padding:4px 8px;' +
        'border-bottom:1px solid var(--vscode-panel-border,#555);">' +
        esc(c) + '</th>';
    });
    html += '</tr></thead><tbody>';
    rows.forEach(function(row) {
      html += '<tr>';
      row.forEach(function(val) {
        var display = val === null ? 'NULL' : String(val);
        var style = 'padding:4px 8px;border-bottom:1px solid rgba(128,128,128,0.2);';
        if (val === null) style += 'color:var(--vscode-descriptionForeground,#666);font-style:italic;';
        html += '<td style="' + style + '">' + esc(display) + '</td>';
      });
      html += '</tr>';
    });
    html += '</tbody></table>';
    html += '<p style="color:var(--vscode-descriptionForeground,#666);' +
      'font-size:12px;margin-top:8px;">' + rows.length + ' row(s)</p>';
    overlay.innerHTML = html;
  }

  // Initial detection
  function init() { requestFilters(); }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  // Re-check when DOM mutates (server HTML may render tables asynchronously)
  var observer = new MutationObserver(function() { requestFilters(); });
  observer.observe(document.body, { childList: true, subtree: true });
})();
`;
