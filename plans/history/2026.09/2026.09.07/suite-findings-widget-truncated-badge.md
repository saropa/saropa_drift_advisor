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

## Hardening round (2026-09-08)

A `/finish` handoff reflection on the badge work raised five concerns; four
were addressed with concrete fixes, one investigated and resolved by evidence
rather than a fix:

- **`doc/API.md` never documented the new `truncated`/`scan_skipped` fields** —
  a real gap, not a false alarm: the `GET /api/issues` envelope-fields table
  and issue `type` enum were both silent on fields the server had been
  emitting since commit `2bb27076`. Added a `truncated` row to the envelope
  fields table and a `scan_skipped` entry to the `type` column's enum,
  cross-referencing the top-level flag so a reader doesn't conflate the two.
- **Badge was hover-only (`title` attribute), invisible to screen readers on
  a bare `<span>`** — added `role="img"` + `aria-label` carrying the same
  text, so assistive tech gets it without requiring a pointer hover. Also
  added `data-testid="suite-trunc-badge"` as a stable hook for future UI
  automation (none exists yet; the CSS class alone is not a safe assertion
  target since the same class also names the stylesheet rule).
- **`--accent-warning` cross-theme contrast was never explicitly verified** —
  investigated rather than blindly re-tested: the token resolves to
  `var(--vscode-editorWarning-foreground, ...)` in the webview context (see
  `extension/src/views/design-tokens.ts`), which is the same color VS Code
  uses for its own editor warning squiggles. Every built-in theme, including
  high-contrast, is required by VS Code itself to keep that token readable
  against the editor background. Documented this as a code comment at the
  token definition so a future reader doesn't need to re-derive it from
  scratch; genuinely does not need a bespoke per-theme contrast test since the
  guarantee belongs to the host, not this extension.
- **Whether `truncated`/`scan_skipped` collide with any schema Saropa Lints
  enforces on `/api/issues`** — this repo does not own Saropa Lints' source,
  so the check was scoped to what this repo does own: `doc/API.md` already
  states "The envelope is additive: every previously documented field is
  unchanged, so existing consumers need no update" — confirmed both new
  fields are additive-only (optional, absent when not applicable) and now
  documented per the fix above.
- **Duplicated `truncated`-extraction logic between `collectDiagnostics`
  (Drift Health panel) and `fetchSuiteFindings` (this widget)** — flagged as
  the "one unrequested feature" in the same reflection; deliberately NOT
  extracted into a shared helper this round. The user selected only
  "harden reflection items," not the unrequested-feature checkbox, so this
  stays as documented, known duplication rather than unrequested scope
  expansion.

Verification: `npx tsc --noEmit -p .` clean; scoped mocha run
(`--grep "suiteFindings|renderSuiteFindingsHtml|buildDriftHealth"`) 22/22
passing (one new test added for the aria-label/role/data-testid trio);
`/code-review low` on the hardening diff — zero findings.

## Second round: shared helper + reflection follow-up (2026-09-08)

The `/finish` run on the hardening round above produced its own reflection,
which the user approved acting on in full (harden + build the previously
deferred unrequested feature):

- **Extracted `extractTruncatedFlag`** into `extension/src/suite/
  suite-diagnostics.ts` — the single home already shared by both call sites
  via `diagnosticsFromEnvelope`/`readSiblingDiagnostics`. Both
  `collectDiagnostics` (`drift-health-panel.ts`) and `fetchSuiteFindings`
  (`suite-findings-widget.ts`) now call it instead of independently casting
  `envelope.truncated === true`. This was the "one unrequested feature" from
  the FIRST reflection (deliberately deferred that round) and directly
  resolves the SECOND reflection's "if this breaks in 3 months" concern
  (drift between the two independent extractions).
- **Verified the accessibility assumption with codebase evidence, not
  speculation** — the second reflection flagged "does VS Code's webview
  sandbox actually honor `role`/`aria-label`" as an unstated assumption.
  Grepped the codebase: `diagram-html.ts` and `bulk-edit-html.ts` already use
  `aria-label`, `role="region"`, `aria-pressed`, `aria-labelledby` in shipped
  webview HTML — this is an established, working pattern in this extension,
  not a novel bet made for this badge.
- Added `extractTruncatedFlag` unit tests to `extension/src/test/
  suite-diagnostics.test.ts` (literal-true gate, malformed-input safety).
- CHANGELOG: added a `### Fixed` bullet for the `/api/issues` doc gap and an
  `### Internal` bullet for the helper extraction.

Verification: `npx tsc --noEmit -p .` clean; scoped mocha run
(`--grep "suiteFindings|renderSuiteFindingsHtml|buildDriftHealth|
extractTruncatedFlag|parseEnvelope|envelopeMeta"`) 32/32 passing.
