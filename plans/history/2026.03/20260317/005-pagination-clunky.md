# BUG-005: Pagination UX is clunky and unintuitive — IMPLEMENTED

## Status

Fully implemented. Table pagination is now page-based with First/Last, page dropdown, status text, and raw offset under Advanced.

## Summary

- **Toolbar:** Rows-per-page selector; status "Showing X–Y of Z rows" (or "Page N (total unknown)"); First | Prev | Page [dropdown] of N | Next | Last; Advanced toggle (Offset + Apply); Clear state.
- **Logic:** `goToOffset(newOffset)` centralizes navigation; `updatePaginationBar(total)` keeps bar in sync; current page clamped when offset is past end so dropdown always has a valid selection; `setupPagination()` guarded for missing DOM.
- **UX:** Disabled states for First/Prev on page 1, Next/Last on last page; 0.15s opacity transition on nav buttons; "(past end of results)" in table status bar unchanged.

## Files changed

- `lib/src/server/html_content.dart` — Pagination bar markup (status, nav, Advanced section, aria attributes).
- `assets/web/app.js` — `goToOffset`, `updatePaginationBar`, First/Last handlers, page dropdown, Advanced toggle; count callback calls `updatePaginationBar(o.count)`.
- `assets/web/style.scss` / `assets/web/style.css` — `.pagination-toolbar`, status, nav, page select, Advanced toggle/panel, button transition.

## Original description (abbreviated)

Offset had to be typed manually; no total count, no "past end" message, no First/Last, limit/offset unclear. All addressed: page-based nav, status bar, past-end message, First/Last, raw offset in Advanced.
