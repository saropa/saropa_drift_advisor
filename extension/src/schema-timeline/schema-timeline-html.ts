/**
 * HTML template for the Schema Evolution Timeline webview panel.
 * Uses VS Code theme CSS variables for light/dark support.
 */

import type { ISchemaChange, ISchemaSnapshot } from './schema-timeline-types';
import { diffSchemaSnapshots } from './schema-differ';
import { t } from '../l10n';

function esc(value: unknown): string {
  const s = value === null || value === undefined ? '' : String(value);
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** Build the full HTML document for the schema timeline panel. */
export function buildSchemaTimelineHtml(
  snapshots: readonly ISchemaSnapshot[],
): string {
  if (snapshots.length === 0) {
    return wrapHtml(`<div class="empty">
      <h2>${t('panel.schema.timeline.empty.title')}</h2>
      <p>${t('panel.schema.timeline.empty.body')}</p>
    </div>`);
  }

  // Pre-compute diffs once (shared by entries + summary)
  const diffs = precomputeDiffs(snapshots);
  const entries = renderEntries(snapshots, diffs);
  const summary = renderSummary(snapshots, diffs);

  return wrapHtml(`
    <div class="header">
      <h2>${t('panel.schema.timeline.title')}</h2>
      <button id="export-btn" title="${t('panel.schema.timeline.btn.export.title')}">${t('panel.schema.timeline.btn.export')}</button>
    </div>
    <div class="timeline">${entries}</div>
    <div class="summary">${summary}</div>
    <script nonce="__CSP_NONCE__">
      const vscode = acquireVsCodeApi();
      document.getElementById('export-btn')
        .addEventListener('click', () => {
          vscode.postMessage({ command: 'export' });
        });
    </script>
  `);
}

/** Compute diffs between each adjacent pair of snapshots. */
function precomputeDiffs(
  snapshots: readonly ISchemaSnapshot[],
): ISchemaChange[][] {
  const diffs: ISchemaChange[][] = [[]]; // Index 0 = initial (no diff)
  for (let i = 1; i < snapshots.length; i++) {
    diffs.push(diffSchemaSnapshots(snapshots[i - 1], snapshots[i]));
  }
  return diffs;
}

function renderEntries(
  snapshots: readonly ISchemaSnapshot[],
  diffs: ISchemaChange[][],
): string {
  const parts: string[] = [];

  for (let i = 0; i < snapshots.length; i++) {
    const snap = snapshots[i];
    const isCurrent = i === snapshots.length - 1;
    const label = isCurrent ? t('panel.schema.timeline.label.current') : '';
    const delta = i > 0 ? timeDelta(snapshots[i - 1], snap) : t('panel.schema.timeline.delta.initial');
    const changes = diffs[i];

    parts.push(`
      <div class="entry${isCurrent ? ' current' : ''}">
        <div class="dot"></div>
        <div class="content">
          <div class="gen-header">
            <strong>${t('panel.schema.timeline.gen', esc(snap.generation))}</strong>
            <span class="time">${esc(formatTime(snap.timestamp))}</span>
            <span class="delta">(${esc(delta)})</span>
            <span class="label">${esc(label)}</span>
          </div>
          ${i === 0 ? renderInitial(snap) : renderChanges(changes)}
        </div>
      </div>
    `);
  }

  return parts.join('');
}

function renderInitial(snap: ISchemaSnapshot): string {
  const names = snap.tables.map((tbl) => esc(tbl.name)).join(', ');
  return `<div class="change-list">
    <div class="change add">${t('panel.schema.timeline.initial', snap.tables.length, names)}</div>
  </div>`;
}

function renderChanges(changes: ISchemaChange[]): string {
  if (changes.length === 0) {
    return '<div class="change-list"><div class="change none">'
      + `${t('panel.schema.timeline.change.none')}</div></div>`;
  }

  const items = changes.map((c) => {
    const cls = changeClass(c.type);
    const icon = changeIcon(c.type);
    const label = changeLabel(c.type);
    const detail = c.detail ? ` ${esc(c.detail)}` : '';
    return `<div class="change ${cls}">${icon} ${label} `
      + `<strong>${esc(c.table)}</strong>:${detail}</div>`;
  });

  return `<div class="change-list">${items.join('')}</div>`;
}

function changeClass(type: ISchemaChange['type']): string {
  if (type.includes('added')) return 'add';
  if (type.includes('dropped') || type.includes('removed')) return 'remove';
  return 'modify';
}

function changeIcon(type: ISchemaChange['type']): string {
  if (type.includes('added')) return '+';
  if (type.includes('dropped') || type.includes('removed')) return '-';
  return '~';
}

function changeLabel(type: ISchemaChange['type']): string {
  // Each change type maps to a localized label phrase; the table name follows it
  // as <strong>-wrapped data at the call site. Unknown type → its raw id (fail-soft).
  const keys: Record<string, string> = {
    table_added: 'panel.schema.timeline.change.tableAdded',
    table_dropped: 'panel.schema.timeline.change.tableDropped',
    column_added: 'panel.schema.timeline.change.columnAdded',
    column_removed: 'panel.schema.timeline.change.columnRemoved',
    column_type_changed: 'panel.schema.timeline.change.columnTypeChanged',
    fk_added: 'panel.schema.timeline.change.fkAdded',
    fk_removed: 'panel.schema.timeline.change.fkRemoved',
  };
  const key = keys[type];
  return key ? t(key) : type;
}

function renderSummary(
  snapshots: readonly ISchemaSnapshot[],
  diffs: ISchemaChange[][],
): string {
  let added = 0, dropped = 0, modified = 0, fkChanges = 0;

  for (let i = 1; i < snapshots.length; i++) {
    for (const c of diffs[i]) {
      if (c.type === 'table_added') added++;
      else if (c.type === 'table_dropped') dropped++;
      else if (c.type === 'fk_added' || c.type === 'fk_removed') fkChanges++;
      else modified++;
    }
  }

  // Each fragment has its own singular/plural key so a translator controls the
  // plural form per language, rather than English "s" suffixing.
  const parts: string[] = [];
  if (added) {
    parts.push(added !== 1
      ? t('panel.schema.timeline.summary.tablesAdded', added)
      : t('panel.schema.timeline.summary.tableAdded', added));
  }
  if (dropped) parts.push(t('panel.schema.timeline.summary.dropped', dropped));
  if (modified) {
    parts.push(modified !== 1
      ? t('panel.schema.timeline.summary.columnChanges', modified)
      : t('panel.schema.timeline.summary.columnChange', modified));
  }
  if (fkChanges) {
    parts.push(fkChanges !== 1
      ? t('panel.schema.timeline.summary.fkChanges', fkChanges)
      : t('panel.schema.timeline.summary.fkChange', fkChanges));
  }

  const text = parts.length > 0 ? parts.join(', ') : t('panel.schema.timeline.summary.noChanges');
  return `<div class="summary-text">${t('panel.schema.timeline.summary.text', snapshots.length, text)}</div>`;
}

function formatTime(iso: string): string {
  try {
    return new Date(iso).toLocaleTimeString();
  } catch {
    return iso;
  }
}

function timeDelta(prev: ISchemaSnapshot, curr: ISchemaSnapshot): string {
  const ms = new Date(curr.timestamp).getTime()
    - new Date(prev.timestamp).getTime();
  if (isNaN(ms) || ms < 0) return '?';
  if (ms < 1000) return '<1s';
  const secs = Math.floor(ms / 1000);
  if (secs < 60) return `${secs}s`;
  const mins = Math.floor(secs / 60);
  const remSecs = secs % 60;
  return remSecs > 0 ? `${mins}m ${remSecs}s` : `${mins}m`;
}

function wrapHtml(body: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<style>
  body {
    font-family: var(--vscode-font-family);
    font-size: var(--vscode-font-size);
    color: var(--vscode-editor-foreground);
    background: var(--vscode-editor-background);
    padding: 16px;
    margin: 0;
  }
  .empty { text-align: center; margin-top: 60px; opacity: 0.7; }
  .header {
    display: flex; align-items: center;
    justify-content: space-between; margin-bottom: 16px;
  }
  .header h2 { margin: 0; }
  .header button {
    background: var(--vscode-button-background);
    color: var(--vscode-button-foreground);
    border: none; padding: 4px 12px; cursor: pointer; border-radius: 2px;
  }
  .header button:hover {
    background: var(--vscode-button-hoverBackground);
  }
  .timeline { position: relative; padding-left: 24px; }
  .timeline::before {
    content: ''; position: absolute; left: 8px; top: 0; bottom: 0;
    width: 2px; background: var(--vscode-editorLineNumber-foreground);
  }
  .entry { position: relative; margin-bottom: 16px; }
  .dot {
    position: absolute; left: -20px; top: 4px;
    width: 10px; height: 10px; border-radius: 50%;
    background: var(--vscode-editorLineNumber-foreground);
    border: 2px solid var(--vscode-editor-background);
  }
  .entry.current .dot {
    background: var(--vscode-terminal-ansiGreen);
  }
  .gen-header { margin-bottom: 4px; }
  .time { opacity: 0.7; margin-left: 8px; }
  .delta { opacity: 0.5; font-size: 0.9em; }
  .label { color: var(--vscode-terminal-ansiGreen); margin-left: 4px; }
  .change-list { margin-left: 4px; }
  .change { padding: 2px 0; font-size: 0.95em; }
  .change.add { color: var(--vscode-terminal-ansiGreen); }
  .change.remove { color: var(--vscode-terminal-ansiRed); }
  .change.modify { color: var(--vscode-terminal-ansiYellow); }
  .change.none { opacity: 0.5; font-style: italic; }
  .summary {
    margin-top: 16px; padding-top: 12px;
    border-top: 1px solid var(--vscode-editorLineNumber-foreground);
  }
  .summary-text { opacity: 0.7; }
</style>
</head>
<body>${body}</body>
</html>`;
}
