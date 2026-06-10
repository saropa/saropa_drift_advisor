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
