/**
 * Markup for the sidebar SQL console webview view (plan 84, work package C).
 *
 * Builds the full HTML document that
 * [./sql-console-view.ts](./sql-console-view.ts) hands to `secureWebviewHtml`,
 * which injects the CSP meta, the Saropa design tokens, and the real nonce in
 * place of the `__CSP_NONCE__` placeholder written on the script tag below.
 * A script that does NOT carry that placeholder gets no nonce and cannot run —
 * that is the whole point of the placeholder being opt-in, so do not remove it
 * and do not add a second unmarked script.
 *
 * Layout order is fixed by the plan: textarea, then the Execute button directly
 * underneath it, then the validation icon strip, then the confirm-destructive
 * checkbox, then the output area.
 */

import { t } from '../l10n';
import { getSqlConsoleJs } from './sql-console-js';
import { getSqlConsoleCss } from './sql-console-styles';

/**
 * Severity glyphs for the validation strip, keyed by the same three-tier
 * vocabulary the diagnostics layer uses (see diagnostics/diagnostic-config.ts).
 * Plain Unicode rather than codicons: the codicon font is not loaded into a
 * webview unless the extension ships its stylesheet, and a missing font would
 * degrade to tofu — a glyph that always renders is worth more here than an exact
 * icon match. Each is paired with a localized aria-label in the script.
 */
const SEVERITY_ICONS: Record<string, string> = {
  info: 'ⓘ', // circled Latin small letter i
  warning: '⚠', // warning sign
  error: '✖', // heavy multiplication x
};

/** Escapes text destined for an HTML attribute or text node. */
function esc(text: string): string {
  return text
    .split('&').join('&amp;')
    .split('<').join('&lt;')
    .split('>').join('&gt;')
    .split('"').join('&quot;')
    .split("'").join('&#39;');
}

/**
 * The localized chrome the webview script needs. Serialized into the script as a
 * JSON literal so the script itself carries no English — the host resolves every
 * key through `t()` here, where `vscode.l10n` is available.
 */
function buildL10nBlob(): string {
  const blob = {
    executeTitle: t('panel.sqlConsole.btn.execute.title'),
    statusRunning: t('panel.sqlConsole.status.running'),
    severityIcon: SEVERITY_ICONS,
    severityLabel: {
      info: t('panel.sqlConsole.severity.info'),
      warning: t('panel.sqlConsole.severity.warning'),
      error: t('panel.sqlConsole.severity.error'),
    },
  };
  // `</` inside a JSON string would close the surrounding <script> element early;
  // escaping the slash keeps the literal inert without changing its parsed value.
  return JSON.stringify(blob).split('</').join('<\\/');
}

/** Builds the complete HTML document for the sidebar SQL console. */
export function getSqlConsoleHtml(confirmDestructive: boolean): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<style>${getSqlConsoleCss()}</style>
</head>
<body>
<div id="console">
  <!-- No visible <label>: the sidebar has ~300px of width and the placeholder
       already says what the box is. The accessible name comes from aria-label
       instead, so screen readers still get it without spending a line. -->
  <textarea id="sql-input" spellcheck="false"
    aria-label="${esc(t('panel.sqlConsole.sql.label'))}"
    placeholder="${esc(t('panel.sqlConsole.sql.placeholder'))}"></textarea>

  <button id="btn-execute" type="button"
    title="${esc(t('panel.sqlConsole.btn.execute.title'))}"
    disabled>${esc(t('panel.sqlConsole.btn.execute'))}</button>

  <!-- Populated by the host's validation message; hidden until the first
       classification arrives so an untouched console shows no severity at all. -->
  <div id="validation" hidden></div>

  <div class="option-row" title="${esc(t('panel.sqlConsole.confirmDestructive.title'))}">
    <input type="checkbox" id="confirm-destructive"${confirmDestructive ? ' checked' : ''}>
    <label for="confirm-destructive">${esc(t('panel.sqlConsole.confirmDestructive.label'))}</label>
  </div>

  <!-- Every execute writes here, so no action ever completes silently. -->
  <div id="output">${esc(t('panel.sqlConsole.status.ready'))}</div>
</div>
<script nonce="__CSP_NONCE__">
  ${getSqlConsoleJs(buildL10nBlob())}
</script>
</body>
</html>`;
}
