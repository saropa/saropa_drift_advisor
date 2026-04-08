/**
 * Pagination module: page navigation, offset management, column chooser,
 * and column configuration helpers.
 *
 * Extracted from app.js — function bodies are unchanged.
 * All shared state accessed via S.*.
 */
import * as S from './state.ts';
import { loadTable } from './table-list.ts';
import { getColumnConfig, setColumnConfig, saveTableState, clearTableState } from './persistence.ts';
import { renderTableView } from './table-view.ts';
import { getScope } from './search.ts';

/**
 * Navigates to a given offset: updates state, syncs advanced offset input,
 * saves table state, and reloads the table. Single place for all page/offset navigation.
 */
export function goToOffset(newOffset) {
      S.setOffset(Math.max(0, newOffset));
      const offsetInput = document.getElementById('pagination-offset');
      if (offsetInput) /** @type {HTMLInputElement} */ (offsetInput).value = String(S.offset);
      saveTableState(S.currentTableName);
      loadTable(S.currentTableName);
    }

/**
 * Updates the pagination bar: status text, First/Prev/Next/Last disabled state,
 * page dropdown, and syncs the advanced offset input. Call after limit/offset/total change.
 * Rebuilds the page dropdown each time so it always reflects current state.
 * @param {number|null} total - Total row count from server, or null if unknown
 */
export function updatePaginationBar(total) {
      const statusEl = document.getElementById('pagination-status');
      const firstBtn = /** @type {HTMLButtonElement|null} */ (document.getElementById('pagination-first'));
      const prevBtn = /** @type {HTMLButtonElement|null} */ (document.getElementById('pagination-prev'));
      const nextBtn = /** @type {HTMLButtonElement|null} */ (document.getElementById('pagination-next'));
      const lastBtn = /** @type {HTMLButtonElement|null} */ (document.getElementById('pagination-last'));
      const pagesEl = document.getElementById('pagination-pages');
      const offsetInput = /** @type {HTMLInputElement|null} */ (document.getElementById('pagination-offset'));
      if (!pagesEl || !offsetInput) return;

      const currentPage = S.limit > 0 ? Math.floor(S.offset / S.limit) + 1 : 1;
      const totalPages = (total != null && total > 0 && S.limit > 0) ? Math.max(1, Math.ceil(total / S.limit)) : null;
      // When offset is past end (e.g. Advanced offset), clamp so dropdown has a valid selection
      const selectedPage = totalPages != null && currentPage > totalPages ? totalPages : currentPage;

      // Status: "Showing 1–50 of 500" or "Page 1" when total unknown
      if (statusEl) {
        if (total != null) {
          const from = S.offset + 1;
          const to = Math.min(S.offset + S.limit, total);
          statusEl.textContent = total === 0 ? '0 rows' : 'Showing ' + from + '\u2013' + to + ' of ' + total.toLocaleString() + ' rows';
        } else {
          statusEl.textContent = 'Page ' + currentPage + ' (total unknown)';
        }
      }

      // First / Prev: disabled on first page
      const onFirstPage = S.offset <= 0;
      if (firstBtn) firstBtn.disabled = onFirstPage;
      if (prevBtn) prevBtn.disabled = onFirstPage;

      // Next / Last: disabled when we know total and we're on last page
      const onLastPage = totalPages != null && currentPage >= totalPages;
      if (nextBtn) nextBtn.disabled = onLastPage;
      if (lastBtn) lastBtn.disabled = onLastPage;

      // Page selector: dropdown with 1..totalPages, or "Page 1 of ?"
      pagesEl.innerHTML = '';
      const pageLabel = document.createElement('label');
      pageLabel.setAttribute('for', 'pagination-page');
      pageLabel.textContent = 'Page ';
      pageLabel.className = 'pagination-page-label';
      pagesEl.appendChild(pageLabel);
      const pageSel = document.createElement('select');
      pageSel.id = 'pagination-page';
      pageSel.setAttribute('aria-label', 'Current page');
      if (totalPages != null) {
        for (let p = 1; p <= totalPages; p++) {
          const opt = document.createElement('option');
          opt.value = String(p);
          opt.textContent = String(p);
          if (p === selectedPage) opt.selected = true;
          pageSel.appendChild(opt);
        }
      } else {
        const opt = document.createElement('option');
        opt.value = '1';
        opt.textContent = '1';
        opt.selected = true;
        pageSel.appendChild(opt);
      }
      pagesEl.appendChild(pageSel);
      const ofSpan = document.createElement('span');
      ofSpan.id = 'pagination-of';
      ofSpan.className = 'pagination-of';
      ofSpan.textContent = totalPages != null ? ' of ' + totalPages : '';
      pagesEl.appendChild(ofSpan);

      pageSel.addEventListener('change', function() {
        const p = parseInt(this.value, 10) || 1;
        goToOffset((p - 1) * S.limit);
      });

      // Sync advanced offset input
      offsetInput.value = String(S.offset);
    }

/** Sets up the pagination bar: populates limit dropdown and initial page state. */
export function setupPagination() {
      const bar = document.getElementById('pagination-bar');
      if (!bar) return;
      const limitSel = /** @type {HTMLSelectElement} */ (document.getElementById('pagination-limit'));
      limitSel.innerHTML = S.LIMIT_OPTIONS.map(n => '<option value="' + n + '"' + (n === S.limit ? ' selected' : '') + '>' + n + '</option>').join('');
      const total = S.currentTableName ? (S.tableCounts[S.currentTableName] ?? null) : null;
      updatePaginationBar(total);
      bar.style.display = getScope() === 'schema' ? 'none' : 'flex';
    }

/** No-op: column table events are bound via document-level delegation below. */
export function bindColumnTableEvents() {}

/** Ensures the current table has a column config with order; merges in any new keys from data. */
export function ensureColumnConfig(tableName, dataKeys) {
      var config = getColumnConfig(tableName);
      if (!config || !config.order) {
        config = { order: dataKeys.slice(), hidden: [], pinned: [] };
        setColumnConfig(tableName, config);
        return config;
      }
      var order = config.order.filter(function(k) { return dataKeys.indexOf(k) >= 0; });
      dataKeys.forEach(function(k) { if (order.indexOf(k) < 0) order.push(k); });
      config.order = order;
      if (!config.hidden) config.hidden = [];
      if (!config.pinned) config.pinned = [];
      setColumnConfig(tableName, config);
      return config;
    }

/** Applies column config change and re-renders the current table view. */
export function applyColumnConfigAndRender() {
      if (!S.currentTableName || !S.currentTableJson) return;
      saveTableState(S.currentTableName);
      renderTableView(S.currentTableName, S.currentTableJson);
    }

/** Populates the column chooser panel with checkboxes and pin buttons. */
export function populateColumnChooserList() {
      var listEl = document.getElementById('column-chooser-list');
      listEl.innerHTML = '';
      if (!S.currentTableName || !S.currentTableJson || !S.currentTableJson.length) return;
      var dataKeys = Object.keys(S.currentTableJson[0]);
      var config = ensureColumnConfig(S.currentTableName, dataKeys);
      config.order.forEach(function(key) {
        var li = document.createElement('li');
        var cb = document.createElement('input');
        cb.type = 'checkbox';
        cb.id = 'col-chooser-' + key.replace(/[^a-zA-Z0-9_]/g, '_');
        cb.checked = config.hidden.indexOf(key) < 0;
        cb.addEventListener('change', function() {
          if (this.checked) {
            config.hidden = config.hidden.filter(function(k) { return k !== key; });
          } else {
            config.hidden.push(key);
          }
          setColumnConfig(S.currentTableName, config);
          applyColumnConfigAndRender();
          populateColumnChooserList();
        });
        var label = document.createElement('label');
        label.htmlFor = cb.id;
        label.textContent = key;
        var pinBtn = document.createElement('button');
        pinBtn.type = 'button';
        pinBtn.textContent = config.pinned.indexOf(key) >= 0 ? 'Unpin' : 'Pin';
        pinBtn.title = config.pinned.indexOf(key) >= 0 ? 'Unpin this column' : 'Pin this column to the left';
        pinBtn.style.fontSize = '11px';
        pinBtn.addEventListener('click', function() {
          var idx = config.pinned.indexOf(key);
          if (idx >= 0) config.pinned.splice(idx, 1);
          else config.pinned.push(key);
          setColumnConfig(S.currentTableName, config);
          applyColumnConfigAndRender();
          populateColumnChooserList();
        });
        li.appendChild(cb);
        li.appendChild(label);
        li.appendChild(pinBtn);
        listEl.appendChild(li);
      });
    }
