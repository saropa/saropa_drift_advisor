# BUG-003: Search highlights text but doesn't navigate to results

## Status: RESOLVED

## Resolution Summary

Implemented full search result navigation in `lib/src/server/html_content.dart`:

- Auto-scrolls to first match on search input
- Shows "X of Y" match counter with Prev/Next buttons
- Keyboard shortcuts: Enter/Shift+Enter, Ctrl+G/Shift+Ctrl+G, Ctrl+F, Escape
- Active match distinguished with orange highlight + outline (both themes)
- Collapsed sections auto-expand when a match is navigated to
- Stale data table highlights properly cleared when search is emptied

All five expected behaviors from the original report are addressed.

---

## Severity: Critical

## Component: Web UI

## File: `lib/src/server/html_content.dart`

## Description

The global search bar highlights matching text in the page but does not scroll to
the first match or provide "next match" / "previous match" navigation. If the
matching content is below the fold or inside a collapsed section, the user has no
way to find it without manually scrolling the entire page.

## Impact

- Users type a search term, see no visible change, and assume nothing matched
- Matches inside collapsed sections are invisible
- No match count shown (e.g., "3 of 12 matches")
- Large databases with many tables make manual scrolling impractical

## Steps to Reproduce

1. Open the web UI with a database that has many tables
2. Type a table or column name in the search bar
3. Observe: text is highlighted but the page does not scroll to the match
4. If the match is off-screen, there is no indication it exists

## Expected Behavior

- Auto-scroll to the first match on search
- Show match count (e.g., "3 of 12 matches")
- Provide Next/Previous buttons (or keyboard shortcuts like Ctrl+G / Shift+Ctrl+G)
- Expand collapsed sections that contain matches
- Clear highlights and match count when search is cleared
