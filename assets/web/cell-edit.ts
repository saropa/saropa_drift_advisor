/**
 * Cell editing and value popup module.
 *
 * Handles inline cell editing (when write mode is enabled), reading
 * raw cell values from table cells, and the cell-value detail popup.
 */
import * as S from './state.ts';
import { schemaTableByName, getPkColumnNameForDataTable, getVisibleDataColumnKeys, copyCellValue, isBooleanColumn } from './table-view.ts';
import { loadTable } from './table-list.ts';
import { loadSchemaMeta } from './schema-meta.ts';

/** Tracks whether a web inline edit is currently active (single-edit v1 guard). */
let activeEditToken = 0;

/** True when the browser UI has an unsaved inline edit open. */
export function hasUnsavedWebEdit(): boolean {
  return activeEditToken > 0;
}

/** Clear the single-edit lock after save/cancel. */
function clearUnsavedWebEdit(): void {
  activeEditToken = 0;
}

/** Acquire the single-edit lock; returns false when another edit is active. */
function tryBeginUnsavedWebEdit(): boolean {
  if (activeEditToken > 0) return false;
  activeEditToken = 1;
  return true;
}

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
     * Client-side type format validation for cell values.
     * Returns null if valid, or an error message string if invalid.
     * Checks format only — does not enforce business rules, just
     * whether the value can be stored in the given SQLite column type.
     */
    function validateCellFormat(value: string, colMeta: any): string | null {
      var trimmed = value.trim();
      var typ = (colMeta.type || '').toUpperCase();

      // Empty value: allowed for nullable columns, blocked for NOT NULL non-text
      if (trimmed === '') {
        if (colMeta.notnull) {
          var textLike = typ === '' || /CHAR|CLOB|TEXT/.test(typ);
          if (!textLike) return 'This column is NOT NULL — a value is required.';
        }
        return null;
      }

      // Boolean-ish integer columns: check before generic integer validation
      // so "true"/"false" get the right error message instead of "expected integer".
      var isIntLike = typ === 'INTEGER' || typ === 'INT' || typ === 'BIGINT' || typ === 'SMALLINT' || typ === 'TINYINT';
      if ((isIntLike || typ === '') && isBooleanColumn(colMeta.name)) {
        var lower = trimmed.toLowerCase();
        if (lower !== '0' && lower !== '1' && lower !== 'true' && lower !== 'false') {
          return 'Expected 0 or 1 (or true/false).';
        }
        // Valid boolean value — skip the generic integer check below
        // since "true"/"false" are valid here but would fail /^-?\d+$/
        return null;
      }

      // Integer check: must be a whole number (optional leading minus)
      if (isIntLike) {
        if (!/^-?\d+$/.test(trimmed)) return 'Expected an integer (e.g. 42, -7).';
      }

      // Real/float check: must be a valid number
      if (typ === 'REAL' || typ === 'FLOAT' || typ === 'DOUBLE' || /NUMERIC|DECIMAL/.test(typ)) {
        if (isNaN(Number(trimmed)) || trimmed === '') return 'Expected a number (e.g. 3.14, -0.5).';
      }

      return null;
    }

    /**
     * Inline cell edit for the browser when S.driftWriteEnabled (POST /api/cell/update).
     * Requires a primary key and schema metadata.
     *
     * Shows a context bar with PK identity, column name/type, and the
     * original value. Validates the new value's format before saving and
     * shows inline error feedback instead of alert() dialogs.
     */
    export function tryStartBrowserCellEdit(td) {
      if (!S.currentTableName) return;
      if (!tryBeginUnsavedWebEdit()) {
        window.alert('Finish or cancel the current edit before editing another cell.');
        return;
      }
      loadSchemaMeta().then(function() {
        var pkName = getPkColumnNameForDataTable();
        if (!pkName) {
          clearUnsavedWebEdit();
          window.alert('This table has no primary key column; inline edit is disabled.');
          return;
        }
        var columnKey = td.getAttribute('data-column-key') || '';
        if (!columnKey || columnKey === pkName) {
          clearUnsavedWebEdit();
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
        if (!colMeta) {
          clearUnsavedWebEdit();
          return;
        }
        if ((colMeta.type || '').toUpperCase() === 'BLOB') {
          clearUnsavedWebEdit();
          window.alert('BLOB columns cannot be edited inline.');
          return;
        }

        var keys = getVisibleDataColumnKeys(td);
        var colIdx = keys.indexOf(columnKey);
        var pkIdx = keys.indexOf(pkName);
        if (colIdx < 0 || pkIdx < 0) {
          clearUnsavedWebEdit();
          return;
        }
        var tr = td.closest('tr');
        if (!tr || !tr.children[pkIdx]) {
          clearUnsavedWebEdit();
          return;
        }
        var pkRaw = readCellRawFromTd(tr.children[pkIdx]);
        var pkJson = jsonPkValueForCellUpdate(pkRaw, pkName);

        var originalHtml = td.innerHTML;
        var startVal = readCellRawFromTd(td);
        var isNull = td.querySelector('.cell-null') != null;
        /** Initial text in the editor — used to detect unsaved edits vs original DB value. */
        var initialEditText = isNull ? '' : String(startVal);

        // Build the inline edit widget with context and validation feedback.
        // Context bar: shows which row (PK) and column/type are being edited,
        // plus the original value so the user knows what they're changing from.
        var colType = (colMeta.type || '').toUpperCase() || 'unspecified';
        var nullableLabel = colMeta.notnull ? 'NOT NULL' : 'nullable';

        var container = document.createElement('div');
        container.className = 'cell-edit-container';

        // Context header: row identity + column metadata
        var contextEl = document.createElement('div');
        contextEl.className = 'cell-edit-context';
        contextEl.textContent = pkName + '=' + pkRaw + ' \u2022 ' + columnKey + ' (' + colType + ', ' + nullableLabel + ')';
        container.appendChild(contextEl);

        // Current value display so the user sees what they're changing from
        var currentEl = document.createElement('div');
        currentEl.className = 'cell-edit-current';
        currentEl.textContent = 'was: ' + (isNull ? 'NULL' : startVal);
        container.appendChild(currentEl);

        var input = document.createElement('input');
        input.type = 'text';
        input.className = 'cell-inline-editor';
        input.setAttribute('aria-label', 'Edit ' + columnKey);
        input.value = startVal;
        container.appendChild(input);

        // Inline error message element — hidden until validation fails
        var errorEl = document.createElement('div');
        errorEl.className = 'cell-edit-error';
        container.appendChild(errorEl);

        // Explicit Save/Cancel row controls (no blur auto-save in web v1).
        var actions = document.createElement('div');
        actions.className = 'cell-edit-actions';
        var saveBtn = document.createElement('button');
        saveBtn.type = 'button';
        saveBtn.className = 'btn-primary';
        saveBtn.textContent = 'Save';
        var cancelBtn = document.createElement('button');
        cancelBtn.type = 'button';
        cancelBtn.textContent = 'Cancel';
        actions.appendChild(saveBtn);
        actions.appendChild(cancelBtn);
        container.appendChild(actions);

        // Shown after server/network save failure — explicit retry vs discard local UI via reload.
        var failureActions = document.createElement('div');
        failureActions.className = 'cell-edit-failure-actions';
        failureActions.style.display = 'none';
        var retrySaveBtn = document.createElement('button');
        retrySaveBtn.type = 'button';
        retrySaveBtn.className = 'cell-edit-retry-btn';
        retrySaveBtn.textContent = 'Retry save';
        var reloadTableBtn = document.createElement('button');
        reloadTableBtn.type = 'button';
        reloadTableBtn.className = 'cell-edit-reload-btn';
        reloadTableBtn.textContent = 'Reload table';
        failureActions.appendChild(retrySaveBtn);
        failureActions.appendChild(reloadTableBtn);
        container.appendChild(failureActions);

        td.innerHTML = '';
        td.appendChild(container);
        input.focus();
        input.select();

        /** Highlights the active cell/row when the draft value differs from the loaded row (Feature 47). */
        function updateDirtyHighlight() {
          var dirty = input.value !== initialEditText;
          td.classList.toggle('cell-edit-td-dirty', dirty);
          tr.classList.toggle('cell-edit-row-dirty', dirty);
        }

        // Live validation on each keystroke: show/clear error as the user types
        input.addEventListener('input', function() {
          var err = validateCellFormat(input.value, colMeta);
          errorEl.textContent = err || '';
          errorEl.style.display = err ? 'block' : 'none';
          input.classList.toggle('cell-edit-invalid', !!err);
          updateDirtyHighlight();
        });
        updateDirtyHighlight();

        function restore() {
          td.classList.remove('cell-edit-td-dirty');
          tr.classList.remove('cell-edit-row-dirty');
          td.innerHTML = originalHtml;
          clearUnsavedWebEdit();
        }
        function commit() {
          failureActions.style.display = 'none';
          // Client-side format check before sending to the server
          var formatErr = validateCellFormat(input.value, colMeta);
          if (formatErr) {
            errorEl.textContent = formatErr;
            errorEl.style.display = 'block';
            input.classList.add('cell-edit-invalid');
            input.focus();
            return;
          }

          var valJson = cellUpdateValueJson(input.value, colMeta);
          if (valJson === '__INVALID__') {
            errorEl.textContent = 'This column is NOT NULL — a value is required.';
            errorEl.style.display = 'block';
            input.classList.add('cell-edit-invalid');
            input.focus();
            return;
          }
          saveBtn.disabled = true;
          cancelBtn.disabled = true;
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
                errorEl.textContent = 'Save failed: ' + msg;
                errorEl.style.display = 'block';
                input.classList.add('cell-edit-invalid');
                failureActions.style.display = 'flex';
                // Keep edit state open so users can adjust/retry (explicit v1 policy).
                saveBtn.disabled = false;
                cancelBtn.disabled = false;
                input.focus();
                return;
              }
              clearUnsavedWebEdit();
              loadTable(S.currentTableName);
            })
            .catch(function(err) {
              errorEl.textContent = 'Save failed: ' + (err && err.message ? err.message : String(err));
              errorEl.style.display = 'block';
              input.classList.add('cell-edit-invalid');
              failureActions.style.display = 'flex';
              saveBtn.disabled = false;
              cancelBtn.disabled = false;
              input.focus();
            });
        }
        retrySaveBtn.addEventListener('click', function() {
          failureActions.style.display = 'none';
          commit();
        });
        reloadTableBtn.addEventListener('click', function() {
          clearUnsavedWebEdit();
          loadTable(S.currentTableName);
        });
        saveBtn.addEventListener('click', function() {
          commit();
        });
        cancelBtn.addEventListener('click', function() {
          restore();
        });
        input.addEventListener('keydown', function(ev) {
          if (ev.key === 'Enter') { ev.preventDefault(); commit(); }
          if (ev.key === 'Escape') {
            ev.preventDefault();
            restore();
          }
        });
      }).catch(function(err) {
        clearUnsavedWebEdit();
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
