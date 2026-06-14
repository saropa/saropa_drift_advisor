# Modularize relationship-engine.ts (300-line limit)

The unified FK-traversal engine for Row Impact Analysis, Lineage Tracer, and Data
Breakpoints had grown to 312 lines, over the repository's 300-line-per-file quality
gate. The file mixed the engine's public traversal/delete-planning API with a set of
low-level, stateless helpers (SQL literal rendering, two query helpers, and two
relationship-tree walkers) that did not depend on engine instance state. Extracting
those helpers brings the file back under the limit and follows the split the engine
already used for its cache and its type definitions.

## Finish Report (2026-06-14)

### Scope

(B) VS Code extension TypeScript. Pure internal refactor — no behavior change, no
user-facing surface, no Dart/Flutter code.

### What changed

- New module `extension/src/engines/relationship-engine-sql.ts` (128 lines) holds five
  free functions lifted verbatim from the engine:
  - `sqlLiteral(value)` — value-to-SQL-literal coercion (single place strings are escaped).
  - `getFkValue(client, table, column, pkColumn, pkValue)` — reads one FK column from a row
    by its primary key; the API client is now passed in rather than read off `this`.
  - `getDependentRows(client, table, column, value, limit)` — fetches referencing rows as
    column-name records.
  - `collectTables(node, result, relationship, seen)` — flattens a relationship subtree into
    a deduplicated affected-table list.
  - `generateDeleteStatements(node, statements, seen)` — emits DELETEs for every dependent
    node deepest-first, each by its own primary-key column.
- `extension/src/engines/relationship-engine.ts` (312 → 220 lines) drops the five private
  methods and calls the imported functions instead; the two query helpers receive
  `this._client` as their first argument. All comments explaining the cycle guard, the
  leaf-delete rationale (audit H6), and the non-`id` primary-key fix were preserved on the
  moved functions.

The functions were moved without modification to their logic. The recursive helpers now
call their own free-function names instead of `this._...`, which is the only edit to their
bodies.

### Why this split

The module mirrors the existing decomposition: `relationship-engine-cache.ts` already holds
the TTL-cached FK/schema fetchers, and `relationship-types.ts` holds the shared interfaces.
Stateless SQL/tree helpers are the natural third extraction — they hold no engine state, so
moving them to free functions keeps them independently unit-testable and leaves the engine
class focused on traversal orchestration and the change-notification surface.

### Verification

- `tsc --noEmit -p tsconfig.json` (full extension type-check): clean, zero errors. This
  confirms the moved signatures, the added `this._client` arguments, and the removed private
  methods all resolve, and that no import is left unused.
- `relationship-engine.test.ts` run via `mocha --grep "RelationshipEngine"`: 2 passing. The
  suite exercises the public API only (`generateSafeDeleteSql`, `walkDownstream`, `dispose`)
  — the H6 safe-delete ordering test and the absolute-depth test — both of which route
  through the relocated helpers, so a green run proves the extraction preserved behavior.
- Repository grep for the old private method names (`_sqlLiteral`, `_getFkValue`,
  `_getDependentRows`, `_collectTables`, `_generateDeleteStatements`) across `src`/`test`:
  no remaining references.
- Line counts after the split: engine 220, new module 128.

### Tests

No new tests were added: the change is a pure extraction with no new behavior, and the
existing test already pins the observable behavior of every moved helper through the public
API. No existing assertion referenced the moved private methods, so none required updating.

### Tracking

CHANGELOG documents the refactor in the `[4.0.0]` Maintenance block (the code shipped in
that release commit). No bug or plan file described this work, so this report is the durable
record. No README/product facts changed.
