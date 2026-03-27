/**
 * Inline JS injected into the Saropa Drift Advisor webview to enable cell editing.
 * Kept as a separate module so editing-bridge stays focused on message wiring.
 */
export const EDITING_SCRIPT = `
(function() {
  const vscodeApi = window._vscodeApi || (window._vscodeApi = acquireVsCodeApi());
  let pendingChanges = [];
  let editingEnabled = true;
  function getTableMeta(table) {
    const name = table.dataset.tableName || table.closest('[data-table-name]')?.dataset.tableName || 'unknown';
    const headers = Array.from(table.querySelectorAll('thead th')).map(th => th.textContent.trim());
    let pkIdx = headers.findIndex(h => h === 'id' || h === '_id');
    if (pkIdx < 0) pkIdx = 0;
    return { name, headers, pkColumn: headers[pkIdx], pkIdx };
  }
  function getCellValue(td) {
    const raw = td.dataset.rawValue;
    if (raw !== undefined) return raw === 'null' ? null : raw;
    return td.textContent.trim();
  }
  document.addEventListener('dblclick', function(e) {
    if (!editingEnabled) return;
    const td = e.target.closest('td');
    if (!td) return;
    const tr = td.closest('tr');
    const table = td.closest('table');
    if (!table || !tr) return;
    const meta = getTableMeta(table);
    const colIdx = Array.from(tr.children).indexOf(td);
    if (colIdx < 0 || colIdx >= meta.headers.length) return;
    if (colIdx === meta.pkIdx) return;
    if (td.querySelector('input')) return;
    const oldValue = getCellValue(td);
    const input = document.createElement('input');
    input.type = 'text';
    input.className = 'cell-inline-editor';
    input.value = oldValue === null ? '' : String(oldValue);
    input.style.cssText = 'width:100%;box-sizing:border-box;font:inherit;padding:2px 4px;';
    const originalContent = td.innerHTML;
    td.innerHTML = '';
    td.appendChild(input);
    input.focus();
    input.select();
    var committedOrCancelled = false;
    function onBlurCommit() {
      if (committedOrCancelled) return;
      committedOrCancelled = true;
      input.removeEventListener('blur', onBlurCommit);
      var newValue = input.value === '' ? null : input.value;
      td.innerHTML = originalContent;
      if (newValue !== oldValue) {
        td.textContent = newValue === null ? 'NULL' : String(newValue);
        td.style.backgroundColor = 'rgba(255, 200, 0, 0.25)';
        td.title = 'Pending change';
        var pkTd = tr.children[meta.pkIdx];
        vscodeApi.postMessage({
          command: 'cellEdit',
          table: meta.name,
          pkColumn: meta.pkColumn,
          pkValue: getCellValue(pkTd),
          column: meta.headers[colIdx],
          oldValue: oldValue,
          newValue: newValue,
        });
      }
    }
    input.addEventListener('blur', onBlurCommit);
    input.addEventListener('keydown', function(ev) {
      if (ev.key === 'Enter') { ev.preventDefault(); input.blur(); }
      if (ev.key === 'Tab') { ev.preventDefault(); input.blur(); }
      if (ev.key === 'Escape') {
        ev.preventDefault();
        committedOrCancelled = true;
        input.removeEventListener('blur', onBlurCommit);
        td.innerHTML = originalContent;
      }
    });
  });
  document.addEventListener('contextmenu', function(e) {
    if (!editingEnabled) return;
    const tr = e.target.closest('tr');
    const table = e.target.closest('table');
    if (!tr || !table || tr.closest('thead')) return;
    e.preventDefault();
    const meta = getTableMeta(table);
    const pkTd = tr.children[meta.pkIdx];
    if (!pkTd) return;
    const btn = document.createElement('button');
    btn.textContent = 'Delete this row?';
    btn.style.cssText = 'position:fixed;z-index:9999;padding:4px 12px;' +
      'background:#d32f2f;color:#fff;border:none;border-radius:4px;cursor:pointer;' +
      'font-size:13px;top:' + e.clientY + 'px;left:' + e.clientX + 'px;';
    document.body.appendChild(btn);
    function cleanup() { btn.remove(); document.removeEventListener('click', onOutside); }
    function onOutside() { cleanup(); }
    setTimeout(() => document.addEventListener('click', onOutside), 0);
    btn.addEventListener('click', function(ev) {
      ev.stopPropagation();
      cleanup();
      tr.style.textDecoration = 'line-through';
      tr.style.opacity = '0.4';
      tr.style.backgroundColor = 'rgba(211, 47, 47, 0.15)';
      vscodeApi.postMessage({
        command: 'rowDelete',
        table: meta.name,
        pkColumn: meta.pkColumn,
        pkValue: getCellValue(pkTd),
      });
    });
  });
  function addInsertButtons() {
    document.querySelectorAll('table').forEach(function(table) {
      if (table.querySelector('.drift-add-row-btn')) return;
      const meta = getTableMeta(table);
      const btn = document.createElement('button');
      btn.className = 'drift-add-row-btn';
      btn.textContent = '+ Add Row';
      btn.style.cssText = 'margin:8px 0;padding:4px 12px;font-size:13px;' +
        'cursor:pointer;background:#2e7d32;color:#fff;border:none;border-radius:4px;';
      btn.addEventListener('click', function() {
        const values = {};
        meta.headers.forEach(function(h, i) {
          if (i !== meta.pkIdx) values[h] = null;
        });
        const tbody = table.querySelector('tbody') || table;
        const newRow = document.createElement('tr');
        newRow.setAttribute('data-drift-pending-insert', '1');
        newRow.style.backgroundColor = 'rgba(46, 125, 50, 0.15)';
        meta.headers.forEach(function(_h, i) {
          const td = document.createElement('td');
          td.textContent = i === meta.pkIdx ? '(auto)' : 'NULL';
          newRow.appendChild(td);
        });
        tbody.appendChild(newRow);
        vscodeApi.postMessage({ command: 'rowInsert', table: meta.name, values: values });
      });
      table.parentNode.insertBefore(btn, table.nextSibling);
    });
  }
  function revertCellEdit(msg) {
    document.querySelectorAll('table').forEach(function(table) {
      var meta = getTableMeta(table);
      if (meta.name !== msg.table) return;
      var colIdx = meta.headers.indexOf(msg.column);
      if (colIdx < 0) return;
      var pkIdx = meta.pkIdx;
      var rows = table.querySelectorAll('tbody tr');
      for (var i = 0; i < rows.length; i++) {
        var tr = rows[i];
        var pkTd = tr.children[pkIdx];
        if (!pkTd) continue;
        if (String(getCellValue(pkTd)) !== String(msg.pkValue)) continue;
        var td = tr.children[colIdx];
        if (!td) continue;
        td.style.backgroundColor = '';
        td.title = '';
        if (msg.oldValue === null || msg.oldValue === undefined) {
          td.innerHTML = '<span class="cell-null">NULL</span>';
        } else {
          td.textContent = String(msg.oldValue);
        }
        break;
      }
    });
  }
  window.addEventListener('message', function(event) {
    const msg = event.data;
    if (msg.command === 'pendingChanges') pendingChanges = msg.changes || [];
    if (msg.command === 'editingEnabled') editingEnabled = msg.enabled;
    if (msg.command === 'cellEditRejected') revertCellEdit(msg);
    if (msg.command === 'rowInsertRejected') {
      document.querySelectorAll('table').forEach(function(table) {
        var meta = getTableMeta(table);
        if (meta.name !== msg.table) return;
        var pending = table.querySelector('tbody tr[data-drift-pending-insert="1"]');
        if (pending) pending.remove();
      });
    }
  });
  document.addEventListener('keydown', function(e) {
    if (!editingEnabled) return;
    if (!(e.ctrlKey || e.metaKey) || e.key !== 'z' || e.shiftKey) return;
    var ae = document.activeElement;
    if (ae && ae.classList && ae.classList.contains('cell-inline-editor')) return;
    e.preventDefault();
    vscodeApi.postMessage({ command: 'undo' });
  }, true);
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', addInsertButtons);
  } else {
    addInsertButtons();
  }
  const observer = new MutationObserver(function() { addInsertButtons(); });
  observer.observe(document.body, { childList: true, subtree: true });
})();
`;
