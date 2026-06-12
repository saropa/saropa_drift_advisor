# Plan-tree housekeeping — archive shipped/redundant plans, add Implementation Plan headings

**Problem.** Shipped and redundant plans remained in the active `plans/` tree (`22-realtime-mutation-stream.md` was shipped; `GAP_FIT_PLAN.md` was redundant), and two phased plans lacked an `## Implementation Plan` heading. Follow-up to prior work that added and verified Implementation Plan sections across the plan tree.

## Finish Report (2026-06-10)

**Scope.** (C) docs only — plan-tree files and one CHANGELOG maintenance line. No Dart, no extension code, no tests touched.

**Deep review.** N/A for logic — no code changed. Reviewed for correctness of the doc moves: confirmed (a) no active (non-history) file links to `22-realtime-mutation-stream.md`, so archiving it breaks nothing; (b) the GAP_FIT_PLAN.md removed from the active tree was a redirect stub whose full content already lives at `plans/history/2026.06/2026.06.10/GAP_FIT_PLAN.md`, and the per-feature plans 71–74 link to that archive directly (not to the stub), so nothing references the removed file; (c) the two added headings introduce existing phased content without demoting or renaming the existing `## Phase N` sections.

**Changes.**
- `git mv plans/22-realtime-mutation-stream.md → plans/history/2026.06/2026.06.10/22-realtime-mutation-stream.md` — the Mutation Stream feature is shipped (server tracker/handler/router + extension panel/polling/command, Dart + extension tests pass); its plan belongs in history.
- `git rm plans/GAP_FIT_PLAN.md` — removed the redundant redirect stub from the active tree. NOTE: this was a delete, not a `git mv`, because the canonical full document already exists at the history path and moving the stub on top would collide; the stub held no unique content (its per-feature-plan pointers live in plans 71–74 and the prior CHANGELOG maintenance entry). Recoverable via git history.
- `plans/esbuild-ts-migration.md` — added `## Implementation Plan` heading introducing the existing Phase 1–4 steps.
- `plans/fix-pub-dev-publisher.md` — added `## Implementation Plan` heading introducing the existing Phase 1–5 steps.
- `CHANGELOG.md` — one `[Unreleased]` Maintenance bullet recording the housekeeping.

**Testing.** SKIPPED [C-NOT-IN-SCOPE] — docs-only; no code or test symbols changed. Verified instead by reference-integrity grep: zero active references to the archived `22-` plan or the removed GAP stub.

**l10n.** SKIPPED [C-NOT-IN-SCOPE] — no Flutter/extension UI strings touched.

**Outcome.** Active `plans/` tree now holds 19 plans, every one carrying an `## Implementation Plan` heading. Shipped (22) and redundant (GAP stub) docs are out of the active tree.

**Finish report saved:** plans/history/2026.06/2026.06.10/plan-tree-housekeeping.md (this file).
