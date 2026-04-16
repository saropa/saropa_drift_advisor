/**
 * SQL history and bookmarks module.
 * Manages localStorage-backed SQL history and saved-query bookmarks,
 * including dropdown UI binding, import/export, and CRUD operations.
 */
import { esc } from './utils.ts';
import * as S from './state.ts';
import { getPref, PREF_SQL_HISTORY_MAX, DEFAULTS } from './settings.ts';

    export function loadSqlHistory() {
      S.setSqlHistory([]);
      try {
        const raw = localStorage.getItem(S.SQL_HISTORY_KEY);
        const parsed = raw ? JSON.parse(raw) : [];
        if (!Array.isArray(parsed)) return;
        S.setSqlHistory(parsed
          .map((h) => {
            const sql = h && typeof h.sql === 'string' ? h.sql.trim() : '';
            if (!sql) return null;
            const rowCount = h && typeof h.rowCount === 'number' ? h.rowCount : null;
            const at = h && typeof h.at === 'string' ? h.at : null;
            return { sql: sql, rowCount: rowCount, at: at };
          })
          .filter(Boolean)
          .slice(0, getPref(PREF_SQL_HISTORY_MAX, DEFAULTS[PREF_SQL_HISTORY_MAX])));
      } catch (e) { S.setSqlHistory([]); }
    }
    export function saveSqlHistory() {
      try {
        localStorage.setItem(S.SQL_HISTORY_KEY, JSON.stringify(S.sqlHistory));
      } catch (e) {}
    }
    export function refreshHistoryDropdown(sel) {
      if (!sel) return;
      const cur = sel.value;
      sel.innerHTML = '<option value="">— Recent —</option>' + S.sqlHistory.map((h, i) => {
        const preview = h.sql.length > 50 ? h.sql.slice(0, 47) + '…' : h.sql;
        const rows = h.rowCount != null ? (h.rowCount + ' row(s)') : '';
        const at = h.at ? new Date(h.at).toLocaleString() : '';
        const label = [rows, at, preview].filter(Boolean).join(' · ');
        return '<option value="' + i + '" title="' + esc(h.sql) + '">' + esc(label) + '</option>';
      }).join('');
      if (cur !== '' && parseInt(cur, 10) < S.sqlHistory.length) sel.value = cur;
    }
    export function pushSqlHistory(sql, rowCount) {
      sql = (sql || '').trim();
      if (!sql) return;
      const at = new Date().toISOString();
      S.setSqlHistory([{ sql: sql, rowCount: rowCount, at: at }].concat(S.sqlHistory.filter(h => h.sql !== sql)));
      S.setSqlHistory(S.sqlHistory.slice(0, getPref(PREF_SQL_HISTORY_MAX, DEFAULTS[PREF_SQL_HISTORY_MAX])));
      saveSqlHistory();
    }

    // --- Shared: bind a dropdown so selecting an item loads its .sql into the input ---
    export function bindDropdownToInput(sel, items, inputEl) {
      if (!sel || !inputEl) return;
      sel.addEventListener('change', function() {
        const idx = parseInt(this.value, 10);
        if (!isNaN(idx) && items[idx]) inputEl.value = items[idx].sql;
      });
    }

    // --- Bookmarks: localStorage CRUD ---
    export function loadBookmarks() {
      S.setSqlBookmarks([]);
      try {
        const raw = localStorage.getItem(S.BOOKMARKS_KEY);
        const parsed = raw ? JSON.parse(raw) : [];
        if (!Array.isArray(parsed)) return;
        S.setSqlBookmarks(parsed
          .map(function(b) {
            const name = b && typeof b.name === 'string' ? b.name.trim() : '';
            const sql = b && typeof b.sql === 'string' ? b.sql.trim() : '';
            if (!name || !sql) return null;
            const createdAt = b && typeof b.createdAt === 'string' ? b.createdAt : null;
            return { name: name, sql: sql, createdAt: createdAt };
          })
          .filter(Boolean));
      } catch (e) { S.setSqlBookmarks([]); }
    }
    export function saveBookmarks() {
      try {
        localStorage.setItem(S.BOOKMARKS_KEY, JSON.stringify(S.sqlBookmarks));
      } catch (e) {}
    }
    export function refreshBookmarksDropdown(sel) {
      if (!sel) return;
      const cur = sel.value;
      sel.innerHTML = '<option value="">— Saved queries (' + S.sqlBookmarks.length + ') —</option>' +
        S.sqlBookmarks.map(function(b, i) {
          return '<option value="' + i + '" title="' + esc(b.sql) + '">' + esc(b.name) + '</option>';
        }).join('');
      if (cur !== '' && parseInt(cur, 10) < S.sqlBookmarks.length) sel.value = cur;
    }
    export function addBookmark(inputEl, bookmarksSel) {
      const sql = inputEl.value.trim();
      if (!sql) return;
      const name = prompt('Name for this query:', sql.slice(0, 40));
      if (name == null || String(name).trim() === '') return;
      S.sqlBookmarks.unshift({ name: name, sql: sql, createdAt: new Date().toISOString() });
      saveBookmarks();
      refreshBookmarksDropdown(bookmarksSel);
    }
    export function deleteBookmark(bookmarksSel) {
      const idx = parseInt(bookmarksSel.value, 10);
      if (isNaN(idx) || !S.sqlBookmarks[idx]) return;
      if (!confirm('Delete saved query "' + S.sqlBookmarks[idx].name + '"?')) return;
      S.sqlBookmarks.splice(idx, 1);
      saveBookmarks();
      refreshBookmarksDropdown(bookmarksSel);
    }
    export function exportBookmarks() {
      if (S.sqlBookmarks.length === 0) { alert('No saved queries to export.'); return; }
      const blob = new Blob([JSON.stringify(S.sqlBookmarks, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'drift-viewer-saved-queries.json';
      a.click();
      URL.revokeObjectURL(url);
    }
    export function importBookmarks(bookmarksSel) {
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = '.json';
      input.onchange = function() {
        const file = input.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = function() {
          try {
            const raw = typeof reader.result === 'string' ? reader.result : '';
            const imported = JSON.parse(raw);
            if (!Array.isArray(imported)) throw new Error('Expected JSON array');
            let newCount = 0;
            imported.forEach(function(b) {
              if (b.name && b.sql && !S.sqlBookmarks.some(function(e) { return e.sql === b.sql; })) {
                S.sqlBookmarks.push({ name: b.name, sql: b.sql, createdAt: b.createdAt || new Date().toISOString() });
                newCount++;
              }
            });
            saveBookmarks();
            refreshBookmarksDropdown(bookmarksSel);
            alert('Imported ' + newCount + ' new saved query(s). ' + (imported.length - newCount) + ' duplicate(s) skipped.');
          } catch (e) {
            alert('Invalid file: ' + e.message);
          }
        };
        reader.readAsText(file);
      };
      input.click();
    }
