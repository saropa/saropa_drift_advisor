# BUG-006: Query Builder too limited for intermediate users

## Severity: Significant

## Component: Web UI

## File: `lib/src/server/html_content.dart`

## Description

The visual query builder only supports flat WHERE conditions — one condition per
row with no way to combine them using AND/OR logic or nest with parentheses.
This creates a gap between "beginner-friendly query builder" and "write raw SQL",
with nothing serving intermediate users.

## Impact

- Users who need multi-condition queries (e.g., "status = 'active' AND
  created_at > '2024-01-01'") must drop to raw SQL
- The query builder is effectively limited to single-condition filters
- No way to express OR logic (e.g., "role = 'admin' OR role = 'moderator'")
- No subquery support for more advanced lookups

## Steps to Reproduce

1. Open a table in the web UI
2. Open the Query Builder
3. Add a WHERE condition (e.g., `status = 'active'`)
4. Try to add a second condition with AND/OR logic — not possible
5. Try to group conditions with parentheses — not possible

## Expected Behavior

- Support multiple WHERE conditions with AND/OR connectors
- Show a connector dropdown (AND/OR) between conditions
- Optional: support parenthetical grouping for complex expressions
- Live SQL preview should update to reflect compound conditions
- Consider a "condition group" concept for nested logic
