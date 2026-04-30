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
