# Outstanding-Items Audit — `plans/history` sweep

Full audit of every file under `plans/history/` (195 files across 2025.03 →
2026.06.12) to surface work that was **documented in a report but never built**,
then cross-referenced against the live `plans/` folder and the actual codebase
(`lib/src/`, `extension/src/`, `assets/web/`) to confirm not-built status.

## Headline finding

The `/finish` discipline held. The overwhelming majority of archived plans were
genuinely delivered — feature specs 01–73, the modularization/UI-redesign plans,
and the ~40 false-positive diagnostic bug reports are all built and code-verified.
Several files carry **stale status headers** that read as unbuilt but are not
(see "Ruled out" below); each was confirmed implemented by grepping the artifact
it names.

What remains is a **small, precise set of buried deferrals** — sub-features that a
finish report explicitly punted ("optional", "deferred", "left for a future
change", "by design") while the parent item was marked done. None of these are
tracked by their own active plan today. They are listed in Section A.

Section B lists the unbuilt feature specs that **are** already tracked as active
`plans/` files (so they are not "buried", but are included so this is a complete
outstanding-work picture). Section C records intentional out-of-scope exclusions.

---

## Section A — Buried deferrals (not built, not tracked elsewhere)

These are the actual finds. Each was confirmed absent from the codebase.

### A1. Website server-side portable report export (`report_handler.dart`) — DONE (2026-06-12)
- **Resolution:** `GET /api/report` added (`report_handler.dart` + `report_html.dart`),
  routed in the schema/export group, with a **Report** link in the web Export panel.
  Finish report appended to `plans/history/2026.03/20260314/25-portable-snapshot-report.md`.
- **Source:** `plans/history/2026.03/20260314/25-portable-snapshot-report.md:5` —
  "Extension-side fully implemented in v1.3.4. Server-side `report_handler.dart`
  deferred (marked optional)."
- **State:** Confirmed not built — no `report_handler.dart` and no portable-report
  route under `lib/src/`. The extension can export a portable HTML report; the
  website/server cannot.
- **Deliverable:** A `GET /api/report` (or equivalent) handler in
  `lib/src/server/` that emits the same portable snapshot report the extension
  produces, plus a web-UI entry point to download it.
- **Gate:** From the website, export a self-contained report for a live DB; opening
  the file offline reproduces the extension report's content.

### A2. Website multi-snapshot persistence across server restart (72 Phase 4) — DONE (2026-06-12)
- **Resolution:** Opt-in `snapshotStorePath` on `DriftDebugServer.start`; snapshots
  mirrored to that file (atomic write) and reloaded on start (`SnapshotStore` +
  `ServerContext.loadPersistedSnapshots`). Finish report appended to
  `plans/history/2026.06/2026.06.10/72-website-multiple-snapshots.md`.
- **Source:** `plans/history/2026.06/2026.06.10/72-website-multiple-snapshots.md:103,126`
  — Phases 1–3 shipped; "Phase 4 explicitly deferred" (optional persistence).
- **State:** Confirmed not built — website snapshots live in `ServerContext`
  in-memory list only; no disk write/reload found in `lib/src/`. A server restart
  drops all captured snapshots.
- **Deliverable:** Persist the snapshot list (to a `.saropa/` file or equivalent)
  and reload it on server start, so multi-snapshot history survives a restart.
- **Gate:** Create ≥2 snapshots, restart the server, confirm the list and pairwise
  diff still work.

### A3. Performance-regression normalization for row-count / cache state — DONE (2026-06-12)
- **Resolution:** Per-row cost comparison added to `detectRegressions`; baselines
  now carry a rolling `avgRowCount`. Finish report appended to the archived bug
  at `plans/history/2026.04/2026.04.21/BUG_perf_regression_false_positives_from_data_quality_probes.md`.
- **Source:** `plans/history/2026.04/2026.04.21/BUG_perf_regression_false_positives_from_data_quality_probes.md:129`
  — "Explicitly not fixed in this change: Suggestion #2 — normalizing comparisons
  for row count or cold-vs-warm cache — was left for a future change."
- **State:** Confirmed open. The 2026.04.21 fix only stopped the extension flagging
  *its own* diagnostic probes. A genuine user-app query against a **growing** table
  still compares raw timings against a prior-session baseline and reads as "slower"
  purely because the table grew or the cache was cold — a live false-positive source
  in `perf-regression-detector` / `perf-baseline` comparison.
- **Deliverable:** Normalize the baseline comparison by row count (and/or flag
  cold-vs-warm first-run timings) before emitting a regression alert.
- **Gate:** A query whose table doubled in rows between sessions does **not** raise a
  regression alert solely from the row-count growth; a real per-row slowdown still does.

### A4. Website schema-scanning divergence view (71 stretch + Option B) — DONE (2026-06-12)
- **Resolution:** Client-side `computeSchemaDivergence` (`schema-divergence.ts`)
  diffs declared vs runtime schema; rendered in the Code-schema web tab. Option B
  (Dart source parser) remains out of scope by design. Finish report appended to
  `plans/history/2026.06/2026.06.10/71-website-dart-schema-scanning.md`.
- **Source:** `plans/history/2026.06/2026.06.10/71-website-dart-schema-scanning.md:126`
  — "Stretch divergence view and Option B remain unbuilt by design." Option A
  (list code-declared tables/columns from the host callback) shipped.
- **State:** Partially built. The website can list the declared schema; it cannot
  yet **diff** code-declared schema against the live runtime schema and surface
  drift (the high-value half of the feature).
- **Deliverable:** A code-vs-runtime divergence view in the website schema tab
  (missing/extra tables, column type/nullability drift), reusing the existing
  `schema-diff` machinery.
- **Gate:** With a declared-schema callback present, a table the code declares but
  the DB lacks (and vice versa) is shown as a divergence.

### A5. NL-SQL "refine-in-English" loop (18 Phase 2 polish)
- **Source:** `plans/history/2026.04/2026.04.30/18-natural-language-sql.md:358` —
  "further polish (e.g. refine-in-English loop) is future work."
- **State:** Not built. NL-to-SQL converts a single question; there is no
  conversational follow-up to refine the prior query in English ("now only the
  active ones").
- **Deliverable:** Let a follow-up question amend the previous `NlResult` rather
  than restart from scratch in the Ask panel.
- **Gate:** After one query, a refining phrase narrows/extends it without
  re-specifying the base intent.
- **Note:** Lowest priority of the set — pure polish, not a correctness gap.

---

## Section B — Unbuilt, but already tracked as active `plans/` files

Included for completeness. These are forward specs the user already has visibility
on; none are "buried." Each was spot-checked as not-yet-built (the GAP parity items
they overlap — e.g. heuristic PII masking, multi-server *discovery* — are done; the
deeper feature below is not).

- **`plans/28-pii-anonymizer.md`** — anonymized-export (fake-data generation) half;
  heuristic PII *masking* already ships (`pii.ts`).
- **`plans/35-multi-server-federation.md`** — unified multi-server dashboard
  (cross-server compare / fan-out query); server *discovery* already ships.
- **`plans/37-data-branching.md`** — git-style data branches (47-bulk-edit's finish
  report names this as the deferred safety mechanism; interim uses DB snapshots).
- **`plans/59-ai-schema-reviewer.md`** — AI Schema Reviewer panel; Feature 66
  exposes bridge hooks (`refactoringOpenWithHint`, NL-SQL prefill) pending this.
- **`plans/60-time-travel-data-slider.md`** — visual time-travel scrubber; 26-DVR's
  finish report names this + a unified timeline as the cross-subsystem deferral.

(Infra plans `connection-reliability-ongoing`, `esbuild-ts-migration`,
`fix-pub-dev-publisher` are ongoing tracks, not feature gaps.)

---

## Section C — Intentional out-of-scope (recorded, not recommended)

Documented exclusions, by design — listed so they are not re-discovered as gaps:

- **Visual query builder limits** (`21-visual-query-builder.md:544`): HAVING,
  subquery/UNION, nested boolean grouping, save/load — "any future work gets its
  own plan."
- **71 Option B** (auto-derive schema from Drift internals beyond duck-typing) —
  excluded by design; the explicit `declaredSchema` callback is the exact path.
- **74 IDE-only capabilities** (go-to-definition, code actions, data breakpoints) —
  reclassified as intentionally IDE-only, not website parity gaps.
- **Soft-relationship "developer declares it" finding** (`77:171`) — superseded by
  the now-shipped declared-relationships manifest (Feature 78).

---

## Ruled out (flagged by stale headers, verified BUILT)

Recording these so the next audit does not re-chase them:

- **71 / 72 / 73** — `GAP_FIT_PLAN.md:499` calls them "genuinely unimplemented";
  in fact each has a Finish Report + tests + shipped code (`schema_handler.dart`
  `/api/schema/declared`, `snapshot_handler` multi-snapshot endpoints,
  `index_batch_handler.dart` bulk apply). Only the sub-items in A2/A4 remain.
- **Feature 79 "Hey Saropa" wake phrase** — header says "Status: SPEC"; the code
  ships in `assets/web/nl-to-sql.ts:886` (`stripWakePhrase`) + `nl-modal.ts:376`,
  compiled into `bundle.js`.
- **NL-SQL documented limitations** (`nl-sql-unit-test-suite.md:48`) — both since
  built: soft-FK inference from shared `*UUID`/`*_id` (`nl-to-sql.ts:721-774`) and
  camelCase `*At` date detection (`nl-to-sql.ts:556`).
- **Datetime-index false positives** (`2026.04.12` bug) — fixed; `index-checker.ts:9-11`
  now routes datetime to the evidence-based `unindexed-where-clause` diagnostic and
  only emits `_id`-based suggestions.
- **Feature specs 01–68** (2026.03) — all implemented (extension `src/` directories
  + GAP_FIT_PLAN done-annotations confirm each).
- **2025.03 early plans** — the six files are 0-byte placeholders; no content.

---

## Recommended order

A3 (live false-positive, hurts trust in diagnostics) → A1 + A4 (close website/server
parity gaps that the extension already has) → A2 (durability) → A5 (polish). Each
gets its own standalone plan file before work starts, per repo convention.
