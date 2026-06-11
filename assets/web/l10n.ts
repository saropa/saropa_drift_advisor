/**
 * Browser-side localization runtime (System B, web viewer) — plan 75 §3.3.
 *
 * The web viewer is a STANDALONE BROWSER APP served by the Dart debug server (and
 * also hosted in a VS Code panel via the same `bundle.js`). In a plain browser
 * there is no `vscode` object and no `vscode.l10n`, so — unlike Saropa Log
 * Capture's webview — this surface CANNOT use `vscode.l10n.t()`. This module is
 * the self-contained replacement: a symbolic-key lookup over an in-bundle English
 * registry plus an optional per-locale translation overlay.
 *
 * Resolution order for `vt('key')` (fail-soft, never throws, never blanks the UI):
 *   1. the active-locale overlay  (translated value, if installed)
 *   2. the bundled English registry  ([./l10n/strings-web.ts](./l10n/strings-web.ts))
 *   3. the raw key itself  (so a missing string is visible, not empty)
 * then `{0}`/`{1}` positional substitution of any args.
 *
 * The English registry is bundled (it is source code), so English is always
 * correct with zero network dependency. Translations are an OPTIONAL overlay
 * installed at boot — see `initWebL10n`. Until the server injects catalogs, the
 * viewer renders fully-correct English, which matches today's English-only state.
 */

import { webStrings } from './l10n/strings-web.ts';

/**
 * Every web English registry, merged into one lookup. Explicit (not a glob)
 * because esbuild bundles at build time — add new `strings-web-*.ts` files here.
 */
const WEB_STRING_REGISTRIES: Array<Record<string, string>> = [webStrings];

/** Merged symbolic-key → English map. Built once at module load. */
const englishStrings: Record<string, string> = Object.assign({}, ...WEB_STRING_REGISTRIES);

/**
 * Locales we ship catalogs for (plan 75 §1.2). `en` is the source and never has
 * an overlay. Full tags (`pt-br`, `zh-cn`, `zh-tw`) are listed before bare subtags
 * so `normalizeLocale` resolves the most specific match first.
 */
const KNOWN_LOCALES = ['pt-br', 'zh-cn', 'zh-tw', 'de', 'es', 'fr', 'it', 'ja', 'ko', 'ru', 'en'];

/** Active-locale translation overlay (symbolic key → translated). Empty = English. */
let activeOverlay: Record<string, string> = {};

/** The resolved active locale tag (one of KNOWN_LOCALES). Defaults to English. */
let activeLocale = 'en';

/**
 * Maps a raw BCP-47 tag (e.g. `de-AT`, `pt-BR`, `zh-Hans-CN`) to a catalog key.
 * Tries the full lowercased tag first (so `pt-br` / `zh-cn` win), then the primary
 * subtag (`de` from `de-at`). Returns `en` when nothing matches — fail-soft so an
 * unsupported locale shows English rather than raw keys.
 */
export function normalizeLocale(raw: string | null | undefined): string {
  if (!raw) {
    return 'en';
  }
  const lower = raw.toLowerCase().replace(/_/g, '-');
  if (KNOWN_LOCALES.indexOf(lower) !== -1) {
    return lower;
  }
  // Some script-tagged inputs (zh-hans-cn) won't equal a catalog key; fold the
  // common Chinese script variants before falling back to the primary subtag.
  if (lower.indexOf('zh') === 0) {
    if (lower.indexOf('hant') !== -1 || lower.indexOf('-tw') !== -1 || lower.indexOf('-hk') !== -1) {
      return 'zh-tw';
    }
    return 'zh-cn';
  }
  if (lower.indexOf('pt') === 0 && lower.indexOf('-br') !== -1) {
    return 'pt-br';
  }
  const primary = lower.split('-')[0];
  return KNOWN_LOCALES.indexOf(primary) !== -1 ? primary : 'en';
}

/**
 * Picks the locale to render in. An explicit override (passed by the VS Code host
 * when the same bundle runs inside a panel — `vscode.env.language`) wins over the
 * browser's own `navigator.language`, so a panel matches the editor's display
 * language rather than the OS locale.
 */
export function detectLocale(override?: string | null): string {
  if (override) {
    return normalizeLocale(override);
  }
  // navigator can be absent in non-browser test contexts — guard rather than throw.
  const navLang = typeof navigator !== 'undefined' ? navigator.language : null;
  return normalizeLocale(navLang);
}

/**
 * Installs a translation overlay for a locale. `en` is the source language and is
 * stored as an empty overlay (lookups fall straight through to the English
 * registry), so callers never need to special-case it.
 */
export function installCatalog(locale: string, catalog: Record<string, string> | null | undefined): void {
  activeLocale = normalizeLocale(locale);
  activeOverlay = activeLocale === 'en' || !catalog ? {} : catalog;
}

/** The resolved active locale tag. */
export function getActiveLocale(): string {
  return activeLocale;
}

/** Replaces `{0}`, `{1}`, … in a template with stringified args. Unmatched placeholders are left intact. */
function substitute(template: string, args: Array<string | number>): string {
  if (args.length === 0) {
    return template;
  }
  return template.replace(/\{(\d+)\}/g, (match, index) => {
    const i = Number(index);
    return i < args.length ? String(args[i]) : match;
  });
}

/**
 * Resolves a symbolic key to localized text. Overlay → English registry → key,
 * then positional `{0}`/`{1}` substitution. Never throws; a missing key returns
 * the key itself so the gap is visible in the UI instead of a blank.
 */
export function vt(key: string, ...args: Array<string | number>): string {
  const template = activeOverlay[key] ?? englishStrings[key] ?? key;
  return substitute(template, args);
}

/** Alias of `vt` for symmetry with the host-side `t()` (plan 75 §3.3). */
export const t = vt;

/**
 * Initializes the web l10n runtime. Synchronous and idempotent: it consumes a
 * host/server-injected `window.__SDA_L10N = { locale, catalog }` global when
 * present (the first-script injection pattern, plan 75 §3.3), otherwise it just
 * resolves the active locale from `navigator.language` and renders English from
 * the bundled registry.
 *
 * WHY synchronous: render code calls `vt()` synchronously during DOMContentLoaded,
 * so the locale + overlay must be in place before then. The injected-global path
 * is synchronous; there is deliberately no async fetch here — English is always
 * correct from the bundle, and wiring the server to inject catalogs is a later
 * phase (plan 75 Phase 4/5). Call once, first, from `index.js`.
 */
export function initWebL10n(): void {
  const injected =
    typeof window !== 'undefined'
      ? (window as unknown as { __SDA_L10N?: { locale?: string; catalog?: Record<string, string> } }).__SDA_L10N
      : undefined;

  if (injected && injected.locale) {
    installCatalog(injected.locale, injected.catalog);
    return;
  }
  // No injected catalog — resolve the locale anyway (so getActiveLocale is honest)
  // and run on the English registry.
  activeLocale = detectLocale();
  activeOverlay = {};
}
