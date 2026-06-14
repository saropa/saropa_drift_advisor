# Diagnostics: table attribution, exclusion key, and schema-cache freshness (audit M12)

Three independent diagnostics defects. `extractTableFromSql` matched a `FROM` clause before the INSERT/UPDATE/DELETE branches, so an `INSERT INTO logs SELECT * FROM users` was attributed to `users` (the source) instead of `logs` (the target), pinning the diagnostic to the wrong file. Per-table diagnostic exclusions never applied to runtime/query events because the consumer read `issue.data.tableName` while the runtime event converter wrote `issue.data.table`. And `SchemaIntelligence.checkGeneration` — intended to drop the schema-insights cache when the schema changes — was never called by anything, so insights (and the diagnostics built from them) served stale data until the 60-second TTL lapsed; the method also left `_cacheTime` and an in-flight load promise intact.

## Finish Report (2026-06-13)

### Scope

(B) VS Code extension (TypeScript). No Dart, no Flutter, no docs beyond the changelog.

### What changed

- **`extension/src/diagnostics/utils/sql-utils.ts`** — `extractTableFromSql` now tests anchored INSERT/UPDATE/DELETE patterns first (write target wins), falling back to the first `FROM` only for reads.
- **`extension/src/diagnostics/diagnostic-manager.ts`** — the per-table exclusion check reads `issue.data?.tableName ?? issue.data?.table`, so events that carry either key are suppressible.
- **`extension/src/engines/schema-intelligence.ts`** — `getInsights` captures its load promise locally and only commits the result if that load is still current (`this._loadPromise === load`), so a generation change mid-load cannot cache pre-migration data. `checkGeneration` now also resets `_cacheTime`, discards the in-flight load, and clears `_loading`.
- **`extension/src/extension-activation-event-wiring.ts`** — the schema-generation watcher now calls `d.intel?.schemaIntel.checkGeneration()` (before the diagnostics refresh), so the insights cache is dropped on a real generation change. This wiring did not exist; `checkGeneration` had no callers.

### Verification

- `tsc --noEmit -p ./` — clean.
- New `sql-utils-extract.test.ts`: INSERT…SELECT → target table, UPDATE/DELETE targets, plain SELECT → FROM table, quoted identifiers, null when absent.
- New `schema-intelligence-generation.test.ts`: `checkGeneration` returns true only when the generation advances and swallows a fetch error as no-change.
- Existing `diagnostic-manager.test.ts` passes unchanged. Full extension suite passes (2739).

### Outstanding

The relationship-engine FK cache still has no generation key (staleness bounded by its 60-second TTL, and `RelationshipEngine.invalidate()` exists for callers). Wiring that cache to the generation watcher is a smaller follow-up than the schema-insights path fixed here.
