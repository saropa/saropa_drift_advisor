# PROPOSAL: Extend PII Masking Beyond CSV Export — a Global Mask Toggle for Every Extension Surface

**Status: Open**

Created: 2026-09-02
Type: UX improvement
Related plan: `plans/28-pii-anonymizer.md` (roadmap priority 1, Wow 5→6)

---

## Summary

The extension has a complete PII detector and masker (`extension/src/export/pii-masking.ts`), and it
is wired into exactly one code path: the "CSV (PII masked)" entry in the export quick pick. Table
grids, SQL Notebook results, portable HTML reports, the Mutation Stream, DVR, Global Search, and the
Dashboard all render raw values with no masking option. The browser UI, by contrast, has a
persistent Mask toggle with a MASKED badge. Add a workspace-wide toggle and route every renderer
through the existing masker.

**Wow: 6/10, Effort: Medium**

---

## Motivation

What exists:

```bash
grep -n "^export function" extension/src/export/pii-masking.ts
#  54: isPiiColumn(colName)
#  81: maskPiiValue(colName, value)
# 154: getDisplayValue(colName, value, mask)

grep -rn "pii-masking" extension/src/ | grep -v /test/
# extension/src/export/format-export.ts:10:import { getDisplayValue } from './pii-masking';
```

One consumer. And inside it:

```ts
// extension/src/export/format-export.ts
const mask = o.maskPii === true;                       // :53
.map((c) => escapeCsvCell(mask ? getDisplayValue(c, row[c], true) : row[c]))  // :57
const FORMAT_LABELS = [ ..., { label: 'CSV (PII masked)', key: 'csv', maskPii: true } ];  // :99-102
```

So masking is a single quick-pick choice on `driftViewer.exportTable`. **JSON export is not
maskable at all**, and nothing else in the extension can mask anything.

The README promises more than that: "Mask PII in the viewer" under *Share safely*, and the
Scope-at-a-glance row lists "optional **PII masking**" under Browse & search. That promise is kept
in the browser (hamburger → Mask, MASKED badge in the masthead, applied to table view, search
results, and CSV export) and broken in the extension — a browser-vs-extension parity defect on a
feature whose whole point is not leaking data.

The concrete leak paths today: `driftViewer.exportReport` produces a self-contained HTML file
explicitly intended to be "shared via Slack, attached to bug reports, archived" (README) with every
raw value inlined; `driftViewer.shareSession` produces a URL; `driftViewer.exportDataset` writes a
dataset file. None can mask.

This is also the cheapest first slice of `plans/28-pii-anonymizer.md` (roadmap priority 1, currently
"client-side masking shipped; server side + extension anonymizer unbuilt"): it needs no Dart change
and no new endpoint.

---

## Detection / Behavior

### Should flag (problematic)

Any renderer that writes a cell value to a webview, a file, or the clipboard without consulting the
mask state.

Inventory of unmasked surfaces (all under `extension/src/`):

```
tree/                 Database tree item descriptions / hovers
sql-notebook/         results grid, chart data, history
global-search/        match rows
report/               report-collector.ts + report-html.ts (the shareable artifact)
dashboard/widgets/    data-widgets.ts, query-widgets.ts
mutation-stream/      before/after values
dvr/                  dvr-detail-format.ts result payloads
profiler/             sample values in the distribution panel
comparator/           side-by-side row diff
bulk-edit/            grid cells
hover/                hover preview rows (driftViewer.hover.maxRows)
export/               JSON / SQL formats (only CSV is covered)
session/              shared session payload
```

### Should pass (correct)

1. New setting and command, mirroring the browser:

```jsonc
"driftViewer.pii.maskInUi": { "type": "boolean", "default": false, "description": "%config.pii.maskInUi.description%" },
"driftViewer.pii.maskInExports": { "type": "boolean", "default": false, "description": "%config.pii.maskInExports.description%" },
"driftViewer.pii.extraColumns": { "type": "array", "default": [], "description": "%config.pii.extraColumns.description%" },
"driftViewer.pii.neverMaskColumns": { "type": "array", "default": [], "description": "%config.pii.neverMaskColumns.description%" }
```

plus `driftViewer.togglePiiMasking` in the status bar next to the health item, showing a **MASKED**
indicator when on — the same affordance the browser already has.

2. A single `formatCell(colName, value)` helper that reads the toggle and delegates to
   `getDisplayValue`, used by every renderer above. One call site per renderer.

3. Copy and clipboard actions respect the toggle (the browser already states "copy and export
   respect the toggle").

4. The exported HTML report and shared session carry a visible "PII masked" banner when produced
   with masking on, so a recipient knows what they are looking at.

---

## Edge Cases

1. **Editing must never mask.** Bulk Edit and inline edit write values back; a masked value written
   back would destroy data. Editing surfaces must either disable masking or refuse to commit a cell
   whose displayed value is masked. This is the one place where getting it wrong is destructive.
2. **Filters and search over masked columns** — the filter must run against the raw value, not the
   masked one, or search silently stops matching.
3. **Primary keys and FK values** must never be masked; FK navigation and row identity depend on
   them, and `isPiiColumn` is a name heuristic that could match a column like `owner_name` used as a
   key.
4. **False positives are expected** — `isPiiColumn` matches on name; `neverMaskColumns` is the
   escape hatch and must be honoured before `extraColumns`.
5. **Charts and aggregates** — masking a value that feeds a numeric chart makes the chart wrong;
   mask labels, not measures.
6. **Diff correctness** — Mutation Stream and the row comparator must diff raw values and mask only
   the rendering, or two different values can both display as `***` and appear equal.
7. **Default off.** Turning masking on by default would change every existing user's view and break
   copy-paste workflows.

---

## Alternatives Considered

- **Mask only the export surfaces.** Covers the sharing risk, but the README's "Mask PII in the
  viewer" claim stays false for the extension and screen-sharing during a debug session stays
  unprotected.
- **Wait for the server-side anonymizer (plan 28).** That is the correct end state but needs Dart
  work and a new endpoint; this slice is extension-only and unblocks the demo.
- **Column-level annotations instead of a heuristic.** `driftViewer.annotateColumn` already exists
  and could carry a `pii` flag — worth doing *in addition*, as the precise override, but it requires
  per-column setup before the feature does anything.

---

## Decision

---

## Implementation Notes

---

## Commits
