# BUG-006: Query Builder too limited for intermediate users

**Implemented 2025-03-17.** Query builder now supports AND/OR connectors between WHERE conditions (dropdown on 2nd+ rows), live SQL preview, and state capture/restore. Parenthetical grouping deferred.

---

## Severity: Significant

## Component: Web UI

## File: `assets/web/app.js` (implementation); `lib/src/server/html_content.dart` (HTML shell only)

## Description

The visual query builder only supported flat WHERE conditions — one condition per row with no way to combine them using AND/OR logic or nest with parentheses. This created a gap between "beginner-friendly query builder" and "write raw SQL".

## Impact

- Users who need multi-condition queries had to drop to raw SQL
- No way to express OR logic (e.g., "role = 'admin' OR role = 'moderator'")
- No subquery support for more advanced lookups

## Resolution (implemented)

- **AND/OR connectors:** Second and subsequent WHERE rows show an AND/OR dropdown; SQL and live preview use chosen connectors. State captured and restored on Run query / table switch.
- **Parenthetical grouping / condition groups:** Not implemented; left for future enhancement.
