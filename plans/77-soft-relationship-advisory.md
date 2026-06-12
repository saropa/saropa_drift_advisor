# Feature 77: Soft-Relationship Advisory

**Status: foundation shipped; detector pending.** The detection engine this
advisory surfaces is **already built and shipped** — `inferForeignKeys`
([nl-to-sql.ts:702](../assets/web/nl-to-sql.ts)) computes the soft edges and
already feeds the NL wizard ([nl-to-sql.ts:836](../assets/web/nl-to-sql.ts)).
What remains is surfacing those inferred-but-undeclared edges as a diagnostic
**finding** (this doc) and reading the manifest ([78](./78-declared-relationships-manifest.md))
to mark them resolved.

Surfaces, as a report-only diagnostic finding, the case where tables are
*related by column-naming convention* (a shared `*UUID` identity column, or a
`<noun>_id` reference) but declare **no** SQLite foreign key — so the
relationship is invisible to every tool that reads `PRAGMA foreign_key_list`.

Companion to [78 — declared-relationships manifest](./78-declared-relationships-manifest.md):
the manifest is the *fix* this advisory points at. Builds on the inference
engine already shipped for [76 — NL Query Wizard](./76-nl-query-wizard.md)
(`inferForeignKeys`, [assets/web/nl-to-sql.ts](../assets/web/nl-to-sql.ts)).

---

## 1. Motivation

The Saropa Contacts schema links every table by a shared `contactSaropaUUID`
column and never calls Drift's `.references()`. So `PRAGMA foreign_key_list`
returns nothing, and the relationships — which absolutely exist in the
application's mental model and its Dart code — are invisible to:

- the NL wizard's relationship engine (now patched over by `inferForeignKeys`);
- the anomaly detector's orphaned-FK check ([anomaly_detector.dart](../lib/src/server/anomaly_detector.dart), step 4 `_detectOrphanedForeignKeys` only walks **declared** FKs);
- the ER diagram, FK hyperlinks, and any future join-aware feature.

The advisor already detects the *inverse* gap — a physical table the schema
doesn't declare ([orphan_table_detector.dart](../lib/src/server/orphan_table_detector.dart)).
This is the missing sibling: **a relationship the data clearly has but the
schema doesn't declare.** It is exactly the class of thing a schema advisor
should notice and surface, because the developer cannot see it from any
standard Drift/SQLite tool.

### What this is NOT (honest scope — from review feedback)

- **NOT a push to add SQLite `REFERENCES`.** For an app that links by UUID and
  ships a prebuilt DB, declaring enforced FKs is the *expensive* path (global
  `PRAGMA foreign_keys`, dual schema sources — see §7). The advisory's
  recommended remedy is the **manifest** ([78](./78-declared-relationships-manifest.md)),
  not schema mutation. The finding text must say so.
- **NOT an orphan-row scanner.** "Child points at a missing parent" is a
  separate, noisy check in an offline-first app (out-of-order sync, soft-deleted
  parents → expected transient orphans). See §6. This advisory is about the
  *schema-level* gap (relationship undeclared), not row-level integrity.

### Non-goals

- No DDL generation, no auto-fix, no enforcement. Report-only, like the orphan
  detector — it never executes anything.
- No new inference rules beyond the two already in `inferForeignKeys`
  (`<noun>_id`, shared `*UUID`). This feature *surfaces* that inference; it does
  not expand it.

---

## 2. What's already built (verified)

- `inferForeignKeys(meta)` ([nl-to-sql.ts:702](../assets/web/nl-to-sql.ts)) —
  returns declared FK edges **plus** soft edges from the two naming
  conventions, deduped against declared ones. Pure, exported, unit-tested.
- `nlToSql` already seeds `meta.foreignKeys = inferForeignKeys(meta)`
  ([nl-to-sql.ts:836](../assets/web/nl-to-sql.ts)) — so the *web* side already
  knows the soft edges at query time.
- `OrphanTableDetector.getOrphanTablesResult` — the finding-shape +
  opt-in + report-only precedent to mirror exactly: returns
  `{ orphans: [{table, severity, type, message, suggestedSql}], ... }`,
  produces findings only when a host-supplied declared set is present, and
  surfaces through `/api/issues` and the extension's anomalies/Health panels.

---

## 3. The detection (definition of a finding)

A **soft-relationship finding** is an edge `child.col → parent.pk` such that:

1. it is produced by the naming-convention inference (`inferForeignKeys` minus
   the declared `foreignKeys` it was seeded with), AND
2. it is NOT covered by a host-supplied relationship manifest
   ([78](./78-declared-relationships-manifest.md)), AND
3. it is NOT a declared SQLite FK (by construction of step 1).

In short: **"the data links these two tables, but nothing — neither a SQLite FK
nor the manifest — declares it."** When the manifest declares the edge, the
finding disappears (the relationship is now known to tooling); that is the
advisory being *resolved*, not suppressed.

### Severity

`info`, not `warning`. An undeclared soft relationship is not a defect in an
app that links by UUID on purpose — it's a *visibility* gap. (Contrast the
orphan-table finding, which is `warning` because a stray physical table is
usually a real mistake.) The whole list is opt-in (§4), so a host that doesn't
want the signal never sees it.

### Finding shape (mirrors the orphan finding)

```jsonc
{
  "fromTable": "contact_points",
  "fromColumn": "contactSaropaUUID",
  "toTable": "contacts",
  "toColumn": "contactSaropaUUID",
  "rule": "shared_uuid",          // or "noun_id"
  "severity": "info",
  "type": "soft_relationship",
  "message": "contact_points.contactSaropaUUID looks like a link to contacts (shared UUID identity column), but no foreign key or relationship is declared. Tooling (ER diagram, joins, NL queries, orphan checks) can't see it. Declare it via a relationship manifest to make it visible — no schema change or PRAGMA needed."
}
```

No `suggestedSql` (the remedy is the manifest, not DDL). `rule` names which
convention fired so a reader can judge confidence (`noun_id` is stronger than
`shared_uuid`).

---

## 4. Where the detection runs — decision

The inference engine is TypeScript (`inferForeignKeys`), but the advisor's
*findings* are Dart-side detectors surfaced through `/api/issues` + the
extension panels (anomaly, orphan, index). Two options:

- **(a) Dart detector** — port the two inference rules into a new
  `SoftRelationshipDetector` (mirroring `OrphanTableDetector`), reading column
  names from `PRAGMA table_info`. First-class issue: shows up in `/api/issues`,
  the Health tab, and Saropa Lints alongside orphan/anomaly findings.
- **(b) Web-only** — surface the edges `inferForeignKeys` already computes
  inside the Ask panel / schema view only. Zero Dart, but it's not a real
  "issue" — invisible to the issue aggregator and the IDE diagnostics.

**Recommendation: (a) Dart detector.** The user's framing is "this project
should *detect and surface as an issue*" — that means the issues pipeline, not
a panel-local hint. Cost: the two naming rules must be replicated in Dart. To
keep the two implementations from drifting, the existing
[test/web/.../nl-to-sql.test.mjs](../assets/web/test/) FK fixtures
(`contactsApp`, `relational`) become the **shared contract**: the Dart detector
gets a parallel test fed the same table/column shapes and asserting the same
edge set.

`SoftRelationshipDetector` is opt-in the same way the orphan check is: it needs
the declared FK set (from `PRAGMA foreign_key_list` across all tables) to
subtract genuinely-declared edges, and — once [78](./78-declared-relationships-manifest.md)
lands — the manifest to subtract declared relationships. With neither, every
inferred edge is reported (still safe: `info`, opt-in endpoint).

---

## 5. Surfacing

- **`GET /api/issues/soft-relationships`** (new) — returns
  `{ softRelationships: [...], manifestAvailable: bool, declaredFkCount: int, tablesScanned: int, analyzedAt }`. Mirror the orphan endpoint's response contract.
- **Merge into `/api/issues`** — add the `soft_relationship` type to the merged
  issues shape (same place `orphan_table` is merged) so the Health tab and
  Saropa Lints pick it up with no per-consumer change. Stable `type` key:
  `soft_relationship` (declare it as a `const` next to `orphanFindingType`).
- **ER diagram tie-in (optional, later)** — render soft edges as dashed lines
  ("inferred, not declared") so the relationship is *visible* even before the
  developer declares it. Out of scope for the first cut; noted so the finding
  shape carries enough (`from*`/`to*`) to drive it.

---

## 6. The orphan-warning trap (why this is NOT a row scanner)

Review feedback, correct: in an offline-first app, a child row whose parent
UUID currently resolves to nothing is *usually expected* — the parent hasn't
synced yet, or was soft-deleted. A `LEFT JOIN ... WHERE parent IS NULL` scan
would flag those as warnings and bury the developer in noise.

So this feature deliberately stops at the **schema level**: "the relationship
isn't declared." It does **not** count or flag orphaned rows. If row-level
orphan reporting is ever wanted, it must be a separate, explicitly opt-in check
with soft-delete / pending-sync awareness — tracked elsewhere, not here. The
NL wizard already exposes an *on-demand* orphan predicate (the user can ask
"contacts with an orphaned company") — that's user-initiated and fine; an
always-on scan is what would be noisy.

---

## 7. Why the finding recommends the manifest, not FKs

(Captured here so the message text and any docs stay honest.)

- **`PRAGMA foreign_keys` is global and binary.** Per-connection, all-or-nothing.
  You cannot enforce some relationships and hint others. With zero FKs today
  it's a no-op, but adopting enforced FKs is a whole-schema policy decision, not
  a per-relationship one.
- **Dual schema sources.** Contacts builds its shipped `saropa_static.db` from a
  separate path (hand-written static-data build + migrations), distinct from the
  Drift table classes. Adding `.references()` to a Drift class only affects
  freshly `onCreate`d tables — not the prebuilt DB or the migration path. So
  declared FKs would have to be mirrored in two places or silently not exist
  where the data already lives. The manifest is a *single* relationship
  source-of-truth both paths can point at.
- **The manifest carries zero runtime DB risk** — no pragma, no migration, no
  DDL. It's metadata the advisor reads. That's why it's the recommended remedy.

---

## 8. Test plan

- **Dart `SoftRelationshipDetector` unit test** (mirrors
  [test/orphan_table_issues_test.dart](../test/orphan_table_issues_test.dart)):
  - shared-UUID fixture → one `shared_uuid` edge per child, owner correctly
    resolved (longest singular match);
  - `<noun>_id` fixture → `noun_id` edge to the right parent;
  - a schema that **declares** its FKs → no finding for the declared edge
    (subtracted);
  - a manifest covering an edge → that edge not reported (resolved);
  - no manifest + no declared FKs → all inferred edges reported, `info` severity;
  - opt-in: absent the declared-FK read, the result still returns a well-formed
    `manifestAvailable:false` payload.
- **Cross-impl contract** — feed the Dart detector the exact column/table shapes
  from the web `contactsApp` / `relational` FK fixtures and assert the same edge
  set the TS `inferForeignKeys` produces. This is the guard against the two
  inference copies drifting.
- **Endpoint test** ([test/handler_integration_test.dart](../test/handler_integration_test.dart)
  / [test/schema_handler_test.dart](../test/schema_handler_test.dart)): the new
  route returns the contract; `/api/issues` includes `soft_relationship`.
- **Changelog** updated at implementation time.

---

## 9. Phasing & gates

- **Phase 1 — Dart inference + detector.** Port the two rules; `SoftRelationshipDetector.getResult` returns the finding list. Gate: unit + cross-impl contract tests green; declared FKs and (stub) manifest correctly subtract.
- **Phase 2 — endpoint + `/api/issues` merge.** Gate: route contract test green; merged issues carry `soft_relationship`; Health tab shows the count.
- **Phase 3 (optional, later) — ER diagram dashed edges.** Out of scope for the first cut.

Each phase ships independently. Phase 1 has no user-visible effect on its own,
so it can land ahead of the endpoint safely.

---

## 10. Decisions (resolved 2026-06-11)

1. **Detection home — Dart detector (§4(a)).** Findings go through the real
   issues pipeline (`/api/issues`, Health tab, Saropa Lints), not a panel-local
   hint. The cost — a second copy of the two inference rules in Dart — is
   accepted and contained by the shared-fixture contract (§4, §8): the Dart
   detector is fed the same `contactsApp` / `relational` shapes the TS
   `inferForeignKeys` is, and must produce the same edge set.
2. **Severity — `info`.** An undeclared soft relationship is a visibility gap,
   not a defect, in an app that links by UUID on purpose. The whole list is
   opt-in, so a host that doesn't want the signal never sees it.
3. **Confidence — report both rules, tag `rule`.** Both `noun_id` and
   `shared_uuid` edges are reported; the `rule` field lets a consumer choose to
   show only the stronger `noun_id` ones. No carrier-count threshold or other
   gating until there is actual noise evidence to act on.
4. **Sequencing with [78] — ship together (78 ready first).** The advisory's
   call-to-action is "declare it via the manifest," so the manifest channel must
   exist for the finding to be resolvable. Build 78's channel, then 77's
   detector reads `manifestAvailable` and subtracts manifested edges.
