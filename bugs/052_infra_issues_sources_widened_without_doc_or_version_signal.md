# BUG: `/api/issues` grew two new `source` values and a new `sources` filter token with no doc update and no version signal — the documented consumer mislabels them

**Status: Open**

Created: 2026-09-02
Component: Server (contract) + Documentation
File: `lib/src/server/analytics_handler.dart` (lines ~325, ~358, ~493), `doc/API.md` (line 1384, line 1392)
Severity: Medium (contract drift; consumer silently mislabels two of four issue kinds)

---

## Summary

`GET /api/issues` emits four `source` values (`index-suggestion`, `anomaly`, `orphan-table`, `soft-relationship`) and accepts four `sources` filter tokens. `doc/API.md` describes only three of each in its prose and its query-parameter table, while the field table further down lists all four — the same document contradicts itself. `schemaVersion` stayed at `1` through the widening, which is correct under an additive policy but leaves a consumer no way to detect that the value set grew. The result is visible downstream: the Saropa Lints extension types `source` as a two-value union and labels every issue that is not an index suggestion as an anomaly.

---

## Attribution Evidence

The endpoint, its filter, and its documentation are all in this repo.

```bash
# Positive — all four sources ARE emitted here
$ grep -n "jsonKeySource: '" lib/src/server/analytics_handler.dart
243:            ServerConstants.jsonKeySource: 'index-suggestion',
288:            ServerConstants.jsonKeySource: 'anomaly',
325:            ServerConstants.jsonKeySource: 'orphan-table',
358:            ServerConstants.jsonKeySource: 'soft-relationship',

# Positive — all four filter tokens ARE parsed here
$ sed -n '508,512p' lib/src/server/analytics_handler.dart
    final hasIndex = parts.any((p) => p == 'index-suggestions');
    final hasAnomalies = parts.any((p) => p == 'anomalies');
    final hasOrphanTables = parts.any((p) => p == 'orphan-tables');
    final hasSoftRelationships = parts.any((p) => p == 'soft-relationships');

$ grep -rn "soft-relationship" extension/src/
# 0 matches — the extension has no source-specific handling either
```

**Emit site(s) — list ALL:** `lib/src/server/analytics_handler.dart:243`, `:288`, `:325`, `:358`. Filter parse at `:493-518`. Category mapping at `:428`.

### The documentation contradicts itself within one section

Prose and query-parameter table say three:

```bash
$ sed -n '1384,1384p' doc/API.md
Returns a single merged list of index suggestions, data-quality anomalies, and orphan physical tables in a stable issue shape. Intended for IDE integrations (e.g. Saropa Lints) and scripts that want one request instead of calling `GET /api/index-suggestions`, `GET /api/analytics/anomalies`, and `GET /api/analytics/orphan-tables` separately.

$ sed -n '1392,1392p' doc/API.md
| `sources` | string (optional) | all | Comma-separated: `index-suggestions`, `anomalies`, `orphan-tables`. When present, only issues from the listed sources are included. Example: `?sources=anomalies` returns only anomaly issues. An unrecognized value falls back to all sources rather than an empty result. |
```

The field table 60 lines later says four:

```bash
$ sed -n '1455,1456p' doc/API.md
| `source` | string | yes | `"index-suggestion"`, `"anomaly"`, `"orphan-table"`, or `"soft-relationship"` (the detector that produced the issue) |
| `category` | string | yes | Shared taxonomy: `"performance"` (index suggestions), `"data"` (anomalies), `"schema"` (orphan tables, inferred relationships), or `"other"` |
```

So a consumer reading the query-parameter table has no way to learn that `?sources=soft-relationships` is a valid token, even though the server accepts it.

### Cross-repo proof this reaches a real consumer

The Saropa Lints client — the integration `doc/API.md:1384` names by name — types the field as two values:

```bash
$ sed -n '9,11p' D:/src/saropa_lints/extension/src/driftAdvisor/types.ts
export type DriftIssueSource = 'index-suggestion' | 'anomaly';
```

Its filter admits the extra sources (it only checks `table` and `message`):

```bash
$ sed -n '63,70p' D:/src/saropa_lints/extension/src/driftAdvisor/client.ts
async function fetchIssuesEndpoint(baseUrl: string): Promise<DriftIssueRaw[]> {
  const res = await fetch(`${baseUrl}${ISSUES_ENDPOINT}`);
  if (!res.ok) return [];
  const data = (await res.json()) as { issues?: DriftIssueRaw[] };
  const arr = Array.isArray(data?.issues) ? data.issues : [];
  return arr.filter((i): i is DriftIssueRaw => i && typeof i.table === 'string' && typeof i.message === 'string');
}
```

…and then every branch that switches on `source` is a two-way test whose `else` arm is "anomaly":

```bash
$ grep -n "issue.source ===" D:/src/saropa_lints/extension/src/driftAdvisor/driftAdvisorTree.ts
103:      const code = issue.source === 'index-suggestion' ? CODE_INDEX_SUGGESTION : CODE_ANOMALY;
151:      issue.source === 'index-suggestion' ? 'symbol-method' : 'warning',

$ sed -n '24,26p' D:/src/saropa_lints/extension/src/driftAdvisor/driftAdvisorTree.ts
const DIAGNOSTIC_SOURCE = 'Saropa Drift Advisor';
const CODE_INDEX_SUGGESTION = 'drift_advisor_index_suggestion';
const CODE_ANOMALY = 'drift_advisor_anomaly';
```

So an orphan-table finding and an inferred-relationship finding are both published into the user's Problems panel with the diagnostic code `drift_advisor_anomaly`. The code is wrong, and it is a code users can filter and suppress on.

### Why `schemaVersion` did not help

```bash
$ grep -n "issuesSchemaVersion" lib/src/server/server_constants.dart
637:  static const int issuesSchemaVersion = 1;
```

Adding a value to an existing enum-like field is additive under the stated policy, so leaving `schemaVersion` at 1 was the right call. But the envelope carries no other signal — no `sources` list, no per-issue capability hint — so a consumer that wants to fail loudly on an unrecognized `source` cannot distinguish "value I have not been taught" from "value that has always existed". That gap is what turns a documentation omission into silent mislabeling.

---

## Environment

- OS: Windows 11 Pro 10.0.22631
- VS Code version: 1.x (any)
- Extension version: 4.2.5
- Dart package version: `saropa_drift_advisor` 4.2.5
- Saropa Lints extension version: 15.2.8
- Database type and version: any SQLite/Drift database; orphan-table findings additionally require the Drift-declared table set (`startDriftViewer` supplies it)
- Connection method: localhost 8642
- Relevant non-default settings: `saropaLints.driftAdvisor.integration: true`, `saropaLints.driftAdvisor.showInProblems: true` (default)
- Other potentially conflicting extensions: none

---

## Steps to Reproduce

1. Start a Drift app via `startDriftViewer` on a database that has at least one physical table absent from the Drift schema (an orphan) or a pair of tables linked only by column naming (a soft relationship).
2. Confirm the server emits the sources:

   ```bash
   curl -s http://127.0.0.1:8642/api/issues | grep -o '"source": *"[a-z-]*"' | sort -u
   # "source": "anomaly"
   # "source": "index-suggestion"
   # "source": "orphan-table"
   # "source": "soft-relationship"
   ```

3. Confirm the undocumented filter token works:

   ```bash
   curl -s "http://127.0.0.1:8642/api/issues?sources=soft-relationships" | head -20
   ```

4. With Saropa Lints 15.2.8 installed and `saropaLints.driftAdvisor.integration` on, run `saropaLints.driftAdvisor.refresh` and inspect the Problems panel entries for the orphan-table finding.

---

## Expected Behavior

- `doc/API.md` prose and the `sources` query-parameter row list all four sources and all four tokens, matching the field table in the same section.
- Consumers can enumerate the valid `source` values from the documentation alone.
- An orphan-table finding is not published under a diagnostic code that says "anomaly".

---

## Actual Behavior

- The `sources` parameter row omits `soft-relationships` entirely; the prose omits soft relationships too. The two halves of one API section disagree.
- Saropa Lints publishes orphan-table and soft-relationship findings with `code: drift_advisor_anomaly`.

---

## Error Output

None. The widening is additive, the consumer's runtime filter is structural (`table` + `message`), and TypeScript's compile-time union is erased at runtime — so an out-of-union value flows through without any check firing.

### VS Code Developer Tools Console

Empty.

### Extension Output Channel

No entry.

---

## Duplicate-Emission Check

Relevant here. Two `(owner, code)` pairs cover the same underlying findings:

- **`Saropa Drift Advisor` / `drift_advisor_anomaly`** — emitted by the Saropa Lints extension at `D:/src/saropa_lints/extension/src/driftAdvisor/driftAdvisorTree.ts:103`, applied to anomaly, orphan-table, *and* soft-relationship issues.
- **Advisor's own surfaces** — this repo renders the same `/api/issues` payload in its Anomalies and Index Suggestions views; the source values are preserved correctly here (`grep -rn "soft-relationship" extension/src/` → 0 matches, i.e. no source-specific relabeling happens on this side).

The Lints publish is gated off when Advisor's extension is active, so the two do not duplicate squiggles in practice:

```bash
$ sed -n '28,33p' D:/src/saropa_lints/extension/src/driftAdvisor/driftProblemsGate.ts
export function shouldPublishDriftProblems(inputs: DriftProblemsGateInputs): boolean {
  return !inputs.standaloneActive && inputs.showInProblems;
}
```

The finding here is mislabeling in the un-gated (Lints-only) case, not duplicate emission.

In this repo: `grep -n "jsonKeySource: '" lib/src/server/analytics_handler.dart` → four sites listed above; `grep -rn "soft-relationship" extension/src/` → 0 matches. Only the Dart path emits source values.

---

## Screenshots / Recordings

Not applicable — the symptom is a wrong `code` string on a Problems-panel row.

---

## Minimal Reproducible Example

```bash
curl -s "http://127.0.0.1:8642/api/issues?sources=soft-relationships"
```

Works. Now search `doc/API.md` for `soft-relationships` in the `sources` row — it is not there. That single mismatch is the documentation half of the bug; the Lints two-value union is the downstream half.

---

## What I Already Tried

- [x] Enumerated every `jsonKeySource:` literal in `analytics_handler.dart` — exactly four.
- [x] Confirmed `_parseSourcesFilter` accepts exactly four tokens and falls back to "all" on an unrecognized one (`:513-518`), so the undocumented token is not merely tolerated, it is implemented.
- [x] Confirmed `doc/API.md` documents four in the field table (line 1455) and three in the query-parameter table (line 1392) and three in the prose (line 1384).
- [x] Confirmed the downstream union in `types.ts:9` is two values and every `source` branch in `driftAdvisorTree.ts` is binary.
- [x] Confirmed Advisor's own extension does no source-specific relabeling, so the mislabeling is confined to the Lints-only case.

---

## Regression Info

- Last working version: the release before orphan-table detection was merged into `/api/issues` — at that point the two-value union was accurate.
- First broken version: the release that added `source: 'orphan-table'`; compounded by the release that added `source: 'soft-relationship'` (Feature 77).
- What changed: two detectors were merged into the unified issues list. The field table in `doc/API.md` was updated; the prose, the `sources` parameter row, and the downstream consumer were not.

---

## Root Cause

<!-- Fill in during investigation. -->

An enum-like string field was widened twice without a documentation checklist covering every place the value set appears. `doc/API.md` mentions the source set in three places and only one was updated. Because the change is additive, nothing in either repo fails at build or at runtime — the two-value assumption downstream simply produces a wrong label.

---

## Changes Made

<!-- Fill in when a fix is written. -->

Suggested shape:

1. Update `doc/API.md:1384` prose and `doc/API.md:1392` `sources` row to list all four sources and all four tokens, matching line 1455.
2. Add a short "Source values are additive" note to the `GET /api/issues` section stating explicitly that new `source` values may appear without a `schemaVersion` bump, and that consumers must treat an unrecognized `source` as "other" rather than folding it into a known bucket. That sentence is what a consumer needs in order to write correct defensive code.
3. Consider echoing the server's supported source list in the health payload (alongside `capabilities`) so a consumer can enumerate rather than hardcode. This is additive and does not require a version bump.
4. Then file a companion issue in `D:/src/saropa_lints/bugs/` to widen `DriftIssueSource` and add distinct diagnostic codes for `orphan-table` and `soft-relationship`. That change cannot be made here.

---

## Commits

<!-- Add commit hashes as fixes land. -->

---

## Impact

- Who is affected: consumers of `/api/issues` — the Saropa Lints extension, and any script written against `doc/API.md`.
- What is blocked: correct labeling and suppression of orphan-table and soft-relationship findings in the Lints-only configuration; discovery of the `?sources=soft-relationships` filter by anyone reading the documentation.
- Data risk: none.
- Frequency: every orphan-table and soft-relationship finding, whenever Advisor's own extension is not active.
