# History sidebar — filter-by-SQL search box

The web viewer's History sidebar listed query-execution rows that could only be
narrowed by source (All / Browser / App / Internal), so finding a specific query
among many runs meant scrolling. A free-text search box was added above the list
to filter rows whose SQL contains the typed text.

## Finish Report (2026-06-26)

### Change

A `<input type="search" id="history-search">` was added to the History sidebar
markup, positioned between the source-filter button bar and the entry list. It
filters the in-memory history cache client-side: each keystroke re-renders the
list against entries whose SQL contains the typed text (case-insensitive
substring), combined with the existing source filter (both constraints must
pass). No server round-trip is involved.

### Files

- `lib/src/server/html_content.dart` — added the search `<input>` to the inline
  HTML shell, between `.history-filter-bar` and `#query-history-list`. The input
  carries an `aria-label`; its placeholder is set at runtime (see below) so the
  translated string is the single source of truth.
- `assets/web/history-filter.ts` (new) — pure, DOM-free predicate
  `entryMatchesHistoryFilter(entry, sourceFilter, query)` holding the combined
  source-equality + case-insensitive SQL-substring match. Extracted so it is
  unit-testable in isolation; the parent module's transitive imports
  (`tabs.ts`, `table-view.ts`) execute DOM code at load and cannot run under
  `node --test`. Mirrors the existing `schema-explorer-logic.ts` /
  `home-search.ts` split-for-testability convention.
- `assets/web/history-sidebar.ts` — added `searchQuery` state and `searchEl`
  reference; `filtered()` now delegates per-entry matching to
  `entryMatchesHistoryFilter`; the empty state distinguishes "no queries yet"
  from "no queries match <text>"; `initHistorySidebar()` sets the placeholder
  via `vt()` and wires an `input` listener that updates `searchQuery` (trimmed,
  as-typed so the no-match message echoes it) and re-renders.
- `assets/web/l10n/strings-web-nav.ts` — added `viewer.nav.history.searchPlaceholder`
  ("Filter by SQL…") and `viewer.nav.history.noMatch` ("No queries match
  "{0}".") to the web viewer's string registry.
- `assets/web/_history-sidebar.scss` — added `.history-search` styling using
  theme tokens (border, radius, monospace text, focus ring). `type="search"`
  provides the browser-native clear affordance.
- `assets/web/test/history-filter.test.mjs` (new) — 7 cases over the predicate:
  source-only filtering, blank-query passthrough, case-insensitive substring,
  whitespace trimming, exclusion, and combined source+text (both must pass).
- `assets/web/bundle.js`, `assets/web/style.css` — regenerated from the TS/SCSS
  sources via `npm run build`.
- `CHANGELOG.md` — `Added` entry under `[Unreleased]`.
- `bugs/UX_issues.md` — the "history sidebar needs a searchbox" line struck
  through as done (running checklist, not a single archivable bug report).

### Verification

- `npm run typecheck:web` (`tsc -p tsconfig.web.json --noEmit`) — clean.
- `node --test assets/web/test/history-filter.test.mjs` — 7 pass, 0 fail.
- `npm run build` — bundle.js and style.css regenerated without error.

### Notes

- Filtering re-renders the whole list per keystroke against the bounded
  in-memory history cache; no debounce was added because the list size is
  server-capped and the work is a synchronous substring scan.
