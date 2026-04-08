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
 * When loading is false, restores plain text (drops spinner markup).
 */
export function setButtonBusy(btn: HTMLElement | null | undefined, loading: boolean, label: string): void {
  if (!btn) return;
  if (loading) {
    btn.classList.add('btn-busy');
    btn.innerHTML =
      '<span class="btn-busy-spinner" aria-hidden="true"></span>' +
      '<span class="btn-busy-label">' + esc(label) + '</span>';
  } else {
    btn.classList.remove('btn-busy');
    btn.textContent = label;
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
