/**
 * Table definition collapsible toggle — self-contained module.
 *
 * Adds collapsible behavior to the table definition panel rendered
 * by `buildTableDefinitionHtml` in app.js. Uses event delegation on the
 * document so it works regardless of when the panel HTML is injected.
 *
 * Collapsed by default — the body (column list) is hidden. The expand/collapse
 * chevron is a CSS ::after on the heading keyed off the .td-collapsed class
 * (defined in _query-builder.scss), so the arrow is never part of the text.
 * Click the heading to expand/collapse.
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
    // Underline only the label span so hovering the tool buttons (meta toggle,
    // copy JSON/Flutter) doesn't drag an underline across the icons.
    '.table-definition-heading:hover .table-definition-heading-label { text-decoration: underline; }\n' +
    '.td-collapsed .table-definition-scroll { display: none; }\n';
  document.head.appendChild(style);

  // --- Event delegation -------------------------------------------------------
  // Listen for clicks on any .table-definition-heading and toggle the
  // .td-collapsed class on the parent .table-definition-wrap. The chevron
  // direction follows from that class via CSS ::after — no text mutation.
  document.addEventListener('click', (e: Event) => {
    const target = e.target as Element;
    const heading = target.closest && target.closest('.table-definition-heading');
    if (!heading) return;

    // The heading hosts the meta/export tool buttons (table-def-meta.ts). Both
    // that module and this one delegate clicks on `document`, so stopPropagation
    // in the meta handler cannot stop this same-target listener from also firing.
    // Bail out explicitly when the click came from a tool button so a tool click
    // never also collapses/expands the panel.
    if (target.closest && target.closest('.table-def-tool')) return;

    const wrap = heading.closest('.table-definition-wrap');
    if (!wrap) return;

    // Chevron direction follows .td-collapsed via CSS ::after \u2014 no text mutation.
    wrap.classList.toggle('td-collapsed');
  });

  // --- Apply default collapsed state to any already-rendered panels -----------
  // On load, collapse wraps that predate this init (e.g. tests). New markup from
  // buildTableDefinitionHtml includes td-collapsed so dynamic re-renders stay collapsed.
  // Open-by-default: skip this loop (see buildTableDefinitionHtml in table-view.ts).
  const existing = document.querySelectorAll('.table-definition-wrap');
  for (let i = 0; i < existing.length; i++) {
    existing[i].classList.add('td-collapsed');
  }
}
