# FEATURE / ENHANCEMENT: Orphan-row anomaly check must consume the host's declared relationship manifest, not only `PRAGMA foreign_key_list`

> Type: Feature / Enhancement (NOT a runtime crash). Severity: Medium — a whole class of orphan-row anomalies is invisible for any host that links by convention (shared UUID column) instead of SQLite foreign keys.
> Labels: `enhancement`, `anomaly-detector`, `feature-78`, `needs-design-decision`.
> Status: Open — spec only. No advisor code changed by this report.

## CRITICAL NOTE
Written for fast, skeptical verification. Code claims below are anchored to **symbols** (class / method / field / typedef names) rather than line numbers, so the references stay valid as the files change — grep the symbol to locate it. The single most important finding: **Feature 78 wires the declared-relationship manifest into the SCHEMA / wizard / ER-diagram path, but NOT into the orphan-ROW anomaly check** — that check still drives its `LEFT JOIN` exclusively from `PRAGMA foreign_key_list`, which is empty for a host that declares no SQLite FKs. Read the Root Cause before the proposal.

---

## 1. Title
The anomaly detector's orphan-row check (`AnomalyDetector._detectOrphanedForeignKeys`) builds its `LEFT JOIN` only from `PRAGMA foreign_key_list`, so for a host that links tables by a shared UUID column and declares ZERO SQLite foreign keys (Saropa Contacts), no UUID relationship is ever orphan-checked.

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
Zero orphan-row anomalies are produced for the UUID relationships. `AnomalyDetector._detectOrphanedForeignKeys` enumerates `PRAGMA foreign_key_list("$tableName")`, which returns an empty set because the host declares no SQLite FKs, so the loop body never runs and no relationship is joined. The host's `declaredRelationships` manifest — already consumed by the schema metadata path — is not consulted here at all.

---

## ROOT CAUSE (verified)

Two facts, both grep-anchored by symbol:

**(a) Feature 78 plumbing exists and is consumed by the schema/wizard path.** All in `lib/src/server/`:
- Edge type `class DeclaredRelationship { fromTable, fromColumn, toTable, toColumn, label? }` and its `typedef DeclaredRelationshipsCallback` — `server_types.dart`.
- Field `ServerContext.declaredRelationships` (the host-supplied callback) — `server_context.dart`.
- The schema-metadata builder in `schema_handler.dart` reads `_ctx.declaredRelationships` and seeds each table's `foreignKeys` from the manifest edges BEFORE falling back to PRAGMA (gated on its `includeForeignKeys` flag).
- The `GET /api/schema/relationships` handler in `schema_handler.dart` returns the manifest.
- The doc comment on `DeclaredRelationship` states its purpose: "turning the web wizard's column-name heuristic into a fact." So the WIZARD / DIAGRAM side is wired.

**(b) The orphan-ROW anomaly check does NOT consume it.** In `lib/src/server/anomaly_detector.dart`:
- `AnomalyDetector._detectOrphanedForeignKeys` is the orphan-row check.
- Its only relationship source is the `PRAGMA foreign_key_list("$tableName")` query inside that method. It never reads `ServerContext.declaredRelationships` (grep: `declaredRelationships` does not appear in `anomaly_detector.dart`).
- For a zero-FK host the PRAGMA returns no rows → the `for (final fk in fkRows)` loop never iterates → the `LEFT JOIN` query never runs → no `orphaned_fk` anomaly (`anomalies.add({... 'type': 'orphaned_fk' ...})`) is emitted for any UUID relationship.

Net: the advisor has the manifest in hand on the schema side, but the orphan-row check is blind to it. This is the gap. (NOTE: orphan-row is distinct from `OrphanTableDetector` in `lib/src/server/orphan_table_detector.dart`, which finds physical TABLES absent from the schema — unrelated to this report.)

---

## PROPOSED WORK (advisor side)

Three changes in `lib/src/server/`, plus one companion task in the host. Recommendation given for each decision per the guide's "name your pick" rule.

### A. Make the orphan-row check consume `declaredRelationships` in addition to `PRAGMA foreign_key_list`
In `AnomalyDetector._detectOrphanedForeignKeys`, union the PRAGMA-derived edges with the host's declared edges for `tableName`, dedup on `(fromColumn, toTable, toColumn)`, and run the existing `LEFT JOIN` for each. The join already takes explicit `fromCol`/`toCol`, so the manifest's differing physical names are handled with no heuristic — e.g. Contacts' `contact_reaction_records.contact_saropa_uuid` → `contacts.contact_saropa_u_u_i_d` (the two physical names differ because Drift's default naming splits `contactSaropaUUID` into `contact_saropa_u_u_i_d` while two tables force `.named('contact_saropa_uuid')`; a same-name heuristic would mis-link or miss them — the manifest carries both names explicitly).
- The detector is currently a pure static function taking only `query`/`tableName`/`tableNames`/`anomalies`. Pass the declared edges in as a parameter (keep it pure — resolve `ServerContext.declaredRelationships` at the caller and hand down a `List<DeclaredRelationship>`), so the unit-test surface stays parameter-only.

### B. Severity: declared-relationship orphans are WARNINGS, not errors
The current emit hardcodes `'severity': 'error'` in the `orphaned_fk` `anomalies.add` inside `_detectOrphanedForeignKeys`. For a convention-linked host, an orphan is EXPECTED steady state (offline-first: out-of-order sync, soft-deleted parents), not corruption. An orphan found via a real, SQLite-ENFORCED FK is still an `error`; an orphan found ONLY via a declared (non-enforced) edge must be `warning`. Branch the severity on the edge's source: PRAGMA-FK edge → keep `error`; declared-only edge → `warning`. **Recommendation:** carry the source through and set severity accordingly; do not blanket-downgrade (a host that DOES declare FKs should keep error semantics).

### C. Decision needed: filter non-joinable edges — add `orphanCheckable` to `DeclaredRelationship`
The host manifest contains edge KINDS that must NOT be scalar-orphan-checked:
- `scalar_ref` / `self_ref` → orphan-checkable (a single child column holds one parent UUID). In the Contacts manifest: 13 + 1 = 14 edges.
- `list_ref` → a JSON-array column (many UUIDs in one text cell). A scalar `LEFT JOIN ... ON t.col = r.col` is WRONG for these. 7 edges.
- `seed_identity` → a static-data UUID that BECOMES a contact UUID when seeded; not a foreign key. 6 edges.

`DeclaredRelationship` (in `server_types.dart`) has no kind/flag today, so a consumer cannot tell a joinable edge from a list/seed edge. Two options:
1. **(Recommended)** Add an optional `bool orphanCheckable` (default `true`) to `DeclaredRelationship`. The orphan-row check filters on it; the wizard / ER diagram keep using ALL edges (they WANT list_ref links for the graph). This maps 1:1 to the manifest's existing `orphan_checkable` field — no host-side information loss.
2. Host supplies ONLY the 14 orphan-checkable edges to `declaredRelationships`. Simpler advisor change, but the wizard/diagram then lose the 13 list/seed relationships — a regression for Feature 78's stated purpose. Rejected for that reason.

### D. Companion task (HOST repo — NOT this repo): supply the callback from the manifest
Saropa Contacts must set `ServerContext.declaredRelationships` to a callback that reads `.saropa/schema/relationship_hints.json` and maps each `relationships[]` entry to a `DeclaredRelationship`: `child_table→fromTable`, `child_column→fromColumn`, `parent_table→toTable`, `parent_column→toColumn`, `kind`→`label`/`orphanCheckable`. This is host wiring, tracked in the Contacts repo (the manifest + generator already shipped there: `docs/history/2026.06/2026.06.11/PROPOSAL_relationships_as_nonenforcing_foreign_key_hints.md`). Listed here only so the advisor-side reviewer knows the two halves and does not assume the advisor must read the JSON file itself — it consumes a host callback, consistent with the existing Feature 78 contract.

### E. Verify the TypeScript surface passes the new warning through
`AnomalyChecker` in `extension/src/diagnostics/checkers/anomaly-checker.ts` already handles the column-scoped `orphaned_fk` finding. Confirm it maps `severity: 'warning'` to a VS Code `Warning` diagnostic (not hardcoding Error) so declared-orphan findings render at the right level. Report-only verification; likely no change.

---

## Emitter Attribution

Single `(owner, code)` pair involved — the orphan-row anomaly. References are by symbol + grep command (line numbers omitted deliberately — they drift).

| Field | Value |
|---|---|
| `type` (finding code) | `orphaned_fk` |
| Constructed at | the `anomalies.add({... 'type': 'orphaned_fk' ...})` inside `AnomalyDetector._detectOrphanedForeignKeys` — `lib/src/server/anomaly_detector.dart` |
| Emit driver | `AnomalyDetector._detectOrphanedForeignKeys` — `lib/src/server/anomaly_detector.dart` |
| TS consumer | `AnomalyChecker` `orphaned_fk` handling — `extension/src/diagnostics/checkers/anomaly-checker.ts` |
| Grep (both trees) | `grep -rn "orphaned_fk" lib/src extension/src` → one DART match in `lib/src/server/anomaly_detector.dart`, one TS match in `extension/src/diagnostics/checkers/anomaly-checker.ts` |
| Sibling-repo negative grep | `grep -rn "orphaned_fk" ../saropa_lints/lib` → 0 matches |

Mixed-language note: the only DART emit site is in `anomaly_detector.dart`; the TS side in `anomaly-checker.ts` consumes/renders, it does not emit. No second emit path.

Feature 78 plumbing referenced above, grep-anchored by symbol:
- `grep -rn "declaredRelationships" lib/src/server` → matches in `server_context.dart` (constructor param + field) and `schema_handler.dart` (the metadata fold), plus the `typedef DeclaredRelationshipsCallback` in `server_types.dart`.
- `grep -rn "class DeclaredRelationship" lib/src/server` → `server_types.dart`.

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

## 9. Already Verified
- Feature 78 IS consumed by the schema metadata fold in `schema_handler.dart` — confirmed by reading the file (the `_ctx.declaredRelationships` read + per-table `foreignKeys` seed), not assumed.
- The orphan-row check's ONLY relationship source is the PRAGMA inside `AnomalyDetector._detectOrphanedForeignKeys` — confirmed; `declaredRelationships` appears nowhere in `anomaly_detector.dart` (`grep -rn "declaredRelationships" lib/src/server/anomaly_detector.dart` → 0 matches).
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

### Scope
(C) docs only. One markdown spec in the `saropa_drift_advisor` `bugs/` tree. No advisor code (`lib/src/`, `extension/src/`), no tests, no host code touched.

### What this task produced
A spec describing a gap in the Advisor's orphan-row anomaly check (`AnomalyDetector._detectOrphanedForeignKeys` reads relationships only from `PRAGMA foreign_key_list`, so a zero-FK host like Saropa Contacts gets no orphan-row checks), plus three proposed changes (consume `declaredRelationships`; emit `warning` not `error` for declared-only orphans; add an `orphanCheckable` flag to `DeclaredRelationship`) and the host-side companion task.

### Deep review (Section 3)
- **Accuracy:** every symbol the spec cites was grep-confirmed to resolve in the current tree — `class DeclaredRelationship` (`server_types.dart`), `AnomalyDetector._detectOrphanedForeignKeys` (`anomaly_detector.dart`), the `orphaned_fk` handling (`anomaly-checker.ts`), and `ServerContext.declaredRelationships`.
- **Anchor durability:** initial draft used `file:line` anchors read from the working tree; line numbers drift as the files change. Rewritten to reference symbols (class/method/field/typedef names) + grep commands instead, so the references stay valid. This was the one correctness defect and it is fixed.
- **Scope discipline:** the spec proposes work but changes no code; the host-side half is explicitly marked as belonging to the Contacts repo, not this one.

### Testing (Section 4)
SKIPPED [C-DOCS-ONLY] for automated tests — no code changed. Verification performed instead: grep-confirmed all cited symbols resolve (command + results in the section above). Tests not executed — there is nothing executable in a markdown spec.

### l10n (Section 5)
SKIPPED [C-NOT-IN-SCOPE] — no UI, no user-facing strings.

### Maintenance (Section 6)
- CHANGELOG: not updated — a `bugs/` spec describing future work is not a user-facing change to the Advisor.
- README: README verified — no updates needed.
- No bug archive — task did not close a `bugs/*.md`; it CREATED an open spec describing work to be done.

### Persistence (Section 7)
Finish report appended: `bugs/FEATURE_orphan_row_check_consume_declared_relationships.md` (this file — the artifact the task produced).

### Outstanding
- The three proposed advisor changes (A/B/C) and the host-side callback wiring are unimplemented — this is a spec, not a fix. Maintainer decision still open on C.1 vs C.2 (recommendation: C.1).
