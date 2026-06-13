# Relationship engine: depth, cycle guard, and correct safe-delete (audit H6)

The shared FK-traversal engine (used by Row Impact, Lineage, and Data Breakpoints) had several compounding defects. Recursive traversal overwrote each child's depth with the constant `1`, destroying nesting information. There was no cycle guard, so a self- or mutually-referential FK graph recursed to `maxDepth` issuing a query per level. The "safe delete" planner gated row deletes on `node.children.length > 0`, so LEAF rows — the ones that actually hold the foreign keys blocking the parent delete — were never deleted, and every delete used the root's primary-key column for every table. FK-value lookups hardcoded `WHERE id = …`, returning null for any table whose primary key is not named `id`.

## Finish Report (2026-06-13)

This work will be reviewed by another AI. — (chat-time note; not part of the durable record.)

### Scope

(B) VS Code extension (TypeScript). No Dart, no Flutter, no docs beyond the changelog.

### What changed

- **`extension/src/engines/relationship-types.ts`** — `IRelationshipNode` gains `pkColumn: string` so each node knows the column to delete its own row by.
- **`extension/src/engines/relationship-engine.ts`** —
  - `walkUpstream` / `walkDownstream` now thread an absolute `depth` (0 at the root, +1 per level) and a shared `visited` set keyed by `table:pkValue` that stops the first time a (table, pk) repeats — terminating cyclic graphs.
  - Each node records its own `pkColumn`: the root's from the caller, an upstream parent's from `fk.toColumn`, a downstream dependent's from its row (`id` if present, else the first selected column).
  - `_generateDeleteStatements` now emits a delete for EVERY dependent node, deepest-first, including leaves, each targeting `node.table` / `node.pkColumn`; the root row is deleted last by the caller. The `children.length > 0` gate is gone.
  - `_getFkValue` filters by the row's actual primary-key column instead of a hardcoded `id`.
  - All interpolated identifiers go through the shared `q()` quoter.

### Verification

- `tsc --noEmit -p ./` — clean.
- New `extension/src/test/relationship-engine.test.ts` (fake client over a users ← orders ← order_items schema): the delete plan includes both leaf `order_items` rows, orders each leaf before its parent and the root last, targets rows by `id`; and `walkDownstream` reports depths 0/1/2 down the chain. Full extension suite passes (2729).

### Outstanding

The downstream tree is row-based, so a delete plan for a row with very many dependents is bounded by `maxDepth`/`maxBreadth` (5/20 here) — unchanged by this fix; it caps plan size rather than guaranteeing exhaustive cascade for pathological fan-out. The cache's missing generation key (stale FK data after a migration) is a separate item (audit M12), addressed next.
