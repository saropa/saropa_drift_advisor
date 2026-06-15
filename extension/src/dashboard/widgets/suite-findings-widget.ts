/**
 * Suite Findings widget for the dashboard (plan 67 R3 — the holistic surface).
 *
 * The compact, at-a-glance counterpart to the full Drift Health panel: it joins
 * the three suite lenses (Advisor's live runtime issues, Saropa Lints' static
 * findings, Saropa Log Capture's runtime signals) into per-tool and per-severity
 * counts on the customizable dashboard, and links through to the full panel.
 *
 * Reuses the existing reader (`readSiblingDiagnostics`), the Advisor-envelope
 * relabeler (`diagnosticsFromEnvelope`), and the join (`buildDriftHealth`) so
 * the count shown here can never diverge from the panel — single source of join
 * truth. The "Open Drift Health" button uses the dashboard's existing
 * `executeAction` message path, identical to the Feature Discovery widget.
 */

import type { IWidgetDefinition } from '../dashboard-types';
import { escapeHtml } from '../dashboard-types';
import {
  diagnosticsFromEnvelope,
  readSiblingDiagnostics,
  type SuiteDiagnostic,
} from '../../suite/suite-diagnostics';
import { buildDriftHealth, summarizeDriftHealth } from '../../suite/drift-health';
import type { SuiteFindingsSummary } from '../../suite/drift-health';

const esc = escapeHtml;

/**
 * Collects all three tools' diagnostics and reduces them to counts. Advisor's
 * own envelope is fetched live (best-effort — a down server just yields zero
 * advisor findings, not an error) and relabeled `source: advisor` so its
 * per-issue detector token does not split it across tool buckets; the siblings
 * come from their on-disk mirrors. Mirrors `collectDiagnostics` in the panel.
 */
async function fetchSuiteFindings(
  client: { issues: () => Promise<unknown> },
): Promise<SuiteFindingsSummary> {
  let advisor: SuiteDiagnostic[] = [];
  try {
    advisor = diagnosticsFromEnvelope(await client.issues(), 'advisor', true);
  } catch {
    advisor = [];
  }
  const siblings = await readSiblingDiagnostics();
  // buildDriftHealth drops unknown producers and routes table-less findings to
  // `untabled`; summarizeDriftHealth is the shared count reducer, so this
  // widget's numbers always match the Drift Health panel and the timeline.
  return summarizeDriftHealth(buildDriftHealth([...advisor, ...siblings]));
}

/** Renders the summary counts plus a deep-link button to the full panel. */
function renderSuiteFindingsHtml(summary: SuiteFindingsSummary): string {
  const clean = summary.total === 0;
  // The open-panel button reuses the dashboard's executeAction path; the command
  // id is Advisor's own stable deep-link target (plan 67 §3 / R5).
  // data-click + the delegated dispatcher replace the inline onclick the C2b
  // nonce CSP would block; executeAction() is a global in the dashboard script.
  const openButton =
    `<button class="suite-open-btn" `
    + `data-click="executeAction" data-a0="driftViewer.openDriftHealth" `
    + `title="Open the full Drift Health panel">Open Drift Health</button>`;

  if (clean) {
    return `<style>${SUITE_FINDINGS_CSS}</style>
      <div class="suite-findings">
        <div class="suite-clean">✅ No suite findings across all three tools</div>
        <div class="suite-actions">${openButton}</div>
      </div>`;
  }

  // Per-tool chips (icon + count); a tool with zero findings is dimmed, not
  // hidden, so the three-lens framing stays visible even when one tool is quiet.
  const tool = (icon: string, label: string, count: number): string =>
    `<span class="suite-tool${count === 0 ? ' suite-zero' : ''}" title="${esc(label)}">`
    + `${icon} ${esc(label)}: <strong>${count}</strong></span>`;

  return `<style>${SUITE_FINDINGS_CSS}</style>
    <div class="suite-findings">
      <div class="suite-headline">
        <span class="suite-total">${summary.total}</span>
        <span class="suite-total-label">findings across ${summary.tables} `
    + `table${summary.tables === 1 ? '' : 's'}</span>
      </div>
      <div class="suite-sev">
        <span class="suite-sev-error">${summary.errors} error${summary.errors === 1 ? '' : 's'}</span>
        <span class="suite-sev-warn">${summary.warnings} warning${summary.warnings === 1 ? '' : 's'}</span>
      </div>
      <div class="suite-tools">
        ${tool('\u{1F4BE}', 'Drift Advisor', summary.advisor)}
        ${tool('\u{1F50D}', 'Saropa Lints', summary.lints)}
        ${tool('\u{1F4DF}', 'Log Capture', summary.logCapture)}
      </div>
      <div class="suite-actions">${openButton}</div>
    </div>`;
}

/** Theme-aware styling; all colors come from VS Code tokens, never hardcoded. */
const SUITE_FINDINGS_CSS = `
  .suite-findings { display:flex; flex-direction:column; gap:8px; padding:4px 0; }
  .suite-headline { display:flex; align-items:baseline; gap:6px; }
  .suite-total { font-size:24px; font-weight:600; color:var(--vscode-foreground); }
  .suite-total-label { font-size:12px; color:var(--vscode-descriptionForeground); }
  .suite-sev { display:flex; gap:10px; font-size:12px; }
  .suite-sev-error { color:var(--vscode-editorError-foreground); }
  .suite-sev-warn { color:var(--vscode-editorWarning-foreground); }
  .suite-tools { display:flex; flex-wrap:wrap; gap:8px; }
  .suite-tool { font-size:12px; color:var(--vscode-foreground);
    background:var(--vscode-editor-background); border:1px solid var(--vscode-panel-border);
    border-radius:4px; padding:2px 8px; }
  .suite-zero { opacity:0.5; }
  .suite-clean { font-size:13px; color:var(--vscode-foreground); }
  .suite-actions { margin-top:2px; }
  .suite-open-btn { background:var(--vscode-button-secondaryBackground, var(--surface-3));
    color:var(--vscode-button-secondaryForeground, var(--text)); border:none; border-radius:3px;
    padding:4px 10px; font-size:11px; cursor:pointer; }
  .suite-open-btn:hover { background:var(--vscode-button-secondaryHoverBackground); }
`;

// ── Widget definition ─────────────────────────────────────────────────

export const SUITE_FINDINGS_WIDGETS: IWidgetDefinition[] = [
  {
    type: 'suiteFindings',
    label: 'Suite Findings',
    icon: '\u{1F517}',
    description: 'Cross-tool findings (Advisor + Lints + Log Capture)',
    defaultSize: { w: 2, h: 2 },
    configSchema: [],
    fetchData: async (client) => fetchSuiteFindings(client),
    renderHtml: (data) => renderSuiteFindingsHtml(data as SuiteFindingsSummary),
  },
];
