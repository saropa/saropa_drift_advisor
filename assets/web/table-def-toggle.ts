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
 * or style.css are needed.
 */

/** Initialises collapsible table-definition toggles. */
export function initTableDefToggle(): void {
  // --- Inject scoped styles ---------------------------------------------------
  // Keeps all collapsible styling in this module. The heading becomes a
  // clickable link-colored toggle; the scroll container is hidden when
  // the wrap has the .td-collapsed class.
  const style = document.createElement('style');
  style.textContent =
    '/* table-def-toggle — collapsible table definition styles */\n' +
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
  document.addEventListener('click', (e: Event) => {
    const target = e.target as Element;
    const heading = target.closest && target.closest('.table-definition-heading');
    if (!heading) return;

    const wrap = heading.closest('.table-definition-wrap');
    if (!wrap) return;

    const isCollapsed = wrap.classList.toggle('td-collapsed');
    heading.textContent = isCollapsed
      ? '\u25BC Table definition'
      : '\u25B2 Table definition';
  });

  // --- Apply default collapsed state to any already-rendered panels -----------
  // On load, find all existing table-definition-wrap elements and collapse them.
  // Future panels (rendered after navigation) are handled by the delegation above.
  const existing = document.querySelectorAll('.table-definition-wrap');
  for (let i = 0; i < existing.length; i++) {
    existing[i].classList.add('td-collapsed');
    const h = existing[i].querySelector('.table-definition-heading');
    if (h) h.textContent = '\u25BC Table definition';
  }
}
