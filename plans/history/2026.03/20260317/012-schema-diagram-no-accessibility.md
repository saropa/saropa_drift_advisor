# BUG-012: SVG schema diagram has no accessibility support

## Status: RESOLVED

## Severity: Significant

## Component: Web UI / Server

## Files: `lib/src/server/html_content.dart`

## Resolution

All accessibility gaps addressed in `html_content.dart`:

- **SVG root**: `role="group"` + `aria-label` announcing table/FK count
- **Table boxes**: `tabindex="0"`, `role="button"`, `aria-label` with table name, column count, and PK info
- **Keyboard navigation**: Enter/Space activates table; arrow keys navigate grid layout
- **FK paths**: `<title>` tooltips describing each relationship (e.g. "posts.user_id → users.id")
- **Text alternative**: screen-reader-only `<div>` with structured HTML list of all tables and FK relationships
- **Focus styles**: visible focus ring on keyboard-focused table boxes
- **Instructional text**: updated to mention keyboard controls

WCAG criteria addressed: 1.1.1 (Non-text Content), 2.1.1 (Keyboard), 4.1.2 (Name, Role, Value), 1.3.1 (Info and Relationships).
