/**
 * Table-view module: column type detection, cell formatting, data table
 * rendering, table definition panel, and schema helpers.
 *
 * Extracted from app.js — function bodies are unchanged.
 */
import * as S from './state.ts';
import { esc, formatTableRowCountDisplay } from './utils.ts';
import { isPiiMaskEnabled, isPiiColumn, getDisplayValue } from './pii.ts';
import { getScope, filterRows, getTableDisplayData, buildTableFilterMetaSuffix, applySearch } from './search.ts';
import { loadFkMeta, renderBreadcrumb } from './fk-nav.ts';
import { getColumnConfig } from './persistence.ts';
import { getPref, PREF_EPOCH_DETECTION, DEFAULTS } from './settings.ts';

// TODO: cross-module import — rowCountText is in table-list.ts
// Circular dependency may need resolution later.
import { rowCountText } from './table-list.ts';

import { buildQueryBuilderHtml, bindQueryBuilderEvents, restoreQueryBuilderUIState } from './query-builder.ts';
import { bindColumnTableEvents } from './pagination.ts';
import { buildBothViewSectionsHtml } from './schema.ts';
import { loadSchemaMeta } from './schema-meta.ts';

export async function loadColumnTypes(tableName) {
  if (S.tableColumnTypes[tableName]) return S.tableColumnTypes[tableName];
  var meta = await loadSchemaMeta();
  var tables = meta.tables || [];
  tables.forEach(function(t) {
    var types = {};
    (t.columns || []).forEach(function(c) { types[c.name] = (c.type || '').toUpperCase(); });
    S.tableColumnTypes[t.name] = types;
  });
  return S.tableColumnTypes[tableName] || {};
}
export function isEpochTimestamp(value) {
  // Skip epoch detection entirely when the user has disabled it in Settings
  if (!getPref(PREF_EPOCH_DETECTION, DEFAULTS[PREF_EPOCH_DETECTION])) return false;
  var n = Number(value);
  if (!isFinite(n) || n <= 0) return false;
  if (n > 946684800000 && n < 32503680000000) return 'ms';
  if (n > 946684800 && n < 32503680000) return 's';
  return false;
}
export function isBooleanColumn(name) {
  var lower = name.toLowerCase();
  return /^(is_|has_|can_|should_|allow_|enable)/.test(lower) ||
    /_(enabled|active|visible|deleted|archived|verified|confirmed|locked|published)\$/.test(lower) ||
    lower === 'active' || lower === 'enabled' || lower === 'deleted' || lower === 'verified';
}
export function isDateColumn(name) {
  var lower = name.toLowerCase();
  return /date|time|created|updated|deleted|_at\$|_on\$/.test(lower);
}
export function formatCellValue(value, columnName, columnType) {
  var raw = value != null ? String(value) : '';
  if (value == null || value === '') return { formatted: raw, raw: raw, wasFormatted: false };
  var type = (columnType || '').toUpperCase();
  if ((type === 'INTEGER' || type === '') && isBooleanColumn(columnName)) {
    if (value === 0 || value === '0') return { formatted: 'false', raw: raw, wasFormatted: true };
    if (value === 1 || value === '1') return { formatted: 'true', raw: raw, wasFormatted: true };
  }
  if ((type === 'INTEGER' || type === 'REAL' || type === '') && (isDateColumn(columnName) || isEpochTimestamp(value))) {
    var epoch = isEpochTimestamp(value);
    if (epoch) {
      var ms = epoch === 'ms' ? Number(value) : Number(value) * 1000;
      var date = new Date(ms);
      if (!isNaN(date.getTime())) {
        return { formatted: date.toISOString(), raw: raw, wasFormatted: true };
      }
    }
  }
  return { formatted: raw, raw: raw, wasFormatted: false };
}

export function showCopyToast(message) {
  var toast = document.getElementById('copy-toast');
  // Allow custom message (e.g. "Session extended!") or default "Copied!".
  if (message) toast.textContent = message;
  toast.classList.add('show');
  clearTimeout(toast._hideTimer);
  toast._hideTimer = setTimeout(function() {
    toast.classList.remove('show');
    // Always reset to default text after fade to avoid race
    // conditions when overlapping toasts capture stale text.
    toast.textContent = 'Copied!';
  }, 1200);
}
export function copyCellValue(text) {
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(text).then(showCopyToast).catch(function() {});
  }
}

export function buildDataTableHtml(filtered, fkMap, colTypes, columnConfig) {
  if (!filtered || filtered.length === 0) return '<p class="meta">No rows.</p>';
  var dataKeys = Object.keys(filtered[0]);
  var order = dataKeys.slice();
  var hidden = [];
  var pinned = [];
  if (columnConfig && columnConfig.order && columnConfig.order.length) {
    order = columnConfig.order.filter(function(k) { return dataKeys.indexOf(k) >= 0; });
    dataKeys.forEach(function(k) { if (order.indexOf(k) < 0) order.push(k); });
  }
  if (columnConfig && columnConfig.hidden) hidden = columnConfig.hidden;
  if (columnConfig && columnConfig.pinned) pinned = columnConfig.pinned;
  var visible = order.filter(function(k) { return hidden.indexOf(k) < 0; });

  var html = '<table id="data-table" class="drift-table"><thead><tr>';
  visible.forEach(function(k) {
    var fk = fkMap[k];
    var fkLabel = fk ? ' <span class="table-header-fk" title="FK to ' + esc(fk.toTable) + '.' + esc(fk.toColumn) + '">&#8599;</span>' : '';
    /* Column type badge: show abbreviated SQLite type next to the column name */
    var colType = colTypes ? (colTypes[k] || '') : '';
    var typeBadge = colType ? ' <span class="col-type-badge" title="' + esc(colType) + '">' + esc(colType.substring(0, 4)) + '</span>' : '';
    var thClass = pinned.indexOf(k) >= 0 ? ' class="col-pinned"' : '';
    html += '<th data-column-key="' + esc(k) + '" draggable="true"' + thClass + ' title="Drag to reorder; right-click for menu">' + esc(k) + typeBadge + fkLabel + '</th>';
  });
  html += '</tr></thead><tbody>';
  var maskOn = isPiiMaskEnabled();
  var piiCols = {};
  visible.forEach(function(k) { piiCols[k] = isPiiColumn(k); });
  filtered.forEach(function(row) {
    html += '<tr>';
    visible.forEach(function(k) {
      var val = row[k];
      var fk = fkMap[k];
      var isNull = val == null;
      var rawStr = isNull ? '' : String(val);
      var displayStr = getDisplayValue(k, val, maskOn, piiCols[k]);
      var cellContent;
      /* Null values render as a dimmed italic "NULL" indicator (industry-standard DB tool convention) */
      if (isNull) {
        cellContent = '<span class="cell-null">NULL</span>';
      } else if (S.displayFormat === 'formatted' && colTypes && !(maskOn && piiCols[k])) {
        var fmt = formatCellValue(val, k, colTypes[k]);
        if (fmt.wasFormatted) {
          cellContent = '<span title="Raw: ' + esc(fmt.raw) + '">' + esc(fmt.formatted) + '</span>'
            + '<span class="cell-raw">' + esc(fmt.raw) + '</span>';
        } else {
          cellContent = esc(displayStr);
        }
      } else {
        cellContent = esc(displayStr);
      }
      var copyBtn = '<button type="button" class="cell-copy-btn" data-raw="' + esc(displayStr) + '" title="Copy value">&#x2398;</button>';
      var tdClass = pinned.indexOf(k) >= 0 ? ' class="col-pinned"' : '';
      var tdAttrs = ' data-column-key="' + esc(k) + '"' + tdClass;
      /* cell-text wrapper allows CSS truncation with ellipsis while copy button stays visible on hover */
      /* FK link keeps data-value as rawStr so navigation filter uses real key; displayed text is displayStr (masked when on). */
      if (fk && !isNull) {
        html += '<td' + tdAttrs + '><span class="cell-text"><a href="#" class="fk-link" style="color:var(--link);text-decoration:underline;" ';
        html += 'data-table="' + esc(fk.toTable) + '" ';
        html += 'data-column="' + esc(fk.toColumn) + '" ';
        html += 'data-value="' + esc(rawStr) + '">' ;
        html += cellContent + ' &#8594;</a></span>' + copyBtn + '</td>';
      } else {
        html += '<td' + tdAttrs + '><span class="cell-text">' + cellContent + '</span>' + copyBtn + '</td>';
      }
    });
    html += '</tr>';
  });
  html += '</tbody></table>';
  return html;
}

/** Wraps table HTML in the scroll container so sticky headers and horizontal scroll work. */
export function wrapDataTableInScroll(tableHtml) {
  if (!tableHtml || tableHtml.indexOf('<table') < 0) return tableHtml;
  return '<div id="data-table-scroll-wrap" class="data-table-scroll-wrap">' + tableHtml + '</div>';
}

/**
 * Returns count of visible columns (mirrors visibility logic in buildDataTableHtml:
 * order + hidden from columnConfig). Used for the table status bar.
 */
export function getVisibleColumnCount(dataKeys, columnConfig) {
  if (!dataKeys || dataKeys.length === 0) return 0;
  var order = dataKeys.slice();
  var hidden = [];
  if (columnConfig && columnConfig.order && columnConfig.order.length) {
    order = columnConfig.order.filter(function(k) { return dataKeys.indexOf(k) >= 0; });
    dataKeys.forEach(function(k) { if (order.indexOf(k) < 0) order.push(k); });
  }
  if (columnConfig && columnConfig.hidden) hidden = columnConfig.hidden;
  return order.filter(function(k) { return hidden.indexOf(k) < 0; }).length;
}

/**
 * Builds the table status bar HTML (row range, total, column count).
 * @param total - Total row count from server (or null if unknown)
 * @param offset - Current offset
 * @param limit - Page size
 * @param displayedLen - Number of rows on current page
 * @param columnCount - Visible column count
 */
export function buildTableStatusBar(total, offset, limit, displayedLen, columnCount) {
  var rangeText = displayedLen > 0
    ? (offset + 1) + '\u2013' + (offset + displayedLen)
    : '0';
  var totalText = total != null ? total.toLocaleString() : '?';
  var colText = (columnCount != null && columnCount > 0) ? (columnCount + ' column' + (columnCount !== 1 ? 's' : '')) : '';
  var parts = ['Showing <span class="table-status-range">' + rangeText + '</span> of ' + totalText + ' rows'];
  if (displayedLen === 0 && total != null && total > 0 && offset >= total) {
    parts.push('(past end of results)');
  }
  if (colText) parts.push(colText);
  return '<div class="table-status-bar" role="status">' + parts.join(' \u2022 ') + '</div>';
}

/**
 * Returns an icon character representing the SQL column type for quick
 * visual scanning in the table definition panel.
 */
export function columnTypeIcon(rawType) {
  if (!rawType) return '\u25CB'; // ○ — unknown/unspecified
  var t = rawType.toUpperCase();
  if (/INT/.test(t))                              return '#';
  if (/CHAR|TEXT|CLOB|STRING/.test(t))            return 'T';
  if (/REAL|FLOAT|DOUBLE|NUMERIC|DECIMAL/.test(t)) return '.#';
  if (/BLOB|BINARY/.test(t))                      return '\u2B21'; // ⬡
  if (/BOOL/.test(t))                             return '\u2713'; // ✓
  if (/DATE|TIME|TIMESTAMP/.test(t))              return '\u25F7'; // ◷
  return '\u25CB'; // ○ — fallback
}

/**
 * Builds the collapsible table-definition panel showing column metadata
 * (type icon, name, SQL type, PK/FK/constraint badges).
 */
export function buildTableDefinitionHtml(tableName) {
  var t = schemaTableByName(tableName);
  if (!t || !t.columns || t.columns.length === 0) return '';

  // Build FK lookup from cached foreign-key metadata
  var fkSet = {};
  var cachedFks = S.fkMetaCache[tableName] || [];
  cachedFks.forEach(function(fk) { fkSet[fk.fromColumn] = fk; });

  var rows = t.columns.map(function(c) {
    var rawType = c.type != null ? String(c.type).trim() : '';
    // Type icon cell
    var icon = columnTypeIcon(rawType);
    var iconHtml = '<span class="table-def-icon" title="' + esc(rawType || 'unspecified') + '">' + esc(icon) + '</span>';
    // PK / FK badge icons (separate from the type icon)
    var badges = '';
    if (c.pk)            badges += '<span class="table-def-badge table-def-badge-pk" title="Primary key">\uD83D\uDD11</span>';
    if (fkSet[c.name])   badges += '<span class="table-def-badge table-def-badge-fk" title="FK \u2192 ' + esc(fkSet[c.name].toTable) + '.' + esc(fkSet[c.name].toColumn) + '">\uD83D\uDD17</span>';

    // Constraints text (NOT NULL only — PK/FK are shown as badges)
    var flags = [];
    if (c.notnull) flags.push('NOT NULL');
    var flagStr = flags.length ? flags.join(', ') : '\u2014';

    var typCell = rawType ? esc(rawType) : '<span class="table-def-type-empty">(unspecified)</span>';
    return '<tr>' +
      '<td class="table-def-icons">' + iconHtml + badges + '</td>' +
      '<td class="table-def-name">' + esc(c.name) + '</td>' +
      '<td class="table-def-type">' + typCell + '</td>' +
      '<td class="table-def-flags">' + esc(flagStr) + '</td>' +
      '</tr>';
  }).join('');

  // Collapsible behavior handled by table-def-toggle.js (event delegation
  // + .td-collapsed class). DOM contract: wrap > heading + scroll.
  return '<div class="table-definition-wrap" role="region" aria-label="Table definition">' +
    '<div class="table-definition-heading">\u25BC Table definition</div>' +
    '<div class="table-definition-scroll">' +
    '<table class="table-definition">' +
    '<thead><tr>' +
      '<th class="table-def-icons" scope="col"></th>' +
      '<th scope="col">Column</th>' +
      '<th scope="col">Type</th>' +
      '<th scope="col">Constraints</th>' +
    '</tr></thead>' +
    '<tbody>' + rows + '</tbody></table></div></div>';
}

/**
 * Binds click-to-toggle on the results table expander heading.
 * Uses event delegation so it works regardless of render timing.
 * Toggles .results-collapsed on the wrapper and swaps the ▼/▲ arrow.
 */
export function bindResultsToggle(): void {
  var headings = document.querySelectorAll('.results-table-heading');
  for (var i = 0; i < headings.length; i++) {
    var heading = headings[i];
    // Guard against double-binding if renderTableView is called multiple times
    if (heading.hasAttribute('data-toggle-bound')) continue;
    heading.setAttribute('data-toggle-bound', '1');
    heading.addEventListener('click', function() {
      var wrap = this.closest('.results-table-wrap');
      if (!wrap) return;
      var isCollapsed = wrap.classList.toggle('results-collapsed');
      // Swap only the leading arrow character, preserve the rest of the heading
      var text = this.textContent || '';
      if (isCollapsed) {
        this.textContent = text.replace('\u25B2', '\u25BC');
      } else {
        this.textContent = text.replace('\u25BC', '\u25B2');
      }
    });
  }
}

export function renderTableView(name, data) {
  const content = document.getElementById('content');
  const scope = getScope();
  const filtered = filterRows(data);
  const displayData = getTableDisplayData(data);
  const jsonStr = JSON.stringify(displayData, null, 2);
  S.setLastRenderedData(jsonStr);
  const metaText = rowCountText(name) + buildTableFilterMetaSuffix(filtered.length, data.length);
  // Show/hide display format bar when viewing table data
  var formatBar = document.getElementById('display-format-bar');
  if (formatBar) formatBar.style.display = (scope !== 'schema') ? 'flex' : 'none';
  // Show row display toggle (All / Matching) when viewing a table
  var rowDisplayWrap = document.getElementById('row-display-toggle-wrap');
  if (rowDisplayWrap) {
    rowDisplayWrap.style.display = (scope === 'data' || scope === 'both') ? 'flex' : 'none';
    var allBtn = document.getElementById('row-display-all');
    var matchBtn = document.getElementById('row-display-matching');
    if (allBtn) allBtn.classList.toggle('active', !S.showOnlyMatchingRows);
    if (matchBtn) matchBtn.classList.toggle('active', S.showOnlyMatchingRows);
  }
  // Show loading hint while FK metadata is being fetched for the first time
  if (!S.fkMetaCache[name] && scope !== 'both') {
    content.innerHTML = '<p class="meta">' + metaText + '</p><p class="meta">Loading\u2026</p>';
  }
  function renderDataHtml(fkMap, colTypes) {
    var defHtml = buildTableDefinitionHtml(name);
    var rawTableHtml = wrapDataTableInScroll(buildDataTableHtml(displayData, fkMap, colTypes, getColumnConfig(name))) + buildTableStatusBar(S.tableCounts[name], S.offset, S.limit, displayData.length, getVisibleColumnCount(Object.keys(displayData[0] || {}), getColumnConfig(name)));
    // Wrap results table in a collapsible expander, expanded by default.
    // Row count in the heading gives context when collapsed.
    var rowCount = displayData.length;
    var totalCount = S.tableCounts[name];
    var resultsLabel = totalCount != null
      ? rowCount + ' of ' + totalCount.toLocaleString() + ' rows'
      : rowCount + ' row' + (rowCount !== 1 ? 's' : '');
    var tableHtml = '<div class="results-table-wrap" role="region" aria-label="Results">' +
      '<div class="results-table-heading">\u25B2 Results \u2014 ' + resultsLabel + '</div>' +
      '<div class="results-table-body">' + rawTableHtml + '</div></div>';
    var qbHtml = buildQueryBuilderHtml(name, colTypes);
    if (scope === 'both') {
      S.setLastRenderedSchema(S.cachedSchema);
      if (S.cachedSchema === null) {
        fetch('/api/schema', S.authOpts()).then(function(r) { return r.text(); }).then(function(schema) {
          S.setCachedSchema(schema);
          S.setLastRenderedSchema(schema);
          content.innerHTML = buildBothViewSectionsHtml(name, metaText, qbHtml, tableHtml, schema, defHtml);
          bindQueryBuilderEvents(colTypes);
          if (S.queryBuilderState) restoreQueryBuilderUIState(S.queryBuilderState);
          applySearch();
          renderBreadcrumb();
          bindColumnTableEvents();
          bindResultsToggle();
        });
      } else {
        var dataSection = document.getElementById('both-data-section');
        if (dataSection) {
          var dataBody = dataSection.querySelector('.collapsible-body');
          var headerEl = dataSection.querySelector('.collapsible-header');
          if (dataBody) dataBody.innerHTML = '<p class="meta">' + metaText + '</p>' + defHtml + qbHtml + tableHtml;
          if (headerEl) headerEl.textContent = 'Table data: ' + name;
          bindColumnTableEvents();
          bindQueryBuilderEvents(colTypes);
          if (S.queryBuilderState) restoreQueryBuilderUIState(S.queryBuilderState);
        }
        applySearch();
        renderBreadcrumb();
        bindResultsToggle();
      }
    } else {
      S.setLastRenderedSchema(null);
      content.innerHTML = '<p class="meta">' + metaText + '</p>' + defHtml + qbHtml + tableHtml;
      bindQueryBuilderEvents(colTypes);
      if (S.queryBuilderState) restoreQueryBuilderUIState(S.queryBuilderState);
      applySearch();
      renderBreadcrumb();
      bindColumnTableEvents();
      bindResultsToggle();
    }
  }
  // Load FK metadata and column types in parallel, then render
  Promise.all([
    loadFkMeta(name),
    loadColumnTypes(name).catch(function() { return {}; })
  ]).then(function(results) {
    var fks = results[0];
    var colTypes = results[1];
    var fkMap = {};
    (fks || []).forEach(function(fk) { fkMap[fk.fromColumn] = fk; });
    renderDataHtml(fkMap, colTypes);
  });
}

/**
 * Returns an ordered array of visible column keys from a .drift-table header.
 * When `childElement` is provided the query is scoped to the closest
 * .drift-table ancestor — avoids cross-table collisions when multiple
 * tables coexist in the DOM (Tables + Search + Query Builder panels).
 */
export function getVisibleDataColumnKeys(childElement?) {
  var root = childElement ? childElement.closest('.drift-table') : null;
  if (!root) root = document.querySelector('.drift-table');
  if (!root) return [];
  var ths = root.querySelectorAll('thead th[data-column-key]');
  return Array.prototype.slice.call(ths).map(function(th) {
    return th.getAttribute('data-column-key') || '';
  });
}

export function schemaTableByName(name) {
  var meta = S.schemaMeta;
  if (!meta || !meta.tables || !name) return null;
  for (var i = 0; i < meta.tables.length; i++) {
    if (meta.tables[i].name === name) return meta.tables[i];
  }
  return null;
}

export function getPkColumnNameForDataTable() {
  var t = schemaTableByName(S.currentTableName);
  if (!t || !t.columns) return null;
  for (var i = 0; i < t.columns.length; i++) {
    if (t.columns[i].pk) return t.columns[i].name;
  }
  return null;
}

/**
 * Toggles the masthead MASKED badge visibility to match the checkbox state.
 * Called on init (to restore state) and on every change event.
 */
function syncMastheadMaskBadge(checked: boolean): void {
  var badge = document.getElementById('masthead-mask-badge');
  if (badge) badge.style.display = checked ? '' : 'none';
}

/**
 * PII mask toggle: update masthead badge and re-render current view
 * when toggled so the user sees immediate feedback without a page refresh.
 */
export function initPiiMaskToggle(): void {
  var cb = document.getElementById('tb-mask-checkbox') as HTMLInputElement | null;
  var sw = document.getElementById('tb-mask-toggle');
  if (!cb) return;

  /** Keep the toolbar mask button in sync with the hidden checkbox. */
  function syncSwitch() {
    if (sw) sw.setAttribute('aria-pressed', cb!.checked ? 'true' : 'false');
  }

  // Sync badge and switch on page load in case browser restores checkbox state.
  syncMastheadMaskBadge(cb.checked);
  syncSwitch();

  cb.addEventListener('change', function() {
    // Update masthead badge immediately so the user sees feedback
    // even if no PII columns exist in the current table.
    syncMastheadMaskBadge(cb!.checked);
    syncSwitch();

    // Re-render current table view so masked/unmasked values update.
    if (S.currentTableName && S.currentTableJson) {
      renderTableView(S.currentTableName, S.currentTableJson);
    }

    // Re-render search results if the search tab has content, so
    // masked values stay consistent across all visible panels.
    var searchResults = document.getElementById('search-results');
    if (searchResults && searchResults.innerHTML.indexOf('<table') >= 0) {
      applySearch();
    }
  });
}
