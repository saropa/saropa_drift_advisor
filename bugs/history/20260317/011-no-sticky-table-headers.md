# BUG-011: No sticky table headers when scrolling

## Severity: Significant

## Component: Web UI

## File: `lib/src/server/html_content.dart`

## Description

When scrolling through wide or tall data tables, the column headers scroll off
screen. Users lose context about which column they are looking at, especially
with tables that have many columns requiring horizontal scrolling.

## Impact

- Users must scroll back to the top to check column names, then scroll back down
  to find their row — tedious and error-prone
- Wide tables with 10+ columns become very difficult to navigate
- Data review tasks take significantly longer

## Steps to Reproduce

1. Open a table with many rows (100+) and many columns (8+)
2. Scroll down past the header row
3. Observe: column headers are no longer visible
4. Scroll horizontally — still no header context

## Expected Behavior

- Column headers should be sticky (CSS `position: sticky; top: 0`)
- Headers should remain visible during both vertical and horizontal scrolling
- Consider also making the first column (often a PK/ID) sticky for horizontal
  scrolling context
