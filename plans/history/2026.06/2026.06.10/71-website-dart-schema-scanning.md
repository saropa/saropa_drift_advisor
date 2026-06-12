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

- Owner: shipped
- Target: shipped 2026-06-10 (Option A)
- State: complete
- Evidence: extension reference parser `extension/src/schema-diff/dart-parser.ts`;
  callback precedent `lib/src/server/orphan_table_detector.dart`.

---

## Finish Report (2026-06-10) — Option A (Phases 1–3)

**Scope.** (A) Dart package (`lib/`, `test/`) + web assets (`assets/web/`). Implemented **Option A** (host-provided declared-schema callback) as the plan recommended; Option B (porting the TS parser to Dart) was not built — it is only needed for scanning without a running app, which no consumer requires.

**What changed.**
- **`lib/src/server/server_types.dart`** (Phase 1) — new `DeclaredColumn`, `DeclaredTable`, `DeclaredSchema` (typedef), and `DeclaredSchemaCallback` (typedef).
- **`lib/src/server/server_context.dart`** (Phase 1) — `declaredSchema` callback field/param, mirroring `declaredTableNames`.
- **`lib/src/drift_debug_server_io.dart`** / **`drift_debug_server_stub.dart`** — `declaredSchema` threaded through both `start` declarations and the stub; passed to `ServerContext`.
- **`lib/saropa_drift_advisor.dart`** — exports the four declared types (via `show`, keeping internal `Snapshot` private) so hosts can build a callback.
- **`lib/src/start_drift_viewer_extension.dart`** — `_deriveDeclaredSchema` duck-types a Drift `GeneratedDatabase` (`allTables` → `actualTableName`, `$columns`/`name`/`type`/`$nullable`, `$primaryKey`) and is wired into `startDriftViewer`. Per-table try/catch (logged debug-only) so one malformed table can't drop the rest; non-Drift dbs yield null → tab stays empty. `_declaredSqlType` maps the `DriftSqlType` enum to a SQLite storage type.
- **`lib/src/server/schema_handler.dart`** (Phase 2) — `sendDeclaredSchema`: serializes the callback result to `{available:true, tables:[{name, columns:[{name,sqlType,nullable,isPk}], indexes}]}`; `{available:false, tables:[]}` when no callback; 500 (logged) if the host callback throws.
- **`lib/src/server/server_constants.dart`** — `pathApiSchemaDeclared` (+Alt) and `available`/`sqlType`/`nullable`/`isPk`/`indexes` keys (reused existing `name`/`columns`/`tables`).
- **`lib/src/server/router.dart`** — `GET /api/schema/declared` in `_routeSchemaApi`, ahead of and independent of the change-detection-gated metadata routes (it issues no DB queries).
- **`assets/web/declared-schema.ts`** (new, Phase 3) + `app.js` (import/init) + `state.ts` (`TOOL_LABELS.declared`) + `html_content.dart` (toolbar launcher `data-tool="declared"` + `panel-declared`). Renders a per-table collapsible column list; shows a clear "not available" note when the host supplied nothing. `bundle.js` rebuilt.
- **`CHANGELOG.md`** — `[Unreleased]` Added entry.

**Deviation from plan (intentional).** The plan said "new tab"; it was implemented as a **tool tab via the existing `data-tool` → `openTool` → `panel-*` system** (the same mechanism every other tool uses), which is the lowest-risk integration and avoids touching the dynamic tab-bar internals. The stretch goal (declared-vs-runtime divergence rendering) was **not** built — it's an additive enhancement on top of this endpoint and not required by the exit gate.

**Testing.**
- **New `test/declared_schema_test.dart`** — 3 cases: supplied callback serialized (columns/types/pk/nullable/indexes, default nullable), no-callback → `available:false`, throwing callback → 500.
- `dart analyze` clean (`No issues found!`); `dart test` → **582 passing** (+3). `npm run typecheck:web` clean; bundle rebuilt. No existing web-contract test broke from the new tool/panel.

**l10n.** SKIPPED [web-not-Flutter] — the web viewer is plain-English HTML outside the Flutter ARB catalog.

**Outstanding.** None for Option A's exit gate (with a callback the tab lists code-declared tables/columns; without one the tab is empty, no errors). The auto-derive from Drift internals is best-effort duck-typing — if a future Drift version renames `$columns`/`$primaryKey`, derivation falls back to empty (logged), and the explicit `declaredSchema` callback remains exact. Stretch divergence view and Option B remain unbuilt by design.

**Finish report appended:** plans/71-website-dart-schema-scanning.md (this section). Complete (Option A) → archived to plans/history/2026.06/2026.06.10/.
