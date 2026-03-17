# BUG-007: Import UX is bare-bones

## Severity: Significant

## Component: Web UI

## File: `lib/src/server/html_content.dart`

## Status

- **Item 1 (column mapping UI for CSV)** — **Implemented.** Web UI now shows "Map CSV columns to table columns" when format is CSV: each CSV header has a dropdown to select a table column or "(skip)". POST /api/import accepts optional `columnMapping` (CSV header → table column). Backend dedupes duplicate table-column targets (last wins). See CHANGELOG and doc/API.md.
- Items 2–6 remain open.

## Description

The data import feature lacks several standard import workflow conveniences that
users expect from database tools:

1. ~~No column mapping UI for CSV — headers must exactly match table column names~~ **Done**
2. No data validation preview before committing the import
3. No dry-run option to test import without modifying data
4. No file size limit displayed to the user
5. No progress indicator for large imports
6. No undo/rollback after import

## Impact

- CSV files with differently named columns silently fail or produce errors
- Users cannot verify data will import correctly before committing
- Large imports provide no feedback during processing
- Accidental imports cannot be undone

## Steps to Reproduce

1. Open the web UI and navigate to Import Data
2. Select a CSV file with column names that differ slightly from the table schema
   (e.g., "user_name" vs "username")
3. Import fails with per-row errors but no suggestion to map columns
4. Select a large CSV file — no progress indication during import

## Expected Behavior

- Show a column mapping step for CSV imports (source column → target column)
- Show a preview of the first N rows before committing
- Offer a "dry run" button that validates without writing
- Show a progress bar or row counter during import
- Display file size limits and warn if exceeded
- Consider a "rollback last import" feature using snapshots
