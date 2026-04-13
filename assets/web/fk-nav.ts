/**
 * Foreign-key navigation module.
 *
 * Handles FK metadata loading, building SQL filter values for FK
 * lookups, navigating between related tables, and rendering the
 * breadcrumb trail that tracks the FK navigation path.
 */
import * as S from './state.ts';
import { esc } from './utils.ts';
import { loadTable, updateTableListActive } from './table-list.ts';
import { switchTab } from './tabs.ts';
import { saveNavHistory, clearNavHistory } from './persistence.ts';

    export function loadFkMeta(tableName) {
      if (S.fkMetaCache[tableName]) return Promise.resolve(S.fkMetaCache[tableName]);
      return fetch('/api/table/' + encodeURIComponent(tableName) + '/fk-meta', S.authOpts())
        .then(function(r) { return r.json(); })
        .then(function(fks) { S.fkMetaCache[tableName] = fks; return fks; })
        .catch(function() { return []; });
    }

    export function buildFkSqlValue(value) {
      var isNumeric = !isNaN(value) && value.trim() !== '';
      return isNumeric ? value : "'" + value.replace(/'/g, "''") + "'";
    }

    export function navigateToFk(table, column, value) {
      // Push the current table onto the breadcrumb trail before
      // navigating away, so the user can return to it later.  We
      // capture the row-filter value and pagination offset so the
      // exact view is restored on Back.
      S.navHistory.push({
        table: S.currentTableName,
        offset: S.offset,
        filter: document.getElementById('row-filter').value
      });
      var sqlInput = document.getElementById('sql-input');
      sqlInput.value = 'SELECT * FROM "' + table + '" WHERE "' + column + '" = ' + buildFkSqlValue(value);
      switchTab('sql');
      document.getElementById('sql-run').click();
      S.setCurrentTableName(table);
      updateTableListActive();
      saveNavHistory();
      renderBreadcrumb();
    }

    // Render the FK breadcrumb trail.  Each historical step is a clickable
    // link that truncates the trail to that point and loads the target
    // table.  The current table is shown as bold (non-clickable) at the
    // end.  A "Clear path" link lets the user discard the entire trail.
    export function renderBreadcrumb() {
      var el = document.getElementById('nav-breadcrumb');
      if (!el) {
        // Create the breadcrumb container on first use and prepend it to
        // the content area so it appears above the table data.
        el = document.createElement('div');
        el.id = 'nav-breadcrumb';
        el.style.cssText = 'font-size:11px;margin:0.3rem 0;color:var(--muted);';
        document.getElementById('content').prepend(el);
      }

      // Nothing to show when there is no navigation history.
      if (S.navHistory.length === 0) { el.style.display = 'none'; return; }

      // --- Build the breadcrumb HTML ---

      // "Back" link: pops the most recent entry (same as browser back)
      var html = '<a href="#" id="nav-back" style="color:var(--link);" title="Go back to previous table">&#8592; Back</a>';

      // "Clear path" link: discards the entire trail and hides the breadcrumb
      html += ' | <a href="#" id="nav-clear" class="nav-clear-link" title="Clear navigation trail">Clear path</a>';

      // Separator before the breadcrumb trail
      html += ' | ';

      // Each history entry becomes a clickable link.  Clicking it
      // truncates the trail to that index and loads the table, letting
      // the user jump directly to any ancestor in a deep FK chain
      // (e.g. users > orders > order_items > products -- clicking
      // "orders" jumps straight there).
      html += S.navHistory.map(function(h, idx) {
        return '<a href="#" class="nav-crumb" data-idx="' + idx + '" '
          + 'style="color:var(--link);" '
          + 'title="Jump to ' + esc(h.table) + '">'
          + esc(h.table) + '</a>';
      }).join(' &#8594; ');

      // The current table is the final segment -- shown as bold, not
      // clickable, because it is already the active view.
      html += ' &#8594; <strong>' + esc(S.currentTableName || '') + '</strong>';

      el.innerHTML = html;
      el.style.display = 'block';

      // --- Bind event handlers ---

      // Back button: pop the last entry and navigate to it
      var backBtn = document.getElementById('nav-back');
      if (backBtn) {
        backBtn.onclick = function(e) {
          e.preventDefault();
          var prev = S.navHistory.pop();
          if (prev) {
            S.setOffset(prev.offset || 0);
            loadTable(prev.table);
            if (prev.filter) document.getElementById('row-filter').value = prev.filter;
            // Persist after popping so refresh reflects the shorter trail
            saveNavHistory();
            renderBreadcrumb();
          }
        };
      }

      // Clear path button: discard everything and hide the breadcrumb
      var clearBtn = document.getElementById('nav-clear');
      if (clearBtn) {
        clearBtn.onclick = function(e) {
          e.preventDefault();
          clearNavHistory();
          renderBreadcrumb();
        };
      }

      // Clickable breadcrumb steps: truncate the history to the clicked
      // index and load that table.  For example, if the trail is
      // [A, B, C] and the user clicks B (index 1), we keep [A] in
      // history and load B.
      el.querySelectorAll('.nav-crumb').forEach(function(crumb) {
        crumb.onclick = function(e) {
          e.preventDefault();
          var idx = parseInt(crumb.getAttribute('data-idx'), 10);
          if (isNaN(idx) || idx < 0 || idx >= S.navHistory.length) return;

          // The clicked entry becomes the new current table.  Everything
          // after it in the trail is discarded (truncated).
          var target = S.navHistory[idx];

          // Keep only entries *before* the clicked index -- those are
          // the ancestors of the table we are about to navigate to.
          S.navHistory.length = idx;

          // Restore the pagination offset and filter from the target
          // entry so the user returns to the exact view they had before.
          S.setOffset(target.offset || 0);
          loadTable(target.table);
          if (target.filter) document.getElementById('row-filter').value = target.filter;

          // Persist the truncated trail
          saveNavHistory();
          renderBreadcrumb();
        };
      });
    }
