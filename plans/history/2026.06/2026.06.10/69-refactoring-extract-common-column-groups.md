# Feature 69: Refactoring — Extract common column groups

## Purpose

Track **deterministic** refactoring detection for the `extract` suggestion type in the Drift Refactoring Engine ([Feature 66](66-drift-refactoring-engine.md)): columns that repeatedly appear together across tables (address blocks, audit metadata, soft-delete triplets, etc.). Feature 66 v1 shipped normalize / split / merge only; `extract` remains in the type union as a forward-looking hook.

## Goals

- Detect **named column bundles** with high co-occurrence across two or more user tables (same logical names and compatible types), with evidence the user can verify.
- Emit `IRefactoringSuggestion` entries with `type: 'extract'`, migration plans via the existing plan builder, and the same panel actions as other types.
- Stay within advisory-only constraints: no automatic schema writes.

## Non-goals

- Inferring semantic meaning from column values alone (e.g. guessing "address" from unstructured TEXT) beyond name + type heuristics.
- LLM-driven detection — that belongs in [Feature 59: AI Schema Reviewer](59-ai-schema-reviewer.md) with optional handoff to [refactoringOpenWithHint](66-drift-refactoring-engine.md).

## Implementation sketch

- **Analyzer** (`refactoring-analyzer.ts`): build a map of column-name sets per table; find intersections across tables weighted by type compatibility; require minimum table count and optional name-prefix families (`addr_*`, `created_at` / `updated_at` / `deleted_at`).
- **Plan builder** (`refactoring-plan-builder.ts`): steps to create shared table, backfill FKs, drop redundant columns (with destructive / compatibility flags).
- **Tests**: fixture schemas with duplicated audit or address columns; assert suggestion count, confidence bounds, and SQL shape.

## Dependencies

- Feature 66 panel, types, and session persistence (unchanged contract).
- Schema metadata from existing `DriftApiClient.schemaMetadata()`.

## Acceptance criteria

- At least one golden fixture produces a stable `extract` suggestion with evidence strings.
- No regression to existing normalize / split / merge tests.

---

## Implementation Plan

Slots into the shipped Refactoring Engine ([66](66-drift-refactoring-engine.md)) as the `extract` suggestion type — no new panel, no new persistence contract. Deterministic only; LLM detection stays in [59](59-ai-schema-reviewer.md). Each phase ends at a verifiable gate.

### Phase 1 — Co-occurrence analyzer
- Extend `refactoring-analyzer.ts`: build per-table column-name sets, find cross-table intersections weighted by type compatibility, require a minimum table count, and recognize name-prefix families (`addr_*`, `created_at`/`updated_at`/`deleted_at` audit triplets, soft-delete bundles). Emit `IRefactoringSuggestion` with `type: 'extract'` and human-verifiable evidence strings.
- **Gate:** a fixture with duplicated audit/address columns yields a stable `extract` suggestion with evidence; below-threshold co-occurrence yields none.

### Phase 2 — Extract plan builder
- Extend `refactoring-plan-builder.ts`: steps to create the shared table, backfill FKs, and drop redundant columns, each carrying destructive / compatibility flags — advisory only, no automatic schema writes.
- **Gate:** generated plan has the correct step order and SQL shape, with destructive steps flagged; asserted by tests.

### Phase 3 — Golden fixtures + regression guard
- Add golden-fixture tests for the analyzer and plan builder; confirm confidence bounds and SQL shape.
- **Gate:** at least one golden fixture produces a stable `extract` suggestion; existing normalize / split / merge tests still pass.

---

## Finish Report (2026-06-10) — Phases 1–3

**This work will be reviewed by another AI.**

**Trigger.** Top-5 easiest-to-build directive, Item 1. Slots the `extract` suggestion type into the already-shipped Refactoring Engine (66) — no new panel, no new persistence contract, exactly as scoped.

**Scope.** (B) VS Code extension (TypeScript) only. No Dart/server code, no user-facing webview changes (suggestions render through the existing generic panel/HTML).

**What changed.**
- **`extension/src/refactoring/refactoring-analyzer.ts`** (Phase 1) — new `_detectExtractGroups` detector plus `_buildExtractSuggestion`. It is schema-only and deterministic (no SQL probes): indexes every non-PK column name to the tables it appears in and the type buckets observed; keeps only columns shared across ≥ `EXTRACT_MIN_TABLES` (2) tables with a single consistent type bucket (a name with conflicting types is dropped — extracting it would force a lossy type decision); then emits suggestions via two passes. **Family pass:** groups shared columns by known `EXTRACT_FAMILIES` (audit/timestamp, soft-delete, address incl. `addr_*` prefix), tolerant of ragged table sets, confidence 0.8. **Generic pass:** non-family columns grouped by identical table-set signature (≥2 columns), confidence 0.62. Wired into `analyze()` after the wide-table detector.
- **`extension/src/refactoring/refactoring-plan-builder.ts`** (Phase 2) — `buildExtractPlan(columns, sourceTables, tablesMeta)` plus an `extract` case in `buildFor`. Emits a shared-table CREATE + per-source-table `ALTER ... ADD COLUMN ... REFERENCES` FK steps + a flagged-destructive backfill/drop step, a Drift `mixin` of the bundle columns (camelCase getters via the new exported `camelCaseFromSqlColumn`, types via the existing `sqlTypeForColumn`), and preflight warnings noting the mixin-vs-shared-table trade-off and the SQLite 3.35 DROP COLUMN requirement. Helpers added: `sharedExtractTableName`, `driftColumnGetter`.
- **`extension/src/test/refactoring-analyzer.test.ts`** (Phase 3) — new `describe('RefactoringAnalyzer extract detection')` with 5 golden fixtures: audit family across 3 tables (high confidence/severity), address family across ragged table sets, generic recurring group, below-threshold single-table column (no suggestion), and type-inconsistent column excluded.
- **`extension/src/test/refactoring-plan-builder.test.ts`** (Phase 3) — 2 cases: full extract plan (shared table, per-table FKs, destructive drop step, mixin with camelCase getter) and the advisory empty plan for an empty bundle.
- **`CHANGELOG.md`** — `[Unreleased]` Added entry.

**Why no panel/bridge/type changes.** `IRefactoringSuggestion.type` already included `'extract'` as a forward hook (Feature 66 v1), so the union is unchanged. The panel (`refactoring-panel.ts`) calls `buildFor` generically and the HTML renders suggestions without a type switch, so `extract` flows through unmodified. `refactoring-nl-bridge.ts` switches on `s.type` with a `default` arm that already produces a sensible NL prompt from the suggestion's title/description for `extract` — verified, no change needed.

**Testing.**
- Audited every consumer of the changed symbols (`RefactoringType`, the type-literal strings, `buildFor`, the new methods) via grep: only the two refactoring source files, their two test files, and `refactoring-nl-bridge.ts` (default-handled). No exhaustiveness switch breaks.
- `npm run compile` clean. `npm test` → **2669 passing** (was 2662; +7 new extract cases). Commands run from `extension/`.

**Constraint compliance.** No existing test deleted or weakened; existing normalize/split/merge analyzer and plan-builder tests untouched and still green (regression guard satisfied).

**Outstanding.** None. All three phases complete; acceptance criteria met (stable golden `extract` suggestion with evidence; no regression).

**Finish report appended:** plans/69-refactoring-extract-common-column-groups.md (this section). Plan fully complete → archived to plans/history/2026.06/2026.06.10/.
