/**
 * Search, filter, and match-navigation helpers.
 * Extracted from app.js — all shared state accessed via S.*.
 */
import * as S from './state.ts';
import { esc } from './utils.ts';

export function escapeRe(s) {
      return s.replace(/[\\\\^\$*+?.()|[\]{}]/g, '\\\\$&');
    }
export function highlightText(text, term) {
      if (!term || term.length === 0) return esc(text);
      const re = new RegExp('(' + escapeRe(term) + ')', 'gi');
      var result = '';
      var lastEnd = 0;
      var match;
      while ((match = re.exec(text)) !== null) {
        result += esc(text.slice(lastEnd, match.index)) + '<span class="highlight">' + esc(match[1]) + '</span>';
        lastEnd = re.lastIndex;
      }
      result += esc(text.slice(lastEnd));
      return result;
    }

export function getScope() { return document.getElementById('search-scope').value || ''; }
export function getSearchTerm() { return String(document.getElementById('search-input').value || '').trim(); }
export function getRowFilter() { return String(document.getElementById('row-filter').value || '').trim(); }
    /** When true, table shows only rows matching the row filter; when false, shows all rows. */
export function filterRows(data) {
      const term = getRowFilter();
      if (!term || !data || data.length === 0) return data || [];
      const lower = term.toLowerCase();
      return data.filter(row => Object.values(row).some(v => v != null && String(v).toLowerCase().includes(lower)));
    }
    /** Returns the data to display for the table: filtered or all rows depending on S.showOnlyMatchingRows. */
export function getTableDisplayData(data) {
      if (!data || data.length === 0) return data || [];
      if (S.showOnlyMatchingRows && getRowFilter()) return filterRows(data);
      return data;
    }

    /**
     * Builds the filter-status suffix for table meta text (row count line).
     * @param {number} filteredLen - Number of rows matching the row filter
     * @param {number} totalLen - Total rows in the table
     * @returns {string} Empty, " (filtered: X of Y)", or " (showing all rows; filter: X match)"
     */
export function buildTableFilterMetaSuffix(filteredLen, totalLen) {
      if (!getRowFilter()) return '';
      if (S.showOnlyMatchingRows) return ' (filtered: ' + filteredLen + ' of ' + totalLen + ')';
      return ' (showing all rows; filter: ' + filteredLen + ' match)';
    }

    // Expand any collapsed section that contains the given DOM element.
    // Walks up the DOM tree looking for a .collapsible-body.collapsed parent,
    // then clicks its preceding .collapsible-header sibling to trigger the
    // existing expand logic (which may lazy-load content and update the arrow).
export function expandSectionContaining(el) {
      var node = el;
      while (node && node !== document.body) {
        if (node.classList && node.classList.contains('collapsible-body') && node.classList.contains('collapsed')) {
          var prev = node.previousElementSibling;
          if (prev && prev.classList.contains('collapsible-header')) {
            prev.click();
          }
        }
        node = node.parentElement;
      }
    }

export function applySearch() {
      const term = getSearchTerm();
      const scope = getScope();
      const navEl = document.getElementById('search-nav');
      const countEl = document.getElementById('search-count');
      const isSearchPanel = S.activeTabId === 'search';
      const root = isSearchPanel ? document.getElementById('search-results-content') : null;

      function getEl(mainId, panelId) {
        if (isSearchPanel && root) {
          var el = root.querySelector('#' + panelId);
          return el || null;
        }
        return document.getElementById(mainId);
      }
      const schemaPre = getEl('schema-pre', 'search-panel-schema-pre');
      const contentPre = getEl('content-pre', 'search-panel-content-pre');
      var dataTable = getEl('data-table', 'search-panel-data-table');

      // --- Phase 1: Apply highlight markup to matching text ---
      if (schemaPre && S.lastRenderedSchema !== null && (scope === 'schema' || scope === 'both')) {
        schemaPre.innerHTML = term ? highlightText(S.lastRenderedSchema, term) : esc(S.lastRenderedSchema);
      }
      if (contentPre && S.lastRenderedSchema !== null && scope === 'schema') {
        contentPre.innerHTML = term ? highlightText(S.lastRenderedSchema, term) : esc(S.lastRenderedSchema);
      }
      if (dataTable && (scope === 'data' || scope === 'both')) {
        dataTable.querySelectorAll('td').forEach(function(td) {
          if (!td.querySelector('.fk-link')) {
            var copyBtn = td.querySelector('.cell-copy-btn');
            var textNodes = [];
            td.childNodes.forEach(function(n) { if (n !== copyBtn) textNodes.push(n.textContent || ''); });
            var text = textNodes.join('');
            var highlighted = term ? highlightText(text, term) : esc(text);
            if (copyBtn) {
              var btnHtml = copyBtn.outerHTML;
              td.innerHTML = highlighted + btnHtml;
            } else {
              td.innerHTML = highlighted;
            }
          }
        });
      }

      // --- Phase 2: Build navigable match list from highlight spans in the active panel ---
      S.setSearchMatches([]);
      S.setSearchCurrentIndex(-1);

      if (term) {
        var searchRoot = isSearchPanel && root ? root : document;
        S.setSearchMatches(Array.from(searchRoot.querySelectorAll ? searchRoot.querySelectorAll('.highlight') : []));
      }

      // --- Phase 3: Update navigation UI visibility and state ---
      if (S.searchMatches.length > 0) {
        navEl.style.display = 'flex';
        navigateToMatch(0);
      } else {
        // Show "No matches" when user typed something, hide entirely when empty
        navEl.style.display = term ? 'flex' : 'none';
        countEl.textContent = term ? 'No matches' : '';
        document.getElementById('search-prev').disabled = true;
        document.getElementById('search-next').disabled = true;
      }
    }

    // Navigate to a specific match by zero-based index in S.searchMatches.
    // Removes highlight-active from old match, applies to new, scrolls into view.
export function navigateToMatch(index) {
      var countEl = document.getElementById('search-count');
      var prevBtn = document.getElementById('search-prev');
      var nextBtn = document.getElementById('search-next');

      if (S.searchMatches.length === 0) return;

      // Wrap around: past last loops to first, before first loops to last
      if (index < 0) index = S.searchMatches.length - 1;
      if (index >= S.searchMatches.length) index = 0;

      // Remove active class from previously focused match
      if (S.searchCurrentIndex >= 0 && S.searchCurrentIndex < S.searchMatches.length) {
        S.searchMatches[S.searchCurrentIndex].classList.remove('highlight-active');
      }

      S.setSearchCurrentIndex(index);

      // Apply active class to the newly focused match
      var current = S.searchMatches[S.searchCurrentIndex];
      current.classList.add('highlight-active');

      // Expand any collapsed section containing this match
      expandSectionContaining(current);

      // Scroll match into viewport, centered vertically.
      // Uses 'auto' (instant) to avoid competing smooth-scroll animations
      // when applySearch fires rapidly on each keystroke.
      current.scrollIntoView({ behavior: 'auto', block: 'center', inline: 'nearest' });

      // Update "X of Y" counter (1-based for display)
      countEl.textContent = (S.searchCurrentIndex + 1) + ' of ' + S.searchMatches.length;

      // Both buttons always enabled (wrap-around navigation)
      prevBtn.disabled = false;
      nextBtn.disabled = false;
    }

    // Move to the next match (wraps to first after last)
export function nextMatch() {
      if (S.searchMatches.length === 0) return;
      navigateToMatch(S.searchCurrentIndex + 1);
    }

    // Move to the previous match (wraps to last before first)
export function prevMatch() {
      if (S.searchMatches.length === 0) return;
      navigateToMatch(S.searchCurrentIndex - 1);
    }
