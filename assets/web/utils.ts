/**
 * Pure utility functions shared across the web viewer.
 * No shared state dependencies — these are safe to import anywhere.
 */

/** HTML-escape a string for safe insertion into innerHTML. */
export function esc(s: unknown): string {
  if (s == null) return '';
  const d = document.createElement('div');
  d.textContent = String(s);
  return d.innerHTML;
}

/**
 * Shows a small spinning indicator plus label inside a button while a slow request runs.
 *
 * On the way in we stash the button's ORIGINAL innerHTML (icon span + label) in a
 * data attribute and, on the way out, restore that markup verbatim. Restoring via
 * `textContent = label` (the old behavior) discarded any child markup — for the
 * Run button that meant the `<span class="material-symbols-outlined">play_arrow</span>`
 * icon was replaced by the literal ligature text "play_arrow Run" after the first
 * run. Restoring the stashed HTML keeps the icon. The `label` arg is now only a
 * fallback for buttons that were never stashed (defensive — every caller stashes
 * by going through the loading=true branch first).
 */
export function setButtonBusy(btn: HTMLElement | null | undefined, loading: boolean, label: string): void {
  if (!btn) return;
  if (loading) {
    // Stash once: a double loading=true (e.g. re-entrant click) must not overwrite
    // the real original markup with the spinner markup.
    if (btn.getAttribute('data-busy-restore') == null) {
      btn.setAttribute('data-busy-restore', btn.innerHTML);
    }
    btn.classList.add('btn-busy');
    btn.innerHTML =
      '<span class="btn-busy-spinner" aria-hidden="true"></span>' +
      '<span class="btn-busy-label">' + esc(label) + '</span>';
  } else {
    btn.classList.remove('btn-busy');
    const stashed = btn.getAttribute('data-busy-restore');
    if (stashed != null) {
      btn.innerHTML = stashed;
      btn.removeAttribute('data-busy-restore');
    } else {
      btn.textContent = label;
    }
  }
}

/** SQL syntax highlighting; uses the sql-highlight module when loaded. */
export function highlightSqlSafe(sql: string | null | undefined): string {
  if (sql == null) return '';
  return (typeof window.sqlHighlight === 'function' && window.sqlHighlight(sql)) || esc(sql);
}

/**
 * Formats a row count for sidebar, browse cards, and dropdowns: thousands
 * separators, no "rows" suffix (callers add parentheses where needed).
 */
export function formatTableRowCountDisplay(n: number | string): string {
  const num = Number(n);
  if (!isFinite(num)) return String(n);
  return num.toLocaleString('en-US');
}

/** Syncs .feature-card.expanded with collapsible open state. */
export function syncFeatureCardExpanded(collapsible: Element | null): void {
  const card = collapsible && collapsible.closest && collapsible.closest('.feature-card');
  if (card) card.classList.toggle('expanded', !collapsible.classList.contains('collapsed'));
}
