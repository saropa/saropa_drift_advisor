/**
 * Pure utility functions shared across the web viewer.
 * No shared state dependencies — these are safe to import anywhere.
 */

/**
 * HTML-escape for BOTH text and attribute contexts.
 *
 * BUG FIX: the previous textContent -> innerHTML round-trip escaped only
 * & < > — the HTML serializer never escapes quotes inside a text node — so
 * any value containing a double quote broke out of `attr="..."` and the rest
 * of the value was parsed as further attributes (event-handler injection).
 * Escaping the quotes explicitly closes that hole for all ~325 call sites at
 * once, rather than auditing each sink for text-vs-attribute position.
 */
export function esc(s: unknown): string {
  if (s == null) return '';
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Per-button stash of the original child nodes, keyed by the button element.
 *
 * BUG FIX: this used to round-trip through a `data-busy-restore` attribute
 * holding `btn.innerHTML` as a string, then restore via `btn.innerHTML =
 * stashed`. That is a DOM-text-reinterpreted-as-HTML pattern: any markup
 * captured off the live DOM (which may itself carry escaped user content,
 * e.g. a table/column name rendered into a button label) gets re-parsed as
 * HTML on the way back out. Stashing actual DOM nodes and reinserting them
 * with `replaceChildren` avoids the string round-trip entirely — nothing is
 * ever re-parsed.
 */
const busyRestoreStash = new WeakMap<HTMLElement, Node[]>();

/**
 * Shows a small spinning indicator plus label inside a button while a slow request runs.
 *
 * On the way in we stash the button's ORIGINAL child nodes (icon span + label) and,
 * on the way out, reinsert those same nodes verbatim. Restoring via
 * `textContent = label` (the old behavior) discarded any child markup — for the
 * Run button that meant the `<span class="material-symbols-outlined">play_arrow</span>`
 * icon was replaced by the literal ligature text "play_arrow Run" after the first
 * run. Restoring the stashed nodes keeps the icon. The `label` arg is now only a
 * fallback for buttons that were never stashed (defensive — every caller stashes
 * by going through the loading=true branch first).
 */
export function setButtonBusy(btn: HTMLElement | null | undefined, loading: boolean, label: string): void {
  if (!btn) return;
  if (loading) {
    // Stash once: a double loading=true (e.g. re-entrant click) must not overwrite
    // the real original markup with the spinner markup.
    if (!busyRestoreStash.has(btn)) {
      busyRestoreStash.set(btn, Array.from(btn.childNodes));
    }
    btn.classList.add('btn-busy');
    const spinner = document.createElement('span');
    spinner.className = 'btn-busy-spinner';
    spinner.setAttribute('aria-hidden', 'true');
    const labelSpan = document.createElement('span');
    labelSpan.className = 'btn-busy-label';
    labelSpan.textContent = label;
    btn.replaceChildren(spinner, labelSpan);
  } else {
    btn.classList.remove('btn-busy');
    const stashed = busyRestoreStash.get(btn);
    if (stashed != null) {
      btn.replaceChildren(...stashed);
      busyRestoreStash.delete(btn);
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

/**
 * Builds the `/api/table/<name>` data URL with the paging query parameters.
 *
 * BUG FIX (plans/history/2026.09/20260902/080): `table-list.ts` used to inline this string and a
 * mechanical rename of the state variable (`limit` -> `S.limit`) was applied
 * *inside* the string literal, so the request went out as
 * `?S.limit=200&S.offset=200`. The Dart server only reads `limit`/`offset`
 * (`ServerConstants.queryParamLimit`/`queryParamOffset`) and silently ignores
 * unknown parameters, so it applied its defaults and returned page 1 for every
 * page while the pagination bar — which derives its text from client state —
 * claimed otherwise. Centralizing the construction here gives the two call
 * sites (Tables view and Search tab) one source of truth, so they cannot
 * drift apart again, and gives the parameter names a single place to be
 * pinned by a test.
 *
 * @param name Table name; encoded because table names may contain `/`, `#`, etc.
 * @param limit Page size (server parameter `limit`).
 * @param offset Row offset of the first row on the page (server parameter `offset`).
 */
export function buildTableDataUrl(name: string, limit: number | string, offset: number | string): string {
  return '/api/table/' + encodeURIComponent(name) + '?limit=' + limit + '&offset=' + offset;
}
