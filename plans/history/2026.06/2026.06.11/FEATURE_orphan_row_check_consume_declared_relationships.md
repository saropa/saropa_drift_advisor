# FEATURE / ENHANCEMENT: Orphan-row anomaly check must consume the host's declared relationship manifest, not only `PRAGMA foreign_key_list`

> Type: Feature / Enhancement (NOT a runtime crash). Severity: Medium — a whole class of orphan-row anomalies is invisible for any host that links by convention (shared UUID column) instead of SQLite foreign keys.
> Labels: `enhancement`, `anomaly-detector`, `feature-78`, `needs-design-decision`.
> Status: Fixed — advisor side implemented (proposals A, B, C.1, E). Host companion task D tracked in the Contacts repo.

## CRITICAL NOTE
This work will be reviewed by another AI. Written for fast, skeptical verification. Every code claim below is anchored to a `file:line` proven by grep; the grep commands are in the Emitter Attribution section. The single most important finding: **Feature 78 already wired the declared-relationship manifest into the SCHEMA / wizard / ER-diagram path, but NOT into the orphan-ROW anomaly check** — that check still drives its `LEFT JOIN` exclusively from `PRAGMA foreign_key_list`, which is empty for a host that declares no SQLite FKs. Read the Root Cause before the proposal.

---

## 1. Title
The anomaly detector's orphan-row check (`_detectOrphanedForeignKeys`) builds its `LEFT JOIN` only from `PRAGMA foreign_key_list`, so for a host that links tables by a shared UUID column and declares ZERO SQLite foreign keys (Saropa Contacts), no UUID relationship is ever orphan-checked.

## 2. Environment
This is a code-state finding, not a runtime reproduction — the gap is visible by reading the source, no running app required.

| Field | Value |
|---|---|
| Repo | `saropa_drift_advisor` |
| Extension version | `3.7.1` (`extension/package.json`) |
| Advisor server tree | `lib/src/server/` (Dart) |
| Host that exhibits the gap | Saropa Contacts (`d:/src/contacts`) — Drift schema with zero `.references(`; links by `*_saropa_uuid` columns |
| Manifest produced by host | `.saropa/schema/relationship_hints.json` (generator: `scripts/schema/generate_relationship_hints.py` in the Contacts repo) |

## 3. Steps to Reproduce (by inspection)
1. Connect the advisor to a host whose Drift schema declares NO SQLite foreign keys but links tables by a shared UUID column (Saropa Contacts: e.g. `contact_points.contact_saropa_u_u_i_d` references `contacts.contact_saropa_u_u_i_d`, no `REFERENCES`).
2. Run the anomaly detector (the `/api/issues` / anomaly path that calls `AnomalyDetector._detectOrphanedForeignKeys`).
3. Observe which orphan-row anomalies are reported for the UUID relationships.

## 4. Expected Behavior
For each declared (convention-based) relationship the host exposes via the Feature 78 manifest, the advisor LEFT-JOINs child→parent on the manifest's explicit child/parent columns and reports any child rows whose parent UUID has no matching parent — as a **warning** (these orphans are expected in an offline-first app, not corruption).

## 5. Actual Behavior
Zero orphan-row anomalies are produced for the UUID relationships. `_detectOrphanedForeignKeys` enumerates `PRAGMA foreign_key_list("$tableName")`, which returns an empty set because the host declares no SQLite FKs, so the loop body never runs and no relationship is joined. The host's `declaredRelationships` manifest — already consumed by the schema metadata path — is not consulted here at all.

---

## ROOT CAUSE (verified)

Two facts, both grep-anchored:

**(a) Feature 78 plumbing exists and is consumed by the schema/wizard path.**
- Edge type `DeclaredRelationship { fromTable, fromColumn, toTable, toColumn, label? }` — `lib/src/server/server_types.dart:97-115`.
- Callback `DeclaredRelationshipsCallback = DeclaredRelationships Function()` — `server_types.dart:124`; field `ServerContext.declaredRelationships` — `lib/src/server/server_context.dart:167`.
- Schema metadata fold seeds each table's `foreignKeys` from the manifest BEFORE falling back to PRAGMA — `lib/src/server/schema_handler.dart:203-232` (gated on `includeForeignKeys`).
- Endpoint `GET /api/schema/relationships` returns the manifest — `schema_handler.dart:511+`.
- The type's own doc states its purpose: "turning the web wizard's column-name heuristic into a fact" (`server_types.dart:96`). So the WIZARD / DIAGRAM side is done.

**(b) The orphan-ROW anomaly check does NOT consume it.**
- `AnomalyDetector._detectOrphanedForeignKeys` — `lib/src/server/anomaly_detector.dart:549-595`.
- Its only relationship source is `PRAGMA foreign_key_list("$tableName")` — `anomaly_detector.dart:556`. It never reads `ServerContext.declaredRelationships`.
- For a zero-FK host the PRAGMA returns no rows → the `for (final fk in fkRows)` loop (`:559`) never iterates → no `LEFT JOIN` (`:572-576`) runs → no `orphaned_fk` anomaly (`:582-591`) is emitted for any UUID relationship.

Net: the advisor has the manifest in hand on the schema side, but the orphan-row check is blind to it. This is the gap. (NOTE: orphan-row is distinct from `OrphanTableDetector` in `lib/src/server/orphan_table_detector.dart`, which finds physical TABLES absent from the schema — unrelated to this report.)

---

## PROPOSED WORK (advisor side)

Three changes in `lib/src/server/`, plus one companion task in the host. Recommendation given for each decision per the guide's "name your pick" rule.

### A. Make the orphan-row check consume `declaredRelationships` in addition to `PRAGMA foreign_key_list`
In `_detectOrphanedForeignKeys` (`anomaly_detector.dart:549`), union the PRAGMA-derived edges with the host's declared edges for `tableName`, dedup on `(fromColumn, toTable, toColumn)`, and run the existing `LEFT JOIN` (`:572-576`) for each. The join already takes explicit `fromCol`/`toCol`, so the manifest's differing physical names are handled with no heuristic — e.g. Contacts' `contact_reaction_records.contact_saropa_uuid` → `contacts.contact_saropa_u_u_i_d` (the two physical names differ because Drift's default naming splits `contactSaropaUUID` into `contact_saropa_u_u_i_d` while two tables force `.named('contact_saropa_uuid')`; a same-name heuristic would mis-link or miss them — the manifest carries both names explicitly).
- The detector is currently a pure static function taking only `query`/`tableName`/`tableNames`/`anomalies`. Pass the declared edges in as a parameter (keep it pure — resolve `ServerContext.declaredRelationships` at the caller and hand down a `List<DeclaredRelationship>`), so the unit-test surface stays parameter-only.

### B. Severity: declared-relationship orphans are WARNINGS, not errors
The current emit hardcodes `'severity': 'error'` (`anomaly_detector.dart:586`). For a convention-linked host, an orphan is EXPECTED steady state (offline-first: out-of-order sync, soft-deleted parents), not corruption. An orphan found via a real, SQLite-ENFORCED FK is still an `error`; an orphan found ONLY via a declared (non-enforced) edge must be `warning`. Branch the severity on the edge's source: PRAGMA-FK edge → keep `error`; declared-only edge → `warning`. **Recommendation:** carry the source through and set severity accordingly; do not blanket-downgrade (a host that DOES declare FKs should keep error semantics).

### C. Decision needed: filter non-joinable edges — add `orphanCheckable` to `DeclaredRelationship`
The host manifest contains edge KINDS that must NOT be scalar-orphan-checked:
- `scalar_ref` / `self_ref` → orphan-checkable (a single child column holds one parent UUID). In the Contacts manifest: 13 + 1 = 14 edges.
- `list_ref` → a JSON-array column (many UUIDs in one text cell). A scalar `LEFT JOIN ... ON t.col = r.col` is WRONG for these. 7 edges.
- `seed_identity` → a static-data UUID that BECOMES a contact UUID when seeded; not a foreign key. 6 edges.

`DeclaredRelationship` (`server_types.dart:97`) has no kind/flag today, so a consumer cannot tell a joinable edge from a list/seed edge. Two options:
1. **(Recommended)** Add an optional `bool orphanCheckable` (default `true`) to `DeclaredRelationship`. The orphan-row check filters on it; the wizard / ER diagram keep using ALL edges (they WANT list_ref links for the graph). This maps 1:1 to the manifest's existing `orphan_checkable` field — no host-side information loss.
2. Host supplies ONLY the 14 orphan-checkable edges to `declaredRelationships`. Simpler advisor change, but the wizard/diagram then lose the 13 list/seed relationships — a regression for Feature 78's stated purpose. Rejected for that reason.

### D. Companion task (HOST repo — NOT this repo): supply the callback from the manifest
Saropa Contacts must set `ServerContext.declaredRelationships` to a callback that reads `.saropa/schema/relationship_hints.json` and maps each `relationships[]` entry to a `DeclaredRelationship`: `child_table→fromTable`, `child_column→fromColumn`, `parent_table→toTable`, `parent_column→toColumn`, `kind`→`label`/`orphanCheckable`. This is host wiring, tracked in the Contacts repo (the manifest + generator already shipped there: `docs/history/2026.06/2026.06.11/PROPOSAL_relationships_as_nonenforcing_foreign_key_hints.md`). Listed here only so the advisor-side reviewer knows the two halves and does not assume the advisor must read the JSON file itself — it consumes a host callback, consistent with the existing Feature 78 contract.

### E. Verify the TypeScript surface passes the new warning through
`extension/src/diagnostics/checkers/anomaly-checker.ts:38` already handles the column-scoped `orphaned_fk` finding. Confirm it maps `severity: 'warning'` to a VS Code `Warning` diagnostic (not hardcoding Error) so declared-orphan findings render at the right level. Report-only verification; likely no change.

---

## Emitter Attribution

Single `(owner, code)` pair involved — the orphan-row anomaly.

| Field | Value |
|---|---|
| `type` (finding code) | `orphaned_fk` |
| Constructed at | `lib/src/server/anomaly_detector.dart:582-591` (the `anomalies.add({... 'type': 'orphaned_fk' ...})`) |
| Emit driver | `_detectOrphanedForeignKeys` — `anomaly_detector.dart:549-595` |
| TS consumer | `extension/src/diagnostics/checkers/anomaly-checker.ts:38` (column-scoped handling) |
| Grep (both trees) | `grep -rn "orphaned_fk" lib/src extension/src` → `lib/src/server/anomaly_detector.dart:585`, `extension/src/diagnostics/checkers/anomaly-checker.ts:38` |
| Sibling-repo negative grep | `grep -rn "orphaned_fk" ../saropa_lints/lib` → 0 matches |

Mixed-language note: the only DART emit site is `anomaly_detector.dart:585`; the TS side at `anomaly-checker.ts:38` consumes/renders, it does not emit. No second emit path.

Feature 78 plumbing referenced above, grep-anchored:
- `grep -rn "declaredRelationships" lib/src/server` → `server_context.dart:53,167`, `schema_handler.dart:213`, plus the typedef in `server_types.dart:124`.
- `grep -rn "class DeclaredRelationship" lib/src/server/server_types.dart` → `server_types.dart:97`.

## 8. Minimal Reproducible Example
Schema (host, no FKs declared):
```sql
CREATE TABLE contacts (id INTEGER PRIMARY KEY, contact_saropa_u_u_i_d TEXT);
CREATE UNIQUE INDEX idx_c ON contacts (contact_saropa_u_u_i_d);
CREATE TABLE contact_points (id INTEGER PRIMARY KEY, contact_saropa_u_u_i_d TEXT);
INSERT INTO contacts VALUES (1, 'uuid-A');
INSERT INTO contact_points VALUES (1, 'uuid-MISSING');  -- orphan
```
Declared manifest edge the host would supply:
```
{ fromTable: contact_points, fromColumn: contact_saropa_u_u_i_d,
  toTable: contacts, toColumn: contact_saropa_u_u_i_d, orphanCheckable: true }
```
Today: `_detectOrphanedForeignKeys` reports nothing (no PRAGMA FK). Desired: one `orphaned_fk` warning, `1 orphaned FK(s): contact_points.contact_saropa_u_u_i_d -> contacts.contact_saropa_u_u_i_d`.

## 9. What I Already Verified
- Feature 78 IS consumed by the schema metadata fold (`schema_handler.dart:203-232`) — confirmed by reading the file, not assumed.
- The orphan-row check's ONLY relationship source is the PRAGMA (`anomaly_detector.dart:556`) — confirmed; `declaredRelationships` appears nowhere in `anomaly_detector.dart` (`grep -rn "declaredRelationships" lib/src/server/anomaly_detector.dart` → 0 matches).
- `orphan_table_detector.dart` is a different concern (physical orphan TABLES, not rows) — read in full; not part of this gap.

## 10. Impact
- **Who:** any host that links by convention instead of SQLite FKs — Saropa Contacts today; the Feature 78 doc explicitly anticipates this host shape.
- **What is blocked:** the entire orphan-ROW anomaly class for UUID relationships is silent. The advisor reports "no orphaned FKs" when it simply never looked.
- **Data risk:** none from the advisor (the check is read-only and report-only). The risk is a FALSE sense of integrity — silence read as "clean."
- **Frequency:** every anomaly run against a zero-FK host.

## Outstanding decision for the maintainer
Adopt option C.1 (`orphanCheckable` flag on `DeclaredRelationship`) vs C.2 (host pre-filters edges). Recommendation: C.1 — preserves all 27 edges for the wizard/diagram while letting the orphan check use only the 14 joinable ones.

# END OF REPORT

---

## Finish Report (2026-06-11)

This work will be reviewed by another AI.

### Scope
**(A)** Dart package code (`lib/src/server/`, `test/`). No extension/TypeScript code changed (section E was a report-only verification of existing TS — confirmed correct, no edit). No docs/scripts beyond CHANGELOG + this archive.

### What was implemented (proposals A, B, C.1, E)
- **C.1 — `orphanCheckable` flag.** Added `final bool orphanCheckable` (default `true`) to `DeclaredRelationship` (`lib/src/server/server_types.dart`). The orphan-row check filters on it; the wizard / ER-diagram path is untouched and still uses every edge. Maps 1:1 to the host manifest's `orphan_checkable` field, so no host information is lost. Option C.2 (host pre-filters) was rejected per the report — it would strip list/seed edges the wizard wants.
- **A — union the two relationship sources.** `AnomalyDetector._detectOrphanedForeignKeys` (`lib/src/server/anomaly_detector.dart`) now builds its candidate edge set from BOTH `PRAGMA foreign_key_list` AND the host's declared edges, deduping on the `(fromColumn, toTable, toColumn)` join triple. The existing `LEFT JOIN child.fromCol = parent.toCol` runs per edge, so the manifest's differing physical column names are handled with no same-name heuristic. `getAnomaliesResult` gained an optional `List<DeclaredRelationship> declaredRelationships` param (default empty); it narrows the manifest per-table by `fromTable == tableName && orphanCheckable` before handing the slice to the detector. A new private `_OrphanEdge` value type normalizes both sources and carries an `enforced` flag.
- **B — severity by source.** Enforced PRAGMA-FK orphan → `error` (real corruption the engine should have blocked). Declared-only (unenforced) orphan → `warning` (expected steady state in an offline-first host: out-of-order sync, soft-deleted parents). A link that is BOTH declared and an enforced FK dedups to the single `error`, never doubled or downgraded.
- **Wiring.** `AnalyticsHandler` (`lib/src/server/analytics_handler.dart`) gained `_resolveDeclaredRelationships()` — resolves `ServerContext.declaredRelationships`, returning empty on a null OR throwing callback (skip-on-throw, mirroring the schema-metadata fold). Both anomaly call sites (`getAnomaliesResult` and `getIssuesList`) feed it through. The detector stays pure/parameter-only for tests.
- **E — TS verified, no change.** `extension/src/diagnostics/checkers/anomaly-checker.ts:59-64` already maps `severity: 'warning'` → `vscode.DiagnosticSeverity.Warning`. Declared-orphan warnings render at Warning level. The message regex `/(\w+)\.(\w+)/` resolves the table+column correctly from the new message text.

### Companion task D (NOT this repo)
Saropa Contacts (`d:/src/contacts`) must set `ServerContext.declaredRelationships` to a callback that reads `.saropa/schema/relationship_hints.json` and maps each entry to a `DeclaredRelationship` (incl. `kind` → `orphanCheckable`). Tracked in the Contacts repo per the report. Until the host wires it, the advisor change is inert for that host (empty list → identical prior behavior) — zero regression risk for existing hosts.

### Deep review notes
- **Logic/safety:** dedup compares the join triple before adding a declared edge, so a host declaring + enforcing the same link is reported once at the stronger severity. Parent-table-absent guard (`tableNames.contains(edge.toTable)`) prevents a manifest naming a table the running DB lacks from issuing a bad join. Throwing host callback is caught and logged, never crashes the scan.
- **No collection-unsafe access** introduced; `_OrphanEdge` list built with explicit loops.
- **Backward compatibility:** new param is optional-with-default; the positional `getAnomaliesResult(query)` call in `stress_performance_test.dart:255` compiles and behaves identically.

### Testing
- **Audited existing tests** referencing the changed symbols: `anomaly_detector_test.dart` (updated), `declared_relationships_test.dart` (DeclaredRelationship serialization — JSON shape unchanged, still passes), `stress_performance_test.dart` (positional call, unaffected).
- **Added 4 cases** to `test/anomaly_detector_test.dart`: declared-orphan → warning with zero PRAGMA FKs; declared edge whose parent table is absent → skipped; `orphanCheckable: false` (list_ref) → ignored; declared edge duplicating an enforced FK → single `error`.
- **Ran:** `dart test` → **597 passing** (incl. the 4 new). `dart analyze` on the four changed files → **No issues found** (saropa_lints clean).

### Files changed
- `lib/src/server/server_types.dart` — `orphanCheckable` field + dartdoc.
- `lib/src/server/anomaly_detector.dart` — union/dedup/severity logic, `_OrphanEdge`, `getAnomaliesResult` param, import.
- `lib/src/server/analytics_handler.dart` — `_resolveDeclaredRelationships()`, both call sites, import.
- `test/anomaly_detector_test.dart` — import + 4 new tests.
- `CHANGELOG.md` — `[Unreleased] → Added` entry.

### Outstanding
Host-side task D (Contacts repo). No advisor-side work remains.

Bug archived: `bugs/FEATURE_orphan_row_check_consume_declared_relationships.md` → `plans/history/2026.06/2026.06.11/FEATURE_orphan_row_check_consume_declared_relationships.md`
Finish report appended: `plans/history/2026.06/2026.06.11/FEATURE_orphan_row_check_consume_declared_relationships.md`
