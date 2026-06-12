/**
 * Web-viewer miscellaneous strings (System B, browser surface) — plan 75 §3.1.
 *
 * Cohesive slice for the standalone web viewer's small cross-cutting modules:
 * shared utilities (assets/web/utils.ts), the inline toolbar (toolbar.ts),
 * touch long-press copy (long-press-copy.ts), SQL syntax highlighting
 * (sql-highlight.ts), and shared state constants (state.ts). Each entry maps a
 * SYMBOLIC KEY → its ENGLISH source text; render code resolves it through
 * `vt()` ([../l10n.ts](../l10n.ts)), and the English value here is the in-bundle
 * fallback shown until a translation overlay is installed for the active locale.
 *
 * WHY a registry instead of inline literals: a hardcoded display string never
 * reaches the translation pipeline, so it ships English in every locale. See
 * the seed registry [./strings-web.ts](./strings-web.ts) for the convention and
 * plan 75 §5.1 for the add-a-string workflow.
 *
 * Keys are namespaced `viewer.misc.*`. Use `{0}`, `{1}` placeholders for runtime
 * values — never English string concatenation, which a translator cannot
 * reorder. Singular/plural and if/ternary branches get separate keys.
 *
 * This slice is registered in `WEB_STRING_REGISTRIES` in [../l10n.ts](../l10n.ts)
 * (the merge list is explicit because esbuild bundles — there is no runtime glob).
 *
 * SCOPE NOTE: the five modules covered by this slice render no English literals
 * of their own — utils.ts/setButtonBusy and long-press-copy operate on
 * caller-supplied or machine (table/column) values, toolbar.ts is pure DOM
 * wiring, and sql-highlight.ts emits only CSS class/token-type names. The
 * tool-label and Home-launcher inventories that live as data constants in
 * state.ts (TOOL_LABELS, HOME_LAUNCHERS, HOME_EXTRAS) are rendered exclusively
 * by the navigation-surface modules (tabs.ts, home-screen.ts) and are
 * externalized under the `viewer.nav.*` namespace by
 * [./strings-web-nav.ts](./strings-web-nav.ts), not here. Hence this slice
 * is intentionally empty.
 */

/** Symbolic key → English source text for the web viewer's miscellaneous modules. */
export const stringsWebMisc: Record<string, string> = {};
