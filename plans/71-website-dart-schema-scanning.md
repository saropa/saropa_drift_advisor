# Feature 71: Website Dart Schema Scanning

**Status: PLANNED** — split out of the archived GAP parity analysis (originally
WP-A03 / section 5 row "Dart schema scanning"). The website cannot yet derive a
schema by scanning Dart Drift source; the extension can. This is the remaining
schema-parity gap.

Source: [GAP_FIT_PLAN.md (archive)](./history/2026.06/2026.06.10/GAP_FIT_PLAN.md) §5.

## Gap

| Surface | Capability                | State       |
| ------- | ------------------------- | ----------- |
| W       | Dart schema scanning      | **missing** |
| E       | Dart schema scanning      | present     |

Effort/usefulness were never estimated (carried as `N/A` in the parity table);
the first deliverable is to set concrete values or defer with a milestone.

## Tasks

- Define the website UI entry point and the scan output format.
- Implement the scan pipeline; surface errors with actionable guidance.
- Document supported inputs and limitations.
- Re-estimate effort/usefulness from `N/A` to concrete values.

## Exit criteria

- If implemented: website runs a schema scan from a UI flow and a manual
  verification pass succeeds.
- If deferred: owner + milestone + rationale recorded here.

## Implementation Plan

### Key decision: where does the "code" schema come from?

The extension scans `.dart` source text in the workspace. The website is a
runtime HTTP server living *inside the host Drift app* — it has no guaranteed
access to the project's source files, but it *does* run alongside the live Drift
database objects. Two approaches:

- **Option A (recommended) — host-provided declared schema callback.** The host
  app already holds the declared Drift schema in memory. Extend the existing
  optional-callback pattern (`ServerContext.declaredTableNames`, already used by
  the orphan-table detector — `lib/src/server/orphan_table_detector.dart`) to a
  richer `declaredSchema` callback returning tables → columns/types/indexes.
  No source parsing, no file access, no regex fragility; the schema is exact.
  Enables true code-vs-runtime schema diff.
- **Option B — port the TS parser to Dart.** Reproduce `parseDartTables()` from
  `extension/src/schema-diff/dart-parser.ts` (+ `dart-schema.ts` types,
  `dart-parser-utils.ts` helpers) in Dart and have the server read source from a
  host-configured path. Only needed if the host genuinely cannot supply schema
  objects. Carries the parser's regex limitations and a new file-access surface.

Recommendation: ship Option A. Reconsider B only if a consumer needs scanning
without a running app instance.

### Phase 1 — Declared-schema callback (Option A)

- Add an optional `DeclaredSchema Function()?` callback to `ServerContext`
  (`lib/src/server/server_context.dart`), mirroring how `declaredTableNames` is
  threaded through `startDriftViewer` / `startDriftViewerExtension`
  (`lib/src/start_drift_viewer_extension.dart`, `lib/src/drift_debug_server_io.dart`).
- Define the result shape in `lib/src/server/server_types.dart` (table name →
  list of {column, sqlType, nullable, isPk, indexes}). Reuse the JSON-key
  constants convention in `server_constants.dart`.
- Gate: with no callback supplied the feature stays silent (same opt-in posture
  as the orphan detector — never a false positive).

### Phase 2 — Endpoint

- New `GET /api/schema/declared` registered in `_routeSchemaApi()`
  (`lib/src/server/router.dart`), served by a `sendDeclaredSchema()` method on a
  handler following `SchemaHandler` (`lib/src/server/schema_handler.dart`).
- Add `pathApiSchemaDeclared` to `server_constants.dart`.

### Phase 3 — Web viewer UI

- New `assets/web/declared-schema.ts` following the `schema.ts`
  `loadSchemaView()` fetch → render pattern; cache in `state.ts`.
- Add a toolbar/tab entry in `lib/src/server/html_content.dart` and wire the tab
  switch in `app.js`.
- Stretch: reuse the existing schema-diff rendering to show declared-vs-runtime
  divergence (pairs naturally with the orphan-table check).

### Exit gate

- Start the viewer with a host that supplies the declared-schema callback; the
  new tab lists the code-declared tables/columns and (stretch) flags divergence
  from the live DB. With no callback, the tab is absent/empty — no errors.

## Tracking

- Owner: TBD
- Target: TBD
- State: planned
- Evidence: extension reference parser `extension/src/schema-diff/dart-parser.ts`;
  callback precedent `lib/src/server/orphan_table_detector.dart`.
