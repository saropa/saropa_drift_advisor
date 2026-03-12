# Saropa Drift Advisor — Roadmap

**Status:** 49 of 63 features complete • 14 remaining • Last updated March 12, 2026

---

## What to Build Next

| Priority | Feature | Wow | Effort | Why |
|----------|---------|:---:|:------:|-----|
| **1** | [55: Clipboard Import](plans/55-clipboard-import.md) | 3→4 | Medium | High practical utility |
| **2** | [63: Query Perf Regression](plans/63-query-perf-regression-detector.md) | 5→6 | Medium | Uses QueryIntelligence already built |
| **3** | [64: Schema Compliance Rules](plans/64-schema-compliance-ruleset.md) | 4→5 | Medium | Feeds Health Score, Pre-Launch |

---

## Integration Architecture

All features integrate through **4 shared hubs** in `extension/src/engines/`:

```
┌─────────────────────────────────────────────────────────────────┐
│                    Shared Intelligence Layer                     │
├─────────────────────────────────────────────────────────────────┤
│  RelationshipEngine    │ FK traversal for Impact, Lineage, etc │
│  SchemaIntelligence    │ Cached schema for all schema features │
│  QueryIntelligence     │ Query patterns → autocomplete, indexes│
│  DiagnosticManager     │ Unified Problems panel (3 sources)    │
└─────────────────────────────────────────────────────────────────┘
```

**Principles:**
1. No feature isolation — every feature consumes or produces data for another
2. Diagnosis → Action → Verification — problems link to fixes
3. Single source of truth — shared engines, not duplicate logic

---

## Remaining Features (14)

### Tier 1: Extension-Only (no Dart changes)

| # | Feature | Wow | Effort | Integration |
|---|---------|:---:|:------:|-------------|
| 55 | [Clipboard Import](plans/55-clipboard-import.md) | 3→4 | Medium | → Bulk Edit, smart column mapping |
| 63 | [Query Perf Regression](plans/63-query-perf-regression-detector.md) | 5→6 | Medium | ← QueryIntelligence, → Health Score |
| 64 | [Schema Compliance Rules](plans/64-schema-compliance-ruleset.md) | 4→5 | Medium | → Health Score, Pre-Launch |
| 61 | [Migration Rollback Gen](plans/61-migration-rollback-generator.md) | 5 | Medium | ← Schema Evolution |
| 60 | [Time-Travel Slider](plans/60-time-travel-data-slider.md) | 5→6 | Medium | ↔ DVR, Timeline |
| 59 | [AI Schema Reviewer](plans/59-ai-schema-reviewer.md) | 5→6 | Medium | Requires LLM integration |
| 18 | [Natural Language SQL](plans/18-natural-language-sql.md) | 5→6 | Medium | Requires LLM integration |
| 66 | [Drift Refactoring Engine](plans/66-drift-refactoring-engine.md) | 5→7 | High | ← AI Review, Profiler |
| 21 | [Visual Query Builder](plans/21-visual-query-builder.md) | 4→5 | High | ← QueryIntelligence |

### Tier 2: Requires Server Changes

| # | Feature | Wow | Effort | Server Change |
|---|---------|:---:|:------:|---------------|
| 28 | [PII Anonymizer](plans/28-pii-anonymizer.md) | 5→6 | Medium | Anonymization endpoint |
| 25 | [Portable Report](plans/25-portable-snapshot-report.md) | 4→5 | Medium | `report_handler.dart` |
| 22 | [Mutation Stream](plans/22-realtime-mutation-stream.md) | 4→5 | Medium | `mutation_tracker.dart` |
| 26 | [Query Replay DVR](plans/26-query-replay-dvr.md) | 5→7 | High | `query_recorder.dart` |
| 35 | [Multi-Server Federation](plans/35-multi-server-federation.md) | 5→6 | High | Multiple clients |
| 37 | [Data Branching](plans/37-data-branching.md) | 5→7 | High | Fork/restore endpoints |
| 47 | [Bulk Edit Grid](plans/47-bulk-edit-grid.md) | 5→7 | High | `writeQuery` callback |

### Low Priority Integrations (P3)

| Item | Status | Notes |
|------|--------|-------|
| Schema Evolution → Migration Gen | ⬜ Pending | Add "Generate Migration" to timeline entries |
| Unified Timeline | ⬜ Pending | Merge 3 timelines — may not be worth complexity |

---

## Wow Factor Key

| Score | Meaning |
|-------|---------|
| 3 | Nice to have |
| 4 | Useful for many users |
| 5 | Compelling differentiator |
| 6 | Wow — competitors don't have this |
| 7 | Industry-leading integration |

---

## Progress Metrics

| Metric | Current | Target |
|--------|---------|--------|
| Features with no outbound connections | ~5 | <5 ✅ |
| Health Score issues with one-click fix | ~90% | 100% |
| Cross-feature navigation paths | ~20 | 20+ ✅ |
| Diagnostic sources unified | 3 | 3 ✅ |

---

## Completed Features (48)

<details>
<summary>Click to expand full list</summary>

| # | Feature |
|---|---------|
| 1 | Database Explorer Tree View |
| 2 | CodeLens on Drift Tables |
| 3 | SQL Notebook |
| 4 | Live Watch |
| 5 | Schema Diff |
| 6 | Server Auto-Discovery |
| 7 | Schema Linter |
| 8 | Explain Visualization |
| 9 | Hover Preview |
| 10 | Terminal Links |
| 11 | File Badges |
| 12 | Snapshot Timeline |
| 13 | Pre-Launch Tasks |
| 14 | Peek Definition |
| 15 | Debug Performance Panel |
| 16 | Data Editing |
| 17 | Dart from Schema |
| 19 | Data Breakpoints |
| 20 | Test Data Seeder |
| 20a | Data Management |
| 23 | Row Impact Analysis |
| 24 | Drift Migration Generator |
| 27 | Data Invariant Checker |
| 29 | Smart Column Profiler |
| 30 | Database Health Score |
| 31 | Regression Test Generator |
| 32 | Schema Documentation Generator |
| 33 | Row Comparator |
| 34 | Snapshot Changelog Narrative |
| 36 | Custom Dashboard Builder |
| 38 | ER Diagram |
| 39 | Cross-Table Global Search |
| 40 | SQL Snippet Library |
| 41 | Schema Evolution Timeline |
| 42 | Data Annotations & Bookmarks |
| 43 | Query Cost Analyzer |
| 44 | Constraint Wizard |
| 45 | Data Sampling Explorer |
| 46 | Automated Data Lineage |
| 48 | Isar-to-Drift Schema Generator |
| 49 | Table Pinning |
| 50 | Query History Search |
| 51 | FK Hyperlinks |
| 52 | Saved Filters |
| 53 | Multi-Format Export |
| 54 | Schema Search |
| 67 | Centralized Diagnostic Manager |

</details>

---

## Integration Hubs Implemented

### 1. Shared Intelligence Layer ✅
- `RelationshipEngine` — FK traversal shared by Impact Analysis, Lineage, Breakpoints
- `SchemaIntelligence` — cached schema metadata for all schema-aware features
- `QueryIntelligence` — query patterns improve autocomplete, suggest indexes

### 2. Health Score as Command Center ✅
- Each metric card has fix actions (Index, Anomaly, Query, Schema)
- Pre-launch tasks display health grade with clickable dashboard link

### 3. Smart Data Generation ✅
- Seeder uses Column Profiler distributions for realistic data
- Anomaly Detection "Fix" buttons open Data Editing with pre-populated SQL

### 4. Diagnostic Manager ✅
- Unified Problems panel from Schema Linter + Anomaly Detection + Invariants
- Consistent severity mapping and quick-fix CodeActions
