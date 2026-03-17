# BUG-016: No column reordering or hiding in data tables

## Severity: Significant

## Component: Web UI

## File: `lib/src/server/html_content.dart`

## Description

Data table columns are always displayed in schema definition order with no way
to reorder, hide, or pin specific columns. Wide tables with many columns force
horizontal scrolling, and users cannot prioritize which columns are visible.

## Impact

- Tables with 10+ columns require excessive horizontal scrolling
- Users debugging a specific column must scroll past irrelevant columns each time
- No way to focus on a subset of columns without writing a custom SELECT query
- Common debugging workflow: check 2-3 specific columns across many rows —
  currently requires constant horizontal scrolling

## Steps to Reproduce

1. Open a table with 10+ columns
2. Try to hide columns that are not relevant — not possible
3. Try to drag a column to reorder — not possible
4. Try to pin the ID column while scrolling — not possible

## Expected Behavior

- Column header context menu with "Hide column" option
- Drag-and-drop column reordering
- "Pin column" option to freeze a column during horizontal scrolling
- "Column chooser" UI showing all columns with show/hide checkboxes
- Persist column preferences per table in localStorage
