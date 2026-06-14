# INFRA: Saropa suite integration — contract Drift Advisor must satisfy (Log Capture side has shipped)

**Status: Open**

Created: 2026-06-13
Type: Infrastructure / cross-tool integration
Related plan (this repo, canonical protocol owner): `plans/67-saropa-suite-integration.md`
Sibling plan (Log Capture): `D:\src\saropa-log-capture\plans\105_plan-saropa-suite-integration.md`
Sibling plan (Lints): `D:\src\saropa_lints\plans\SAROPA_SUITE_INTEGRATION.md`

---

## Why this file exists

The **Saropa Log Capture** side of the three-tool suite integration is now implemented and committed
(saropa-log-capture commits `d5c87e4e`, `49fa4fb1`, `c1e9bfa6`). Log Capture now produces and consumes
the **Saropa Diagnostic Envelope** (the schema Drift Advisor owns, Section 2 of plan 67) and exposes a
deep-link button that targets a **Drift Advisor** command.

That button is **gated on Drift Advisor implementing its half** — an "Explain this query in Drift
Advisor" button only appears on a SQL Query History row when the `driftViewer.openExplainForSql`
command is registered (Log Capture probes the live command list, so it never shows a dead action).
This file is the precise, self-contained contract so the Drift Advisor work matches what Log Capture
already ships. No code change is requested in Log Capture; this is the Advisor task list.

This is a hand-off **spec**, not a defect report — filed under `bugs/` for visibility.

---

## What Drift Advisor must build (3 pieces)

### 1. Contribute the stable deep-link commands (public surface, Section 3 of your own plan)

| Command id | Args | Opens |
|------------|------|-------|
| `driftViewer.openExplainForSql` | `{ sql: string, table?: string }` | EXPLAIN tree + index suggestion for that query |
| `driftViewer.openTable` | `{ table: string }` | Live table data grid |

- These ids are the canonical surface. **Never rename them** — Log Capture hard-codes
  `driftViewer.openExplainForSql` as the "Explain this query" target, and any envelope `fix.command`
  may point at them.
- Log Capture invokes `driftViewer.openExplainForSql` with a **single object arg** `{ sql }` (it omits
  `table`; derive it from the SQL if you need it). Its executor passes a lone object straight through
  and spreads an array, so accept the options object as the first positional arg:
  `(opts: { sql: string, table?: string }) => …`.
- Until `driftViewer.openExplainForSql` is registered, Log Capture's "Explain this query" button stays
  hidden — by design, not a bug.

### 2. Write the offline mirror `<workspace>/.saropa/diagnostics/advisor.json`

You already half-ship the envelope as `GET /api/issues`. Add the **offline mirror**: write the same
envelope (schema below, `source: "advisor"`) to `.saropa/diagnostics/advisor.json` on each scan, so
Log Capture and Lints can read your issues when the debug server is not running.

Log Capture reads this file as the **fallback** source for its SQL Query History "Database issues
(Drift Advisor)" section (it prefers your live `/api/issues` when the server is reachable, and falls
back to this mirror otherwise), rendering each diagnostic as a typed row (source tag, severity color,
fix button). For that panel, Log Capture keeps the DB-relevant categories: `drift`, `schema`, `data`,
`performance`. Populate `table` and `sql` where you have them — they drive the row's location text and
its fix button.

A natural primary action on a missing-index issue:
`fix: { kind: "command", title: "…", command: "saropaLints.explainRule", args: [{ ruleId: "require_database_index" }] }`
— linking a runtime issue to the static rule that governs it. `fix.args` is a **spread array** (VS Code
`executeCommand(id, ...args)` semantics), so wrap the options object as shown.

### 3. Drift Health panel (R4 / Section 5 — the flagship loop)

Host the joined panel (only Advisor can render live schema + EXPLAIN). Pull the static side from
`.saropa/diagnostics/lints.json` and the telemetry side from `.saropa/diagnostics/log-capture.json`
(both written today by their respective tools — Log Capture's is live now). Log Capture's
`log-capture.json` carries `drift`/`performance` diagnostics with normalized `sql` and a `commitSha`
for the same-commit correlation in Section 6.

---

## The Saropa Diagnostic Envelope (schema you write — schemaVersion 1)

File: `<workspace>/.saropa/diagnostics/advisor.json`, UTF-8.

```jsonc
{
  "schemaVersion": 1,
  "producer": { "name": "saropa_drift_advisor", "version": "<your version>" },
  "generatedAt": "<ISO 8601>",
  "diagnostics": [
    {
      "id": "string",                 // stable dedupe key
      "source": "advisor",
      "severity": "error | warning | info",
      "category": "drift | schema | data | performance | …",
      "title": "string",              // already-localized
      "detail": "string?",
      "ruleId": "string?",            // your check id
      "location": { "file": "lib/db/app_database.dart", "line": 12, "column": 3, "uri": "string?" },
      "sql": "string?",               // normalized query text
      "table": "string?",
      "fix": { "kind": "command", "title": "string", "command": "saropaLints.explainRule", "args": [ { "ruleId": "require_database_index" } ] },
      "docUri": "string?",
      "commitSha": "string?",
      "timestamp": "string?"
    }
  ]
}
```

Log Capture validates leniently: it drops malformed individual diagnostics, ignores unknown fields,
and refuses an envelope whose `schemaVersion` major exceeds 1. `location.file` must be
workspace-relative (never an absolute home path). Strings are already localized by the producer.

---

## Reciprocal: commands Log Capture exposes (for your deep-links back into it)

| Command id | Args | Opens |
|------------|------|-------|
| `saropaLogCapture.openSignal` | `{ id: string }` | Reveals + flashes that signal in the Signal panel |
| `saropaLogCapture.openSqlHistoryForFingerprint` | `{ sql?: string, fingerprint?: string }` | SQL Query History focused on that query |

So a Drift Advisor issue that Log Capture saw run slow can deep-link back with
`saropaLogCapture.openSqlHistoryForFingerprint { sql }`.

---

## Done criteria for the Advisor side

- `driftViewer.openExplainForSql` (+ `driftViewer.openTable`) registered (Log Capture's "Explain this
  query" button then appears automatically).
- `.saropa/diagnostics/advisor.json` mirror written on each scan, conforming to the schema above,
  alongside the existing `/api/issues`.
- Drift Health panel joins live schema/EXPLAIN with `lints.json` + `log-capture.json`, correlated by
  `commitSha`.
- Reading the sibling mirrors is tolerant of absent/truncated/newer-schema files.

---

## Changes Made

<!-- Fill in as the Advisor work lands; add commit hashes. -->

## Commits

<!-- Add commit hashes as pieces land. -->
