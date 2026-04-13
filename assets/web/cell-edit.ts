/**
 * Cell editing and value popup module.
 *
 * Handles inline cell editing (when write mode is enabled), reading
 * raw cell values from table cells, and the cell-value detail popup.
 */
import * as S from './state.ts';
import { schemaTableByName, getPkColumnNameForDataTable, getVisibleDataColumnKeys, copyCellValue } from './table-view.ts';
import { loadTable } from './table-list.ts';
import { loadSchemaMeta } from './schema-meta.ts';

    export function readCellRawFromTd(td) {
      if (!td) return '';
      var btn = td.querySelector('.cell-copy-btn');
      if (btn && btn.hasAttribute('data-raw')) return btn.getAttribute('data-raw') || '';
      if (td.querySelector('.cell-null')) return '';
      return (td.textContent || '').trim();
    }

    export function jsonPkValueForCellUpdate(rawStr, pkColName) {
      var t = schemaTableByName(S.currentTableName);
      var col = null;
      if (t && t.columns) {
        for (var i = 0; i < t.columns.length; i++) {
          if (t.columns[i].name === pkColName) { col = t.columns[i]; break; }
        }
      }
      var typ = (col && col.type || '').toUpperCase();
      if ((typ === 'INTEGER' || typ === 'INT') && /^-?\d+$/.test(String(rawStr))) {
        return parseInt(String(rawStr), 10);
      }
      if ((typ === 'REAL' || typ === 'FLOAT' || typ === 'DOUBLE') && /^-?\d+(\.\d+)?([eE][+-]?\d+)?$/.test(String(rawStr))) {
        return parseFloat(String(rawStr));
      }
      return rawStr === '' ? null : rawStr;
    }

    /** Builds JSON [value] for /api/cell/update; returns '__INVALID__' when client should block empty NOT NULL non-text. */
    export function cellUpdateValueJson(inputValue, colMeta) {
      var typ = (colMeta.type || '').toUpperCase();
      var notNull = !!colMeta.notnull;
      var trimmed = (inputValue || '').trim();
      var textLike = typ === '' || typ.indexOf('CHAR') >= 0 || typ.indexOf('CLOB') >= 0 || typ.indexOf('TEXT') >= 0;
      if (trimmed === '') {
        if (!notNull) return null;
        if (textLike) return '';
        return '__INVALID__';
      }
      return inputValue;
    }

    /**
     * Inline cell edit for the browser when S.driftWriteEnabled (POST /api/cell/update).
     * Requires a primary key and schema metadata.
     */
    export function tryStartBrowserCellEdit(td) {
      if (!S.currentTableName) return;
      loadSchemaMeta().then(function() {
        var pkName = getPkColumnNameForDataTable();
        if (!pkName) {
          window.alert('This table has no primary key column; inline edit is disabled.');
          return;
        }
        var columnKey = td.getAttribute('data-column-key') || '';
        if (!columnKey || columnKey === pkName) {
          window.alert('Primary key columns cannot be edited inline.');
          return;
        }
        var t = schemaTableByName(S.currentTableName);
        var colMeta = null;
        if (t && t.columns) {
          for (var j = 0; j < t.columns.length; j++) {
            if (t.columns[j].name === columnKey) { colMeta = t.columns[j]; break; }
          }
        }
        if (!colMeta) return;

        var keys = getVisibleDataColumnKeys(td);
        var colIdx = keys.indexOf(columnKey);
        var pkIdx = keys.indexOf(pkName);
        if (colIdx < 0 || pkIdx < 0) return;
        var tr = td.closest('tr');
        if (!tr || !tr.children[pkIdx]) return;
        var pkRaw = readCellRawFromTd(tr.children[pkIdx]);
        var pkJson = jsonPkValueForCellUpdate(pkRaw, pkName);

        var originalHtml = td.innerHTML;
        var startVal = readCellRawFromTd(td);
        var input = document.createElement('input');
        input.type = 'text';
        input.className = 'cell-inline-editor';
        input.setAttribute('aria-label', 'Edit ' + columnKey);
        input.value = startVal;
        input.style.cssText = 'width:100%;box-sizing:border-box;font:inherit;padding:2px 4px;';
        td.innerHTML = '';
        td.appendChild(input);
        input.focus();
        input.select();

        function restore() {
          td.innerHTML = originalHtml;
        }
        function commit() {
          input.removeEventListener('blur', onBlur);
          var valJson = cellUpdateValueJson(input.value, colMeta);
          if (valJson === '__INVALID__') {
            window.alert('This column is NOT NULL; enter a value or clear only if the column is nullable.');
            restore();
            return;
          }
          fetch('/api/cell/update', S.authOpts({
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              table: S.currentTableName,
              pkColumn: pkName,
              pkValue: pkJson,
              column: columnKey,
              value: valJson,
            }),
          }))
            .then(function(r) {
              return r.json().then(function(data) { return { ok: r.ok, data: data }; });
            })
            .then(function(res) {
              if (!res.ok || !res.data || res.data.error) {
                var msg = (res.data && res.data.error) ? res.data.error : 'Request failed';
                window.alert('Save failed: ' + msg);
                restore();
                return;
              }
              loadTable(S.currentTableName);
            })
            .catch(function(err) {
              window.alert('Save failed: ' + (err && err.message ? err.message : String(err)));
              restore();
            });
        }
        function onBlur() {
          commit();
        }
        input.addEventListener('keydown', function(ev) {
          if (ev.key === 'Enter') { ev.preventDefault(); input.blur(); }
          if (ev.key === 'Escape') {
            ev.preventDefault();
            input.removeEventListener('blur', onBlur);
            restore();
          }
        });
        input.addEventListener('blur', onBlur);
      }).catch(function(err) {
        window.alert('Could not load schema: ' + (err && err.message ? err.message : String(err)));
      });
    }

    /**
     * Opens the cell-value popup with full (untruncated) value and column name.
     * When writes are enabled: Shift+double-click opens this popup; plain double-click edits inline.
     * When writes are disabled: double-click always opens this popup.
     */
    export function showCellValuePopup(rawValue, columnKey) {
      var popup = document.getElementById('cell-value-popup');
      var textEl = document.getElementById('cell-value-popup-text');
      var titleEl = document.getElementById('cell-value-popup-title');
      if (!popup || !textEl || !titleEl) return;
      titleEl.textContent = columnKey ? 'Cell value: ' + columnKey : 'Cell value';
      textEl.textContent = rawValue !== undefined && rawValue !== null ? String(rawValue) : '';
      popup.classList.add('show');
      popup.setAttribute('aria-hidden', 'false');
    }

    export function hideCellValuePopup() {
      var popup = document.getElementById('cell-value-popup');
      if (!popup) return;
      popup.classList.remove('show');
      popup.setAttribute('aria-hidden', 'true');
    }

/** Wire up cell value popup buttons (copy, close, backdrop, escape). */
export function setupCellValuePopupButtons(): void {
  var popup = document.getElementById('cell-value-popup');
  var copyBtn = document.getElementById('cell-value-popup-copy');
  var closeBtn = document.getElementById('cell-value-popup-close');
  var textEl = document.getElementById('cell-value-popup-text');
  if (!popup || !copyBtn || !closeBtn || !textEl) return;
  copyBtn.addEventListener('click', function() {
    copyCellValue(textEl.textContent || '');
  });
  closeBtn.addEventListener('click', hideCellValuePopup);
  popup.addEventListener('click', function(e) {
    if (e.target === popup) hideCellValuePopup();
  });
  document.addEventListener('keydown', function(e) {
    if (e.key === 'Escape' && popup.classList.contains('show')) hideCellValuePopup();
  });
}
