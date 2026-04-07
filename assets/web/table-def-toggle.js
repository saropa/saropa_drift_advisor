/**
 * Table definition collapsible toggle — self-contained module.
 *
 * Adds collapsible ▼/▲ behavior to the table definition panel rendered
 * by `buildTableDefinitionHtml` in app.js. Uses event delegation on the
 * document so it works regardless of when the panel HTML is injected.
 *
 * Collapsed by default — the heading shows "▼ Table definition" and
 * the body (column list) is hidden. Click to expand/collapse.
 *
 * DOM contract (from app.js `buildTableDefinitionHtml`):
 *   .table-definition-wrap     — outer container
 *   .table-definition-heading  — clickable header (toggle target)
 *   .table-definition-scroll   — scrollable column table (hidden/shown)
 *
 * This module injects its own <style> block so no edits to style.scss
 * or style.css are needed. Loaded as a separate <script> by
 * html_content.dart, after app.js.
 */
(function initTableDefToggle() {
  'use strict';

  // --- Inject scoped styles ---------------------------------------------------
  // Keeps all collapsible styling in this module. The heading becomes a
  // clickable link-colored toggle; the scroll container is hidden when
  // the wrap has the .td-collapsed class.
  var style = document.createElement('style');
  style.textContent =
    '/* table-def-toggle.js — collapsible table definition styles */\n' +
    '.table-definition-heading {\n' +
    '  cursor: pointer;\n' +
    '  user-select: none;\n' +
    '  color: var(--link);\n' +
    '  font-size: 0.875rem;\n' +
    '  padding: 0.25rem 0;\n' +
    '}\n' +
    '.table-definition-heading:hover { text-decoration: underline; }\n' +
    '.td-collapsed .table-definition-scroll { display: none; }\n';
  document.head.appendChild(style);

  // --- Event delegation -------------------------------------------------------
  // Listen for clicks on any .table-definition-heading, toggle the
  // .td-collapsed class on the parent .table-definition-wrap, and swap
  // the ▼/▲ arrow prefix in the heading text.
  document.addEventListener('click', function (e) {
    var heading = e.target.closest && e.target.closest('.table-definition-heading');
    if (!heading) return;

    var wrap = heading.closest('.table-definition-wrap');
    if (!wrap) return;

    var isCollapsed = wrap.classList.toggle('td-collapsed');
    heading.textContent = isCollapsed
      ? '\u25BC Table definition'
      : '\u25B2 Table definition';
  });

  // --- Apply default collapsed state to any already-rendered panels -----------
  // On load, find all existing table-definition-wrap elements and collapse them.
  // Future panels (rendered after navigation) are handled by the delegation above.
  var existing = document.querySelectorAll('.table-definition-wrap');
  for (var i = 0; i < existing.length; i++) {
    existing[i].classList.add('td-collapsed');
    var h = existing[i].querySelector('.table-definition-heading');
    if (h) h.textContent = '\u25BC Table definition';
  }
})();
