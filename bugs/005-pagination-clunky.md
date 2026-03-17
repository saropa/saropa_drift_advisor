# BUG-005: Pagination UX is clunky and unintuitive

## Severity: Significant

## Component: Web UI

## File: `lib/src/server/html_content.dart`

## Description

The pagination controls require users to manually type a raw offset number
instead of providing a page-based navigation experience. Several usability
issues compound the problem:

1. Offset must be typed as a raw number — no "page 1, 2, 3..." concept
2. No total row count shown alongside pagination controls
3. Requesting an offset beyond total rows shows an empty table with no
   explanation (no "no more results" message)
4. No "jump to first page" or "jump to last page" buttons
5. The relationship between limit and offset is not obvious to non-technical
   users

## Impact

- Non-technical users (designers, PMs debugging data) struggle with offset-based
  pagination
- Users don't know how many total rows exist or how many pages of data there are
- Overshooting the offset produces a confusing empty result

## Steps to Reproduce

1. Open a table with 500 rows
2. Set limit to 50
3. Try to navigate to "page 5" — must manually calculate offset = 200
4. Set offset to 9999 — shows empty table with no explanation

## Expected Behavior

- Show total row count (e.g., "Showing 1-50 of 500 rows")
- Page-based navigation (Page 1, 2, 3 ... 10) or at minimum clear Prev/Next
  with page indicator
- Show "No more results" when offset exceeds total rows
- First/Last page buttons
- Keep the raw offset input available as an advanced option
