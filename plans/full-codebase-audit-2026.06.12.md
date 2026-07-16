# Full Codebase Audit — Saropa Drift Advisor

**Scope:** entire repository — `lib/` Dart debug server (45 files, ~14.3k LOC), `extension/src/` VS Code extension (760 TS files, ~107k LOC), `assets/web/` browser SPA served by the Dart server (~40 TS modules), plus packaging, config, docs, and plans.

**Method:** the security-critical Dart core (server entry, auth, SQL validator, rate limiter, router, context, utils) and the top-severity findings were read and verified by hand. The remaining surface was covered by six parallel deep-audit passes (Dart handlers, Dart detectors, TS API/connection, TS webview HTML/XSS, TS feature subsystems, served-SPA XSS). Every Critical claim below was re-opened in the source and confirmed; items not personally re-verified are marked *(agent-reported)*.

**Verdict:** the engineering quality is high — modular, heavily commented, well-tested. The defects cluster in two places: (1) the **security posture of a tool that exposes a live database over HTTP**, and (2) **HTML rendering of untrusted DB content** in both the served SPA and the extension webviews. None of these block normal single-developer-on-localhost use; all of them matter because this is a *published* package that embeds in consumer apps and renders data the developer did not author.

---

## Remediation status — CLOSED (2026-06-14)

> This completed audit is kept in place (not moved to `plans/history/`) because 30 source files cite it by this exact path as stable anchors (`// See plans/full-codebase-audit-2026.06.12.md <finding>`). Relocating it would break those references; the doc is closed logically, not relocated.

**Every finding in this audit is resolved.** All Critical, High, and Medium findings are fixed and verified; all Low findings are either fixed or reviewed-as-acceptable. Verification on close: Dart `analyze` clean; extension `tsc` clean and the full Mocha suite (2845 tests) green. Per-finding reports and the original verification record live in [`plans/history/2026.06/2026.06.13/audit-remediation-closeout.md`](history/2026.06/2026.06.13/audit-remediation-closeout.md).

The one follow-on enhancement (C2b phase 2 — nonce CSP for the served SPA + data-grid webview) was closed WONTFIX on 2026-07-16: defense-in-depth only on a loopback-only surface whose exploitable sinks are already fixed; the boot-path regression risk and manual verification cost outweigh the marginal gain. See [`plans/history/2026.07/2026.07.16/c2b-phase2-served-spa-csp.md`](history/2026.07/2026.07.16/c2b-phase2-served-spa-csp.md).

Each finding below carries its final status tag (`✅ DONE` / `☑ REVIEWED — no change`). Summary of what changed since the original audit, by severity:

- **CRITICAL** — C1 (secure loopback/CORS defaults), C2 (XSS sinks fixed C2a; `executeAction` allowlisted C2c; nonce CSP on all 47 webview panels C2b phase 1), C3 (`sqlLiteral` backslash corruption): all DONE.
- **HIGH** — H1–H6: all DONE.
- **MEDIUM** — M1–M14: all DONE.
- **LOW** — L1, L4, L5, L6, L7: DONE. L2, L8: reviewed, no change. L3 (OVSX token rotation) was removed from scope (handled outside this audit).

> The detail below is the original audit content, preserved verbatim with per-finding status tags appended. It is the historical record; the live forward item is the deferred C2b phase 2 plan linked above.

---

## High-Level Report

### The shape of the risk

This package's whole job is to take a SQLite database living inside someone's app and expose it — over an HTTP server, into a browser, and into VS Code webviews. That means two trust boundaries that the code does not consistently honor:

1. **The network boundary.** The server binds, by default, to *all* interfaces with *no* auth and a wildcard CORS header. Anyone who can reach the port — or any website the developer happens to visit while it runs — can read (and, when writes are enabled, modify) the database.

2. **The content boundary.** Table names, column names, and especially cell *values* are arbitrary data. They are rendered into HTML in ~27 of the SPA's modules and dozens of webview generators. Most paths escape correctly; a handful do not, and there is no Content-Security-Policy backstop, so each miss is directly executable as script in the developer's browser/editor.

A third, smaller theme runs through the SQL-building code: **identifiers are interpolated into SQL as `"$name"` without doubling embedded quotes**, and string values go through a `sqlLiteral` helper that *corrupts backslashes*. A correct quoting helper already exists in the codebase (`q()` in `shared-utils.ts`, and the `_buildDataSignature` escaping in `server_context.dart`) — it is simply not used everywhere.

### What is genuinely solid

- The router enforces auth on **every** request when auth is configured, before any handler work.
- `requireKnownTable` validates table names against `sqlite_master` before use (the right idea — the gap is the unescaped interpolation *after* validation).
- `connection-state.ts` is a clean, total state machine. `snapshot-store.dart` does correct atomic temp-file-then-rename writes and treats its path as host-config-only. `report_html.dart`, `sql-highlight.ts`, and the `mutation-stream` renderer are XSS-safe by construction.
- Test coverage is broad (39 Dart test files, large TS test suite).
- `.env` (the Open VSX token) is correctly gitignored and excluded from the published package.

### The five things to fix first

1. **Default to loopback + no wildcard CORS** (network exposure).
2. **Add a nonce-based CSP to every webview and the served SPA**, then fix the handful of unescaped sinks (content exposure → code execution).
3. **Remove the backslash doubling in `sqlLiteral`** (silent data corruption on every write).
4. **Route every SQL identifier interpolation through one shared quoting helper**.
5. **Validate the extension's `host` config and gate the auth token to loopback** (SSRF + token leak on workspace open).

---

## Findings by severity

Severity reflects this package's real threat model (a debug tool, often on localhost, but published and embedding untrusted DB content). "✓ verified" = re-read in source during this audit.

### CRITICAL

**C1 — Insecure-by-default network exposure** ✓ verified — `✅ DONE`
`drift_debug_server_io.dart:109,268-270` and `start_drift_viewer_extension.dart:242-243`. Defaults are `loopbackOnly: false` (→ `InternetAddress.anyIPv4`, i.e. `0.0.0.0`), `corsOrigin: '*'`, `authToken: null`. With no auth the entire database is readable by any host that can reach the port; with `writeQuery` wired it is also writable. The wildcard CORS header means *any* web page the developer opens can `fetch('http://localhost:8642/api/dump')` and read the response cross-origin (a DNS-rebinding / malicious-site vector), even when the server is "only" on localhost.
**Fix:** default `loopbackOnly: true`; do not emit `Access-Control-Allow-Origin: *` by default (omit the header, or echo a vetted origin); require an explicit opt-in (and ideally a generated token) before binding to a non-loopback address. Document the posture in the README's first server example.

**C2 — Stored XSS in served SPA and extension webviews; no CSP backstop** ✓ verified (3 sinks + CSP) — `✅ exploitable sinks fixed (C2a)` · `✅ executeAction allowlisted (C2c)` · `✅ CSP on all 47 webview panels (C2b phase 1)` · `❌ CSP on the served SPA + data-grid panel WONTFIX (C2b phase 2 → plans/history/2026.07/2026.07.16/c2b-phase2-served-spa-csp.md)`
DB content reaches HTML unescaped in several places, and there is no Content-Security-Policy (or `'unsafe-inline'` where one exists), so each miss executes script.
- `assets/web/.../snippets`→ no; the SPA result path: `snippets/snippet-library-html.ts:198-210` builds `'<th>'+c+'</th>'`, `'<td>'+v+'</td>'`, and `'<p class="error">'+msg.message` straight into `innerHTML` — DB column names, **cell values**, and SQLite error text. The file's own `esc()` is never called here. ✓
- `lineage/lineage-html.ts:100` — `onclick="navigate('${escAttr(node.table)}',...)"` where `escAttr` escapes only `\` and `'`, inside a **double-quoted** attribute; an unescaped `"` in a table/column/PK value breaks out. Same defect in `impact/impact-html.ts:68,106`. ✓
- `er-diagram/er-diagram-html.ts:71` — `<script>${getErDiagramScript(JSON.stringify(nodes), ...)}</script>`; `JSON.stringify` does not escape `</script>`, so a table/column name containing `</script>` breaks out. ✓
- `dashboard/dashboard-scripts.ts:205-213` — DB table names into `<option>` value/text and a number `value` attribute, unescaped *(agent-reported)*.
- CSP: only `panel.ts:193-194`, `dashboard-html.ts:21`, `bulk-edit-html.ts:17-18` set any CSP, all with `script-src 'unsafe-inline'`; every other panel and the served SPA have none. ✓
**Escalation:** `dashboard/panel/message-handler.ts:91-95` runs `vscode.commands.executeCommand(msg.actionCommand, msg.args)` with no allowlist, and several DB-mutating `postMessage` handlers validate only `command` (bulk-edit commit, editing-bridge, clipboard-import, seeder) — so an XSS can drive editor commands and DB writes *(agent-reported)*.
**Fix:** add a per-render nonce CSP (`default-src 'none'; script-src 'nonce-…'; …`) to every webview and to the Dart-served HTML; drop `'unsafe-inline'`; replace inline `onclick` with delegated listeners; consolidate to one complete `escapeHtml` (`& < > " '` + `String()` coercion) and call it at every dynamic sink; allowlist `executeAction` command ids; add runtime shape validation to DB-mutating message handlers.

**C3 — `sqlLiteral` corrupts string data by doubling backslashes** ✓ verified — `✅ DONE`
`server_utils.dart:131,148-152`: `value.replaceAll(r'\', r'\\').replaceAll("'", "''")`. SQLite string literals escape **only** `'` (as `''`); backslash is an ordinary character. Doubling `\` silently stores a second backslash for every imported/edited/dumped string containing one (`C:\path` → `C:\\path`). Not an injection (the `''` doubling still neutralizes quotes), but silent, irreversible data corruption on every write path (`import_handler`, `cell_update_handler`, `getFullDumpSql`). Used for `pkValue` in `cell_update_handler.dart:171` with no type coercion.
**Fix:** delete the `.replaceAll(r'\', r'\\')`; escape only `'`. Prefer the existing `queryWithBindings` parameter-binding path over literal interpolation.

### HIGH

> **Status: all of H1–H6 are `✅ DONE`** — fixed and verified (see closeout). Detail retained below as the historical record.

**H1 — SQL read-only validator can be desynchronized from the executed SQL** ✓ verified
`sql_validator.dart:24-53`. Comments are stripped (`--…`, `/*…*/`) **before** string literals are masked. An apostrophe inside a comment, or a `--`/`/*` inside a string literal, shifts quote pairing so a trailing `; <write statement>` is hidden from the first-semicolon multi-statement check. Worked example: `SELECT 'a -- b' ; DROP TABLE t --` is accepted as read-only. The DB executes the original string. For Drift hosts using `customSelect` (single-statement prepare) the trailing statement is ignored, but the package explicitly supports "raw SQLite app via injectable callback," where a host using multi-statement `execute` is exposed. Also does not normalize `[bracket]`/`` `backtick` `` identifier quoting.
**Fix:** replace the sequential-regex passes with a single linear tokenizer that tracks string/comment state simultaneously; reject bracket/backtick-quoted identifiers in the read-only path; keep the SELECT/WITH allowlist + write-verb denylist on top.

**H2 — Unescaped identifier interpolation across Dart handlers and TS SQL generators** ✓ verified (Dart sites)
Identifiers are built as `"$name"` with no doubling of embedded `"`. Dart: `table_handler.dart:73,115,158,183`, `cell_update_handler.dart:115,174-175`, `schema_handler.dart` (several), `snapshot_handler.dart`, `compare_handler.dart`, `mutation_tracker.dart:237,258`. TS: `branching/branch-merge-sql.ts`, `branch-restore.ts`, `constraint-wizard/constraint-codegen.ts` + `constraint-validator.ts`, `data-breakpoint-checker.ts`, `dashboard/widgets/*` *(agent-reported)*. A legal SQLite identifier containing `"` passes the whitelist and then breaks the quoting (`UPDATE "x" SET …` corruption / identifier injection). The correct helper already exists (`q()` in `shared-utils.ts`; `_buildDataSignature` in `server_context.dart:691-695`) and is used by `profiler-queries.ts` — the inconsistency is the bug.
**Fix:** one shared `quoteIdent(name) => '"${name.replaceAll('"','""')}"'` (Dart) / `q()` (TS), used at every identifier interpolation site.

**H3 — No request-body size limit on any POST handler; whole-table materialization** *(agent-reported; pattern confirmed)*
Every handler does `await for (chunk in request) builder.add(chunk)` with no cap (`sql_handler.dart`, `import_handler.dart`, `cell_update_handler.dart`, `edits_batch_handler.dart`, `snapshot_handler.dart`). Caps like `maxStatements`/`maxLimit` apply only *after* the full body is buffered. Snapshot/dump/compare also `SELECT * FROM "$table"` with no LIMIT and retain up to 20 in-memory snapshot copies. On a dev tunnel (which the Basic-auth comments explicitly target) this is a trivial OOM DoS.
**Fix:** check `request.contentLength` against a cap up front (413 on exceed) and enforce a running byte budget in the read loop; cap or stream snapshot/dump row counts.

**H4 — Extension `host` config flows unvalidated into every request URL + Bearer token** *(agent-reported; config source confirmed)*
`api-client-base.ts:36-43` builds `http://${host}:${port}` from `driftViewer.host` (free-form workspace config, default `127.0.0.1`). The extension activates on `onStartupFinished` / `workspaceContains:**/pubspec.yaml`, so a cloned repo's `.vscode/settings.json` setting `host` to an attacker address causes discovery/health probes to send every request — including the `Authorization: Bearer` token — to that host, over plaintext `http://`, on workspace open.
**Fix:** validate `host` against loopback/`localhost` (or an explicit user-confirmed remote); do not attach the auth token to non-loopback hosts without consent; consider `vscode.SecretStorage` for the token instead of plaintext settings.

**H5 — Cell update / batch apply report success without checking affected rows; pkValue not coerced** ✓ verified
`cell_update_handler.dart:171-196` responds `{ok:true}` regardless of whether the `WHERE` matched, and `pkValue` is interpolated via `sqlLiteral` (inheriting C3) with no affinity check — a string pkValue against an integer PK matches nothing. The project's own UX rules require surfacing the concrete outcome (rows affected).
**Fix:** surface the affected-row count (re-query if the write callback can't return it); coerce `pkValue` against PK metadata; do not report success for a zero-row update.

**H6 — Relationship engine: broken "safe delete", lost depth, no cycle guard** *(agent-reported)*
`engines/relationship-engine.ts`: recursion sets `child.depth = 1` unconditionally; no `visited` set (cyclic FK graph recurses to `maxDepth` issuing SQL per cycle); `generateSafeDeleteSql` uses the root's PK column for every child and gates on `children.length > 0` so leaf rows are never deleted; `_getFkValue` hardcodes `WHERE id = …`. The "safe delete" plan targets wrong columns and omits the rows that actually block deletion.
**Fix:** propagate `depth = parent.depth + 1`; add a cycle guard; carry each node's own PK from FK metadata; emit deletes for all non-root nodes.

### MEDIUM

> **Status: all of M1–M14 are `✅ DONE`** — fixed and verified (see closeout). Detail retained below as the historical record.

- **M1 — String-typed COUNT silently coerced to 0** ✓ verified. `server_utils.dart:46-59` returns 0 when a count column is a `String`; hosts whose executor returns numeric columns as strings make the whole anomaly scanner (`_detectNullValues`, `_detectEmptyStrings`, duplicates, orphan FKs) report **no findings** (false negatives). `report_handler.dart` and `analytics_handler.dart:472` already handle the String case — `extractCountFromRows` is the outlier. Fix: add `if (countValue is String) return int.tryParse(countValue) ?? 0;`.
- **M2 — Naive variance with catastrophic cancellation** ✓ verified. `anomaly_detector.dart:426-427` computes `AVG(x*x) - AVG(x)*AVG(x)` in SQL; for large-magnitude, low-spread columns floating-point cancellation yields garbage σ (clamped-to-0 suppresses real outliers, or tiny σ flags everything). The log-scale fallback (`:510-533`, `logStddev = logRange/4`) is a statistically unsound heuristic, not a real log-space σ. Fix: two-pass / Welford, or `AVG((x-mean)*(x-mean))` after fetching the mean.
- **M3 — Query-stat double-counting inflates all index/slow-query advice** *(agent-reported)*. `engines/query-intelligence.ts:226-233` re-ingests `recentQueries` on every 15s TTL refresh; `executionCount`/`totalDurationMs` grow on each cache expiry. Fix: track an ingested cursor.
- **M4 — `fetchWithRetry` retries non-idempotent POSTs** *(agent-reported)*. `transport/fetch-utils.ts` retries transient errors for mutating POSTs (`httpSql` write path, import, session share/annotate, DVR config) → possible duplicate writes. `httpApplyEditsBatch` correctly uses the no-retry path. Fix: restrict retry to idempotent requests.
- **M5 — Unguarded `JSON.parse` + unvalidated `Memento.get` across stores** *(agent-reported)*. `snippet-store.ts:53-62`, `perf-baseline-store.ts:36-37` (transforms in constructor), `branch-manager.ts:59`, `dashboard-state.ts` — corrupted/version-mismatched persisted state throws on load. Fix: shared `loadArray(state,key,validate)` with try/catch + `Array.isArray` + version check.
- **M6 — Unawaited `Memento.update()` + read-modify-write races** *(agent-reported)*. `annotation-store.ts:214`, `filter-store.ts:72`, `snippet-store.ts`, `analysis-history-store.ts:103`, `dashboard-state.ts`; `snippet-store` re-reads the whole array per op with no cache. `pin-store`/`query-history-store` await correctly — use as the model.
- **M7 — `query_recorder` is a "ring buffer" backed by `List.removeAt(0)`** *(agent-reported)*. `query_recorder.dart:122-126,312-317` — O(n) per eviction at `maxQueries=5000`; `updateConfig` shrink is O(n²). Comment contradicts implementation. Fix: real circular buffer or `Queue`/`removeRange`.
- **M8 — `_parseTableName` ReDoS-prone regex on hot path** *(agent-reported)*. `query_recorder.dart:339` `^\s*SELECT\s+.*?\s+FROM\s+…` runs on every recorded query; large/pathological SELECTs backtrack. Fix: length guard or non-regex leading-keyword scan.
- **M9 — Branch restore is non-transactional** *(agent-reported)*. `branching/branch-restore.ts:45-61` deletes all tables then inserts; a mid-insert failure leaves the live DB wiped and partially repopulated. Fix: wrap in BEGIN/COMMIT/ROLLBACK.
- **M10 — CSV import fidelity** ✓ verified. `server_utils.parseCsvLines` splits on `\n` first (breaks quoted fields with embedded newlines) and `.trim()`s every field (corrupts intentional whitespace). A second, weaker duplicate parser exists vs. `drift_debug_import.dart`. Fix: one RFC-4180-aware parser; stop trimming field contents.
- **M11 — Naive `;`-split in SQL-format import** *(agent-reported)*. `drift_debug_import.dart:224` `data.split(';')` shatters statements containing `;` in a literal; SQL import runs arbitrary unrestricted statements through `writeQuery`. Fix: real statement splitter; document/​gate SQL import as arbitrary-write.
- **M12 — Diagnostics correctness** *(agent-reported)*: `extractTableFromSql` returns the wrong table for `INSERT … SELECT … FROM` (`sql-utils.ts:23`); runtime table-exclusion never applies due to a `data.tableName` vs `data.table` key mismatch (`diagnostic-manager.ts:192` vs `event-converter.ts`); schema/FK caches have no generation key so they serve stale data after migration.
- **M13 — Compliance fails open** *(agent-reported)*. `naming-matcher.ts:20` returns `true` for an unknown convention (a typo in `.drift-rules.json` marks everything compliant); config is a blind `as` cast. Fix: fail closed; validate config shape.
- **M14 — `pkKey`/composite-key collisions** ✓ verified (Dart) / *(agent-reported)* (TS). `server_utils.compositePkKey` joins with `|`; `timeline/snapshot-diff.ts:26` coerces `null`/`""`/`1`/`"1"` to the same key. Causes phantom or missed diffs in snapshot/branch/changelog comparison. Fix: per-column `JSON.stringify` or a null sentinel.

### LOW

- `✅ DONE` — **L1 — `_secureCompare` leaks length** ✓ verified. `auth_handler.dart:108-110` early-returns on length mismatch, defeating the constant-time loop for length. Minor for a dev tool; fold length into the result without early return.
- `☑ REVIEWED — no change` (C1 loopback default removes the exposure premise) — **L2 — Error responses echo `error.toString()`** ✓ verified. `server_context.dart:581` and many handlers return raw SQLite/exception text (schema, paths, SQL) to the client. Acceptable for debug, but information disclosure on an open/tunneled server. Consider gating detail behind a flag.
- `✅ DONE (2026-06-14)` — **L4 — `safeSubstring` reimplements `substring` via double `replaceRange`** ✓ verified (`server_utils.dart:177`) — now a direct `substring(start, safeEnd)`; the four guards above prove the bounds, tests unchanged and green.
- `✅ DONE (2026-06-14)` — **L5 — `esc()` single-quote omission, systemic + duplicated** *(agent-reported)*. ~50 `esc`/`escapeHtml` copies are now one canonical `shared-utils.escapeHtml` (`& < > " '` + `String()`); host-side copies alias it, prior `escapeHtml` defs re-export it, and the in-browser copies got the missing `'` escape. Full suite green.
- `✅ DONE (2026-06-14)` — **L6 — Repo clutter / stale artifacts**: the two `.bak` files and the three stale duplicate web assets (`masthead.js`, `sql-highlight.js`, `table-def-toggle.js` — superseded by their `.ts` sources via the esbuild bundle) were removed.
- `✅ DONE (2026-06-14)` — **L7 — Duplicated helpers** *(agent-reported)*: the 3 `makeId` copies are now one `shared-utils.makeId(prefix?)`; the `codelens` O(n²) per-keystroke line scan uses `document.positionAt` (O(log n)); the duplicate `ServerUtils.parseCsvLines` was already removed. The three snake/pascal case converters (`table-name-mapper.dartClassToSnakeCase`, `dart-names.snakeToPascal`, `refactoring-plan-naming.pascalCaseFromSqlTable`) were left intentionally distinct — they carry domain-specific rules (Drift acronym splitting, `'Lookup'`/`'column'` empty fallbacks) and are NOT redundant; `isar`'s `toSnake` is already a wrapper over `dartClassToSnakeCase`. (TTL constants / `999` sentinel: trivial, not pursued.)
- `☑ REVIEWED — no change` (bounded by the 2 s `changeDetectionMinInterval` throttle) — **L8 — Long-poll per-connection DB probing** *(agent-reported)*. `generation_handler.dart:131` runs `checkDataChange()` each interval per concurrent client for the whole window, driven by a client-supplied `since` with no upper bound. Verify the interval floor; consider a shared change-detection tick.

---

## Detailed Remediation Plan

> **Status: All phases shipped and verified; no open work remains.** C2b phase 2 (served SPA + data-grid CSP) was closed WONTFIX on 2026-07-16. The detailed plan below is kept verbatim as the original specification.

Ordered by leverage. Each phase is independently shippable; phases 1–2 are the security-defining ones.

### Phase 1 — Secure the boundaries (highest priority)

1. **Secure server defaults** (C1) — `drift_debug_server_io.dart`, `start_drift_viewer_extension.dart`.
   - Change defaults to `loopbackOnly: true`; stop sending `Access-Control-Allow-Origin: *` by default (omit header unless an origin is explicitly configured).
   - When a non-loopback bind is requested without a token, log a loud warning (or require an explicit `allowInsecureBind: true`).
   - Update README's first example + dartdoc to show the secure posture. Add tests asserting the default address is loopback and no wildcard CORS header is emitted.
   - *Verification:* `dart test test/drift_debug_server_test.dart test/handler_integration_test.dart`.

2. **CSP + escaping for all HTML surfaces** (C2) — `extension/src/**/*-html.ts`, `panel.ts`, `assets/web/*.ts`, `lib/src/server/html_content.dart`.
   - Add a per-render nonce and a strict CSP (`default-src 'none'; script-src 'nonce-…'; style-src …; img-src …`) to every webview `<head>` and to the Dart-served HTML. Remove `'unsafe-inline'` from `panel.ts`, `dashboard-html.ts`, `bulk-edit-html.ts`.
   - Fix the confirmed sinks: `snippet-library-html.ts:198-210` (escape `c`, `v`, `msg.message`), `lineage-html.ts:100` + `impact-html.ts:68,106` (HTML-attribute-encode or move to `data-*` + delegated listener), `er-diagram-html.ts:71` (`<`-escape stringified JSON), `dashboard-scripts.ts:205-213`.
   - Consolidate to ONE `escapeHtml` (`& < > " '` + `String()` coercion) and call it at every dynamic sink; replace inline `onclick` with delegated listeners.
   - Allowlist `executeAction` command ids (`message-handler.ts:91`); add runtime shape validators to DB-mutating message handlers (bulk-edit commit, editing-bridge, clipboard-import, seeder, breakpoint).
   - *Verification:* extend the existing webview HTML tests; add a test that a `<img onerror>` cell value renders inert.

3. **Validate extension `host` + gate token** (H4) — `api-client-base.ts`, `extension-bootstrap.ts`.
   - Reject non-loopback `host` unless explicitly confirmed; never attach `Authorization` to a non-loopback host without consent; move the token to `SecretStorage`.

### Phase 2 — SQL correctness and data integrity

4. **Remove backslash doubling in `sqlLiteral`** (C3) — `server_utils.dart:131,148-152`. Escape only `'`. Add a regression test with a backslash-containing value round-tripped through import/cell-update.
5. **One identifier-quoting helper everywhere** (H2) — add `quoteIdent` (Dart) / use `q()` (TS) at every `"$name"` site. Add a test with a table/column name containing `"`.
6. **Rewrite the read-only validator as a state-tracking tokenizer** (H1) — `sql_validator.dart`. Add the worked-bypass strings as test cases (`SELECT 'a -- b' ; DROP TABLE t --`, bracket/backtick identifier quoting).
7. **Affected-row reporting + pkValue coercion** (H5) — `cell_update_handler.dart`, `edits_batch_handler.dart`.
8. **String-tolerant count extraction** (M1) — `server_utils.dart:46-59`; align with `analytics_handler.dart:472`.

### Phase 3 — Resource safety and resilience

9. **Request-body size cap + table-read caps** (H3) — shared body-read helper enforcing `contentLength`/running-byte budget (413); cap snapshot/dump rows.
10. **Idempotency for mutating POSTs** (M4) — restrict `fetchWithRetry` to idempotent calls.
11. **Real ring buffer + ReDoS guard** (M7, M8) — `query_recorder.dart`.
12. **Transactional branch restore** (M9); **robust CSV/statement parsing** (M10, M11).

### Phase 4 — Detector accuracy and engine logic

13. **Fix anomaly variance + drop/replace the log-scale heuristic** (M2).
14. **Relationship-engine depth/cycle/safe-delete fixes** (H6).
15. **Query-stat double-counting** (M3); **schema/FK cache generation key** (M12).
16. **Store hardening**: shared validated `loadArray`, await all `Memento.update`, fix collisions (M5, M6, M14).
17. **Diagnostics correctness**: `extractTableFromSql` verb-first, table-exclusion key alignment (M12); compliance fail-closed (M13).

### Phase 5 — Hygiene

18. Consolidate duplicated escapers/converters/helpers; remove `*.bak` and stale `*.js` artifacts (L5–L7).
19. Constant-time-compare length hardening (L1); error-detail gating (L2); long-poll tick review (L8).

---

## Open questions (saved for the user, not blocking)

1. **Is non-loopback binding an intended supported mode** (dev tunnels are referenced in comments)? If yes, the fix is "secure default + explicit opt-in"; if no, it can be removed entirely.
2. **Should write features (cell update, import, branching) be off by default** and require explicit host opt-in, given the open-by-default network posture?
3. **Threat model for the webviews:** are table/column *names* considered trusted (developer-authored schema) while cell *values* are untrusted? That changes whether lineage/er-diagram are Critical or High — the snippet result path (cell values) is unambiguously the worst.

---

## Finish Report (2026-06-14)

### Status

This audit is **closed**. Every Critical, High, and Medium finding is fixed and verified; every Low finding is fixed or reviewed-as-acceptable. The one follow-on enhancement (C2b phase 2) was closed WONTFIX on 2026-07-16. No outstanding work remains.

### Scope

The remediation spanned the Dart debug server (`lib/`, `test/`), the VS Code extension (`extension/src`, TS tests), the browser SPA assets (`assets/web/`), and the project docs/changelog. It landed across the `security/audit-phases-1-2` branch in a sequence of focused commits (secure boundaries → SQL integrity → resource safety → detector/engine accuracy → hygiene → the C2b webview CSP → the L4–L7 cleanups).

### What changed, by theme

- **Network boundary (C1, H4):** the server defaults to `loopbackOnly: true` with no wildcard CORS header; the extension withholds the Bearer token from non-loopback hosts. BREAKING for anyone who relied on `0.0.0.0` + `'*'`.
- **Content boundary / XSS (C2):** the confirmed stored-XSS sinks were fixed (C2a), the dashboard `executeAction` command id was allowlisted (C2c), and a per-render nonce Content-Security-Policy was added to all 47 extension webview panels through one shared `secureWebviewHtml` post-processor (C2b phase 1). The post-processor swaps an author `__CSP_NONCE__` placeholder rather than auto-stamping every `<script>`, so an injected script from any future escaping miss is inert. Inline `on*` handlers were converted to delegated `data-*` dispatch because a nonce CSP blocks inline handlers. The browser-served SPA and the data-grid webview (C2b phase 2) are deferred — see `plans/history/2026.07/2026.07.16/c2b-phase2-served-spa-csp.md`.
- **SQL correctness (C3, H1, H2, H5):** `ServerUtils.sqlLiteral` no longer doubles backslashes (silent data corruption); all identifier interpolation routes through `ServerUtils.quoteIdent`; the read-only validator is a single-pass tokenizer that cannot be desynchronized by comments-in-strings or strings-in-comments; cell updates coerce the PK value and report affected rows.
- **Resource safety (H3, M4, M7, M8, M9, M10, M11):** a POST body-size cap (HTTP 413), no-retry for non-idempotent requests, an O(1) DVR ring buffer with a bounded table-name parser, transactional branch restore, and RFC-4180 CSV + literal-aware SQL statement parsing.
- **Detector / engine accuracy (M1, M2, M3, M5, M6, M12, M13, M14, H6):** string-tolerant count extraction, numerically-stable variance, single-count query statistics, hardened persisted-state loading, diagnostic table attribution + cache freshness, fail-closed naming compliance, key-collision fixes, and a corrected relationship-engine traversal / safe-delete planner.
- **Hygiene (L1, L4, L5, L6, L7):** constant-time auth compare without a length leak; `safeSubstring` simplified to a direct `substring`; the ~50 HTML escapers consolidated into one `shared-utils.escapeHtml` (with the previously-missing `'` escape added everywhere); stale duplicate web assets and `.bak` files removed; the `makeId` copies consolidated and the CodeLens per-keystroke line scan reduced from O(n²) to O(log n) via `document.positionAt`.

### Reviewed without change

- **L2** (error-detail echo) — intentional for a debug server; the C1 loopback default removes the exposure premise.
- **L8** (long-poll probing) — already bounded by the 2 s `changeDetectionMinInterval` throttle.

### Out of scope

- **C2b phase 2** — closed WONTFIX (2026-07-16). Defense-in-depth only on a loopback-only surface whose exploitable sinks are already fixed; boot-path regression risk and manual verification cost outweigh the marginal gain. Plan retained at `plans/history/2026.07/2026.07.16/c2b-phase2-served-spa-csp.md`.
- **OVSX publish-token rotation** (former L3) — a credential-management action handled outside this audit.

### Verification on close

Dart `analyze` clean; extension `tsc --noEmit` clean; the full extension Mocha suite (2845 tests) passes. Each remediation commit also passed the repo pre-commit hook (Dart format+analyze, and for TS commits `tsc` + build verification).

### Disposition

This completed audit is retained at its original path rather than moved to `plans/history/`, because 30 source files cite it by that exact path as stable cross-reference anchors (`// See plans/full-codebase-audit-2026.06.12.md <finding>`); relocating it would break those references. It is closed logically (status marked CLOSED, finish report appended) without physical relocation.

Finish report appended: `plans/full-codebase-audit-2026.06.12.md` (closed in place).
