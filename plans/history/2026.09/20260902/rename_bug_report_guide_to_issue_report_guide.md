# Rename BUG_REPORT_GUIDE to ISSUE_REPORT_GUIDE

The project's bug reporting guide was limited to bug reports only. The `saropa_lints` sibling project already had a broader `ISSUE_REPORT_GUIDE.md` covering bugs, feature requests, and proposals — `saropa_drift_advisor` needed the same treatment.

## Finish Report (2026-09-02)

### What changed

- `bugs/BUG_REPORT_GUIDE.md` deleted.
- `bugs/ISSUE_REPORT_GUIDE.md` created, adapted from `saropa_lints/bugs/ISSUE_REPORT_GUIDE.md` for drift_advisor's mixed Dart/TypeScript context.
- `.gitignore` updated: `!bugs/BUG_REPORT_GUIDE.md` → `!bugs/ISSUE_REPORT_GUIDE.md`.

### Structure of the new guide

The new guide adds sections not present in the old bug-only guide:

- **File naming conventions** for all issue types (false positives, crashes, proposals, infra, UX).
- **Confirm Attribution Before Filing** — grep-based proof that the diagnostic lives in this repo, adapted for the mixed Dart/TypeScript tree.
- **Feature Request Template** — separate from the bug template.
- **Bug and Feature Request Categories** with investigation focus for each.
- **Investigation Checklist** — step-by-step diagnostic workflow.
- **Common Pitfalls** table — known misattribution and detection failures.
- **Fix Requirements** — code, test, quality gate, and documentation checklists.
- **Lifecycle** diagrams for bugs and feature requests, including archival to `plans/history/`.
- **Severity Guide**, **Linking** conventions, **Policy Note**.

### Hardening

- Added `<!-- Formerly bugs/BUG_REPORT_GUIDE.md — renamed 2026-09-02 -->` comment to the new guide so historical references to the old name resolve via search.
- Verified Common Pitfalls entries (`blobSafeSelectList`, `onClassifiedError`) reference real symbols in the codebase (9 and 9 file matches respectively).
- Updated `.github/ISSUE_TEMPLATE/bug_report.yml`: added severity dropdown, emitter attribution field, minimal reproducible example field, "what you already tried" field, and link to the guide.
- Updated `.github/ISSUE_TEMPLATE/feature_request.yml`: added request type dropdown, detection/behavior field for diagnostic proposals, and link to the guide.

### Second hardening pass

- Removed a duplicate file-naming row (`feature_description.md`) that overlapped with the existing `proposal_*` rows; the guide now states explicitly that every feature request uses the `proposal_*` prefix, with no separate `feature_*` pattern.
- Replaced the relative link (`../../bugs/ISSUE_REPORT_GUIDE.md`) in both issue templates with an absolute GitHub blob URL — relative markdown links are not guaranteed to resolve inside GitHub's rendered issue-form UI.
- Added `.github/ISSUE_TEMPLATE/config.yml` with `blank_issues_enabled: false` and a contact link to the guide, so all new issues are routed through the structured templates instead of a blank issue.

### Not changed

Historical references to `BUG_REPORT_GUIDE` in `plans/history/` files were left as-is — they are archived records referencing the guide as it existed at the time of writing. The "formerly known as" comment in the new guide ensures searchability. The Common Pitfalls table remains a curated subset (cspell and system-resource-state pitfalls from the old guide were not carried forward) — low value relative to effort, not addressed in this pass.

### Risk

None. Documentation-only change. No code behavior affected.
