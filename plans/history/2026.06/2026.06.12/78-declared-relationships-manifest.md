# Feature 78: Declared-Relationships Manifest Channel

**Status: consumer shipped; host channel pending.** The web side that reads
relationship edges is **already built** — the wizard consumes `meta.foreignKeys`
and `inferForeignKeys` ([nl-to-sql.ts:702](../assets/web/nl-to-sql.ts)) already
keeps host-supplied edges verbatim and only fills genuine gaps. What remains is
the host→server **manifest channel** (this doc) so those edges arrive as
authoritative fact instead of being inferred.

A host-supplied **relationship manifest** — a list of parent→child links the
app already knows from its Dart code — that the advisor reads as **authoritative
ground truth**, with zero runtime DB risk (no `PRAGMA foreign_keys`, no
migration, no DDL). It feeds both the NL wizard's relationship engine and the
soft-relationship advisory ([77](./77-soft-relationship-advisory.md)).

Mirrors the existing **declared-schema** channel
([server_types.dart](../lib/src/server/server_types.dart) `DeclaredSchemaCallback`,
GET `/api/schema/declared`) exactly — same opt-in posture, same "host knows,
advisor reads" shape.

---

## 1. Motivation

The relationships in Saropa Contacts are fully known in the Dart table classes
(every table carries a `contactSaropaUUID`; the link semantics are obvious to
the developer). The *only* problem is that no standard SQLite/Drift surface
exposes them: `PRAGMA foreign_key_list` is empty because the app never calls
`.references()`, and it deliberately won't (see [77 §7](./77-soft-relationship-advisory.md)).

Today the web wizard recovers the relationships by **guessing** from column
names (`inferForeignKeys`, [nl-to-sql.ts:702](../assets/web/nl-to-sql.ts)).
Guessing is good enough to avoid dead-ends, but it's heuristic: it can miss a
non-conventional link, or infer a wrong one. The host *already has the exact
answer*. The manifest is the channel for the host to hand it over — turning a
heuristic into a fact.

This is strictly better than declaring SQLite FKs for this app:

- **No runtime DB risk** — it's metadata, read at request time. Nothing touches
  the database file, the connection pragma, or migrations.
- **Single source of relationship truth** — both the live Drift path *and* the
  prebuilt-`saropa_static.db` build path can be described by one manifest,
  instead of mirroring `.references()` in two schema sources.
- **Per-relationship, not all-or-nothing** — unlike the global
  `PRAGMA foreign_keys` switch, the manifest declares exactly the links that
  exist, one at a time.

### Non-goals

- No enforcement. The manifest never constrains writes; it's descriptive
  metadata only. (Integrity enforcement, if ever wanted, is the separate
  SQLite-FK path, not this.)
- No auto-derivation from Dart source in *this* feature. The host supplies the
  manifest however it likes (hand-written list, or generated from its own
  table-class annotations). Static extraction from Drift classes is a possible
  *future* convenience, noted in §7, not built here.

---

## 2. The data model

A manifest is a list of directed edges, identical in shape to the
`ForeignKey` interface the web side already consumes
([nl-to-sql.ts:20](../assets/web/nl-to-sql.ts):
`{ fromTable, fromColumn, toTable, toColumn }`).

### Dart types (new, in [server_types.dart](../lib/src/server/server_types.dart))

```dart
/// One declared relationship edge: fromTable.fromColumn references
/// toTable.toColumn. Descriptive only — the advisor reads it to know the link
/// exists; it never enforces it (no PRAGMA, no constraint). This is how a host
/// that links by convention (shared UUID) instead of SQLite foreign keys makes
/// its relationships visible to tooling.
class DeclaredRelationship {
  const DeclaredRelationship({
    required this.fromTable,
    required this.fromColumn,
    required this.toTable,
    required this.toColumn,
    this.label,           // optional human name ("contact → phones")
  });
  final String fromTable;
  final String fromColumn;
  final String toTable;
  final String toColumn;
  final String? label;
}

/// The full host-declared relationship manifest.
typedef DeclaredRelationships = List<DeclaredRelationship>;

/// Host-supplied callback returning the relationship manifest. When null the
/// endpoint reports availability:false (same opt-in posture as
/// [DeclaredSchemaCallback] and the orphan check's declaredTableNames).
typedef DeclaredRelationshipsCallback = DeclaredRelationships Function();
```

`label` is the only field beyond the edge tuple, and it has a real consumer
(the ER diagram / wizard chip text); per the "no fields for documentation only"
rule it stays optional and is omitted from JSON when null.

---

## 3. Wiring (mirror the declared-schema path end to end)

1. **[server_context.dart](../lib/src/server/server_context.dart)** — add a
   `DeclaredRelationshipsCallback? declaredRelationships` field, exactly beside
   the existing `declaredSchema` callback.
2. **`DriftDebugServer.start(...)`** ([drift_debug_server_io.dart](../lib/src/drift_debug_server_io.dart)
   + the stub) — add an optional `declaredRelationships` parameter, threaded
   into the context. Optional and defaulted, so no existing caller breaks.
3. **[schema_handler.dart](../lib/src/server/schema_handler.dart)** — a
   `sendDeclaredRelationships(response)` handler modeled on
   `sendDeclaredSchema` (L398): invoke the callback, JSON-encode the edges,
   report `available:false` when the callback is null, return 500 when it
   throws. Route it (see §4).
4. **[server_constants.dart](../lib/src/server/server_constants.dart)** — JSON
   keys (`jsonKeyFromTable`, etc. — reuse if the FK metadata path already names
   them; add only what's missing).

This is the same five-touch-point change the `driftType` / declared-schema
features already made; no new architectural surface.

---

## 4. Endpoint — decision

Two ways to expose it:

- **(a) Dedicated route** `GET /api/schema/relationships` →
  `{ available: bool, relationships: [{fromTable, fromColumn, toTable, toColumn, label?}] }`.
- **(b) Fold into metadata** — have
  `GET /api/schema/metadata?includeForeignKeys=1` *prefer* the manifest:
  emit manifest edges as the `foreignKeys` list when a manifest is supplied,
  else fall back to `PRAGMA foreign_key_list` as today.

**Recommendation: do both, with (a) as the source and (b) as a convenience.**
The dedicated route (a) is the clean, testable surface and the one the advisory
reads. The metadata fold (b) is what makes the **web wizard** pick the manifest
up with almost no client change — `loadSchemaMeta()`
([schema-meta.ts](../assets/web/schema-meta.ts)) already requests
`?includeForeignKeys=1` and assigns `meta.foreignKeys`. If the server seeds
`foreignKeys` from the manifest, the wizard is authoritative for free.

**Precedence rule (server side), most-trusted first:**
1. host manifest (if supplied) — authoritative;
2. declared SQLite FKs (`PRAGMA foreign_key_list`) — also authoritative;
3. nothing — the web client still runs `inferForeignKeys` over what it got, so a
   host with neither keeps today's heuristic behavior.

Manifest and PRAGMA FKs are *merged* (a host can have both), deduped by edge
identity. The manifest never has to restate a real SQLite FK.

---

## 5. Web side — manifest as ground truth, inference as fallback

Today: `nlToSql` unconditionally does `meta.foreignKeys = inferForeignKeys(meta)`
([nl-to-sql.ts:836](../assets/web/nl-to-sql.ts)), which *augments* whatever
`foreignKeys` arrived with soft edges.

Change: `inferForeignKeys` already dedupes inferred edges against the
`meta.foreignKeys` it's seeded with, so if `loadSchemaMeta` populates
`meta.foreignKeys` from the manifest (via §4(b)), the existing call **already
does the right thing** — manifest edges are kept verbatim, inference only fills
genuine gaps. The only web change needed is in
[schema-meta.ts](../assets/web/schema-meta.ts): when the metadata response
carries manifest-sourced edges, keep treating them as `foreignKeys` (no code
change if §4(b) reuses the same field — confirm the response shape).

Net: **the wizard's relationship chips and EXISTS predicates become exact when
a manifest is present, and degrade to inference when it isn't.** No converter
logic changes.

---

## 6. Interaction with the advisory ([77](./77-soft-relationship-advisory.md))

The manifest is what *resolves* a soft-relationship finding:

- An inferred edge that the manifest declares → **not** a finding (the
  relationship is now known to tooling). The advisory's whole purpose is to push
  the developer toward declaring exactly these.
- An inferred edge the manifest *omits* → still a finding ("data links these,
  nothing declares it"). The remedy text points at the manifest.

So the advisory's `manifestAvailable` flag and its subtraction of manifest edges
(77 §3) depend on this feature. Ship 78 first or alongside 77.

---

## 7. Future convenience (noted, not built)

A later helper could *generate* the manifest from the host's Drift table classes
(e.g. an annotation or a registry the app already maintains), so the developer
doesn't hand-maintain the edge list. Out of scope here — this feature defines
the *channel*; how the host fills it is the host's choice. Static extraction
from Dart source is the kind of thing the **extension** could do (it can read
workspace code), and is a natural follow-up once the channel exists.

---

## 8. Test plan

- **Dart handler test** ([test/declared_schema_test.dart](../test/declared_schema_test.dart)
  is the template):
  - supplied manifest → serialized edges, `available:true`, `label` emitted only
    when present;
  - no callback → `available:false`, empty list;
  - throwing callback → 500.
- **Metadata fold test** ([test/schema_handler_test.dart](../test/schema_handler_test.dart)):
  `?includeForeignKeys=1` returns manifest edges as `foreignKeys` when a manifest
  is supplied; falls back to PRAGMA FKs when not; merges + dedupes when both
  exist.
- **Test helper** ([test/helpers/test_helpers.dart](../test/helpers/test_helpers.dart)):
  `createTestContext` gains an optional `declaredRelationships` param (same as
  the `declaredSchema` param added for the driftType work).
- **Web** — a `loadSchemaMeta` test (or the existing nl-to-sql suite) asserting
  that manifest-sourced `foreignKeys` survive `inferForeignKeys` unchanged and
  inference only adds genuinely-missing edges.
- **Changelog** updated at implementation time.

---

## 9. Phasing & gates

- **Phase 1 — Dart channel.** Types + context field + `start()` param +
  `sendDeclaredRelationships` + route. Gate: handler tests green (available /
  unavailable / throws).
- **Phase 2 — metadata fold + precedence.** `?includeForeignKeys=1` prefers and
  merges the manifest. Gate: fold tests green; wizard picks manifest edges up
  end-to-end (manual check in the Ask panel).
- **Phase 3 — advisory integration.** Wire `manifestAvailable` + edge
  subtraction into [77](./77-soft-relationship-advisory.md). Gate: a manifested
  edge produces no finding.

Each phase ships independently; Phase 1 alone is inert until something reads the
channel.

---

## 10. Decisions (resolved 2026-06-11)

1. **Endpoint shape — both (§4).** Dedicated `GET /api/schema/relationships` is
   the authoritative source the advisory reads; the metadata fold
   (`?includeForeignKeys=1` emitting manifest edges as `foreignKeys`) is the
   convenience that makes the web wizard pick the manifest up with no client
   change. The fold reuses the existing `foreignKeys` field — no new client
   field.
2. **Manifest + PRAGMA FKs — merge + dedupe.** A host may declare some SQLite
   FKs and manifest the rest; both are authoritative and combined, deduped by
   edge identity. Precedence for *labels/extras* on a duplicate edge: manifest
   wins.
3. **`label` field — keep, optional.** Real consumer is the ER-diagram / wizard
   chip text; omit from JSON when null. If the diagram tie-in is still deferred
   at ship time and nothing else reads it, drop the field then (no field for
   documentation only) — but it ships defined.
4. **Cardinality / link-type metadata — omit for v1.** The four-field edge tuple
   is sufficient for EXISTS predicates and the advisory. Add one-to-many /
   many-to-many only when a concrete consumer needs it.

---

## Finish Report (2026-06-11)

**Scope shipped: Phase 1 (Dart channel) + Phase 2 (metadata fold).** Phase 3
(advisory / orphan-row integration with Features 77 + the
`FEATURE_orphan_row_check_consume_declared_relationships` spec) is a separate
active workstream and is NOT part of this change — this plan stays in the active
tree until that lands.

### What changed

- **`DeclaredRelationship` type + manifest typedefs**
  ([server_types.dart](../lib/src/server/server_types.dart)) — the directed-edge
  record (`fromTable`/`fromColumn`/`toTable`/`toColumn`, optional `label`, and
  `orphanCheckable` default-true), plus `DeclaredRelationships` and
  `DeclaredRelationshipsCallback`. (The `orphanCheckable` field was added to the
  type by the parallel orphan-row workstream; this change carries it through the
  serialization channel so the manifest is exposed losslessly.)
- **Context + start() wiring** — `ServerContext.declaredRelationships`
  ([server_context.dart](../lib/src/server/server_context.dart)) and an optional
  `declaredRelationships` parameter threaded through both `start()` forms
  ([drift_debug_server_io.dart](../lib/src/drift_debug_server_io.dart)) and the
  web stub ([drift_debug_server_stub.dart](../lib/src/drift_debug_server_stub.dart)).
  All optional/defaulted — no existing caller breaks.
- **Dedicated endpoint** `GET /api/schema/relationships`
  ([schema_handler.dart](../lib/src/server/schema_handler.dart)
  `sendDeclaredRelationships`, routed in
  [router.dart](../lib/src/server/router.dart)) — serializes the manifest;
  `available:false` + empty list when no callback; 500 when the callback throws.
  `label` and `orphanCheckable:false` are emitted only when set (omit-default
  convention; absence of `orphanCheckable` means true).
- **Metadata fold** — `getSchemaMetadataList(includeForeignKeys: true)` now seeds
  each table's `foreignKeys` from the manifest (authoritative) before merging
  PRAGMA FKs, deduped by edge identity `(fromColumn, toTable, toColumn)`;
  manifest wins on a duplicate edge (its label survives), per §10.2. A PRAGMA
  failure no longer drops already-seeded manifest edges. The web wizard picks
  these up with **no client change**: `schema-meta.ts` flattens per-table
  `foreignKeys` into `meta.foreignKeys`, and `inferForeignKeys` seeds from and
  dedupes against that, so manifest edges survive verbatim and inference only
  fills genuine gaps (§5 confirmed by reading
  [nl-to-sql.ts:702](../assets/web/nl-to-sql.ts)).
- **Public exports** ([saropa_drift_advisor.dart](../lib/saropa_drift_advisor.dart))
  — `DeclaredRelationship`, `DeclaredRelationships`,
  `DeclaredRelationshipsCallback`.
- **Constants** — `pathApiSchemaRelationships`(+Alt), `jsonKeyRelationships`,
  `jsonKeyOrphanCheckable` ([server_constants.dart](../lib/src/server/server_constants.dart)).
- **Tests** — new
  [test/declared_relationships_test.dart](../test/declared_relationships_test.dart)
  (serialize + label/orphanCheckable conditional emission, available:false,
  500-on-throw); two metadata-fold cases added to
  [test/schema_handler_test.dart](../test/schema_handler_test.dart) (manifest
  surfaces as `foreignKeys` with no PRAGMA; merge + dedupe with manifest label
  winning). `createTestContext` gained an optional `declaredRelationships`
  param.
- **Changelog** — Added entry under `[Unreleased]`.

### Gate

- `dart analyze` (full package): **No issues found.**
- `dart test` (full suite): **All 608 tests passed**, including the parallel
  workstream's `anomaly_detector_test.dart`.

### Not done here (separate scope)

- Phase 3 advisory / orphan-row consumption (Feature 77 +
  `FEATURE_orphan_row_check_consume_declared_relationships`) — actively owned by
  another workstream; its `anomaly_detector.dart` already reads
  `ServerContext.declaredRelationships` directly (the Dart object, not this
  endpoint's JSON).
- No host-side manifest generation — the host supplies the callback (plan §7).
