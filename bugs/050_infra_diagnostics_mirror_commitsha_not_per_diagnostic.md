# BUG: Diagnostics mirror stamps `commitSha` only at envelope level, so both siblings read it as absent

**Status: Open**

Created: 2026-09-02
Component: Extension
File: `extension/src/suite/diagnostics-mirror.ts` (line ~76)
Severity: False negative (silent data loss across the suite contract)

---

## Summary

`writeAdvisorDiagnosticsMirror()` stamps the workspace commit onto the **envelope root** (`{...canonical, commitSha}`). Both sibling tools stamp and read `commitSha` **per diagnostic**. Log Capture's "which commit were these findings captured at?" lookup literally scans the diagnostics array — `envelope.diagnostics.find((d) => d.commitSha)` — so for `advisor.json` it always returns `undefined`. The plan 67 R6 cross-commit correlation feature is wired on Advisor's side and dead on the consumer side.

---

## Attribution Evidence

The writer lives in this repo.

```bash
# Positive — the mirror writer IS here
$ grep -n "commitSha" extension/src/suite/diagnostics-mirror.ts
69:  const commitSha = await resolveWorkspaceCommit();
70:  const stamped = commitSha === undefined
71:    ? canonical
72:    : { ...canonical, commitSha };

$ grep -rn "commitSha" lib/src/
# 0 matches — the Dart server does not produce commitSha at all; the extension adds it
```

**Emit site(s) — list ALL:** `extension/src/suite/diagnostics-mirror.ts:72` (the only place Advisor writes `commitSha`).

### Negative attribution — the consumers are NOT at fault

Saropa Lints stamps it **per diagnostic**:

```bash
$ grep -rn "commitSha" D:/src/saropa_lints/extension/src/ | grep -v test
D:/src/saropa_lints/extension/src/suite/commitSha.ts:5: * signals." Stamping each exported diagnostic with `commitSha` lets the three
D:/src/saropa_lints/extension/src/suite/envelope.ts:77:  commitSha?: string;
D:/src/saropa_lints/extension/src/suite/envelope.ts:99:  commitSha?: string;
D:/src/saropa_lints/extension/src/suite/envelope.ts:215:  if (opts.commitSha) diagnostic.commitSha = opts.commitSha;
D:/src/saropa_lints/extension/src/suite/exporter.ts:19:import { resolveCommitSha } from './commitSha';
D:/src/saropa_lints/extension/src/suite/exporter.ts:43:    commitSha: resolveCommitSha(root),
```

`envelope.ts:215` — `diagnostic.commitSha = opts.commitSha`, i.e. on the entry, not the envelope.

Log Capture stamps it per diagnostic **and reads it per diagnostic**:

```bash
$ grep -rn "commitSha" D:/src/saropa-log-capture/src/ | grep -v test
.../diagnostics/diagnostics-producer.ts:33:  readonly commitSha?: string;
.../diagnostics/diagnostics-producer.ts:48:  const diagnostics = signalsToDiagnostics(signals, { commitSha: opts.commitSha });
.../diagnostics/envelope-parse.ts:65:    commitSha: optionalString(raw.commitSha),
.../diagnostics/saropa-diagnostic-envelope.ts:94:  readonly commitSha?: string;
.../diagnostics/signal-to-diagnostic.ts:23:  readonly commitSha?: string;
.../diagnostics/signal-to-diagnostic.ts:109:    commitSha: ctx.commitSha,
.../diagnostics/suite-connection-status.ts:49:    capturedCommit: envelope.diagnostics.find((d) => d.commitSha)?.commitSha,
```

The load-bearing line is `suite-connection-status.ts:49`. It is the only place Log Capture derives "which commit was this sibling's data captured at", and it looks **only** inside `diagnostics[]`.

The canonical schema puts `commitSha` on the diagnostic, not the envelope:

```bash
$ sed -n '86,112p' D:/src/saropa-log-capture/src/modules/diagnostics/saropa-diagnostic-envelope.ts
  readonly table?: string;
  readonly fix?: DiagnosticFix;
  /** Rule/issue documentation. */
  readonly docUri?: string;
  /** For cross-commit correlation (Section 6). */
  readonly commitSha?: string;
  ...
/** The serialized file shape written to `.saropa/diagnostics/<source>.json`. Section 2.2. */
export interface DiagnosticEnvelope {
  readonly schemaVersion: number;
  readonly producer: EnvelopeProducer;
  /** ISO 8601 timestamp the envelope was generated. */
  readonly generatedAt: string;
  readonly diagnostics: readonly Diagnostic[];
}
```

`DiagnosticEnvelope` has **no** `commitSha` field. `Diagnostic` does. Advisor writes it in the one place the schema does not define it.

Log Capture's parser reconstructs the envelope field-by-field from the whitelist above, so Advisor's extra root-level key is dropped on read entirely:

```bash
$ sed -n '106,121p' D:/src/saropa-log-capture/src/modules/diagnostics/envelope-parse.ts
  if (!isObject(raw) || !isReadableSchema(raw.schemaVersion) || !Array.isArray(raw.diagnostics)) {
    return undefined;
  }
  const producer = isObject(raw.producer) ? raw.producer : {};
  const diagnostics = raw.diagnostics
    .map(parseDiagnostic)
    .filter((d): d is Diagnostic => d !== undefined);
```

### Why this was not caught here

Advisor's own reader is lenient in exactly the way the siblings are not — it backfills the envelope value onto entries that lack their own:

```bash
$ grep -n "commitSha" extension/src/suite/suite-diagnostics.ts
267:      commitSha: d.commitSha ?? env.commitSha,
```

So Advisor reads its **own** mirror correctly and Advisor's own tests pass. The asymmetry is only visible from the sibling side.

---

## Environment

- OS: Windows 11 Pro 10.0.22631
- Extension version: 4.2.5
- Saropa Log Capture version: 9.3.12 (`D:/src/saropa-log-capture/package.json:3450`)
- Saropa Lints extension version: 15.2.8
- Relevant non-default settings: none — the mirror write is automatic on every generation tick (`registerDiagnosticsMirror`, debounced 1500 ms).

---

## Steps to Reproduce

1. Open a git workspace with a Drift app, start the Drift debug server, and let Advisor write the mirror (or run `driftViewer.writeDiagnosticsMirror` from the Command Palette).
2. Open `<workspace>/.saropa/diagnostics/advisor.json`. Observe `commitSha` at the top level and **no** `commitSha` on any entry in `diagnostics[]`.
3. With Saropa Log Capture 9.3.12 installed, open its suite connection status surface (the consumer of `suite-connection-status.ts`). The Advisor row shows no captured commit.

---

## Expected Behavior

Log Capture (and Lints) resolve the capture commit for Advisor's findings, so a stale mirror written at an older checkout can be identified and cross-commit trends can join Advisor's issues to the sibling tools' findings.

---

## Actual Behavior

`capturedCommit` is `undefined` for `advisor.json` in every case. There is no error, no warning, and no visible difference from "this envelope genuinely has no commit information" — which is what makes it a silent failure rather than a loud one.

---

## Error Output

None. Every layer is best-effort by design (`envelope-parse.ts` drops unknown fields; `suite-connection-status.ts` uses `?.`), so a missing field degrades to absent rather than throwing.

---

## Duplicate-Emission Check

Not a diagnostic. One writer (`extension/src/suite/diagnostics-mirror.ts:72`); no Dart counterpart (`grep -rn "commitSha" lib/src/` → 0 matches).

---

## Minimal Reproducible Example

Advisor writes (abridged):

```json
{
  "schemaVersion": 1,
  "producer": { "name": "saropa_drift_advisor", "version": "4.2.5" },
  "generatedAt": "2026-09-02T00:00:00.000Z",
  "commitSha": "abc1234",
  "diagnostics": [
    { "id": "saropa_drift_advisor:anomaly:orders:total", "source": "advisor",
      "severity": "warning", "category": "data", "title": "…", "ruleId": "anomaly" }
  ]
}
```

Log Capture evaluates `envelope.diagnostics.find((d) => d.commitSha)?.commitSha` → `undefined`.

Saropa Lints writes (abridged), for contrast:

```json
{
  "schemaVersion": 1,
  "diagnostics": [
    { "id": "…", "source": "lints", "severity": "warning", "category": "drift",
      "title": "…", "commitSha": "abc1234" }
  ]
}
```

---

## What I Already Tried

- [x] Traced `resolveWorkspaceCommit()` → `extension/src/suite/workspace-commit.ts`; the resolution itself is fine, only its placement is wrong.
- [x] Confirmed Advisor's own reader backfills envelope→entry (`suite-diagnostics.ts:267`), which is why in-repo tests do not catch it.
- [x] Confirmed both siblings' writers put it on the entry and Log Capture's only reader looks on the entry.

---

## Regression Info

- Last working version: never worked as a cross-tool signal.
- First broken version: the release that introduced plan 67 R6 commit stamping.
- What changed: the stamp was added at the point where the workspace commit is known (the envelope write) rather than at the point the schema defines it (each diagnostic).

---

## Root Cause

<!-- Fill in during investigation. -->

Placement, not resolution. `extension/src/suite/diagnostics-mirror.ts:70-72` spreads the commit onto the envelope object because that is the object in hand at that point in the function; the canonical schema (`DiagnosticEnvelope` vs `Diagnostic` in Log Capture's mirror of it) puts the field on each diagnostic. Advisor's own lenient reader masks it.

---

## Changes Made

<!-- Fill in when a fix is written. -->

Suggested shape:

1. In `toCanonicalEnvelope` (or immediately after it, where `commitSha` is known), set `commitSha` on **each** diagnostic that does not already carry one, in addition to — not instead of — the envelope-level key. Keeping the root key preserves Advisor's own reader and any script already reading it; adding the per-entry key is what the siblings need.
2. Regression test: write a mirror with a known commit and assert `parsed.diagnostics.every(d => d.commitSha === sha)`, mirroring Log Capture's `find` predicate rather than Advisor's lenient backfill.

---

## Commits

<!-- Add commit hashes as fixes land. -->

---

## Impact

- Who is affected: users running Advisor alongside Log Capture and/or Lints — i.e. anyone who installed the Saropa Suite pack.
- What is blocked: plan 67 R6 cross-commit correlation for Advisor's half. Log Capture cannot tell a fresh Advisor mirror from one written three commits ago, so its staleness reporting for Advisor is permanently blank.
- Data risk: none — the mirror content itself is correct; only the provenance stamp is unreadable.
- Frequency: every mirror write, 100%.
