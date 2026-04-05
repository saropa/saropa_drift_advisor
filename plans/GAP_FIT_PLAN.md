# Feature Gap Analysis: Website vs Extension

## Legend

- **W** = Website only | **E** = Extension only
- Effort/Usefulness = High / Med / Low

---

## 1. Data Browsing & Tables

| Feature | Gap | Effort | Usefulness |
|---------|-----|--------|------------|
| Column visibility toggle | **E missing** | Low | Med |
| Column reordering | **E missing** | Med | Low |
| Cell copy button | **E missing** | Low | Med |
| Live row filter (search-as-you-type) | **E missing** | Med | High |
| Row filter toggle (all vs matching) | **E missing** | Low | Med |
| JSON export | **W missing** | Low | Med |
| SQL dump export | **W missing** | Low | Low |
| Database file download | **W missing** | Low | Low |
| Column type icons | **W missing** | Low | Low |

## 2. Inline Editing & Mutations

| Feature | Gap | Effort | Usefulness |
|---------|-----|--------|------------|
| Inline cell editing (double-click) | **E missing** | Med | Med |
| Pending changes staging | **W missing** | High | Med |
| Undo/redo edits | **W missing** | High | Med |
| Batch edit operations | **W missing** | High | Med |
| SQL preview of pending changes | **W missing** | Med | Med |
| Mutation stream (live feed) | **W missing** | Med | Low |
| Clear table / clear all | **W missing** | Low | Med |
| Seed with test data | **W missing** | High | Low |

## 3. SQL Execution

| Feature | Gap | Effort | Usefulness |
|---------|-----|--------|------------|
| Query history (W=20, E=200) | **W smaller** | Low | Low |
| Bookmark export/import (JSON) | **E missing** | Low | Low |
| Natural language to SQL | **E missing** | Med | High |
| Visual query builder | **E missing** | High | High |
| SQL templates | **E missing** | Low | Med |
| EXPLAIN query plan | **W missing** | Low | High |
| Query cost analysis | **W missing** | Med | Med |

## 4. Search

| Feature | Gap | Effort | Usefulness |
|---------|-----|--------|------------|
| Scope filter (data/schema/both) | **E missing** | Med | Med |
| Match navigation (prev/next) | **E missing** | Med | Med |
| Highlight matching text | **E missing** | Med | Med |
| Dedicated search tab | **E missing** | Med | Low |

## 5. Schema & Definitions

| Feature | Gap | Effort | Usefulness |
|---------|-----|--------|------------|
| Schema documentation generation | **W missing** | Med | Med |
| Schema diff (code vs runtime) | **W missing** | Med | High |
| Isar schema conversion | **W missing** | High | Low |
| Dart schema scanning | **W missing** | N/A | N/A |

## 6. ER Diagram

| Feature | Gap | Effort | Usefulness |
|---------|-----|--------|------------|
| Clickable table boxes | **E missing** | Low | Med |
| SVG export | **E missing** | Med | Low |
| Responsive redraw | **E missing** | Low | Low |

## 7. Foreign Key Navigation

| Feature | Gap | Effort | Usefulness |
|---------|-----|--------|------------|
| Breadcrumb trail | **E missing** | Med | High |
| Back/forward history | **E missing** | Med | High |

## 8. Snapshots & Time Travel

| Feature | Gap | Effort | Usefulness |
|---------|-----|--------|------------|
| Export snapshot diff | **E missing** | Low | Low |
| Auto-capture on changes | **W missing** | Med | Med |
| Timeline UI (git-style) | **W missing** | High | Med |
| Multiple snapshots (W has 1) | **W missing** | Med | Med |
| Historical schema tracking | **W missing** | Med | Low |

## 9. Database Comparison

| Feature | Gap | Effort | Usefulness |
|---------|-----|--------|------------|
| Copy migration SQL | **E missing** | Low | Med |
| Migration code generation (Dart) | **W missing** | High | Med |
| Rollback generation | **W missing** | High | Low |

## 10. Performance Analysis

| Feature | Gap | Effort | Usefulness |
|---------|-----|--------|------------|
| Slow query detection | **W missing** | Med | High |
| N+1 query detection | **W missing** | Med | High |
| Full table scan detection | **W missing** | Med | High |
| Performance regression alerts | **W missing** | High | Med |
| Baseline comparison | **W missing** | Med | Med |
| Configurable slow threshold | **W missing** | Low | Med |

## 11. Index Suggestions

| Feature | Gap | Effort | Usefulness |
|---------|-----|--------|------------|
| Save analysis history | **E missing** | Med | Med |
| Compare analyses over time | **E missing** | Med | Med |
| Export analysis | **E missing** | Low | Low |
| Bulk index creation | **W missing** | Med | Med |

## 12. Size Analytics

| Feature | Gap | Effort | Usefulness |
|---------|-----|--------|------------|
| Stacked bar chart | **E missing** | Med | Med |
| Save/compare history | **E missing** | Med | Med |

## 13. Health / Anomaly Detection

| Feature | Gap | Effort | Usefulness |
|---------|-----|--------|------------|
| Save/compare history | **E missing** | Med | Med |
| Health score (0-100, A-F) | **W missing** | Med | High |
| Health panel breakdown | **W missing** | Med | High |
| Generate anomaly fixes | **W missing** | Med | Med |

## 14. Data Import

| Feature | Gap | Effort | Usefulness |
|---------|-----|--------|------------|
| Column mapping UI | **E missing** | Med | Med |
| Clipboard paste import | **W missing** | Low | Med |
| Import undo | **W missing** | Med | Med |
| Import history | **W missing** | Low | Low |
| Dataset support | **W missing** | High | Med |
| Dependency-aware insertion | **W missing** | High | Med |

## 15. Charting & Visualization

| Feature | Gap | Effort | Usefulness |
|---------|-----|--------|------------|
| Chart builder (7 types) | **E missing** | High | High |
| PNG/SVG export | **E missing** | Med | Med |
| Copy chart to clipboard | **E missing** | Low | Med |
| Data profiling (histograms) | **W missing** | Med | Med |

## 16. PII Masking

| Feature | Gap | Effort | Usefulness |
|---------|-----|--------|------------|
| Heuristic PII masking | **E missing** | Med | High |
| Masked CSV export | **E missing** | Low | Med |

## 17. Connection Management

| Feature | Gap | Effort | Usefulness |
|---------|-----|--------|------------|
| Multi-server discovery | **W missing** | Med | Low |
| Android emulator forwarding | **W missing** | Med | Low |
| Offline schema caching | **W missing** | Med | Med |
| Connection diagnostics | **W missing** | Med | Med |

---

## 18. Extension-Only Feature Areas (no website equivalent)

| Feature | Effort to add to W | Usefulness in W |
|---------|---------------------|-----------------|
| Diagnostics/linting (30+ codes) | High | Med |
| Go-to-definition | N/A (IDE-only) | N/A |
| Code actions / quick fixes | N/A (IDE-only) | N/A |
| Data breakpoints | N/A (IDE-only) | N/A |
| Watch queries (live SQL monitor) | Med | High |
| Row impact analysis (FK cascade) | Med | High |
| Constraint wizard | High | Med |
| Data sampling | Low | Med |
| Invariants/rules | High | Med |
| Row narration | Low | Low |
| Bulk edit panel | High | Med |
| Session sharing | Med | Med |
| Dashboard (widget layout) | High | Med |
| Annotations/bookmarks on tables | Med | Med |
| Compliance checking (.drift-rules) | Med | Low |
| Portable report export | Med | Med |

## 19. Website-Only Feature Areas (no extension equivalent)

| Feature | Effort to add to E | Usefulness in E |
|---------|---------------------|-----------------|
| Natural language to SQL | Med | High |
| Visual query builder | High | High |
| Chart builder (7 types) | High | High |
| PII masking | Med | High |
| Showcase theme | Low | Low |
| Analysis save/compare history | Med | Med |
| Column reorder/visibility | Med | Med |
| Search scope + match nav | Med | Med |
| FK breadcrumb trail | Med | High |
| Stacked bar chart (size) | Med | Med |
| SQL templates | Low | Med |

---

## Quick-Win Candidates (Low effort + High/Med usefulness)

### For the Extension

- ~~Cell copy button (Low / Med)~~ — DONE (already in app.js, loaded via webview)
- ~~Copy migration SQL (Low / Med)~~ — DONE (button in compare panel + fetches migration preview)
- ~~SQL templates (Low / Med)~~ — DONE (full snippet system in extension/src/snippets/)
- ~~Clickable ER diagram tables (Low / Med)~~ — DONE (double-click navigates to table view)
- ~~Masked CSV export (Low / Med)~~ — DONE ("CSV (PII masked)" option in export picker)

### For the Website

- ~~EXPLAIN query plan (Low / High)~~ — DONE (both /api/sql/explain and UI exist)
- ~~Clear table/all commands (Low / Med)~~ — DONE (Clear rows + Clear all tables buttons, write-enabled only)
- ~~Clipboard paste import (Low / Med)~~ — DONE (Paste button auto-detects CSV/TSV/JSON)
- ~~Configurable slow threshold (Low / Med)~~ — DONE (threshold input in perf panel, passed to server)

## Highest-Impact Gaps (any effort)

| Feature | Target | Effort | Usefulness |
|---------|--------|--------|------------|
| Chart builder | Extension | High | High |
| Visual query builder | Extension | High | High |
| NL-to-SQL | Extension | Med | High |
| PII masking | Extension | Med | High |
| Health score | Website | Med | High |
| Performance diagnostics | Website | Med | High |
| FK breadcrumb trail | Extension | Med | High |
| Row impact analysis | Website | Med | High |
| Watch queries | Website | Med | High |
