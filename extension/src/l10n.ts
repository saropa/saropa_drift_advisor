/**
 * Extension-host localization runtime (System B, host surface) — plan 75 §3.3.
 *
 * Resolves a SYMBOLIC KEY to its English source string (from the merged
 * `strings-*.ts` registries) and passes it through `vscode.l10n.t()`, which
 * applies the active display-language translation from `l10n/bundle.l10n.*.json`
 * and substitutes `{0}`/`{1}` arguments. VS Code's l10n bundle is keyed by the
 * ENGLISH string value, so the indirection here is "symbolic key → English →
 * vscode.l10n.t(English)". Unknown key → the key itself (fail-soft).
 *
 * This is the HOST counterpart to the browser `vt()` in
 * [../../assets/web/l10n.ts](../../assets/web/l10n.ts). Host code and host-built
 * panel HTML call `t()`; client scripts inside a panel webview call a `vt()`
 * seeded from `getWebviewL10nMap()`.
 *
 * The MANIFEST surface (command titles, settings, walkthrough — `%key%` in
 * `package.json`) is System A and is NOT handled here; VS Code resolves it from
 * `package.nls.<locale>.json` directly.
 */

import * as vscode from 'vscode';

import { hostStrings } from './l10n/strings-host';
import { stringsPanelDashboard } from './l10n/strings-panel-dashboard';
import { stringsPanelHealth } from './l10n/strings-panel-health';
import { stringsPanelSchema } from './l10n/strings-panel-schema';
import { stringsPanelQuery } from './l10n/strings-panel-query';
import { stringsPanelCompare } from './l10n/strings-panel-compare';
import { stringsPanelData } from './l10n/strings-panel-data';
import { stringsPanelReplay } from './l10n/strings-panel-replay';
import { stringsPanelQuality } from './l10n/strings-panel-quality';
import { stringsPanelTools } from './l10n/strings-panel-tools';
import { stringsPanelNotes } from './l10n/strings-panel-notes';
import { stringsPanelRules } from './l10n/strings-panel-rules';
import { stringsPanelHub } from './l10n/strings-panel-hub';

/**
 * Every host English registry, merged into one lookup. Explicit list (not a glob)
 * — add new `strings-host*.ts` / `strings-panel-*.ts` slices here as they are split
 * out under the 300-line limit.
 */
const HOST_STRING_REGISTRIES: Array<Record<string, string>> = [
  hostStrings,
  stringsPanelDashboard,
  stringsPanelHealth,
  stringsPanelSchema,
  stringsPanelQuery,
  stringsPanelCompare,
  stringsPanelData,
  stringsPanelReplay,
  stringsPanelQuality,
  stringsPanelTools,
  stringsPanelNotes,
  stringsPanelRules,
  stringsPanelHub,
];

/** Merged symbolic-key → English map. */
const strings: Record<string, string> = Object.assign({}, ...HOST_STRING_REGISTRIES);

/**
 * Localizes a symbolic key. Resolves to its English source string, then through
 * `vscode.l10n.t()` for translation + positional `{0}` substitution. A missing key
 * falls through as its own text so the gap is visible rather than blank.
 */
export function t(key: string, ...args: Array<string | number | boolean>): string {
  const english = strings[key] ?? key;
  return vscode.l10n.t(english, ...args);
}

/**
 * Returns the English source string for a key WITHOUT translating it. For the rare
 * case a caller needs the untranslated template (e.g. logging, or building a key
 * that VS Code's l10n bundle is itself keyed by). Missing key → the key.
 */
export function englishOf(key: string): string {
  return strings[key] ?? key;
}

/**
 * Builds a `{ key: translatedText }` map for injection into a panel webview's first
 * script, so client-side render code (which has no host `t()`) can look up strings
 * by symbolic key — the `__VT` bridge pattern (plan 75 §3.3). Pass `prefixes` to
 * ship only the keys a given panel needs (keeps the injected blob small); omit to
 * include every host key.
 */
export function getWebviewL10nMap(prefixes?: string[]): Record<string, string> {
  const map: Record<string, string> = {};
  for (const key of Object.keys(strings)) {
    if (prefixes && !prefixes.some((p) => key.startsWith(p))) {
      continue;
    }
    map[key] = t(key);
  }
  return map;
}
