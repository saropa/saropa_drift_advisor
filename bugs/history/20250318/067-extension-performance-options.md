# Extension performance options — IMPLEMENTED

**Status:** Fully implemented.  
**Plan:** plans/67-extension-performance-options.md (moved here after implementation).

## Summary

- **Schema cache:** In-memory cache with TTL + optional last-known persist; cached client used by tree, Schema Search, ER diagram, etc. Invalidated on server/generation change; prewarm on connect.
- **Lazy Database tree:** `driftViewer.database.loadOnConnect` (default true); when false, tree loads on first view visibility.
- **Lightweight mode:** `driftViewer.lightweight` skips badges, timeline auto-capture, tree/badges refresh on generation change.
- **Schema Search:** Configurable timeout and cross-ref cap; "Browse all tables" (tables only, no cross-refs); empty query short-circuit; idle state on open.
- **Reliability:** Tree providers never throw from `getChildren`; Schema Search always reaches a resolved state.
- **Stale-while-revalidate:** Cache `onDidUpdate` refreshes tree when background revalidate completes.

## Config keys added

`driftViewer.database.loadOnConnect`, `driftViewer.schemaCache.ttlMs`, `driftViewer.schemaCache.persistKey`, `driftViewer.schemaSearch.timeoutMs`, `driftViewer.schemaSearch.crossRefMatchCap`, `driftViewer.lightweight`.

## Files changed

Schema cache (new): `extension/src/schema-cache/schema-cache.ts`, `cached-drift-client.ts`.  
Modified: `extension.ts`, schema-search (engine, view, types, html), tree providers (drift, tools), package.json, tests, CHANGELOG, README.
