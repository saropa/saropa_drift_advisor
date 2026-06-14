/**
 * Webview HTML for the Branch Manager (Feature 37, Phase 5).
 *
 * Two render modes share one panel: the branch LIST (with per-branch action buttons) and a
 * branch DIFF view. All buttons post a `{command, branchId}` message back to the panel, which
 * runs the action and re-renders. The HTML is rebuilt server-side on each state change rather
 * than mutated in-place, keeping the webview script tiny (it only forwards button clicks).
 */

import type { IBranchDiff, IDataBranch } from './branch-types';
import { t } from '../l10n';

function esc(value: unknown): string {
  const s = value === null || value === undefined ? '' : String(value);
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function styles(): string {
  return `<style>
    body { font-family: var(--vscode-font-family, sans-serif); color: var(--vscode-editor-foreground, #ccc); background: var(--vscode-editor-background, #1e1e1e); padding: 14px; line-height: 1.4; }
    h2 { margin-top: 0; }
    .branch { border: 1px solid var(--vscode-panel-border, #444); border-radius: 4px; padding: 10px 12px; margin: 10px 0; }
    .branch .name { font-weight: 600; font-size: 14px; }
    .branch .meta { font-size: 12px; opacity: 0.75; margin: 2px 0 8px; }
    .truncated { color: #d6a92b; }
    button { background: var(--vscode-button-background, #0e639c); color: var(--vscode-button-foreground, #fff); border: none; padding: 4px 10px; border-radius: 3px; cursor: pointer; margin-right: 6px; }
    button.secondary { background: var(--vscode-button-secondaryBackground, #3a3d41); color: var(--vscode-button-secondaryForeground, #ccc); }
    .toolbar { margin-bottom: 12px; }
    .empty { font-style: italic; opacity: 0.65; }
    table { border-collapse: collapse; width: 100%; margin: 6px 0 14px; font-size: 13px; }
    th, td { border: 1px solid var(--vscode-panel-border, #444); padding: 4px 8px; text-align: left; }
    th { background: var(--vscode-editor-inactiveSelectionBackground, #333); }
    .badge { display: inline-block; padding: 2px 8px; border-radius: 10px; font-size: 12px; margin-right: 6px; }
    .badge.added { background: rgba(40,167,69,0.3); } .badge.changed { background: rgba(255,193,7,0.3); } .badge.removed { background: rgba(220,53,69,0.3); }
    .back { margin-bottom: 12px; }
  </style>`;
}

function shell(body: string): string {
  return `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8">${styles()}</head><body>
${body}
<script nonce="__CSP_NONCE__">
  const vscode = acquireVsCodeApi();
  document.addEventListener('click', (e) => {
    const btn = e.target.closest('button[data-command]');
    if (!btn) return;
    vscode.postMessage({ command: btn.getAttribute('data-command'), branchId: btn.getAttribute('data-branch') || undefined });
  });
</script>
</body></html>`;
}

/** Render the branch list with a "New Branch" toolbar and per-branch actions. */
export function buildBranchListHtml(branches: readonly IDataBranch[]): string {
  const toolbar = `<div class="toolbar"><button data-command="create">${t('panel.compare.branch.btn.new')}</button></div>`;
  if (branches.length === 0) {
    return shell(`<h2>${t('panel.compare.branch.title')}</h2>${toolbar}<p class="empty">${t('panel.compare.branch.empty')}</p>`);
  }
  const cards = branches
    .map((b) => {
      // "(truncated)" marker carries a tooltip explaining the per-table row cap.
      const trunc = b.metadata.truncated
        ? ` <span class="truncated" title="${t('panel.compare.branch.truncated.title')}">${t('panel.compare.branch.truncated.label')}</span>`
        : '';
      // Capture timestamp, table count, and locale-formatted row count are passed as
      // {0}/{1}/{2} tokens so the sentence stays one translator-reorderable unit.
      const meta = t(
        'panel.compare.branch.meta',
        esc(b.createdAt),
        b.metadata.tableCount,
        b.metadata.totalRows.toLocaleString(),
      );
      return `<div class="branch">
        <div class="name">${esc(b.name)}</div>
        <div class="meta">${meta}${trunc}</div>
        <button data-command="diff" data-branch="${esc(b.id)}">${t('panel.compare.branch.btn.diff')}</button>
        <button data-command="merge" data-branch="${esc(b.id)}" class="secondary">${t('panel.compare.branch.btn.merge')}</button>
        <button data-command="restore" data-branch="${esc(b.id)}" class="secondary">${t('panel.compare.branch.btn.restore')}</button>
        <button data-command="delete" data-branch="${esc(b.id)}" class="secondary">${t('panel.compare.branch.btn.delete')}</button>
      </div>`;
    })
    .join('\n');
  return shell(`<h2>${t('panel.compare.branch.title')}</h2>${toolbar}${cards}`);
}

function diffRows(columns: string[], rows: Record<string, unknown>[], cls: string): string {
  if (rows.length === 0) return '';
  const head = `<tr>${columns.map((c) => `<th>${esc(c)}</th>`).join('')}</tr>`;
  const body = rows
    .map((r) => `<tr class="${cls}">${columns.map((c) => `<td>${esc(r[c])}</td>`).join('')}</tr>`)
    .join('');
  return `<table>${head}${body}</table>`;
}

/** Render a branch diff (branch → current) with per-table insert/update/delete sections. */
export function buildBranchDiffHtml(diff: IBranchDiff): string {
  const back = `<div class="back"><button data-command="list" class="secondary">&larr; ${t('panel.compare.branch.btn.back')}</button></div>`;
  const header = `<h2>${t('panel.compare.branch.diff.heading', esc(diff.branchA), esc(diff.branchB))}</h2>
    <p><span class="badge added">${t('panel.compare.branch.summary.inserted', diff.summary.inserts)}</span>
       <span class="badge changed">${t('panel.compare.branch.summary.changed', diff.summary.updates)}</span>
       <span class="badge removed">${t('panel.compare.branch.summary.deleted', diff.summary.deletes)}</span></p>`;

  if (diff.tableDiffs.length === 0) {
    return shell(`${back}${header}<p class="empty">${t('panel.compare.branch.diff.empty')}</p>`);
  }

  const sections = diff.tableDiffs
    .map((td) => {
      const parts: string[] = [`<h3>${esc(td.table)}</h3>`];
      if (td.inserts.length > 0) {
        parts.push(`<p><span class="badge added">${t('panel.compare.branch.table.inserted', td.inserts.length)}</span></p>`);
        parts.push(diffRows(td.columns, td.inserts, 'added'));
      }
      if (td.updates.length > 0) {
        parts.push(`<p><span class="badge changed">${t('panel.compare.branch.table.changed', td.updates.length)}</span></p>`);
        parts.push(diffRows(td.columns, td.updates.map((u) => u.after), 'changed'));
      }
      if (td.deletes.length > 0) {
        parts.push(`<p><span class="badge removed">${t('panel.compare.branch.table.deleted', td.deletes.length)}</span></p>`);
        parts.push(diffRows(td.columns, td.deletes, 'removed'));
      }
      return parts.join('\n');
    })
    .join('\n');

  return shell(`${back}${header}${sections}`);
}
