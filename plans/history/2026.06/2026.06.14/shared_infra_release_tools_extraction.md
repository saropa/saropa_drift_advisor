# Shared-infra extraction task: `saropa-release-tools`

**Type:** Cross-repo shared-infrastructure extraction (tracked under `bugs/` as an actionable task).
**Status:** Won't Do — rejected (see `plans/history/2026.07/2026.07.16/67-saropa-suite-integration.md` §7). Closed 2026-06-14.

## Resolution: WON'T DO (2026-06-14)

Extraction rejected as over-engineering. Three new publishable packages for three in-house consumers
cost more in versioning, publishing, and release coordination than the duplication they remove, with
no user-facing benefit. The duplication is accepted as a known trade-off; if a shared bug recurs, a
single path-dep module or a sync script is preferred over a new published unit. Full rationale in
plan 67 §7. The original task plan is retained below as the record of what was considered. The
canonical cross-repo copy (`saropa_lints/plans/SHARED_INFRA_RELEASE_TOOLS.md`) and any sibling-repo
consumer copies need the same disposition in their own repos.
**This repo's role:** Consumer. The canonical seed and cross-repo coordination live in `saropa_lints`
(`plans/SAROPA_SUITE_INTEGRATION.md` shared-infra section + `plans/SHARED_INFRA_RELEASE_TOOLS.md`).
**Created:** 2026-06-14

## What it is

A shared Python release toolkit: the `publish.py` orchestrator and the reusable gates it runs — the
dependency-import check, the write-time American-English gate, the changelog-conventions enforcement,
and the CI-mirroring analyze step. One toolkit so a fix to the publish guard or the spelling gate lands
once.

## Why extract (the convergence evidence)

All three repos converged on the same release machinery by hand:

- A `publish.py` orchestrator with retry/ignore/abort prompting and the never-run-NLLB publish guard.
  Seed: `saropa_lints/scripts/publish.py` plus `saropa_lints/scripts/modules/` (`_publish_workflow.py`,
  `_publish_steps.py`, `_extension_publish.py`, `_git_ops.py`, `_retrigger_ci.py`,
  `_version_changelog.py`, `_timing.py`).
- A dependency-import publish gate that blocks a release when a used dependency is missing from the
  manifest. Seed: `saropa_lints/scripts/check_dependency_imports.py`,
  `saropa_lints/scripts/modules/_analyze_pubspec.py`.
- A write-time American-English gate. Seed: `saropa_lints/scripts/modules/_us_spelling.py` (and the
  `scripts/hooks/` spelling guard).
- Changelog conventions: dateless headers, the `<details>Maintenance</details>` block, the
  `[log](tag-url)` per-section link, archive compaction. Seed:
  `saropa_lints/scripts/compact_changelog_archive.py`,
  `saropa_lints/scripts/modules/_version_changelog.py`.
- A final CI gate that re-runs analysis (`--fatal-infos`) before tagging, mirroring CI exactly.

## What gets extracted

1. **Orchestrator core:** the `publish.py` workflow engine (step sequencing, retry/ignore/abort,
   timing, git ops, CI re-trigger) — the repo-agnostic parts of `scripts/modules/`.
2. **Gates:** dependency-import check, American-English spelling gate, changelog-convention
   enforcement + archive compaction, CI-mirroring analyze runner.
3. **Conventions as config:** the changelog format rules and the never-run-NLLB guard, parameterized so
   each repo supplies its own package name, manifest path, and analyze command.

## Non-goals

- **Not the repo-specific steps.** This repo's own publish specifics (its diagnostics, its
  Marketplace/pub.dev wiring) stay here; the toolkit calls out to repo-supplied hooks. Lints-only
  modules (`_tier_integrity.py`, `_rule_metrics.py`, `_roadmap_implemented.py`) stay in Lints.
- **Not a single shared CI config.** Each repo keeps its own GitHub Actions workflow; the toolkit
  provides the steps those workflows invoke.
- **Not a monorepo merge.**

## Dependency mechanism (decision needed — the blocker)

Recommendation: **git submodule** vendored under each repo's `scripts/`, consistent with the two TS
shared packages. `publish.py` is invoked from a known path, the imports are plain Python module paths
(no install step), and a pinned SHA makes a toolkit upgrade an explicit, reviewable bump.

Alternatives: published PyPI (cleanest versioning, internal publish + install step); `pip install
git+https` (needs a venv per repo, floats unless pinned); copy-and-sync (the status quo).

## Migration steps for this repo (do AFTER Lints seeds the package)

1. Lints creates `saropa-release-tools` from its `publish.py` orchestrator + the repo-agnostic
   `scripts/modules/` core + the three gates; adopts it first.
2. Add the submodule here; repoint this repo's `publish.py` imports; parameterize this repo's package
   name / manifest / analyze command; discard the forked copy.
3. Run a full audit-only publish dry run and confirm every gate fires identically (dependency-import,
   US-English, changelog conventions, CI-mirror analyze).

## Risks

- **Hidden repo coupling.** A module assumed repo-agnostic may reference a Lints-only path; the dry-run
  must prove the gate is truly parameterized before this repo adopts it.
- **The never-run-NLLB guard must survive extraction intact** — it is a safety guard, not boilerplate;
  verify it still blocks a translation run after the move.
- **Durable scripts stay Python.** Do not introduce `.ps1`/`.sh` durable tooling during extraction.

## Related

- Canonical: `saropa_lints/plans/SHARED_INFRA_RELEASE_TOOLS.md`
- Suite plan: `saropa_lints/plans/SAROPA_SUITE_INTEGRATION.md`; this repo's half:
  `plans/history/2026.07/2026.07.16/67-saropa-suite-integration.md`
- Sibling extraction tasks: `bugs/shared_infra_vscode_i18n_extraction.md`,
  `bugs/shared_infra_vscode_ui_extraction.md`
