/**
 * Table-view module: column type detection, cell formatting, data table
 * rendering, table definition panel, and schema helpers.
 *
 * Extracted from app.js — function bodies are unchanged.
 */
import * as S from './state.ts';
import { vt } from './l10n.ts';
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
  // BUG FIX (2026-07-09): the suffix branch used `\$` which in a JS regex
  // matches a literal dollar-sign character (a Dart string-escaping artifact),
  // so names like `user_active` never matched. `$` restores the intended
  // end-of-string anchor.
  return /^(is_|has_|can_|should_|allow_|enable)/.test(lower) ||
    /_(enabled|active|visible|deleted|archived|verified|confirmed|locked|published)$/.test(lower) ||
    lower === 'active' || lower === 'enabled' || lower === 'deleted' || lower === 'verified';
}
export function isDateColumn(name) {
  var lower = name.toLowerCase();
  // BUG FIX (2026-07-09): `_at\$` / `_on\$` matched a literal dollar sign (the
  // same Dart string-escaping artifact fixed in isBooleanColumn above), so
  // `expires_at` / `starts_on` style names never got date formatting.
  return /date|time|created|updated|deleted|_at$|_on$/.test(lower);
}

/**
 * Single decision point for "render/validate this column as a boolean":
 * the exact `driftType` signal wins; otherwise an INTEGER-affinity storage
 * type plus the name heuristic. Shared by the grid formatter and the cell
 * editor so their intLike sets cannot drift apart (they previously diverged —
 * the editor accepted INT/BIGINT/SMALLINT/TINYINT, the grid only INTEGER,
 * so a `user_active INT` column validated as bool but displayed as 0/1).
 */
export function isBoolSemanticColumn(name, type, driftType) {
  if (driftType === 'bool') return true;
  var typ = (type || '').toUpperCase();
  var intLike = typ === '' || typ === 'INTEGER' || typ === 'INT' ||
    typ === 'BIGINT' || typ === 'SMALLINT' || typ === 'TINYINT';
  return intLike && isBooleanColumn(name);
}

/**
 * BLOB/binary columns can hold values up to the SQLite column limit (MBs).
 * Pushing the full string into a cell text node and relying on CSS
 * `text-overflow: ellipsis` forces the browser to lay out the entire
 * (clipped) line — that layout cost is what froze the grid on binary-heavy
 * tables. We instead render a hard substring so only a handful of characters
 * ever enter the laid-out text node; the full value stays in the copy
 * button's data-raw attribute (attributes are not laid out) for copy/expand.
 */
export var BLOB_PREVIEW_CHARS = 48;
export function isBlobType(colType) {
  return /BLOB|BINARY/.test((colType || '').toUpperCase());
}
export function formatCellValue(value, columnName, columnType, driftType?: string) {
  var raw = value != null ? String(value) : '';
  if (value == null || value === '') return { formatted: raw, raw: raw, wasFormatted: false };
  var type = (columnType || '').toUpperCase();
  // `driftType === 'bool'` is the EXACT semantic signal from the host's
  // declared Drift schema (Drift stores bools as INTEGER, so the SQLite type
  // alone can't distinguish them). The name heuristic stays as the fallback
  // for raw SQLite hosts and older servers that don't send driftType.
  if (isBoolSemanticColumn(columnName, type, driftType)) {
    if (value === 0 || value === '0') return { formatted: vt('viewer.table.grid.boolFalse'), raw: raw, wasFormatted: true };
    if (value === 1 || value === '1') return { formatted: vt('viewer.table.grid.boolTrue'), raw: raw, wasFormatted: true };
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
    toast.textContent = vt('viewer.table.toast.copied');
  }, 1200);
}
export function copyCellValue(text) {
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(text).then(showCopyToast).catch(function() {});
  }
}

/**
 * Builds a column-name → Drift semantic type map for one table from the
 * cached schema metadata. Empty when the host declared no schema (raw SQLite
 * host / older server) — callers then fall back to the name heuristic.
 */
export function schemaDriftTypesForTable(tableName) {
  var map = {};
  var t = schemaTableByName(tableName);
  if (t && t.columns) {
    t.columns.forEach(function(c) { if (c.driftType) map[c.name] = c.driftType; });
  }
  return map;
}

/**
 * True when [columnName] is a Drift bool in EVERY table that declares a column
 * with that name. For custom SQL results the source table of a result column is
 * unknown, so an ambiguous name (bool in one table, int in another) must NOT be
 * formatted — this errs toward raw display. False when no schema was declared.
 */
export function isUnambiguousDriftBoolColumn(columnName) {
  var meta = S.schemaMeta;
  if (!meta || !meta.tables) return false;
  var seen = false;
  for (var i = 0; i < meta.tables.length; i++) {
    var cols = meta.tables[i].columns || [];
    for (var j = 0; j < cols.length; j++) {
      if (cols[j].name === columnName) {
        if (cols[j].driftType !== 'bool') return false;
        seen = true;
      }
    }
  }
  return seen;
}

export function buildDataTableHtml(filtered, fkMap, colTypes, columnConfig, tableName?: string | null) {
  if (!filtered || filtered.length === 0) return '<p class="meta">' + vt('viewer.table.grid.empty') + '</p>';
  // Semantic Drift types for exact bool rendering. INVARIANT: any caller
  // rendering rows that are NOT from S.currentTableName must pass tableName —
  // otherwise a same-named column in the current table leaks its type onto
  // this grid (the search tab passes its searched table for exactly this).
  // `null` means "no single-table context" (raw SQL / multi-table joins):
  // per-table lookup is impossible, so only names that are bool in EVERY
  // declaring table are formatted, matching the SQL tab's posture.
  var driftTypes = {};
  if (tableName === null) {
    Object.keys(filtered[0]).forEach(function(k) {
      if (isUnambiguousDriftBoolColumn(k)) driftTypes[k] = 'bool';
    });
  } else {
    driftTypes = schemaDriftTypesForTable(tableName || S.currentTableName);
  }
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

  var maskOn = isPiiMaskEnabled();
  var singlePkName = getSinglePkColumnName(S.currentTableName);
  var showRowDelete = !!S.driftWriteEnabled && !!singlePkName;
  var html = '<table id="data-table" class="drift-table"><thead><tr>';
  visible.forEach(function(k) {
    var fk = fkMap[k];
    var fkLabel = fk ? ' <span class="table-header-fk" title="' + esc(vt('viewer.table.grid.fkHeaderTitle', fk.toTable, fk.toColumn)) + '">&#8599;</span>' : '';
    /* Column type badge: show abbreviated SQLite type next to the column name */
    var colType = colTypes ? (colTypes[k] || '') : '';
    var typeBadge = colType ? ' <span class="col-type-badge" title="' + esc(colType) + '">' + esc(colType.substring(0, 4)) + '</span>' : '';
    /* When PII masking is on, mark sensitive columns in the header (same heuristic as cell masking). */
    var maskBadge = '';
    if (maskOn && isPiiColumn(k)) {
      var maskTip = vt('viewer.table.grid.maskTip');
      maskBadge =
        ' <span class="col-mask-badge" title="' +
        esc(maskTip) +
        '" aria-label="' +
        esc(maskTip) +
        '"><span class="material-symbols-outlined" aria-hidden="true">visibility_off</span></span>';
    }
    var thClass = pinned.indexOf(k) >= 0 ? ' class="col-pinned"' : '';
    html +=
      '<th data-column-key="' +
      esc(k) +
      '" draggable="true"' +
      thClass +
      ' title="' + esc(vt('viewer.table.grid.headerDragTitle')) + '">' +
      esc(k) +
      maskBadge +
      typeBadge +
      fkLabel +
      '</th>';
  });
  if (showRowDelete) {
    html += '<th class="row-action-col">' + esc(vt('viewer.table.grid.actionsHeader')) + '</th>';
  }
  html += '</tr></thead><tbody>';
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
      /* BLOB cells: never let the full value reach the laid-out text node
         (see BLOB_PREVIEW_CHARS). Truncated cells get an expand button so the
         user can still read/copy the whole value via the cell-value popup. */
      var isBlob = colTypes ? isBlobType(colTypes[k]) : false;
      var blobTruncated = false;
      var cellContent;
      /* Null values render dimmed via .cell-null. The label string is user-
         configurable via Settings (Data Formatting → "NULL display") — defaults
         to the industry-standard "NULL", but users can switch to "-" for a
         compact dashboard look. esc() guards against future custom values. */
      if (isNull) {
        cellContent = '<span class="cell-null">' + esc(S.nullDisplay) + '</span>';
      } else if (isBlob) {
        // Substring before esc() so we cap the work to a few characters, not
        // escape an MB-sized string only to throw most of it away.
        if (displayStr.length > BLOB_PREVIEW_CHARS) {
          cellContent = esc(displayStr.substring(0, BLOB_PREVIEW_CHARS)) +
            '<span class="cell-blob-ellipsis" aria-hidden="true">…</span>';
          blobTruncated = true;
        } else {
          cellContent = esc(displayStr);
        }
      } else if (S.displayFormat === 'formatted' && colTypes && !(maskOn && piiCols[k])) {
        var fmt = formatCellValue(val, k, colTypes[k], driftTypes[k]);
        if (fmt.wasFormatted) {
          cellContent = '<span title="' + esc(vt('viewer.table.grid.rawTitle', fmt.raw)) + '">' + esc(fmt.formatted) + '</span>'
            + '<span class="cell-raw">' + esc(fmt.raw) + '</span>';
        } else {
          cellContent = esc(displayStr);
        }
      } else {
        cellContent = esc(displayStr);
      }
      var copyBtn = '<button type="button" class="cell-copy-btn" data-raw="' + esc(displayStr) + '" title="' + esc(vt('viewer.table.grid.copyValueTitle')) + '">&#x2398;</button>';
      /* Expand button sits next to copy on hover; opens the full (untruncated)
         value in the cell-value popup. Only shown when the BLOB preview clipped
         the value, since that is the only case the visible text is incomplete.
         It reads the full value from the sibling copy button's data-raw, so the
         value is stored once (single source) rather than duplicated per button. */
      var expandBtn = blobTruncated
        ? '<button type="button" class="cell-expand-btn" title="' + esc(vt('viewer.table.grid.expandValueTitle')) + '">&#x26F6;</button>'
        : '';
      var tdClass = pinned.indexOf(k) >= 0 ? ' class="col-pinned"' : '';
      var tdAttrs = ' data-column-key="' + esc(k) + '"' + tdClass;
      /* cell-text wrapper allows CSS truncation with ellipsis while copy button stays visible on hover */
      /* FK link keeps data-value as rawStr so navigation filter uses real key; displayed text is displayStr (masked when on). */
      if (fk && !isNull) {
        html += '<td' + tdAttrs + '><span class="cell-text"><a href="#" class="fk-link" style="color:var(--link);text-decoration:underline;" ';
        html += 'data-table="' + esc(fk.toTable) + '" ';
        html += 'data-column="' + esc(fk.toColumn) + '" ';
        html += 'data-value="' + esc(rawStr) + '">' ;
        html += cellContent + ' &#8594;</a></span>' + expandBtn + copyBtn + '</td>';
      } else {
        html += '<td' + tdAttrs + '><span class="cell-text">' + cellContent + '</span>' + expandBtn + copyBtn + '</td>';
      }
    });
    if (showRowDelete && singlePkName) {
      var pkRaw = row[singlePkName] == null ? '' : String(row[singlePkName]);
      html += '<td class="row-action-col"><button type="button" class="row-delete-btn"'
        + ' data-pk-col="' + esc(singlePkName) + '"'
        + ' data-pk-raw="' + esc(pkRaw) + '"'
        + ' title="' + esc(vt('viewer.table.grid.rowDeleteTitle')) + '">' + esc(vt('viewer.table.grid.rowDeleteLabel')) + '</button></td>';
    }
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
  var colText = (columnCount != null && columnCount > 0)
    ? vt(columnCount !== 1 ? 'viewer.table.status.columnMany' : 'viewer.table.status.columnOne', columnCount)
    : '';
  // Range is pre-wrapped in markup so the {0} token carries the styled span; the
  // catalog value keeps word order ("Showing {0} of {1} rows") translator-editable.
  var rangeMarkup = '<span class="table-status-range">' + rangeText + '</span>';
  var parts = [vt('viewer.table.status.showing', rangeMarkup, totalText)];
  if (displayedLen === 0 && total != null && total > 0 && offset >= total) {
    parts.push(vt('viewer.table.status.pastEnd'));
  }
  if (colText) parts.push(colText);
  return '<div class="table-status-bar" role="status">' + parts.join(' \u2022 ') + '</div>';
}

/**
 * Builds the "Results — …" heading label: row count and column count, each
 * collapsing to a single number when the page shows the whole set so we never
 * print the redundant "126 of 126". Examples:
 *   126 rows / 5 columns
 *   126 of 1,126 rows / 5 of 19 columns
 *
 * @param rowCount     - Rows on the current page
 * @param totalRows    - Server total row count, or null when unknown
 * @param visibleCols  - Columns currently shown (after hide config)
 * @param totalCols    - Columns available in the result set
 */
export function buildResultsLabel(rowCount, totalRows, visibleCols, totalCols) {
  // Rows: show the total only when it differs from what is on the page.
  var rowsText = (totalRows != null && totalRows !== rowCount)
    ? vt('viewer.table.results.rowsOf', rowCount.toLocaleString(), totalRows.toLocaleString())
    : vt(rowCount !== 1 ? 'viewer.table.results.rowMany' : 'viewer.table.results.rowOne', rowCount.toLocaleString());

  // Columns: same collapse — drop the duplicate when every column is visible.
  var colsText = '';
  if (totalCols != null && totalCols > 0) {
    colsText = (visibleCols != null && visibleCols !== totalCols)
      ? vt('viewer.table.results.colsOf', visibleCols, totalCols)
      : vt(totalCols !== 1 ? 'viewer.table.results.colMany' : 'viewer.table.results.colOne', totalCols);
  }

  return colsText ? rowsText + ' / ' + colsText : rowsText;
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

/** Human-readable byte size for the table-definition Size column: 932 B, 4.2 KB, 1.3 MB. */
export function formatTableDefBytes(n) {
  if (n == null || !isFinite(n)) return '—';
  if (n < 1024) return n + ' B';
  if (n < 1024 * 1024) return (n / 1024).toFixed(1) + ' KB';
  if (n < 1024 * 1024 * 1024) return (n / (1024 * 1024)).toFixed(1) + ' MB';
  return (n / (1024 * 1024 * 1024)).toFixed(1) + ' GB';
}

/**
 * Renders a min/max profiling value into a compact, escaped cell. Long values
 * (text columns can be paragraphs) are truncated so the meta columns stay
 * scannable; the full value lives in the title attribute for hover.
 */
function formatMetaScalar(value) {
  if (value == null) return '<span class="tdm-dim">—</span>';
  var s = String(value);
  var TRUNC = 22;
  if (s.length > TRUNC) {
    return '<span title="' + esc(s) + '">' + esc(s.substring(0, TRUNC)) + '…</span>';
  }
  return esc(s);
}

/**
 * Builds the trailing meta <td> cells for one column when profiling is on.
 * Order must match the meta <th> cells in buildTableDefinitionHtml:
 * Fill, Nulls, Distinct, Unique, Min, Max, Size.
 */
function buildColumnMetaCells(stat) {
  if (!stat) {
    // Stats missing for this column — render dashes so the row still lines up
    // with the header (defensive; should not normally happen).
    var dash = '<td class="tdm-col"><span class="tdm-dim">—</span></td>';
    return dash + dash + dash + dash + dash + dash + dash;
  }
  var total = stat.total || 0;
  var nonnull = stat.nonnull || 0;
  // Fill rate = non-null fraction of all rows. Drives the completeness bar.
  var fillPct = total > 0 ? Math.round((nonnull / total) * 100) : 0;
  var fillTitle = vt('viewer.table.def.fillCellTitle', nonnull, total, stat.nulls);
  var fillCell = '<td class="tdm-col tdm-fill-cell">' +
    '<span class="tdm-bar" title="' + esc(fillTitle) + '">' +
    '<span class="tdm-bar-fill" style="width:' + fillPct + '%"></span></span>' +
    '<span class="tdm-pct">' + fillPct + '%</span></td>';

  var nullsCell = '<td class="tdm-col tdm-num">' +
    (stat.nulls > 0 ? stat.nulls.toLocaleString() : '<span class="tdm-dim">0</span>') + '</td>';

  var distinctCell = '<td class="tdm-col tdm-num">' + (stat.distinct || 0).toLocaleString() + '</td>';

  // Uniqueness: a column whose distinct count equals the row count (and has no
  // nulls) is a candidate key — flag it with a key glyph. Otherwise show the
  // distinct-to-rows ratio so low-cardinality (categorical) columns stand out.
  var uniqueCell;
  if (total > 0 && stat.distinct === total && stat.nulls === 0) {
    uniqueCell = '<td class="tdm-col tdm-unique" title="' + esc(vt('viewer.table.def.uniqueKeyTitle')) + '">' +
      '<span class="tdm-key">🔑</span> 100%</td>';
  } else if (total > 0) {
    var uPct = Math.round((stat.distinct / total) * 100);
    uniqueCell = '<td class="tdm-col tdm-num" title="' + esc(vt('viewer.table.def.uniqueRatioTitle', stat.distinct, total)) + '">' + uPct + '%</td>';
  } else {
    uniqueCell = '<td class="tdm-col tdm-num"><span class="tdm-dim">—</span></td>';
  }

  var minCell = '<td class="tdm-col tdm-val">' + formatMetaScalar(stat.min) + '</td>';
  var maxCell = '<td class="tdm-col tdm-val">' + formatMetaScalar(stat.max) + '</td>';
  var sizeCell = '<td class="tdm-col tdm-num" title="' + esc(vt('viewer.table.def.sizeCellTitle')) + '">' +
    esc(formatTableDefBytes(stat.bytes)) + '</td>';

  return fillCell + nullsCell + distinctCell + uniqueCell + minCell + maxCell + sizeCell;
}

/**
 * Builds the collapsible table-definition panel showing column metadata
 * (type icon, name, SQL type, PK/FK/constraint badges). When profiling is on
 * (S.tableDefMetaOn) and stats are cached for the table, appends per-column
 * meta columns (fill, nulls, distinct, uniqueness, min/max, size).
 */
export function buildTableDefinitionHtml(tableName) {
  var t = schemaTableByName(tableName);
  if (!t || !t.columns || t.columns.length === 0) return '';

  // Build FK lookup from cached foreign-key metadata
  var fkSet = {};
  var cachedFks = S.fkMetaCache[tableName] || [];
  cachedFks.forEach(function(fk) { fkSet[fk.fromColumn] = fk; });

  // Current column visibility: a checked box means the column is shown in the
  // results grid. Backed by the same columnConfig.hidden list the column
  // chooser and right-click "Hide" use, so all three stay in sync.
  var cfg = getColumnConfig(tableName);
  var hiddenCols = (cfg && cfg.hidden) || [];

  // Profiling columns render only when the user has toggled meta on AND the
  // stats query for this table has completed (table-def-meta.ts caches results
  // in S.tableDefStats). Until then the base columns render alone.
  var metaOn = !!S.tableDefMetaOn;
  var stats = S.tableDefStats[tableName];
  var showMeta = metaOn && !!stats;

  var rows = t.columns.map(function(c) {
    var rawType = c.type != null ? String(c.type).trim() : '';
    // Type icon cell
    var icon = columnTypeIcon(rawType);
    var iconHtml = '<span class="table-def-icon" title="' + esc(rawType || vt('viewer.table.def.typeUnspecified')) + '">' + esc(icon) + '</span>';
    // Show/hide checkbox: toggles this column's visibility in the results table.
    var isHidden = hiddenCols.indexOf(c.name) >= 0;
    var visCell = '<td class="table-def-vis">' +
      '<input type="checkbox" class="table-def-colvis" data-col-key="' + esc(c.name) + '"' +
      (isHidden ? '' : ' checked') +
      ' title="' + esc(vt('viewer.table.def.visTitle')) + '" aria-label="' + esc(vt('viewer.table.def.visLabel', c.name)) + '"></td>';
    // PK / FK badge icons (separate from the type icon)
    var badges = '';
    if (c.pk)            badges += '<span class="table-def-badge table-def-badge-pk" title="' + esc(vt('viewer.table.def.badgePk')) + '">\uD83D\uDD11</span>';
    if (fkSet[c.name])   badges += '<span class="table-def-badge table-def-badge-fk" title="' + esc(vt('viewer.table.def.badgeFk', fkSet[c.name].toTable, fkSet[c.name].toColumn)) + '">\uD83D\uDD17</span>';

    // Constraints text (NOT NULL only — PK/FK are shown as badges)
    var flags = [];
    if (c.notnull) flags.push(vt('viewer.table.def.flagNotNull'));
    var flagStr = flags.length ? flags.join(', ') : '\u2014';

    var typCell = rawType ? esc(rawType) : '<span class="table-def-type-empty">' + esc(vt('viewer.table.def.typeEmpty')) + '</span>';
    var metaCells = showMeta ? buildColumnMetaCells(stats[c.name]) : '';
    return '<tr>' +
      visCell +
      '<td class="table-def-icons">' + iconHtml + badges + '</td>' +
      '<td class="table-def-name" data-longpress-copy="' + esc(c.name) + '">' + esc(c.name) + '</td>' +
      '<td class="table-def-type">' + typCell + '</td>' +
      '<td class="table-def-flags">' + esc(flagStr) + '</td>' +
      metaCells +
      '</tr>';
  }).join('');

  // Collapsible: table-def-toggle.ts toggles .td-collapsed on click. td-collapsed in markup
  // keeps re-renders (e.g. column reorder) collapsed without re-running init.
  //
  // The expand/collapse chevron is a CSS ::after on the heading keyed off .td-collapsed
  // (see _query-builder.scss) \u2014 no arrow character lives in the markup.
  //
  // Open-by-default later: omit td-collapsed on the wrap. Also remove or skip the post-init loop in
  // table-def-toggle.ts that force-adds td-collapsed to every .table-definition-wrap — it
  // would still collapse everything on first load even if this HTML left the panel open.
  // Meta header cells, appended after the base headers when profiling is on.
  var metaHeads = showMeta
    ? '<th class="tdm-col" scope="col" title="' + esc(vt('viewer.table.def.metaFillTitle')) + '">' + esc(vt('viewer.table.def.metaFill')) + '</th>' +
      '<th class="tdm-col" scope="col" title="' + esc(vt('viewer.table.def.metaNullsTitle')) + '">' + esc(vt('viewer.table.def.metaNulls')) + '</th>' +
      '<th class="tdm-col" scope="col" title="' + esc(vt('viewer.table.def.metaDistinctTitle')) + '">' + esc(vt('viewer.table.def.metaDistinct')) + '</th>' +
      '<th class="tdm-col" scope="col" title="' + esc(vt('viewer.table.def.metaUniqueTitle')) + '">' + esc(vt('viewer.table.def.metaUnique')) + '</th>' +
      '<th class="tdm-col" scope="col" title="' + esc(vt('viewer.table.def.metaMinTitle')) + '">' + esc(vt('viewer.table.def.metaMin')) + '</th>' +
      '<th class="tdm-col" scope="col" title="' + esc(vt('viewer.table.def.metaMaxTitle')) + '">' + esc(vt('viewer.table.def.metaMax')) + '</th>' +
      '<th class="tdm-col" scope="col" title="' + esc(vt('viewer.table.def.metaSizeTitle')) + '">' + esc(vt('viewer.table.def.metaSize')) + '</th>'
    : '';

  // Heading toolbar: meta toggle + JSON/Flutter copy. The buttons live inside the
  // clickable heading, so table-def-meta.ts calls stopPropagation on tool clicks
  // to keep them from also collapsing the panel (table-def-toggle.ts).
  var metaActive = metaOn ? ' is-active' : '';
  var tools = '<span class="table-def-tools">' +
    '<button type="button" class="table-def-tool' + metaActive + '" data-tdm-action="toggle-meta"' +
      ' title="' + esc(vt('viewer.table.def.toolMetaTitle')) + '"' +
      ' aria-label="' + esc(vt('viewer.table.def.toolMetaLabel')) + '" aria-pressed="' + (metaOn ? 'true' : 'false') + '">' +
      '<span class="material-symbols-outlined" aria-hidden="true">insights</span></button>' +
    '<button type="button" class="table-def-tool" data-tdm-action="copy-json"' +
      ' title="' + esc(vt('viewer.table.def.toolJsonTitle')) + '" aria-label="' + esc(vt('viewer.table.def.toolJsonLabel')) + '">' +
      '<span class="material-symbols-outlined" aria-hidden="true">data_object</span></button>' +
    '<button type="button" class="table-def-tool" data-tdm-action="copy-flutter"' +
      ' title="' + esc(vt('viewer.table.def.toolFlutterTitle')) + '" aria-label="' + esc(vt('viewer.table.def.toolFlutterLabel')) + '">' +
      '<span class="material-symbols-outlined" aria-hidden="true">flutter_dash</span></button>' +
    '</span>';

  // data-table-name lets table-def-meta.ts resolve which table a tool click acts on
  // (and re-find the live panel after an async stats fetch).
  return '<div class="table-definition-wrap td-collapsed" role="region" aria-label="' + esc(vt('viewer.table.def.regionLabel')) + '" data-table-name="' + esc(tableName) + '">' +
    '<div class="table-definition-heading">' +
    '<span class="table-definition-heading-label">' + esc(vt('viewer.table.def.headingLabel')) + '</span>' +
    tools +
    '</div>' +
    '<div class="table-definition-scroll">' +
    '<table class="table-definition">' +
    '<thead><tr>' +
      '<th class="table-def-vis" scope="col" title="' + esc(vt('viewer.table.def.colShowTitle')) + '">' + esc(vt('viewer.table.def.colShow')) + '</th>' +
      '<th class="table-def-icons" scope="col"></th>' +
      '<th scope="col">' + esc(vt('viewer.table.def.colColumn')) + '</th>' +
      '<th scope="col">' + esc(vt('viewer.table.def.colType')) + '</th>' +
      '<th scope="col">' + esc(vt('viewer.table.def.colConstraints')) + '</th>' +
      metaHeads +
    '</tr></thead>' +
    '<tbody>' + rows + '</tbody></table></div></div>';
}

/**
 * Binds click-to-toggle on the results table expander heading.
 * Uses event delegation so it works regardless of render timing.
 * Toggles .results-collapsed on the wrapper; the chevron is a CSS ::after
 * keyed off that class (see _data-table.scss), so no text swap is needed.
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
      // Chevron direction is driven by CSS ::after keyed off .results-collapsed
      // (see _data-table.scss) \u2014 toggling the class is all that is needed.
      wrap.classList.toggle('results-collapsed');
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
    content.innerHTML = '<p class="meta">' + metaText + '</p><p class="meta">' + vt('viewer.table.results.loading') + '</p>';
  }
  function renderDataHtml(fkMap, colTypes) {
    var defHtml = buildTableDefinitionHtml(name);
    var rawTableHtml = wrapDataTableInScroll(buildDataTableHtml(displayData, fkMap, colTypes, getColumnConfig(name))) + buildTableStatusBar(S.tableCounts[name], S.offset, S.limit, displayData.length, getVisibleColumnCount(Object.keys(displayData[0] || {}), getColumnConfig(name)));
    // Wrap results table in a collapsible expander, expanded by default.
    // Row/column counts in the heading give context when collapsed.
    var rowCount = displayData.length;
    var totalCount = S.tableCounts[name];
    var resultDataKeys = Object.keys(displayData[0] || {});
    var resultsLabel = buildResultsLabel(
      rowCount,
      totalCount != null ? totalCount : null,
      getVisibleColumnCount(resultDataKeys, getColumnConfig(name)),
      resultDataKeys.length
    );
    var tableHtml = '<div class="results-table-wrap" role="region" aria-label="' + esc(vt('viewer.table.results.regionLabel')) + '">' +
      '<div class="results-table-heading">' + vt('viewer.table.results.heading', resultsLabel) + '</div>' +
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
          if (headerEl) headerEl.textContent = vt('viewer.table.results.dataHeader', name);
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

/** Returns the PK column name only when the table has exactly one PK column. */
export function getSinglePkColumnName(tableName) {
  var t = schemaTableByName(tableName);
  if (!t || !t.columns) return null;
  var pkCols = t.columns.filter(function(c) { return !!c.pk; });
  if (pkCols.length !== 1) return null;
  return pkCols[0].name;
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
