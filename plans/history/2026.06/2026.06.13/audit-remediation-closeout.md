# Full-codebase audit remediation — closeout

A full security and code-quality audit of the `saropa_drift_advisor` package (the debug-only Drift/SQLite HTTP server) and its `Drift Viewer` VS Code extension produced a ranked findings list in `plans/full-codebase-audit-2026.06.12.md`. This file records the remediation of that list: which findings were fixed, which were reviewed without change, and which are handed off. Each fixed finding has its own dated report in this directory; this is the index and overall verification record.

## Finish Report (2026-06-13)

### Scope

(A) Dart package (`lib/`, `test/`), (B) VS Code extension (`extension/src`, TS tests), (C) docs (`CHANGELOG.md`, `README.md`, `plans/history`). The remediation landed as 15 commits on branch `security/audit-phases-1-2`.

### Findings fixed (with per-finding reports in this directory)

- **C1** secure server defaults — `loopbackOnly: true` and `corsOrigin: null` (was `0.0.0.0` + `'*'`). BREAKING.
- **H4** extension withholds the Bearer token from non-loopback hosts.
- **C2a** confirmed stored-XSS sinks fixed (snippet query results, lineage/impact inline handlers, ER-diagram `<script>`, dashboard config form) via new `attrJsString`/`jsonForScript`/`isLoopbackHost` helpers.
- **C2c** dashboard `executeAction` allowlisted to `driftViewer.*`.
- **C3** `sqlLiteral` no longer doubles backslashes (data corruption).
- **M1** string-typed COUNT parsed instead of coerced to 0.
- **H2** all SQL identifier interpolation routed through `ServerUtils.quoteIdent`.
- **H5** cell update coerces the PK value and returns `rowsAffected`.
- **H1** read-only SQL validator rewritten as a single-pass tokenizer (comment/string desync bypass closed).
- **H3** POST body size cap (64 MiB → HTTP 413) via `ServerUtils.readBodyBytes`.
- **M4** `fetchWithRetry` no longer retries non-idempotent requests.
- **M7/M8** DVR recorder uses an O(1) circular buffer; table-name parser input bounded.
- **M9** branch restore is atomic (transactional batch path).
- **M10/M11** RFC-4180 CSV parsing + literal-aware SQL statement splitting.
- **M2** stable two-pass variance + correct log-scale outlier check.
- **H6** relationship engine: absolute depth, cycle guard, leaf-inclusive safe-delete by each node's own PK column.
- **M3** query statistics counted once per query (ingest cursor).
- **M12** `extractTableFromSql` verb-first; diagnostic exclusion key accepts `tableName`/`table`; schema-insights cache invalidated on generation change.
- **M5/M6/M14** snippet-import guard, perf-baseline corrupt-state tolerance, annotation floating-promise, `pkKey` type/null collision fix.
- **M13** naming-compliance fails closed on unknown convention; array config rejected.
- **L1** constant-time auth compare no longer leaks secret length.
- **L7** removed the duplicate weaker `ServerUtils.parseCsvLines`.

### Reviewed — no change required

- **L2** error-detail echo: intentional for a debug server; the C1 loopback default removes the exposure premise.
- **L8** long-poll DB probing: already bounded by the 2 s `changeDetectionMinInterval` throttle.

### Handed off (not done)

- **C2b** nonce-based CSP across ~40 webview panels + the served HTML (defense-in-depth; the exploitable sinks are already fixed under C2a). Best done as a focused per-panel pass with render verification.
- **L5** consolidation of ~15 duplicate `esc()` helpers (latent-only gaps; canonical helpers already exist).
- **L6** removal of stale artifacts — the two `.bak` files (`analysis_options_custom.yaml.bak`, `assets/web/app.js.bak`) were deleted 2026-06-14; the duplicated `*.js` next to their `*.ts` sources remain. The duplicate CSV parser half of the original L7 finding was removed earlier; the helper dedup is not.
- **L7 (remainder)** TS helper dedup — three case converters, 3 `makeId` copies, shared TTL constants, codelens O(n²) line scan. Cosmetic.
- **L4** `safeSubstring` rewrite — cosmetic, not scheduled.
- **L3** rotation of the Open VSX publish token (user action).

### Documentation updated

- `CHANGELOG.md` — Unreleased section covers every shipped fix, with the BREAKING default change called out.
- `README.md` — bind/CORS default descriptions corrected to loopback + no-CORS in all three places that stated the old `0.0.0.0` / `false` defaults.

### Verification

- Dart: `dart analyze lib/` clean; full `dart test` suite 648 tests pass.
- Extension: `tsc --noEmit -p ./` clean; full Mocha suite 2749 tests pass.
- Every commit passed the repo pre-commit hook (Dart format+analyze and, for TS commits, `tsc` + build verification).

### Outstanding

Engineering: **C2b** (CSP backstop), **L5** (esc consolidation), **L6** (remove stale `.bak`/`.js` artifacts). User action: **L3** (rotate OVSX token). Optional/cosmetic: **L4**, **L7 remainder**. The umbrella audit document `plans/full-codebase-audit-2026.06.12.md` remains active because of these open items; it now carries per-finding `✅ DONE` / `☑ REVIEWED` / `⏳ NEEDS BUILDING` tags.
