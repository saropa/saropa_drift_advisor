# BUG: Duplicate anomaly warning in Problems panel (two extensions, one anomaly)

## Title
The same Drift anomaly is reported twice in the Problems panel — once by the standalone **Saropa Drift Advisor** extension and once by the **Saropa Lints** extension's optional Drift Advisor integration.

## Status
Root cause identified. The duplicate is cross-project: the second diagnostic originates in `saropa_lints`, not in this repo. Fix is **not yet applied** — it requires editing `saropa_lints` (a separate project).

## Actual Behavior
Two diagnostics appear on the same line for the same underlying statistic (identical `n=149`, identical min/mean/σ):

| # | Owner | Code | Source | Prefix | Originating extension |
|---|---|---|---|---|---|
| 1 | `Saropa Drift Advisor` | `drift_advisor_anomaly` | "Saropa Drift Advisor" | `[Drift]` | `saropa.saropa-lints` (optional Drift Advisor integration) |
| 2 | `drift-advisor` | `anomaly` | "Drift Advisor" | `[drift_advisor]` | `saropa.drift-viewer` (this repo — standalone extension) |

Raw payloads as captured from the Problems panel:

```json
[{
	"resource": "/d:/src/contacts/lib/database/drift/tables/static_data/contact/star_trek_table.dart",
	"owner": "Saropa Drift Advisor",
	"code": "drift_advisor_anomaly",
	"severity": 2,
	"message": "[Drift] star_trek_characters.weight_kilograms: Potential outlier in star_trek_characters.weight_kilograms: min value 30.0 is 3.3σ from mean 70.75 (range [30.0, 110.0], n=149)",
	"source": "Saropa Drift Advisor",
	"startLineNumber": 80,
	"startColumn": 1,
	"endLineNumber": 80,
	"endColumn": 201
},{
	"resource": "/d:/src/contacts/lib/database/drift/tables/static_data/contact/star_trek_table.dart",
	"owner": "drift-advisor",
	"code": "anomaly",
	"severity": 2,
	"message": "[drift_advisor] Potential outlier in star_trek_characters.weight_kilograms: min value 30.0 is 3.3σ from mean 70.75 (range [30.0, 110.0], n=149)",
	"source": "Drift Advisor",
	"startLineNumber": 80,
	"startColumn": 1,
	"endLineNumber": 80,
	"endColumn": 1000
}]
```

## Expected Behavior
One diagnostic per anomaly. With the standalone Saropa Drift Advisor extension installed, it is the canonical owner of these Problems-panel diagnostics; the Saropa Lints integration should not also publish them.

## Root Cause
This is **not** the same defect as the previously-resolved in-repo duplicate (see Related). That earlier fix deleted this repo's legacy second emitter, leaving exactly one collection here: `drift-advisor` / code `anomaly` / source "Drift Advisor". That collection is **diagnostic #2** above, and it is working correctly — one diagnostic, on the column line.

**Diagnostic #1 comes from a different VS Code extension.** `saropa_lints` ships an optional "Saropa Drift Advisor integration" that discovers the same Drift Advisor server, fetches the same issues, and republishes them to the Problems panel:

- [D:\src\saropa_lints\extension\src\driftAdvisor\driftAdvisorTree.ts:67-93](D:\src\saropa_lints\extension\src\driftAdvisor\driftAdvisorTree.ts#L67-L93) — `updateDiagnostics()` publishes under source `Saropa Drift Advisor`, code `drift_advisor_anomaly`, with the `[Drift] <table>.<column>: ` message prefix. Exactly matches diagnostic #1.
- The publish is gated only by `saropaLints.driftAdvisor.showInProblems`, which **defaults to `true`** ([driftAdvisorTree.ts:69](D:\src\saropa_lints\extension\src\driftAdvisor\driftAdvisorTree.ts#L69)).

When a user has **both** extensions installed (the case in `d:\src\contacts`), both connect to the same server and both publish — hence the duplicate. Neither extension is internally double-emitting.

Confirmation that nothing in this repo produces diagnostic #1: grep for `drift_advisor_anomaly` and the `[Drift]` prefix across this repo's `.ts` sources returns no matches. This repo's constants are `DIAGNOSTIC_COLLECTION_NAME='drift-advisor'`, `DIAGNOSTIC_SOURCE='Drift Advisor'`, `DIAGNOSTIC_PREFIX='[drift_advisor]'`, code `anomaly` ([extension/src/diagnostics/diagnostic-types.ts:144-150](../extension/src/diagnostics/diagnostic-types.ts#L144-L150)) — i.e. diagnostic #2 only.

## Fix (lives in `saropa_lints`, not this repo)
The standalone extension is the canonical Problems-panel owner, so the lints-side integration should defer to it. Recommended change in `saropa_lints`:

In `DriftAdvisorTreeProvider.updateDiagnostics()`, skip publishing to the Problems collection when the standalone extension is active:

```ts
// The standalone Saropa Drift Advisor extension (saropa.drift-viewer) owns the
// Problems-panel diagnostics. When it is installed and active, suppress our copy
// to avoid duplicate squiggles; keep populating the tree view either way.
const standalone = vscode.extensions.getExtension('saropa.drift-viewer');
if (standalone?.isActive) return;
```

The Lints "Drift Advisor" tree view still works (it does not depend on the Problems publish). Alternative, lower-effort: flip the `saropaLints.driftAdvisor.showInProblems` default to `false`, but that hides the diagnostics for lints-only users — the active-extension check is the correct behavior.

This repo (`saropa_drift_advisor`) needs **no change** — its single emitter is already correct.

## Related
- Prior, distinct duplicate (both emitters were in this repo, resolved 2026-04-22): [plans/history/2026.04/2026.04.22/BUG_anomaly_false_positive_tight_timestamp_range.md](../plans/history/2026.04/2026.04.22/BUG_anomaly_false_positive_tight_timestamp_range.md)
- Triggering workspace: `d:\src\contacts` — `lib/database/drift/tables/static_data/contact/star_trek_table.dart:80`
- Cross-project bug filed for the actual fix: `saropa_lints/bugs/infra_drift_advisor_integration_duplicate_diagnostics_with_standalone_extension.md`

## Finish Report (2026-06-18)

### Objective summary
A duplicate Drift anomaly appeared twice in the Problems panel for the same statistic. Investigation determined the two diagnostics originate from two different VS Code extensions, and that the standalone Saropa Drift Advisor extension (this repo) emits correctly while the duplicate originates in a separate project.

### Defect
The Problems panel showed two warnings for one anomaly on `star_trek_characters.weight_kilograms` (identical `n=149` / min / mean / σ), differing only by `source` / `code` / message prefix:
- `Saropa Drift Advisor` / `drift_advisor_anomaly` / prefix `[Drift]`
- `drift-advisor` / `anomaly` / prefix `[drift_advisor]`

### Root cause
The two diagnostics come from two distinct extensions both connected to the same Drift Advisor server:
- Diagnostic with code `anomaly`, source `Drift Advisor`, collection `drift-advisor`, prefix `[drift_advisor]` is this repo's standalone extension (`saropa.drift-viewer`). Constants at `extension/src/diagnostics/diagnostic-types.ts:144-150`; single emitter, correct, lands on the column line.
- Diagnostic with code `drift_advisor_anomaly`, source `Saropa Drift Advisor`, prefix `[Drift]` is the `saropa_lints` extension's optional "Drift Advisor integration" (`saropa.saropa-lints`), at `saropa_lints/extension/src/driftAdvisor/driftAdvisorTree.ts:67-93`, gated only by `saropaLints.driftAdvisor.showInProblems` (default `true`).

A grep of this repo's `extension/src` for `drift_advisor_anomaly` and the `[Drift]` prefix returns zero matches, confirming this repo does not produce the duplicate. This is a distinct defect from the 2026-04-22 in-repo duplicate, which removed this repo's own second emitter.

### What changed
- This repo: `bugs/BUG_remove duplicate lint warning.md` rewritten from two raw JSON payloads into a diagnosed report (attribution table, root cause, cross-project fix pointer). No code change — this repo's emitter is already correct.
- Cross-project deliverable (documentation only, not code edits): a bug report filed at `saropa_lints/bugs/infra_drift_advisor_integration_duplicate_diagnostics_with_standalone_extension.md` with a three-part fix plan (auto-suppress the Lints Problems publish when `saropa.drift-viewer` is active, reusing the existing `ADVISOR_EXTENSION_ID` constant and `suiteAwarenessNudge` detection precedent; a once-gated recommendation toast when the standalone extension is absent; keep `showInProblems` defaulting to `true`). Indexed in that repo's `bugs/BUG_REPORT_GUIDE.md`.

### Status
Open. This repo requires no change. The fix is tracked in `saropa_lints`; the duplicate persists until that fix ships.
