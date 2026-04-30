# Feature Gap Analysis: Website vs Extension

## Legend

- **W** = Website only | **E** = Extension only
- Effort/Usefulness = High / Med / Low
- **Done** = Implemented in code and considered complete for this plan
- Sections marked **Historical** preserve original gap framing and may no longer
  reflect current parity if later rows are marked done on both surfaces.

---

## 1. Data Browsing & Tables

| Feature                              | Gap           | Effort | Usefulness | Done |
| ------------------------------------ | ------------- | ------ | ---------- | ---- |
| Column visibility toggle             | **E missing** | Low    | Med        | [x]  |
| Column reordering                    | **E missing** | Med    | Low        | [x]  |
| Cell copy button                     | **E missing** | Low    | Med        | [x]  |
| Live row filter (search-as-you-type) | **E missing** | Med    | High       | [x]  |
| Row filter toggle (all vs matching)  | **E missing** | Low    | Med        | [x]  |
| JSON export                          | **W missing** | Low    | Med        | [x]  |
| SQL dump export                      | **W missing** | Low    | Low        | [x]  |
| Database file download               | **W missing** | Low    | Low        | [x]  |
| Column type icons                    | **W missing** | Low    | Low        | [x]  |

## 2. Inline Editing & Mutations

| Feature                            | Gap           | Effort | Usefulness | Done |
| ---------------------------------- | ------------- | ------ | ---------- | ---- |
| Inline cell editing (double-click) | **E missing** | Med    | Med        | [x]  |
| Pending changes staging            | **W missing** | High   | Med        | [x]  |
| Undo/redo edits                    | **W missing** | High   | Med        | [x]  |
| Batch edit operations              | **W missing** | High   | Med        | [x]  |
| SQL preview of pending changes     | **W missing** | Med    | Med        | [x]  |
| Mutation stream (live feed)        | **W missing** | Med    | Low        | [x]  |
| Clear table / clear all            | **W missing** | Low    | Med        | [x]  |
| Seed with test data                | **W missing** | High   | Low        | [x]  |

## 3. SQL Execution

| Feature                       | Gap           | Effort | Usefulness | Done |
| ----------------------------- | ------------- | ------ | ---------- | ---- |
| Query history (W=20, E=200)   | **W smaller** | Low    | Low        | [x]  |
| Bookmark export/import (JSON) | **E missing** | Low    | Low        | [x]  |
| Natural language to SQL       | **E missing** | Med    | High       | [x]  |
| Visual query builder          | **E missing** | High   | High       | [x]  |
| SQL templates                 | **E missing** | Low    | Med        | [x]  |
| EXPLAIN query plan            | **W missing** | Low    | High       | [x]  |
| Query cost analysis           | **W missing** | Med    | Med        | [x]  |

## 4. Search

| Feature                         | Gap           | Effort | Usefulness | Done |
| ------------------------------- | ------------- | ------ | ---------- | ---- |
| Scope filter (data/schema/both) | **E missing** | Med    | Med        | [x]  |
| Match navigation (prev/next)    | **E missing** | Med    | Med        | [x]  |
| Highlight matching text         | **E missing** | Med    | Med        | [x]  |
| Dedicated search tab            | **E missing** | Med    | Low        | [x]  |

## 5. Schema & Definitions

| Feature                         | Gap           | Effort | Usefulness | Done |
| ------------------------------- | ------------- | ------ | ---------- | ---- |
| Schema documentation generation | **W missing** | Med    | Med        | [x]  |
| Schema diff (code vs runtime)   | **W missing** | Med    | High       | [x]  |
| Isar schema conversion          | **W missing** | High   | Low        | [x]  |
| Dart schema scanning            | **W missing** | N/A    | N/A        | [ ]  |
| _Tracking_                      | _Owner: TBD_  | _Target: TBD_ | _State: planned_ | _Evidence: TBD_ |

## 6. ER Diagram

| Feature               | Gap           | Effort | Usefulness | Done |
| --------------------- | ------------- | ------ | ---------- | ---- |
| Clickable table boxes | **E missing** | Low    | Med        | [x]  |
| SVG export            | **E missing** | Med    | Low        | [x]  |
| Responsive redraw     | **E missing** | Low    | Low        | [x]  |

## 7. Foreign Key Navigation

| Feature              | Gap           | Effort | Usefulness | Done |
| -------------------- | ------------- | ------ | ---------- | ---- |
| Breadcrumb trail     | **E missing** | Med    | High       | [x]  |
| Back/forward history | **E missing** | Med    | High       | [x]  |

## 8. Snapshots & Time Travel

| Feature                      | Gap           | Effort | Usefulness | Done |
| ---------------------------- | ------------- | ------ | ---------- | ---- |
| Export snapshot diff         | **E missing** | Low    | Low        | [x]  |
| Auto-capture on changes      | **W missing** | Med    | Med        | [x]  |
| Timeline UI (git-style)      | **W missing** | High   | Med        | [x]  |
| Multiple snapshots (W has 1) | **W missing** | Med    | Med        | [ ]  |
| _Tracking_                   | _Owner: TBD_  | _Target: TBD_ | _State: planned_ | _Evidence: TBD_ |
| Historical schema tracking   | **W missing** | Med    | Low        | [x]  |

## 9. Database Comparison

| Feature                          | Gap           | Effort | Usefulness | Done |
| -------------------------------- | ------------- | ------ | ---------- | ---- |
| Copy migration SQL               | **E missing** | Low    | Med        | [x]  |
| Migration code generation (Dart) | **W missing** | High   | Med        | [x]  |
| Rollback generation              | **W missing** | High   | Low        | [x]  |

## 10. Performance Analysis

| Feature                       | Gap           | Effort | Usefulness | Done |
| ----------------------------- | ------------- | ------ | ---------- | ---- |
| Slow query detection          | **W missing** | Med    | High       | [x]  |
| N+1 query detection           | **W missing** | Med    | High       | [x]  |
| Full table scan detection     | **W missing** | Med    | High       | [x]  |
| Performance regression alerts | **W missing** | High   | Med        | [x]  |
| Baseline comparison           | **W missing** | Med    | Med        | [x]  |
| Configurable slow threshold   | **W missing** | Low    | Med        | [x]  |

## 11. Index Suggestions

| Feature                    | Gap           | Effort | Usefulness | Done |
| -------------------------- | ------------- | ------ | ---------- | ---- |
| Save analysis history      | **E missing** | Med    | Med        | [x]  |
| Compare analyses over time | **E missing** | Med    | Med        | [x]  |
| Export analysis            | **E missing** | Low    | Low        | [x]  |
| Bulk index creation        | **W missing** | Med    | Med        | [ ]  |
| _Tracking_                 | _Owner: TBD_  | _Target: TBD_ | _State: planned_ | _Evidence: TBD_ |

## 12. Size Analytics

| Feature              | Gap           | Effort | Usefulness | Done |
| -------------------- | ------------- | ------ | ---------- | ---- |
| Stacked bar chart    | **E missing** | Med    | Med        | [x]  |
| Save/compare history | **E missing** | Med    | Med        | [x]  |

## 13. Health / Anomaly Detection

| Feature                   | Gap           | Effort | Usefulness | Done |
| ------------------------- | ------------- | ------ | ---------- | ---- |
| Save/compare history      | **E missing** | Med    | Med        | [x]  |
| Health score (0-100, A-F) | **W missing** | Med    | High       | [x]  |
| Health panel breakdown    | **W missing** | Med    | High       | [x]  |
| Generate anomaly fixes    | **W missing** | Med    | Med        | [x]  |

## 14. Data Import

| Feature                    | Gap           | Effort | Usefulness | Done |
| -------------------------- | ------------- | ------ | ---------- | ---- |
| Column mapping UI          | **E missing** | Med    | Med        | [x]  |
| Clipboard paste import     | **W missing** | Low    | Med        | [x]  |
| Import undo                | **W missing** | Med    | Med        | [x]  |
| Import history             | **W missing** | Low    | Low        | [x]  |
| Dataset support            | **W missing** | High   | Med        | [x]  |
| Dependency-aware insertion | **W missing** | High   | Med        | [x]  |

## 15. Charting & Visualization

| Feature                     | Gap           | Effort | Usefulness | Done |
| --------------------------- | ------------- | ------ | ---------- | ---- |
| Chart builder (7 types)     | **E missing** | High   | High       | [x]  |
| PNG/SVG export              | **E missing** | Med    | Med        | [x]  |
| Copy chart to clipboard     | **E missing** | Low    | Med        | [x]  |
| Data profiling (histograms) | **W missing** | Med    | Med        | [x]  |

## 16. PII Masking

| Feature               | Gap           | Effort | Usefulness | Done |
| --------------------- | ------------- | ------ | ---------- | ---- |
| Heuristic PII masking | **E missing** | Med    | High       | [x]  |
| Masked CSV export     | **E missing** | Low    | Med        | [x]  |

## 17. Connection Management

| Feature                     | Gap           | Effort | Usefulness | Done |
| --------------------------- | ------------- | ------ | ---------- | ---- |
| Multi-server discovery      | **W missing** | Med    | Low        | [x]  |
| Android emulator forwarding | **W missing** | Med    | Low        | [x]  |
| Offline schema caching      | **W missing** | Med    | Med        | [x]  |
| Connection diagnostics      | **W missing** | Med    | Med        | [x]  |

---

## 18. Historical: Extension-Only Feature Areas (originally no website equivalent)

This section is retained for history. Some items listed here are now implemented
on the website and are no longer extension-only in current state.

| Feature                            | Effort to add to W | Usefulness in W | Done |
| ---------------------------------- | ------------------ | --------------- | ---- |
| Diagnostics/linting (30+ codes)    | High               | Med             | [x]  |
| Go-to-definition                   | N/A (IDE-only)     | N/A             | [ ]  |
| _Tracking_                         | _Owner: TBD_       | _Target: TBD_   | _State: planned_ | _Evidence: TBD_ |
| Code actions / quick fixes         | N/A (IDE-only)     | N/A             | [ ]  |
| _Tracking_                         | _Owner: TBD_       | _Target: TBD_   | _State: planned_ | _Evidence: TBD_ |
| Data breakpoints                   | N/A (IDE-only)     | N/A             | [ ]  |
| _Tracking_                         | _Owner: TBD_       | _Target: TBD_   | _State: planned_ | _Evidence: TBD_ |
| Watch queries (live SQL monitor)   | Med                | High            | [x]  |
| Row impact analysis (FK cascade)   | Med                | High            | [x]  |
| Constraint wizard                  | High               | Med             | [x]  |
| Data sampling                      | Low                | Med             | [x]  |
| Invariants/rules                   | High               | Med             | [x]  |
| Row narration                      | Low                | Low             | [x]  |
| Bulk edit panel                    | High               | Med             | [x]  |
| Session sharing                    | Med                | Med             | [x]  |
| Dashboard (widget layout)          | High               | Med             | [x]  |
| Annotations/bookmarks on tables    | Med                | Med             | [x]  |
| Compliance checking (.drift-rules) | Med                | Low             | [x]  |
| Portable report export             | Med                | Med             | [x]  |

## 19. Historical: Website-Only Feature Areas (originally no extension equivalent)

This section is retained for history. Multiple items listed here are now
implemented in the extension and are no longer website-only in current state.

| Feature                       | Effort to add to E | Usefulness in E | Done |
| ----------------------------- | ------------------ | --------------- | ---- |
| Natural language to SQL       | Med                | High            | [x]  |
| Visual query builder          | High               | High            | [x]  |
| Chart builder (7 types)       | High               | High            | [x]  |
| PII masking                   | Med                | High            | [x]  |
| Showcase theme                | Low                | Low             | [x]  |
| Analysis save/compare history | Med                | Med             | [x]  |
| Column reorder/visibility     | Med                | Med             | [x]  |
| Search scope + match nav      | Med                | Med             | [x]  |
| FK breadcrumb trail           | Med                | High            | [x]  |
| Stacked bar chart (size)      | Med                | Med             | [x]  |
| SQL templates                 | Low                | Med             | [x]  |

---

## Quick-Win Candidates (Low effort + High/Med usefulness)

### For the Extension

- ~~Cell copy button (Low / Med)~~ — DONE (already in app.js, loaded via webview)
- ~~Copy migration SQL (Low / Med)~~ — DONE (button in compare panel + fetches migration preview)
- ~~SQL templates (Low / Med)~~ — DONE (full snippet system in extension/src/snippets/)
- ~~Clickable ER diagram tables (Low / Med)~~ — DONE (double-click navigates to table view)
- ~~Masked CSV export (Low / Med)~~ — DONE ("CSV (PII masked)" option in export picker)
- ~~Column visibility toggle (Low / Med)~~ — DONE (Columns button + dropdown chooser in SQL Notebook)
- ~~Row filter toggle (Low / Med)~~ — DONE (Matching/All toggle in SQL Notebook filter bar)
- ~~Responsive ER diagram redraw (Low / Low)~~ — DONE (debounced resize → fitToView)
- ~~Export index analysis (Low / Low)~~ — DONE (Export Analysis button: JSON/CSV/Markdown)
- ~~Copy chart to clipboard (Low / Med)~~ — DONE (clipboard button on dashboard chart widgets)
- ~~Column reordering (Med / Low)~~ — DONE (drag-and-drop header reorder in table-view)
- ~~Live row filter (Med / High)~~ — DONE (search-as-you-type via search.ts filterRows)
- ~~Inline cell editing (Med / Med)~~ — DONE (double-click editing via cell-edit.ts)
- ~~SVG export for ER diagram (Med / Low)~~ — DONE (exportChartSvg in charts.ts)
- ~~Breadcrumb trail for FK (Med / High)~~ — DONE (fk-nav.ts breadcrumb trail)
- ~~Back/forward FK history (Med / High)~~ — DONE (navHistory in fk-nav.ts)
- ~~Search scope filter (Med / Med)~~ — DONE (data/schema/both dropdown in search.ts)
- ~~Match navigation (Med / Med)~~ — DONE (nextMatch/prevMatch in search.ts)
- ~~Highlight matching text (Med / Med)~~ — DONE (highlightText in search.ts)
- ~~Dedicated search tab (Med / Low)~~ — DONE (search-tab.ts)
- ~~Column mapping UI (Med / Med)~~ — DONE (clipboard-import-html.ts column mapper)
- ~~Stacked bar chart (Med / Med)~~ — DONE (renderStackedBarChart in charts.ts)
- ~~Heuristic PII masking (Med / High)~~ — DONE (pii.ts heuristic detection + masking)
- ~~Natural language to SQL (Med / High)~~ — DONE (nl-to-sql.ts)
- ~~Visual query builder (High / High)~~ — DONE (query-builder.ts)
- ~~Chart builder (High / High)~~ — DONE (7 chart types in charts.ts)
- ~~PNG/SVG export (Med / Med)~~ — DONE (exportChartSvg + exportChartCopy in charts.ts)
- ~~Bookmark export/import (Low / Low)~~ — DONE (sql-history.ts export/import JSON)

### For the Website

- ~~EXPLAIN query plan (Low / High)~~ — DONE (both /api/sql/explain and UI exist)
- ~~Clear table/all commands (Low / Med)~~ — DONE (Clear rows + Clear all tables buttons, write-enabled only)
- ~~Clipboard paste import (Low / Med)~~ — DONE (Paste button auto-detects CSV/TSV/JSON)
- ~~Configurable slow threshold (Low / Med)~~ — DONE (threshold input in perf panel, passed to server)
- ~~JSON export (Low / Med)~~ — DONE (Table JSON link in export panel)
- ~~Import history log (Low / Low)~~ — DONE (collapsible session history below import form)
- ~~Pending changes staging (High / Med)~~ — DONE (pending-changes-persistence.ts + change-tracker.ts)
- ~~Undo/redo edits (High / Med)~~ — DONE (import-undo.ts + change tracking)
- ~~SQL preview of pending changes (Med / Med)~~ — DONE (sql-generator.ts)
- ~~Mutation stream (Med / Low)~~ — DONE (mutation-stream-panel.ts with polling)
- ~~Seed with test data (High / Low)~~ — DONE (seeder-panel.ts + seed-orchestrator.ts)
- ~~Batch edit operations (High / Med)~~ — DONE (bulk-edit-panel.ts)
- ~~Schema documentation (Med / Med)~~ — DONE (schema-docs-command.ts)
- ~~Schema diff (Med / High)~~ — DONE (schema-diff-panel.ts code-vs-runtime)
- ~~Isar schema conversion (High / Low)~~ — DONE (isar-gen/ directory)
- ~~Auto-capture snapshots (Med / Med)~~ — DONE (schema-tracker.ts auto-capture)
- ~~Timeline UI (High / Med)~~ — DONE (schema-timeline-panel.ts)
- ~~Historical schema tracking (Med / Low)~~ — DONE (schema-timeline/schema-differ.ts)
- ~~Migration code generation (High / Med)~~ — DONE (migration-codegen.ts + dart-type-mapper.ts)
- ~~Rollback generation (High / Low)~~ — DONE (rollback-generator.ts + rollback-dart.ts)
- ~~Slow query detection (Med / High)~~ — DONE (slow-query-checker.ts)
- ~~N+1 query detection (Med / High)~~ — DONE (n-plus-one-checker.ts)
- ~~Full table scan detection (Med / High)~~ — DONE (performance-provider.ts)
- ~~Performance regression alerts (High / Med)~~ — DONE (perf-regression-detector.ts)
- ~~Baseline comparison (Med / Med)~~ — DONE (perf-baseline-panel.ts + perf-baseline-store.ts)
- ~~Import undo (Med / Med)~~ — DONE (import-undo.ts)
- ~~Dataset support (High / Med)~~ — DONE (dataset-import.ts + dataset-export.ts)
- ~~Dependency-aware insertion (High / Med)~~ — DONE (dependency-sorter.ts)
- ~~Data profiling (Med / Med)~~ — DONE (profiler/ directory)
- ~~Generate anomaly fixes (Med / Med)~~ — DONE (anomalies-panel.ts + health-commands.ts)
- ~~Multi-server discovery (Med / Low)~~ — DONE (server-discovery-*.ts)
- ~~Android emulator forwarding (Med / Low)~~ — DONE (android-forward.ts)
- ~~Offline schema caching (Med / Med)~~ — DONE (schema-cache/)
- ~~Connection diagnostics (Med / Med)~~ — DONE (connection-checker.ts)

## Highest-Impact Gaps (any effort)

All high-impact gaps tracked in this section are marked resolved in this plan.
Remaining open items are lower-impact and/or IDE-only:

| Feature                 | Target    | Effort | Usefulness | Done |
| ----------------------- | --------- | ------ | ---------- | ---- |
| Chart builder           | Extension | High   | High       | [x]  |
| Visual query builder    | Extension | High   | High       | [x]  |
| NL-to-SQL               | Extension | Med    | High       | [x]  |
| PII masking             | Extension | Med    | High       | [x]  |
| Health score            | Website   | Med    | High       | [x]  |
| Performance diagnostics | Website   | Med    | High       | [x]  |
| FK breadcrumb trail     | Extension | Med    | High       | [x]  |
| Row impact analysis     | Website   | Med    | High       | [x]  |
| Watch queries           | Website   | Med    | High       | [x]  |

---

## Actionable Next Items

Execution backlog to keep this document accurate and close remaining gaps.

| ID   | Priority | Item                                                    | Source row(s)                               | Deliverable                                                                 | Verification / exit criteria                                                                 |
| ---- | -------- | ------------------------------------------------------- | ------------------------------------------- | --------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| A-01 | P0       | Attach evidence for every unresolved item               | 5. Schema, 8. Snapshots, 11. Index, 18. Ext | Add `Evidence` note to each unresolved row (file path, command, or issue). | Every `[ ]` item has a concrete pointer; no unresolved row lacks implementation evidence.   |
| A-02 | P0       | Resolve classification of IDE-only capabilities         | 18. Historical extension-only               | Move IDE-only rows to `Intentionally IDE-only` subsection or mark excluded. | `Go-to-definition`, `Code actions`, `Data breakpoints` no longer appear as ambiguous gaps.  |
| A-03 | P1       | Implement website Dart schema scanning or defer clearly | `Dart schema scanning`                      | Feature implementation OR explicit deferral rationale with target milestone. | Row has non-N/A effort/usefulness and updated `Done`; deferrals include milestone + owner.  |
| A-04 | P1       | Add multi-snapshot support                              | `Multiple snapshots (W has 1)`              | UI/API supports create/select N snapshots and pairwise diff.                | Manual test: create >1 snapshot, switch between snapshots, run diff, reload and verify.     |
| A-05 | P1       | Add bulk index creation workflow                        | `Bulk index creation`                       | Multi-select index suggestions with apply batch action and SQL preview.     | Manual test: choose multiple suggestions, preview SQL, apply, and validate resulting schema. |
| A-06 | P1       | Introduce parity verification checklist                 | Entire plan                                 | New checklist section used before marking any new row done.                 | Checklist executed in release process; `Done` claims require checklist reference/date.       |

### Required metadata for unresolved rows

For each unresolved row (`[ ]`), add:

- `Owner`: single responsible person/team
- `Target`: release/milestone or date
- `Evidence`: file path(s), command(s), test(s), or issue link
- `State`: `planned`, `in progress`, `blocked`, or `deferred`

### Current unresolved rows (must be tracked)

| Feature                    | Current gap/status | Required next step                                                                |
| -------------------------- | ------------------ | --------------------------------------------------------------------------------- |
| Dart schema scanning       | W missing, N/A     | Estimate effort/usefulness, assign owner, implement or defer with milestone.      |
| Multiple snapshots (W has 1) | W missing       | Define snapshot data model + selection UI, then implement and verify reload path. |
| Bulk index creation        | W missing          | Design batch apply UX with SQL preview and failure handling semantics.            |
| Go-to-definition           | IDE-only           | Reclassify to intentionally IDE-only (or define realistic website approximation). |
| Code actions / quick fixes | IDE-only           | Reclassify to intentionally IDE-only (or define realistic website approximation). |
| Data breakpoints           | IDE-only           | Reclassify to intentionally IDE-only (or define realistic website approximation). |

### Implementation sequence (ready to execute)

Follow this order to avoid rework and keep the plan authoritative during delivery:

1. A-01 (evidence coverage)
2. A-02 (IDE-only classification cleanup)
3. A-03 (schema scanning decision + implementation/defer)
4. A-04 and A-05 (feature delivery in parallel if resourcing allows)
5. A-06 (release gate for all future updates)

### Work packages

#### WP-A01: Evidence coverage for unresolved items

- Scope: all rows with `Done = [ ]`
- Tasks:
  - Add `Owner`, `Target`, `Evidence`, `State` fields under each unresolved row.
  - Link to concrete artifacts (paths/tests/issues), not just section names.
  - Mark blocked/deferred rows with explicit reason.
- Output:
  - This plan updated with evidence annotations for each unresolved row.
- Exit criteria:
  - Zero unresolved rows without evidence metadata.

#### WP-A02: IDE-only classification cleanup

- Scope: `Go-to-definition`, `Code actions / quick fixes`, `Data breakpoints`
- Tasks:
  - Add subsection `Intentionally IDE-only`.
  - Move or duplicate those rows there with rationale.
  - Remove ambiguity from parity tracking tables.
- Output:
  - Main parity tables only contain implementable cross-surface gaps.
- Exit criteria:
  - No IDE-only capability appears as a normal unresolved parity gap.

#### WP-A03: Website Dart schema scanning

- Scope: `Dart schema scanning` row in section 5
- Tasks:
  - Define entry point in website UI and output format.
  - Implement scan pipeline and surface errors with actionable guidance.
  - Add docs for supported inputs and limitations.
  - Re-estimate effort/usefulness from `N/A` to concrete values.
- Output:
  - Website can run schema scan from UI flow OR row explicitly deferred.
- Exit criteria:
  - If implemented: manual verification pass succeeds and row set to `[x]`.
  - If deferred: owner + milestone + rationale are documented in row metadata.

#### WP-A04: Multiple snapshots support (website)

- Scope: `Multiple snapshots (W has 1)`
- Tasks:
  - Extend snapshot storage model to support multiple named entries.
  - Add snapshot list/select UI and pairwise diff controls.
  - Persist/reload selected snapshot context in session state.
  - Guard against empty/invalid snapshot states.
- Output:
  - Full multi-snapshot workflow in UI.
- Exit criteria:
  - User can create at least 3 snapshots, switch among them, diff any pair,
    and retain list after reload.

#### WP-A05: Bulk index creation (website)

- Scope: `Bulk index creation`
- Tasks:
  - Add multi-select control in index suggestion list.
  - Generate merged SQL preview with per-index status.
  - Apply as one action with partial-failure reporting.
  - Provide rollback guidance (or generated rollback SQL when available).
- Output:
  - Batch index creation flow with preview and robust failure handling.
- Exit criteria:
  - User can apply 2+ suggestions at once and validate resulting schema/indexes.

#### WP-A06: Parity verification release gate

- Scope: all future updates to this document
- Tasks:
  - Add checklist template (below) to release workflow.
  - Require checklist completion before changing any row to `[x]`.
  - Record verification date + verifier initials.
- Output:
  - Repeatable process that keeps plan status trustworthy.
- Exit criteria:
  - New done-marked items include checklist evidence and verification stamp.

### Verification checklist template

Use this checklist before marking any item as done:

- [ ] Capability is discoverable from intended UI path.
- [ ] Happy-path behavior works end-to-end in manual test.
- [ ] At least one edge case is verified (empty input, invalid state, conflict).
- [ ] User-visible errors are clear and actionable.
- [ ] Any new persistence state survives reload/reopen where applicable.
- [ ] Plan row updated with `Evidence`, verification date, and verifier initials.

### Implementation board starter (copy/paste)

| ID   | Owner | State | Target | Blockers | Evidence | Last update |
| ---- | ----- | ----- | ------ | -------- | -------- | ----------- |
| A-01 | TBD   | planned | TBD  | None     | TBD      | TBD         |
| A-02 | TBD   | planned | TBD  | None     | TBD      | TBD         |
| A-03 | TBD   | planned | TBD  | None     | TBD      | TBD         |
| A-04 | TBD   | planned | TBD  | None     | TBD      | TBD         |
| A-05 | TBD   | planned | TBD  | None     | TBD      | TBD         |
| A-06 | TBD   | planned | TBD  | None     | TBD      | TBD         |
