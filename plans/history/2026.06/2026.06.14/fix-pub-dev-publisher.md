# 67 — Fix pub.dev Publisher Identity

## Status

**COMPLETE (for the work that can be done here).** Phases 1–3 done: the
package is renamed, the repo is renamed, and `saropa_drift_advisor` is live
under the `saropa.com` verified publisher. The remaining poison-pill of the
old package is blocked on pub.dev admin access and has been split out to
[deferred/poison-pill-old-package.md](deferred/poison-pill-old-package.md).

## Problem

The `saropa_drift_viewer` package on pub.dev is owned by a CI OIDC service
identity. No human can access the Admin tab, transfer it to `saropa.com`,
discontinue, or retract it.

## Solution: Rename to `saropa_drift_advisor`

Publish a new package under the correct publisher, then poison-pill the old one.

## What Was Tried (on the old package)

| Action | Result |
|--------|--------|
| `dart pub uploader add` via CI (`add-uploader.yml`) | Command deprecated, exit code 1 |
| Filed [dart-lang/pub-dev#9261](https://github.com/dart-lang/pub-dev/issues/9261) | Closed, told to use `support@pub.dev` |
| OIDC API calls via `fix-publisher.yml` (run #1, 2026-03-10) | All 5 endpoints returned 401 — admin APIs reject GitHub OIDC tokens |
| Poison pill via CI (push `v0.2.5` tag, 2026-03-10) | `publish.yml` failed: "publishing from github is not enabled" — OIDC was never configured on pub.dev for this package |

## Implementation Plan

Executed in five phases. **Phase 1** renames all code references to `saropa_drift_advisor`, **Phase 2** renames the GitHub repo, **Phase 3** publishes the new package under the correct publisher — all complete, detailed below. **Phase 4** (poison-pill the old package) and **Phase 5** (post-poison-pill cleanup) are blocked on pub.dev admin access and have been moved to [deferred/poison-pill-old-package.md](deferred/poison-pill-old-package.md).

## Completed: Phase 1 — Code Rename

All references to `saropa_drift_viewer` updated to `saropa_drift_advisor`:

- `lib/saropa_drift_viewer.dart` renamed to `lib/saropa_drift_advisor.dart`
- `pubspec.yaml` — name `saropa_drift_advisor`, version `0.3.0`, all URLs updated
- `lib/flutter.dart` — export path and doc comments
- 7 Dart source/test files — `package:saropa_drift_advisor/` imports
- `example/pubspec.yaml` — dependency name
- 5 extension TypeScript source + 2 test files — pub.dev URLs, provider ID
- 4 Python publish scripts — repo URL, user-agent, pub.dev links
- README, ABOUT_SAROPA, example README, roadmap, CHANGELOG
- Deleted `fix-publisher.yml` and `add-uploader.yml`
- **All checks pass:** analyze, format, 56 Dart tests, 1168 extension tests

**NOT renamed** (intentional):
- Extension npm name: still `drift-viewer` (keep Marketplace installs)
- Extension command IDs: still `driftViewer.*` (keep user keybindings)
- Dart class names: `DriftViewerOverlay`, `DriftDebugServer`, etc. (still accurate)

## Completed: Phase 2 — GitHub Repo Rename

- Repository renamed to `saropa/saropa_drift_advisor` (2026-03-10)
- GitHub auto-redirects `saropa_drift_viewer` URLs
- Local remote updated: `git remote set-url origin https://github.com/saropa/saropa_drift_advisor.git`
- Local folder renamed to `d:\src\saropa_drift_advisor`

## Completed: Phase 3 — First Publish

- Published `saropa_drift_advisor` v0.3.0 locally via `dart pub publish`
- Transferred to `saropa.com` verified publisher on pub.dev
- Tagged `v0.3.0` and pushed
- Live at https://pub.dev/packages/saropa_drift_advisor

## Deferred: Phases 4–5 — Poison Pill + Cleanup

Blocked on pub.dev admin access. Full detail (poison-pill branch contents,
unblock options, why version 0.2.5, post-poison-pill cleanup) lives in
[deferred/poison-pill-old-package.md](deferred/poison-pill-old-package.md).

## Prevention (for all future packages)

1. **Always publish the first version locally** with `dart pub publish`
2. **Transfer to `saropa.com`** via the Admin tab on pub.dev
3. **Then** enable the GitHub Actions OIDC workflow for subsequent versions

## References

- [dart-lang/pub-dev#9261](https://github.com/dart-lang/pub-dev/issues/9261)
- [Automated publishing docs](https://dart.dev/tools/pub/automated-publishing)
- [Verified publishers docs](https://dart.dev/tools/pub/verified-publishers)

## Finish Report (2026-06-14)

### What changed

The blocked tail of this plan — poison-pilling the old `saropa_drift_viewer`
package — was extracted into its own active plan so the parent could be closed.
The doable scope (rename code, rename repo, publish `saropa_drift_advisor` under
the `saropa.com` verified publisher) was already complete; the only remaining
work is gated on pub.dev admin access, which no human currently holds for the
old package. Carrying that blocked work inside a plan whose status read
"mostly complete" obscured that nothing here is actionable without an external
unblock.

- Phase 4 (poison pill) and Phase 5 (post-poison-pill cleanup), with their full
  detail (poison-pill branch contents, the three unblock options, the rationale
  for version 0.2.5 over 1.0.0, and the prevention checklist), now live in
  `plans/deferred/poison-pill-old-package.md`. That file is self-contained: it
  carries its own background and the table of what was already tried, so it can
  be actioned without reading the parent.
- This parent plan was reduced to the completed record (Phases 1–3) plus a
  pointer to the deferred plan, its status flipped from "MOSTLY COMPLETE" to
  "COMPLETE (for the work that can be done here)", and is archived to history.
- The active-plan index (`plans/outstanding-items-audit.md`) no longer lists
  `fix-pub-dev-publisher` as an ongoing track; it points to the deferred plan
  for the remaining blocked work.

### Scope

Docs/plans only — no Dart, no extension TypeScript, no scripts touched. No code
behavior changed; nothing to compile or test.

### Verification

Markdown-link integrity checked by inspection: the deferred plan's backlink to
the parent was repointed to the archived history path, and the audit index
reference was repointed to the deferred plan. No `bugs/*.md` file was involved.

Finish report appended: plans/fix-pub-dev-publisher.md
Plan split: remaining work → plans/deferred/poison-pill-old-package.md; completed plan archived → plans/history/2026.06/2026.06.14/fix-pub-dev-publisher.md
