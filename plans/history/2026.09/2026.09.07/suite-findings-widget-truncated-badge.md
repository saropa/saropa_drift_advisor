# Suite Findings dashboard widget: truncated-scan badge

The Suite Findings dashboard widget gave no indication when Advisor's live
anomaly scan had been truncated by its wall-clock budget, so a user could see
a clean or partial count with no signal that the scan itself was incomplete.
The Drift Health panel already surfaced this via a banner (commit `9e407d54`);
the compact dashboard widget did not.

## Change

`extension/src/dashboard/widgets/suite-findings-widget.ts`:

- `fetchSuiteFindings` now extracts the envelope's `truncated` flag (same cast
  pattern as `collectDiagnostics` in `extension/src/suite/drift-health-panel.ts`)
  and returns a new `SuiteFindingsData` shape (`{ summary, truncated }`) instead
  of a bare `SuiteFindingsSummary`.
- `renderSuiteFindingsHtml` (exported for test coverage) renders a `⚠` badge
  next to the total count when `truncated` is true, with a tooltip sourced from
  the new l10n key. The all-clear "No suite findings" message is suppressed
  when truncated even if the finding count is zero, since a truncated scan with
  zero findings has not actually confirmed a clean state.
- `extension/src/l10n/strings-panel-health.ts` gained
  `panel.suiteFindings.truncated` — a short tooltip string distinct from the
  full Drift Health panel banner sentence (`panel.driftHealth.truncated`),
  since the dashboard widget is compact.

## Tests

`extension/src/test/suite-findings-widget.test.ts`: existing tests updated for
the new `SuiteFindingsData` shape; three new tests added covering the badge
omitted by default, the badge shown when truncated, and the zero-findings +
truncated edge case (must not report a clean state).

## Verification

- `npx tsc --noEmit -p .` — clean.
- Scoped mocha run (`--grep "suiteFindings|renderSuiteFindingsHtml|buildDriftHealth"`)
  — 21/21 passing, no regressions in the related `buildDriftHealth`/
  `buildDriftHealthHtml` suite.
- `/code-review medium` on the diff — zero findings.

## Related work (same thread, prior commits)

This closes out the last unimplemented piece of the anomaly-scan truncation
work: the original performance fix (`5a9d04ab`), the hardening round adding
injectable scan budgets and `truncated` propagation through `/api/issues` and
`/api/report` (`2bb27076`), and the Drift Health panel banner (`9e407d54`).
CHANGELOG entries for all three were added in this same commit (`34ad955b`).
