# Feature 67: Saropa Suite Integration (Drift Advisor side)

**Created:** 2026-06-13
**What it does:** Defines how Saropa Drift Advisor links with its two sibling tools so a
developer's static code, live database, and runtime behavior become one correlated picture instead
of three disconnected panels.

This doc is the **Drift Advisor** half of a three-repo plan. The sibling docs:

- **Saropa Lints** — `D:\src\saropa_lints\plans\SAROPA_SUITE_INTEGRATION.md`
  (repo `saropa/saropa_lints`, plugin + VS Code extension, static AST findings).
- **Saropa Log Capture** — `D:\src\saropa-log-capture\plans\105_plan-saropa-suite-integration.md`
  (repo `saropa/saropa-log-capture`, VS Code extension, runtime logs / crashes / signals).
- **Saropa Dart Utils** — `D:\src\saropa_dart_utils\plans\SAROPA_SUITE_INTEGRATION.md`
  (repo `saropa/saropa_dart_utils`, pure Dart library — the remediation layer, not a diagnostic lens;
  ships the safe primitives the suite's quick fixes recommend).

Drift Advisor **owns the canonical shared protocol** below (it already half-ships it as
`GET /api/issues` + `GET /api/health`), so the two sibling docs reference Section 2 here rather than
restating the schema. Single source of truth: edit the envelope in this file only.

---

## The thesis: three lenses on one app

| Tool | Sees | When | Emits |
|------|------|------|-------|
| `saropa_lints` | Static **code** (AST) | Compile-time | findings |
| `saropa_drift_advisor` (this) | Live **DB data + schema** | Debug runtime | issues (`/api/issues`) |
| `saropa-log-capture` | **Behavior / telemetry** (logs, crashes) | Debug + production | signals |

The same Drift database and the same app flow through all three. Lints catches the bug *class*
statically; Advisor catches the bad *data/schema* at runtime; Log Capture catches the *crash or slow
query* in the wild. Integration makes that correlation automatic and bidirectional — **without
merging the products**. The README's standing commitment holds: these stay complementary and neither
subsumes the other (see [README.md](../README.md) "Scope: Runtime Data vs. Static Code").

Existing touchpoints today (ad-hoc, mostly one-directional):

- Advisor → Lints: `GET /api/issues` surface; README scope table tells users to read the
  `source`/`owner` field to know which product owns a Drift diagnostic.
- Advisor → Log Capture: the Log Capture bridge exports session metadata + a JSON sidecar
  (`driftViewer.integrations.includeInLogCaptureSession`).
- Log Capture → Advisor: SQL Query History shows live Drift Advisor issues; Signal panel has a
  "Drift Advisor" action and a "Drift Advisor issues" summary signal; the Drift debug-server ASCII
  box is recognized.

This plan formalizes those into a typed protocol plus deep-linking, and adds the cross-product Drift
Health loop.

---

## 2. Canonical shared protocol — the Saropa Diagnostic Envelope

All three tools emit "a problem with a location, a severity, a source, and (maybe) a fix." Today each
serializes that differently. This section defines the one shape they all produce and consume.

### 2.1 Diagnostic

```jsonc
{
  "id": "string",                 // stable, product-scoped id (dedupe key)
  "source": "lints | advisor | log-capture",
  "severity": "error | warning | info",   // the triple saropa_lints already standardized on
  "category": "drift | security | performance | crash | schema | data | a11y | other",
  "title": "string",              // one line, human-facing, already-localized
  "detail": "string?",            // optional longer body
  "ruleId": "string?",            // lints rule id, advisor check id, or log-capture signal id
  "location": {                   // optional; workspace-relative path preferred
    "file": "string?",            // e.g. lib/db/app_database.dart  (never an absolute home path)
    "line": "number?",
    "column": "number?",
    "uri": "string?"              // when not a workspace file
  },
  "sql": "string?",               // normalized query text, when SQL-related
  "table": "string?",             // Drift / SQLite table name, when table-scoped
  "fix": {                        // optional, at most one primary action
    "kind": "quickFix | command | doc",
    "title": "string",
    "command": "string?",         // contributed VS Code command id (see Section 3)
    "args": "unknown[]?",
    "uri": "string?"
  },
  "docUri": "string?",            // rule/issue documentation
  "commitSha": "string?",         // for cross-commit correlation (Section 6)
  "timestamp": "string?"          // ISO 8601, when the diagnostic is event-like
}
```

### 2.2 Envelope

```jsonc
{
  "schemaVersion": 1,
  "producer": { "name": "saropa_drift_advisor", "version": "3.7.3" },
  "generatedAt": "2026-06-13T...Z",
  "diagnostics": [ /* Diagnostic[] */ ]
}
```

### 2.3 Transport

- **Advisor (this package):** `GET /api/issues` returns the envelope; `GET /api/health` advertises
  `capabilities` including `"issues"` so a client knows it is safe to call. This already exists in
  reduced form — the work is conforming the payload to 2.1/2.2 and bumping `schemaVersion`.
- **Cross-tool, IDE-only:** any tool MAY also write its current envelope to
  `<workspace>/.saropa/diagnostics/<source>.json` so the other two extensions can read it without a
  running server (Advisor's server is debug-only; Lints runs at compile time; Log Capture runs
  whenever the editor is open — they are rarely all live at once). This file path is the shared
  contract that lets the three correlate offline.

### 2.4 Compatibility rules

- `schemaVersion` is integer, bumped only on breaking change; consumers ignore unknown fields.
- Every string in `title`/`detail`/`fix.title` is **already localized** by the producer (do not ship
  translation keys across the boundary — each tool owns its own i18n catalog).
- `location.file` is always workspace-relative (Log Capture already had a bug leaking
  `C:\Users\<name>\…` into reports; the envelope forbids absolute home paths).

---

## 3. Deep-linking — contributed command ids

Cross-product click-through needs stable, documented command ids that each extension contributes and
never renames. The Drift Advisor extension (`saropa.drift-viewer`) commits to these as its public
integration surface:

| Command id | Args | Opens |
|------------|------|-------|
| `driftViewer.openExplainForSql` | `{ sql, table? }` | EXPLAIN tree + index suggestion for that query |
| `driftViewer.openTable` | `{ table }` | Live table data grid |
| `driftViewer.openSchemaForTable` | `{ table }` | Live schema SQL / ER focus |
| `driftViewer.openIssues` | `{ category? }` | The runtime issues list, optionally filtered |
| `driftViewer.goToDefinitionForTable` | `{ table }` | Jump to the Drift `Table` class in Dart |

The sibling docs commit to the reciprocal ids (Lints: `saropaLints.explainRule`,
`saropaLints.enableRule`; Log Capture: `saropaLogCapture.openSignal`,
`saropaLogCapture.openSqlHistoryForFingerprint`). A `fix.command` in any envelope diagnostic MUST be
one of these documented ids.

---

## 4. Drift Advisor requirements (what this package builds)

- **R1 — Conform `/api/issues` to the envelope (Section 2).** Emit `source: "advisor"`,
  `category`, `table`, `sql`, and a `fix.command` pointing at a Lints rule when a runtime issue has a
  static counterpart (e.g. a missing-index issue links to `saropaLints.explainRule` for
  `require_database_index`). Advertise `schemaVersion` in `/api/health.capabilities`.
  - **Status: partially shipped (this build).** Done: the envelope wrapper (`schemaVersion`,
    `producer`, `generatedAt`) on `GET /api/issues`; per-issue `id` (locale-independent dedupe key),
    `category` (`performance`/`data`/`schema`/`other`), and `title` (alias of `message`); the same
    wrap on the VM-service `getIssues` RPC; `schemaVersion` advertised on `GET /api/health` (HTTP +
    VM). Additive — existing fields untouched. Implemented in
    [analytics_handler.dart](../lib/src/server/analytics_handler.dart) (`_wrapIssuesEnvelope`,
    `_categoryForSource`, `_issueId`), [server_constants.dart](../lib/src/server/server_constants.dart),
    [generation_handler.dart](../lib/src/server/generation_handler.dart),
    [router.dart](../lib/src/server/router.dart); documented in [doc/API.md](../doc/API.md); covered by
    `test/handler_integration_test.dart`.
  - **`fix.command` — shipped (this build).** Each table-scoped issue now carries a `fix` deep-link
    in the envelope. **Finding:** Advisor's runtime detectors have **no** static Lints counterpart to
    point at — verified against `saropa_lints/lib/src/rules/packages/drift_rules.dart` (it has
    `avoid_drift_enum_index_reorder` and a unique-`@TableIndex` insert rule, but no missing-index
    rule, because a missing index is a runtime concern). So the `fix` targets Advisor's own
    `driftViewer.goToDefinitionForTable` (a valid, always-available navigation action) rather than a
    fabricated Lints rule id. Consumer side: a shared, **security-gated** renderer
    ([extension/src/suite/suite-notes-html.ts](../extension/src/suite/suite-notes-html.ts)) shows a
    fix button only when the command is allowlisted (`driftViewer.`/`saropaLints.`/`saropaLogCapture.`
    prefixes) AND registered, and `executeSuiteFix` re-validates before running — so a sibling-emitted
    `fix.command` (pointing at an Advisor command) will render and run safely once siblings ship them.
    Covered by `extension/src/test/suite-notes.test.ts` and the Dart `handler_integration_test`.
  - **Closed (rest of R1):** per-diagnostic `source: "advisor"` is intentionally NOT emitted — tool
    identity lives in `producer.name`, and the existing per-issue `source` field keeps its established
    meaning (the *detector*) for backward compatibility. The **normalized `sql` field does not apply to
    Advisor** and is not a gap: Advisor's four detectors don't run a query to find a problem, so there
    is no originating query text to normalize — index-suggestion and orphan-table carry `suggestedSql`
    (the `CREATE INDEX` / `DROP` *fix*, not a query), and anomaly / soft-relationship have no SQL at
    all (verified in [analytics_handler.dart](../lib/src/server/analytics_handler.dart) `getIssuesList`).
    The envelope's `sql` is for query-shaped diagnostics (Log Capture's slow queries); the consumer
    already matches on it (`relatedDiagnostics`, `buildDriftHealth` untabled routing). Emitting it on
    Advisor issues would ship an always-empty field.
- **R2 — Write the offline mirror** to `.saropa/diagnostics/advisor.json` on each scan, so Lints and
  Log Capture can read Advisor's issues when the debug server is not running (Section 2.3).
  - **Status: shipped (this build).** Implemented in
    [extension/src/suite/diagnostics-mirror.ts](../extension/src/suite/diagnostics-mirror.ts): the
    extension fetches the live `/api/issues` envelope (new `client.issues()` →
    `httpIssuesEnvelope`) and writes it verbatim to `<workspace>/.saropa/diagnostics/advisor.json`.
    Refresh trigger is the generation watcher (debounced) — the mirror is captured *while the server
    is up*, since the debug server is gone by the time a session ends and a fetch would fail. Manual
    refresh via the `driftViewer.writeDiagnosticsMirror` command. Best-effort: it skips (leaving any
    existing mirror intact) when there is no workspace, the server is unreachable, or the payload is
    not a valid envelope, so a transient failure never wipes a good mirror. Covered by
    `extension/src/test/suite-diagnostics-mirror.test.ts`.
  - **Deferred:** the symmetric R3 consumption (Advisor *reading* the sibling
    `lints.json`/`log-capture.json` mirrors) is tracked separately under R3 below.
- **R3 — Consume sibling envelopes.** Read `.saropa/diagnostics/lints.json` and
  `.saropa/diagnostics/log-capture.json` and render the relevant ones inside Advisor's own surfaces:
  in the EXPLAIN / Index panels show "Lints rule `X` also governs this" and "Log Capture saw this
  query run slow N times this session."
  - **Status: partially shipped (this build).** Reader + matcher implemented in
    [extension/src/suite/suite-diagnostics.ts](../extension/src/suite/suite-diagnostics.ts)
    (`readSiblingDiagnostics`, `parseEnvelope`, `relatedDiagnostics`) — malformed-safe, tolerant of
    either `issues`/`diagnostics` carrier key, matching a query by referenced table or exact SQL. The
    **EXPLAIN panel** now renders a "Related Saropa Suite Findings" section
    ([explain-html.ts](../extension/src/explain/explain-html.ts) `renderSuiteNotes`,
    [explain-panel.ts](../extension/src/explain/explain-panel.ts) `findReferencedTables` +
    `createOrShow`), showing each sibling finding's tool, its own already-localized title/detail, and
    rule id; HTML-escaped. Covered by `extension/src/test/suite-diagnostics.test.ts`.
  - **Index + Anomaly surfaces — shipped (this build).** The shared renderer
    ([suite-notes-html.ts](../extension/src/suite/suite-notes-html.ts) `buildSuiteSectionFor`) now also
    feeds the Index Suggestions and Anomalies panels (matched by their tables), and the EXPLAIN
    renderer was refactored onto the same shared code. Covered by `suite-notes.test.ts`.
  - **Holistic dashboard surface — shipped (this build).** A **Suite Findings** widget on the
    customizable dashboard
    ([extension/src/dashboard/widgets/suite-findings-widget.ts](../extension/src/dashboard/widgets/suite-findings-widget.ts))
    joins all three lenses into compact counts — total findings, per-severity (errors / warnings),
    and per-tool (Advisor / Lints / Log Capture) — with an "Open Drift Health" deep link
    (`driftViewer.openDriftHealth`). It reuses the same reader (`readSiblingDiagnostics`), envelope
    relabeler (`diagnosticsFromEnvelope(..., 'advisor', true)`), and join (`buildDriftHealth`) as the
    full panel, so its counts can never diverge from it. Best-effort: a down server yields zero Advisor
    findings, not an error. Covered by `extension/src/test/suite-findings-widget.test.ts`. The "saw N
    times" count rides on the sibling's own `detail` text rather than a dedicated field, so no schema
    change is needed. **R3 is complete** — EXPLAIN, Index Suggestions, Anomalies, the Drift Health
    panel, and now the dashboard widget all surface sibling findings.
- **R4 — Drift Health surface (the flagship loop, see Section 5).** A single panel that joins
  Advisor's runtime schema/data evidence with Lints' static Drift rules and Log Capture's live SQL
  telemetry for the same table/query.
- **R5 — Reciprocal deep-link targets.** Register the commands in Section 3 and keep their ids
  stable; treat them as public API (changelog any change).
  - **Status: shipped (this build).** All five Section 3 command ids are registered as stable public
    wrappers in [extension/src/suite/suite-commands.ts](../extension/src/suite/suite-commands.ts),
    wired through the feature-module registry, declared in `extension/package.json` (NLS titles), and
    asserted by `extension/src/test/extension.test.ts`. They delegate to existing internal commands
    (or, for `openExplainForSql`, run the explain panel against the supplied SQL via the API client),
    so the cross-tool contract is decoupled from internal command churn. Per-table focus for
    `openTable`/`openSchemaForTable` is a future enhancement that will not change the ids or signatures.
- **R6 — Commit correlation.** Stamp every emitted diagnostic with the current `commitSha` (Advisor
  already records session metadata SHAs for the Log Capture bridge) so Section 6 can align all three
  tools per commit.
  - **Status: shipped (this build).** A dependency-free
    [extension/src/suite/workspace-commit.ts](../extension/src/suite/workspace-commit.ts) resolves the
    workspace commit by reading `.git/HEAD` (loose ref → packed-refs fallback; pure `parseHeadRef` /
    `findPackedRef` are unit-tested). The diagnostics mirror stamps the resolved `commitSha` at the
    envelope top level on write; `diagnosticsFromEnvelope` backfills each diagnostic's `commitSha` from
    the envelope when absent (per-diagnostic wins). The Drift Health panel resolves the current commit
    and renders a **stale** badge (dimmed row) on any finding from a different commit — never guessing
    when either commit is unknown. Covered by `workspace-commit.test.ts` and the commit assertions in
    `suite-diagnostics.test.ts` / `drift-health.test.ts`.
  - **R6 core is complete.** What remains is a **separate, larger feature**, not a gap in R6: the
    deeper "at commit X, N lint findings + schema V + these signals" timeline view, and embedding the
    cross-tool commit set into the Log Capture session sidecar (Section 6's richer form). The
    per-finding stamping + staleness that the suite needs day-to-day is in place; the timeline is a new
    multi-commit history surface that should be planned on its own, not carried as R6 residue.

---

## 5. The Drift Health loop (flagship, unique to the suite)

The one place all three uniquely overlap on Drift — a competitor cannot follow because no one else
has all three lenses:

1. **Log Capture** sees an N+1 or a slow query in SQL Query History → emits a `performance`/`drift`
   signal with the normalized `sql`.
2. **Advisor** confirms the missing index against the *live* schema and produces the ready-to-run
   `CREATE INDEX` SQL.
3. **Lints** confirms whether a *static* rule already flags that pattern
   (`avoid_drift_update_without_where`, `require_database_index`, the 32 rules in
   `lib/src/rules/packages/drift_rules.dart`) and offers the quick fix.

One panel, three evidence sources, one fix. Advisor hosts this panel because it is the only tool that
can render live schema + EXPLAIN; it pulls the static side from `lints.json` and the telemetry side
from `log-capture.json` (or the live Log Capture command in Section 3).

**Status: MVP shipped (this build).** The `driftViewer.openDriftHealth` command opens a Drift Health
webview that joins all three lenses **per table**: Advisor's live `/api/issues` (fetched and relabeled
`source: advisor`), Saropa Lints' `lints.json`, and Saropa Log Capture's `log-capture.json`. Pure join
model in [extension/src/suite/drift-health.ts](../extension/src/suite/drift-health.ts)
(`buildDriftHealth` — group by table, case-folded merge, sort by finding count); theme-aware,
HTML-escaped rendering in
[extension/src/suite/drift-health-html.ts](../extension/src/suite/drift-health-html.ts); panel +
Refresh in [extension/src/suite/drift-health-panel.ts](../extension/src/suite/drift-health-panel.ts).
Covered by `extension/src/test/drift-health.test.ts`.
**Post-MVP — shipped (this build):** per-finding fix-action buttons (R1, security-gated), severity
filter + sort controls, auto-refresh on the generation watcher (debounced, visible-only), and
code-level design touches (keyboard focus-visible outlines, ARIA toolbar/pressed states, logical
RTL margins). **Open — needs a running VS Code, not a code edit:** a full visual design audit (RTL /
dyslexia rendering verified on a real rendered panel, contrast against WCAG AA, design-system token
adoption beyond `--vscode-*`). This is a **LAUNCH_TEST** item: the code-level work is in, but a visual
result cannot be claimed from a headless environment — it requires loading the extension and looking
at the panel. Tracked as the one manual-verification task for this feature, not as unfinished code.

---

## 6. Cross-commit / session correlation

Log Capture already diffs logs against a Git commit baseline and reads per-session metadata SHAs;
Advisor exports session metadata + sidecar; Lints knows findings at a point in time. Keyed on
`commitSha`, the three answer one question together: "at commit `abc123`, code had N lint findings,
the DB was at schema version V, and the session produced these signals." Advisor's sidecar export is
the natural carrier — extend it to embed the envelope (`source: "advisor"`) and reference the sibling
`.saropa/diagnostics/*.json` captured at the same commit.

---

## 7. Shared infrastructure (cross-repo, tracked in all three docs)

These are duplicated across the three TypeScript extensions and worth extracting to internal shared
packages (path/git deps, **not** a monorepo merge — keep the three independently publishable):

- **i18n / translation tooling** — all three run an NLLB-then-Google fallback, real-coverage audits,
  day-bucketed report paths, and "this locale is N% translated" notices. Extract
  `saropa-vscode-i18n`. (Sharing the *tooling*; running any translation job stays separate and
  explicitly authorized.)
- **Webview / dashboard kit** — theme tokens, KPI cards, sortable tables, sparklines, focus rings,
  skip-links, axe-checked light/dark/high-contrast rendering. Lints already decomposed its dashboards
  into reusable section builders; all three shipped the same "fixed color washes out in
  light/high-contrast" class of bug. Extract `saropa-vscode-ui`.
- **Release tooling** — `publish.py` orchestrator (retry/ignore/abort, the never-run-NLLB publish
  guard), dependency-import publish gate, write-time American-English gate, and the shared changelog
  conventions (dateless headers, `<details>Maintenance</details>`, `[log](tag-url)`,
  ROADMAP→plans redirect). All three already converged on these by hand. Extract
  `saropa-release-tools` (Python).

Ownership of the extraction is shared; each repo's doc lists the same Section 7 so the work is
visible from any entry point.

---

## 8. Phasing

1. **Protocol first (R1, R2, R5).** Pure schema + command-id work, zero user-facing risk; everything
   else depends on it. **Substantially shipped** — R5 (the five public deep-link command ids), R2 (the
   offline mirror `.saropa/diagnostics/advisor.json`), and the `/api/issues` envelope + `/api/health`
   `schemaVersion` half of R1 have all landed (see the R1, R2, and R5 Status notes above). The only
   Phase-1 remainder is the `sql`/`fix.command` part of R1 — emitting, on each Advisor issue that has a
   static counterpart, a `fix.command` pointing at the relevant Lints rule (e.g. a missing-index issue
   → `saropaLints.explainRule` for `require_database_index`). That now has its target command ids to
   point at, but depends on the Lints extension contributing them (Lints doc R4).
2. **Consume + render (R3).** Each tool shows the others' relevant diagnostics with correct
   attribution. **Complete (Advisor side)** — reader/matcher + the "Related Saropa Suite Findings"
   section on the EXPLAIN, Index Suggestions, and Anomalies panels, the security-gated per-finding fix
   button, and the **Suite Findings dashboard widget** (the holistic surface). Nothing remains.
3. **Drift Health loop (R4 / Section 5).** The flagship; structurally uncopyable. **Shipped** — the
   `driftViewer.openDriftHealth` panel joins all three lenses per table, with per-finding fix actions,
   severity filter + sort, and auto-refresh (see the R4 Status note in Section 5). One manual
   verification (LAUNCH_TEST) remains: a visual design audit on a rendered panel (RTL / dyslexia /
   contrast / design-system tokens) — code is in; the result needs a running VS Code to confirm.
4. **Commit correlation (R6 / Section 6).** **Core shipped** — commit stamping on the mirror + stale
   marking in Drift Health (see the R6 Status note above). The richer cross-tool timeline view is a
   separate future feature, not R6 residue.
5. **Shared infra extraction (Section 7).** Highest code-debt payoff; consolidation of code that has
   already converged, so low design risk.
6. **Extension Pack + cross-discovery** — publish "Saropa for Flutter" bundling all three; gate
   cross-recommend nudges once (reuse Lints' offered/dismissed pattern).

---

## Related plans

- Sibling: `saropa_lints` — `D:\src\saropa_lints\plans\SAROPA_SUITE_INTEGRATION.md`
- Sibling: `saropa-log-capture` — `D:\src\saropa-log-capture\plans\105_plan-saropa-suite-integration.md`
- Sibling: `saropa_dart_utils` — `D:\src\saropa_dart_utils\plans\SAROPA_SUITE_INTEGRATION.md`
  (remediation layer: the `fix.command` / "enable rule X" recommendations resolve to its safe helpers)
- Internal: [59-ai-schema-reviewer.md](59-ai-schema-reviewer.md),
  [66-drift-refactoring-engine.md](66-drift-refactoring-engine.md) — findings that open the
  refactoring panel with structured hints are a natural consumer of the envelope's `fix.command`.
