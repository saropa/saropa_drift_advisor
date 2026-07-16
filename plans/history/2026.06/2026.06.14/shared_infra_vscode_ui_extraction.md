# Shared-infra extraction task: `saropa-vscode-ui`

**Type:** Cross-repo shared-infrastructure extraction (tracked under `bugs/` as an actionable task).
**Status:** Won't Do — rejected (see `plans/history/2026.07/2026.07.16/67-saropa-suite-integration.md` §7). Closed 2026-06-14.

## Resolution: WON'T DO (2026-06-14)

Extraction rejected as over-engineering. Three new publishable packages for three in-house consumers
cost more in versioning, publishing, and release coordination than the duplication they remove, with
no user-facing benefit. The duplication is accepted as a known trade-off; if a shared bug recurs, a
single path-dep module or a sync script is preferred over a new published unit. Full rationale in
plan 67 §7. The original task plan is retained below as the record of what was considered. The
canonical cross-repo copy (`saropa_lints/plans/SHARED_INFRA_VSCODE_UI.md`) and any sibling-repo
consumer copies need the same disposition in their own repos.
**This repo's role:** Consumer. The canonical seed and cross-repo coordination live in `saropa_lints`
(`plans/SAROPA_SUITE_INTEGRATION.md` shared-infra section + `plans/SHARED_INFRA_VSCODE_UI.md`).
**Created:** 2026-06-14

## What it is

A reusable webview/dashboard kit for the Saropa VS Code extensions: theme tokens, the shell-once +
postMessage rendering pattern, and the primitives every dashboard rebuilds (CSP nonce, HTML escaping,
JSON-for-script-block, KPI cards, sortable tables, sparklines, focus rings, skip-links). One kit so a
"fixed color washes out in light/high-contrast" fix lands once, not three times.

## Why extract (the convergence evidence)

All three extensions shipped the same building blocks and the same class of bug:

- Webview HTML helpers — `createWebviewCspNonce`, `escapeHtml`, `jsonForScriptBlock`,
  `resolveRepoUrl`. Seed: `saropa_lints/extension/src/vibrancy/views/html-utils.ts`.
- The "shell set exactly once, patch the DOM from `model` messages" architecture — seed:
  `saropa_lints/extension/src/views/consolidated/{consolidatedView,consolidatedClient}.ts` and its
  decomposed section builders (`saropa_lints/plans/CENTRAL_DASHBOARD_CONSOLIDATION.md`).
- Theme-token-first styling: every color a `--vscode-*` token with a fallback, so the surface tracks
  light / dark / high-contrast. Seed: `saropa_lints/extension/src/views/consolidated/consolidatedStyles.ts`
  and `saropa_lints/extension/src/vibrancy/views/{report-styles,detail-view-styles,chart-styles,
  pill-button-styles}.ts`.

Lints already decomposed its dashboards into reusable section builders, so it is the seed. All three
repos independently hit and fixed the same "fixed color invisible in the opposite theme" defect — the
strongest signal that the styling layer belongs in one place.

## What gets extracted

1. **Primitives (TS):** `html-utils.ts` (CSP nonce, escape, script-block JSON, repo-url), the theme
   token set, the focus-ring / skip-link / accessibility helpers.
2. **Dashboard kit (TS):** the shell-once webview scaffold, the `model`/`occurrences` message
   contract, KPI-card / sortable-table / sparkline builders, the section-builder pattern.
3. **Style tokens:** the `--vscode-*`-first variable layer and the severity/grade color scale, so a
   contrast fix is made once.

## Non-goals

- **Not shared view models.** Each extension keeps its own data model and message payloads; the kit
  provides the rendering scaffold and primitives, not the domain content.
- **Not a component framework.** No React/Lit dependency — these are string-building webview helpers.
- **Not a monorepo merge.**

## Dependency mechanism (decision needed — the blocker)

Recommendation: **git submodule** pinned per consumer, same as the i18n package — the kit is pure TS
bundled into each extension by esbuild, so a path import from a pinned submodule bundles cleanly and an
upgrade is a deliberate SHA bump. One mechanism for both TS shared packages avoids two patterns for the
same kind of code.

Alternatives: published npm (cleaner semver, internal publish step + registry dependency); npm
`git+https` (floats to branch tip).

## Migration steps for this repo (do AFTER Lints seeds the package)

1. Lints creates `saropa-vscode-ui` from its `html-utils.ts`, the consolidated dashboard scaffold, the
   style-token layer, and the chart/pill/section builders; adopts it first.
2. Add the submodule here; repoint this repo's webview imports; discard this repo's forked copy.
3. Confirm the webview/HTML tests and the axe/light/dark/high-contrast checks pass.

## Risks

- **Snapshot/HTML test coupling.** Tests that assert exact webview HTML must stay byte-stable or be
  updated deliberately (not silently) when builders move.
- **Theme-token regressions.** The whole point is one contrast fix for all three — verify light / dark
  / high-contrast rendering after the move.
- **esbuild bundling of a submodule path** — confirm the bundle resolves the kit before deleting the
  in-repo copy.

## Related

- Canonical: `saropa_lints/plans/SHARED_INFRA_VSCODE_UI.md`
- Suite plan: `saropa_lints/plans/SAROPA_SUITE_INTEGRATION.md`; this repo's half:
  `plans/history/2026.07/2026.07.16/67-saropa-suite-integration.md`
- Sibling extraction tasks: `bugs/shared_infra_vscode_i18n_extraction.md`,
  `bugs/shared_infra_release_tools_extraction.md`
