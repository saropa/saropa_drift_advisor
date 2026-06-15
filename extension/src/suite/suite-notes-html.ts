/**
 * Shared rendering for the cross-tool "Related Saropa Suite Findings" section
 * (plan 67 R3) used by the Explain, Index Suggestions, and Anomalies panels.
 *
 * Also renders the optional per-finding fix-action button (plan 67 R1): a
 * deep-link to a suite command. Buttons render only when the command is both
 * allowlisted (SUITE_COMMAND_PREFIXES) and actually registered in the host, so
 * a dead or untrusted action never appears. Execution is validated again
 * host-side via `executeSuiteFix` before the command runs.
 */
import * as vscode from 'vscode';
import {
  isAllowedSuiteCommand,
  readSiblingDiagnostics,
  relatedDiagnostics,
  type SuiteDiagnostic,
} from './suite-diagnostics';
import { t } from '../l10n';

export function escSuite(value: unknown): string {
  const s = value === null || value === undefined ? '' : String(value);
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** Human label for a sibling tool's machine source token (brand names kept as-is). */
export function suiteSourceLabel(source: string | undefined): string {
  switch (source) {
    case 'lints': return 'Saropa Lints';
    case 'log-capture': return 'Saropa Log Capture';
    case 'advisor': return 'Saropa Drift Advisor';
    default: return source ?? 'Saropa Suite';
  }
}

export interface SuiteRenderOptions {
  /** Registered command ids; a fix button renders only for one of these. */
  availableCommands?: ReadonlySet<string>;
}

/** Renders the fix-action button for a finding, or '' when none/unavailable. */
export function renderSuiteFixButton(d: SuiteDiagnostic, opts?: SuiteRenderOptions): string {
  const fix = d.fix;
  if (!fix || !fix.title || !isAllowedSuiteCommand(fix.command)) return '';
  // Hide the button unless the target command is actually registered — avoids a
  // dead action when the owning sibling extension is not installed.
  if (opts?.availableCommands && !opts.availableCommands.has(fix.command)) {
    return '';
  }
  const argsJson = escSuite(JSON.stringify(fix.args ?? []));
  return ` <button class="suite-fix" data-fix-cmd="${escSuite(fix.command)}" `
    + `data-fix-args="${argsJson}">${escSuite(fix.title)}</button>`;
}

/** Renders one finding row (source, its own localized title/detail, rule, fix). */
function renderNote(d: SuiteDiagnostic, opts?: SuiteRenderOptions): string {
  const src = escSuite(suiteSourceLabel(d.source));
  const title = escSuite(d.title ?? d.detail ?? d.ruleId ?? '');
  const detail = d.detail && d.detail !== d.title
    ? `<span class="suite-detail">${escSuite(d.detail)}</span>`
    : '';
  const rule = d.ruleId ? `<code class="suite-rule">${escSuite(d.ruleId)}</code>` : '';
  const sev = escSuite(d.severity ?? 'info');
  return `<div class="suite-note suite-${sev}">
  <span class="suite-src">${src}</span>
  <span class="suite-title">${title}</span>
  ${rule}${renderSuiteFixButton(d, opts)}
  ${detail}
</div>`;
}

/**
 * Full "Related Saropa Suite Findings" section, or '' when there are none.
 */
export function renderSuiteNotesSection(
  notes: SuiteDiagnostic[],
  opts?: SuiteRenderOptions,
): string {
  if (notes.length === 0) return '';
  const items = notes.map((n) => renderNote(n, opts)).join('\n');
  return `<h3>${t('panel.query.explain.section.suiteRelated')}</h3>\n${items}`;
}

/** Shared CSS for the suite-notes section (consumed inside each panel's <style>). */
export const SUITE_NOTES_CSS = `
  .suite-note {
    margin: 8px 0; padding: 8px 12px; border-radius: 4px;
    background: var(--vscode-editor-inactiveSelectionBackground, #333);
    border-left: 4px solid var(--vscode-panel-border, #444);
  }
  .suite-note.suite-error { border-left-color: var(--status-bad); }
  .suite-note.suite-warning { border-left-color: var(--accent-warning); }
  .suite-note.suite-info { border-left-color: var(--accent-info); }
  .suite-src { display: inline-block; font-size: 11px; font-weight: 600; opacity: 0.8; margin-right: 8px; }
  .suite-title { font-size: 13px; }
  .suite-detail { display: block; font-size: 12px; opacity: 0.7; margin-top: 4px; }
  .suite-rule { font-size: 11px; opacity: 0.6; }
  .suite-fix {
    background: var(--vscode-button-secondaryBackground, #3a3d41);
    color: var(--vscode-button-secondaryForeground, #fff);
    border: none; padding: 2px 8px; border-radius: 3px; cursor: pointer; font-size: 11px;
  }
  .suite-fix:hover { background: var(--vscode-button-secondaryHoverBackground, #45494e); }`;

/**
 * Client-side script (insert inside a panel's <script nonce="__CSP_NONCE__">): forwards a suite-fix
 * button click to the host as a `suiteFix` message carrying the command + args.
 */
export const SUITE_NOTES_SCRIPT = `
  document.addEventListener('click', (e) => {
    const fix = e.target.closest('.suite-fix');
    if (!fix) return;
    let args = [];
    try { args = JSON.parse(fix.dataset.fixArgs || '[]'); } catch (_) { args = []; }
    vscode.postMessage({ command: 'suiteFix', fixCommand: fix.dataset.fixCmd, fixArgs: args });
  });`;

/**
 * Host-side execution of a `suiteFix` webview message. Re-validates the command
 * against the allowlist AND the registered-command set before running it — the
 * message crosses the webview boundary, so the render-time gate is not trusted
 * on its own. Returns true when the command was dispatched.
 */
export async function executeSuiteFix(msg: {
  fixCommand?: unknown;
  fixArgs?: unknown;
}): Promise<boolean> {
  const command = msg.fixCommand;
  if (!isAllowedSuiteCommand(command)) return false;
  const registered = await vscode.commands.getCommands(true);
  if (!registered.includes(command)) return false;
  const args = Array.isArray(msg.fixArgs) ? msg.fixArgs : [];
  await vscode.commands.executeCommand(command, ...args);
  return true;
}

/** Resolves the set of registered command ids, for render-time fix-button gating. */
export async function availableCommandSet(): Promise<ReadonlySet<string>> {
  return new Set(await vscode.commands.getCommands(true));
}

/**
 * One-call build of the "Related Saropa Suite Findings" section for a surface
 * that concerns [tables] and/or [sql]: reads the sibling mirrors, matches the
 * relevant findings, resolves the available commands for fix-button gating, and
 * returns the section HTML (or '' when there are no related findings). Used by
 * the Index Suggestions and Anomalies panels (plan 67 R3). Best-effort — the
 * reader never throws.
 */
export async function buildSuiteSectionFor(query: {
  tables?: string[];
  sql?: string;
}): Promise<string> {
  const notes = relatedDiagnostics(await readSiblingDiagnostics(), query);
  if (notes.length === 0) return '';
  return renderSuiteNotesSection(notes, {
    availableCommands: await availableCommandSet(),
  });
}
