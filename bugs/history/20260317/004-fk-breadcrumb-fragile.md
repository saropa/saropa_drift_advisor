# BUG-004: FK breadcrumb navigation is fragile

## Status: RESOLVED

## Summary

All 4 requirements implemented in `lib/src/server/html_content.dart`:

1. **Clickable breadcrumb steps** — each historical table in the trail is a link; clicking jumps directly to that table by truncating the trail
2. **localStorage persistence** — `saveNavHistory()` / `loadNavHistory()` persist the trail across page refreshes using `drift-viewer-nav-history` key
3. **"Clear path" button** — discards the entire breadcrumb trail
4. **Back button persists** — popping the last entry also saves to localStorage
5. **Page-load restoration** — on load, validates restored entries against the current table list and truncates at the first dropped table

## Files Changed

- `lib/src/server/html_content.dart` — NAV_HISTORY_KEY constant, saveNavHistory/loadNavHistory/clearNavHistory functions, rewritten renderBreadcrumb with clickable steps, page-load restoration with validation

## Original Report

The foreign key navigation breadcrumb trail had several usability issues:
back button only went one step, no way to jump to earlier steps, entire
history lost on page refresh, and breadcrumb steps were not clickable.
