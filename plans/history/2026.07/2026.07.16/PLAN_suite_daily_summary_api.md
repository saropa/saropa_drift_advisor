# Suite API: expose `getDailySummary` from activate() exports

Filed from Saropa Workspace (`d:\src\saropa_workspace`,
`plans/TODO_better integration with saropa suite.md`). Workspace is building a
consolidated Suite daily report and needs each Suite tool to expose one small
data-returning API. This plan specifies the Drift Advisor side; the Workspace
consumer already tolerates the API being absent (section omitted), so there is no
ordering constraint.

## What to build

Return an API object from the extension's `activate()` so siblings can call
`vscode.extensions.getExtension('saropa.drift-viewer')?.exports`:

```ts
interface SaropaSuiteApi {
  apiVersion: 1;
  getDailySummary(date: string /* YYYY-MM-DD */): Promise<DailySummary | undefined>;
}

interface DailySummary {
  tool: 'drift-viewer';
  date: string;                    // echo of the requested day
  headline: string;                // one plain-language sentence for the caller's
                                   // executive summary, e.g. queries observed,
                                   // slow-query and anomaly counts
  counts: Record<string, number>;  // e.g. { queries, slowQueries, anomalies,
                                   //        indexSuggestions, snapshots }
  trouble: Array<{                 // failure-only items for the caller's Trouble
    label: string;                 // section (anomalies, slow-query offenders)
    detail?: string;
    command?: string;              // deep-link id, e.g. 'driftViewer.showAnomalies'
    args?: unknown;
  }>;
  openCommand?: string;            // e.g. 'driftViewer.openInPanel'
}
```

## Why this shape

- **Thin wrapper, not new logic.** Query performance stats, anomaly counts, and
  index suggestions already exist for the dashboard and the session metadata the
  Suite integration shares with Log Capture — the API returns that day's view of
  what is already computed.
- **The API is the contract.** `apiVersion` lets the shape evolve without breaking
  callers; siblings never scrape internals or on-disk state.
- **Same protocol family as the documented `driftViewer.*` deep-link ids** the
  Suite already uses for jumping in; this is the matching data-out channel. Treat
  the exported shape with the same never-rename discipline.
- If per-day history is not retained, returning the current session/snapshot view
  with today's date is acceptable for `apiVersion: 1` — note it in the doc.
  `undefined` when no database has been observed — callers omit the section.

## Constraints

- Local read only; nothing transmitted. No new dependencies.
- Must not slow activation: build the summary lazily on call, not eagerly.

## Acceptance

- `getExtension('saropa.drift-viewer').exports.getDailySummary(<date>)` resolves
  with real counts + headline when observation data exists, `undefined` otherwise.
- The exported shape is documented as part of the cross-tool Suite contract.

## Finish Report (2026-07-16)

Status: Complete.

Saropa Workspace needs each Suite tool to expose one small data-returning API
so a consolidated Suite daily report never scrapes another tool's internals.
This adds the Drift Advisor side.

### What changed

- **New module** `extension/src/suite/suite-daily-summary.ts` — declares the
  cross-tool `SaropaSuiteApi` (`apiVersion: 1` + `getDailySummary(date)`) and
  `DailySummary` shapes, plus `buildDailySummary(client, date)`. The builder is
  a thin read-only projection of already-computed session data: it fetches
  `performance`, `anomalies`, and `indexSuggestions` in parallel, each wrapped
  in a per-call timeout + `.catch(() => null)` so one hung or failing endpoint
  degrades to zero rather than failing the whole call. Returns `undefined` when
  the client is null (no connected server = no database observed). Emits named
  counts (queries, slowQueries, anomalies, indexSuggestions), a one-sentence
  headline, and a failure-only Trouble list (all anomalies deep-linked to
  `driftViewer.showAnomalies`, then the five worst slow queries by duration
  deep-linked to `driftViewer.showQueryDetail` with the `QueryEntry` as args).
  Slow queries are capped at five and SQL detail truncated to 120 chars so the
  payload stays a digest.
- **`extension/src/log-capture-api.ts`** — `DriftAdvisorApi` now
  `extends SaropaSuiteApi`; `createDriftAdvisorApi` returns `apiVersion: 1` and
  `getDailySummary` alongside the pre-existing `getSessionSnapshot`. One exports
  object satisfies both the Log Capture and Suite contracts. The `activate()`
  wiring (`extension-main.ts`) was already returning this object; no change
  there was required.
- **`doc/EXTENSION_API.md`** — documents the Suite contract, the never-rename
  discipline, and the apiVersion-1 caveat that per-day history is not retained
  (the live session view is stamped with the requested date).
- **`extension/src/test/suite-daily-summary.test.ts`** — six cases: undefined on
  no client, date/tool/openCommand echo, real counts + headline, anomaly-first
  Trouble ordering with cap-and-sort, args passthrough + table-only detail
  branch, and failed-fetch degradation.

### Verification

- `npm run compile` (tsc + verify-nls + verify:nls-coverage): all OK.
- New test file: 6 passing, scoped run.
- Full extension suite: 3017 passing (no regression).

### Design decisions

- Dropped `snapshots` from `counts` (a plan example): the extension's API client
  exposes no snapshots method. Adding it later is additive and non-breaking.
- `getDailySummary` returns `undefined` for the not-connected state while the
  sibling `getSessionSnapshot` returns `null`; each matches its own contract
  (Suite uses undefined, Log Capture uses null).

### Known follow-up (not done here)

- `withTimeout` now has three near-identical copies (`log-capture-utils.ts`
  4-arg exported, plus 2-arg copies in `log-capture-api.ts` and
  `suite-daily-summary.ts`). Pre-existing smell; consolidating touches the
  shared util and was left out of scope.
