/**
 * Webview HTML for the Branch Manager (Feature 37, Phase 5).
 *
 * Two render modes share one panel: the branch LIST (with per-branch action buttons) and a
 * branch DIFF view. All buttons post a `{command, branchId}` message back to the panel, which
 * runs the action and re-renders. The HTML is rebuilt server-side on each state change rather
 * than mutated in-place, keeping the webview script tiny (it only forwards button clicks).
 */

import type { IBranchDiff, IDataBranch } from './branch-types';

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
<script>
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
  const toolbar = `<div class="toolbar"><button data-command="create">+ New Branch</button></div>`;
  if (branches.length === 0) {
    return shell(`<h2>Data Branches</h2>${toolbar}<p class="empty">No branches yet. Capture the current database state as a branch to experiment safely.</p>`);
  }
  const cards = branches
    .map((b) => {
      const trunc = b.metadata.truncated
        ? ` <span class="truncated" title="At least one table hit the row cap">(truncated)</span>`
        : '';
      return `<div class="branch">
        <div class="name">${esc(b.name)}</div>
        <div class="meta">Captured ${esc(b.createdAt)} — ${b.metadata.tableCount} tables, ${b.metadata.totalRows.toLocaleString()} rows${trunc}</div>
        <button data-command="diff" data-branch="${esc(b.id)}">Diff vs Now</button>
        <button data-command="merge" data-branch="${esc(b.id)}" class="secondary">Generate Merge SQL</button>
        <button data-command="restore" data-branch="${esc(b.id)}" class="secondary">Restore</button>
        <button data-command="delete" data-branch="${esc(b.id)}" class="secondary">Delete</button>
      </div>`;
    })
    .join('\n');
  return shell(`<h2>Data Branches</h2>${toolbar}${cards}`);
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
  const back = `<div class="back"><button data-command="list" class="secondary">&larr; Back to branches</button></div>`;
  const header = `<h2>Diff: ${esc(diff.branchA)} &rarr; ${esc(diff.branchB)}</h2>
    <p><span class="badge added">${diff.summary.inserts} inserted</span>
       <span class="badge changed">${diff.summary.updates} changed</span>
       <span class="badge removed">${diff.summary.deletes} deleted</span></p>`;

  if (diff.tableDiffs.length === 0) {
    return shell(`${back}${header}<p class="empty">No differences between this branch and the current database.</p>`);
  }

  const sections = diff.tableDiffs
    .map((td) => {
      const parts: string[] = [`<h3>${esc(td.table)}</h3>`];
      if (td.inserts.length > 0) {
        parts.push(`<p><span class="badge added">+${td.inserts.length} inserted</span></p>`);
        parts.push(diffRows(td.columns, td.inserts, 'added'));
      }
      if (td.updates.length > 0) {
        parts.push(`<p><span class="badge changed">~${td.updates.length} changed</span></p>`);
        parts.push(diffRows(td.columns, td.updates.map((u) => u.after), 'changed'));
      }
      if (td.deletes.length > 0) {
        parts.push(`<p><span class="badge removed">-${td.deletes.length} deleted</span></p>`);
        parts.push(diffRows(td.columns, td.deletes, 'removed'));
      }
      return parts.join('\n');
    })
    .join('\n');

  return shell(`${back}${header}${sections}`);
}
