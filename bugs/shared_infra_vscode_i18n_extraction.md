# Shared-infra extraction task: `saropa-vscode-i18n`

**Type:** Cross-repo shared-infrastructure extraction (tracked under `bugs/` as an actionable task).
**Status:** Open — plan only, no code moved. Blocked on one cross-repo decision: the dependency
mechanism (see below).
**This repo's role:** Consumer. The canonical seed and cross-repo coordination live in `saropa_lints`
(`plans/SAROPA_SUITE_INTEGRATION.md` shared-infra section + `plans/SHARED_INFRA_VSCODE_I18N.md`).
**Created:** 2026-06-14

## What it is

A reusable VS Code extension localization toolkit: a tiny runtime that resolves `l10n('namespace.key')`
against bundled per-locale JSON, plus the Python build tooling that audits coverage and (separately
authorized) regenerates translated catalogs via an NLLB-then-Google fallback. Three Saropa extensions
each grew their own copy; this package is the one copy they share.

## Why extract (the convergence evidence)

All three TypeScript extensions independently built the same pieces:

- A runtime `l10n()` lookup over `locales/<lang>.json` with `{token}` interpolation and an
  intentional-empty-string distinction. Seed: `saropa_lints/extension/src/i18n/runtime.ts`.
- A manifest-string pipeline (`package.nls.json` + `%key%` + a verify step). Seed:
  `saropa_lints/extension/scripts/verify-manifest-nls-keys.mjs`,
  `saropa_lints/extension/scripts/i18n/migrate_manifest_nls.py`.
- Machine-translation tooling with an ASCII-sentinel do-not-translate shield, strict integrity checks,
  a self-healing cache, real-coverage audits, day-bucketed report paths, and a publish coverage gate.
  Seed: `saropa_lints/extension/scripts/i18n/{generate_translations.py, generate_locales.py,
  audit_coverage.py, nllb_engine.py, mt_fallback.py, translator.py, tree_translate.py, dictionaries.py}`.
- A language-picker quick-pick and a coverage manifest (`locale_coverage.json`).

Lints is furthest along — **24 translated languages** (25 locale files incl. English) and the most
developed tooling — so it is the source of the extracted package. This repo carries a reduced copy that
drifts out of sync: a fix to the sentinel shield or the cache lands in Lints and not here.

## What gets extracted

1. **Runtime (TS):** `runtime.ts` (locale resolution, `l10n`, `format`), the language-picker, and the
   locale-JSON loading contract. Each consumer keeps its OWN `locales/*.json` catalogs — the canonical
   envelope rule forbids shipping translation keys across the tool boundary; each tool owns its copy.
   The package ships the loader and the lookup, not the strings.
2. **Build tooling (Python):** the whole `scripts/i18n/` set — NLLB engine, Google fallback, sentinel
   shield, coverage audit, `--fail-on-missing` gate, manifest-NLS verify/migrate.
3. **Conventions:** the do-not-translate list (the Saropa brand never translates), the day-bucketed
   report-path convention, and the `--fail-on-missing` publish gate wiring.

## Non-goals

- **Not a shared catalog.** This repo keeps its own `en.json` + translated locales. Shared machinery,
  never shared copy.
- **Not a monorepo merge.** The extensions stay independently publishable.
- **Does not change when translation runs.** Running the NLLB pipeline stays per-repo and separately
  authorized; extraction triggers no translation job.

## Dependency mechanism (decision needed — the blocker)

Recommendation: **git submodule** pinned per consumer repo, vendoring both the TS runtime and the
Python `scripts/i18n/` tree. The TS side is bundled by each extension's esbuild step (a submodule path
import bundles fine, no runtime npm resolution), the Python side is invoked from a path by each repo's
publish flow, and a pinned SHA makes an upgrade a deliberate, reviewable bump.

Alternatives: published npm+PyPI (cleanest semver, but an internal publish step and two registries);
npm `git+https` (floats to branch tip, no pin discipline); copy-and-sync (the status quo — the problem).

## Migration steps for this repo (do AFTER Lints seeds the package)

1. Lints creates the `saropa-vscode-i18n` repo from its `i18n/runtime.ts` + language-picker +
   `scripts/i18n/`, and adopts it first as the source of truth.
2. Add the submodule here; repoint this repo's i18n imports to the submodule path; diff this repo's
   reduced fork against the shared one and discard the stale fork.
3. Confirm `check-types`, the i18n tests, and the `--fail-on-missing` coverage gate pass.
4. This repo's catalogs (`locales/*.json`, `package.nls*.json`) stay here.

## Risks

- **ABI-locked Python deps.** The NLLB engine pins ctranslate2 / sentencepiece / numpy to one CPython
  release; the shared package must document the single-interpreter requirement so a consumer does not
  reinstall and clobber it.
- **esbuild bundling of a submodule path** — verify the extension bundle resolves the runtime from the
  submodule before removing the in-repo copy.

## Related

- Canonical: `saropa_lints/plans/SHARED_INFRA_VSCODE_I18N.md`
- Suite plan: `saropa_lints/plans/SAROPA_SUITE_INTEGRATION.md`; this repo's half:
  `plans/67-saropa-suite-integration.md`
- Sibling extraction tasks: `bugs/shared_infra_vscode_ui_extraction.md`,
  `bugs/shared_infra_release_tools_extraction.md`
