# Git Branch Divergence Reconciliation

Local `main` and `origin/main` diverged after upstream history moved via a separate merge/rebase-based publish workflow (a merge-base existed but neither tip was an ancestor of the other), so the project's remote-sync tooling refused to auto-merge and required manual reconciliation.

## Finish Report (2026-09-08)

### Root cause
Local `main` (541daa88, 21 commits deep) and `origin/main` (492f46da, 3 Dependabot dependency-bump commits) shared merge-base `0256d0695` (Release v4.3.2) but had each advanced independently — origin via GitHub-side Dependabot PR merges, local via ordinary commit work. The project's publish tooling detected the diverged tips and blocked automatic merging.

### Resolution
1. Identified the 21 local-only commits (feature/fix/harden work) and 3 origin-only commits (Dependabot bumps for `sass`, `mocha`, `saropa_lints`).
2. Stashed pre-existing uncommitted working-tree changes (l10n bundles, `analysis_options.yaml`, `pubspec.yaml`, `scripts/modules/l10n/qwen_engine.py`) that were unrelated to the divergence but blocked the rebase.
3. Ran `git rebase --onto origin/main 0256d069 main`, replaying all 21 local commits onto the 3 Dependabot commits — completed with zero conflicts.
4. Restored the stash; one conflict surfaced in `pubspec.yaml` between the rebased Dependabot bump (`saropa_lints: ">=14.3.8 <16.0.0"`) and the pre-existing stashed edit (`saropa_lints: ^16.0.1`); resolved by keeping the stashed value, which is the newer/more permissive constraint.
5. Mid-reconciliation, a 4th origin commit landed (Dependabot PR #59, merged live via the sync tool's auto-merge prompt), causing a second, ordinary (non-rewrite) divergence (`ahead 23, behind 1`). Repeated the stash → rebase (`git rebase origin/main main`) → stash-pop cycle; this pass had no conflicts.

### End state
Local `main` is a clean 23 commits ahead of `origin/main`, zero behind — a fast-forward-able state ready for push. Pre-existing uncommitted working-tree changes were preserved throughout and remain uncommitted, as they were not part of this task.
