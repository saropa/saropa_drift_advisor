/**
 * HTML template for the Annotations & Bookmarks webview panel.
 * Self-contained with inline CSS/JS. Uses VS Code theme variables.
 */

import type { AnnotationIcon, IAnnotation } from './annotation-types';

function esc(value: unknown): string {
  const s = value === null || value === undefined ? '' : String(value);
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

const ICON_MAP: Record<AnnotationIcon, string> = {
  note: '\u{1F4A1}',
  warning: '\u26A0\uFE0F',
  bug: '\u{1F41B}',
  star: '\u2B50',
  pin: '\u{1F4CC}',
  todo: '\u{1F4CB}',
  bookmark: '\u{1F516}',
};

function targetLabel(ann: IAnnotation): string {
  const t = ann.target;
  if (t.kind === 'row') return `${t.table} #${t.rowPk ?? '?'}`;
  if (t.kind === 'column') return `${t.table}.${t.column ?? '?'}`;
  return t.table;
}

function formatDate(timestamp: number): string {
  return new Date(timestamp).toLocaleDateString(undefined, {
    month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
  });
}

function renderAnnotation(ann: IAnnotation): string {
  const icon = ICON_MAP[ann.icon] ?? '\u{1F4A1}';
  const label = esc(targetLabel(ann));
  const note = esc(ann.note);
  const date = esc(formatDate(ann.updatedAt));
  const kind = esc(ann.target.kind);
  const id = esc(ann.id);

  return `<div class="annotation" data-id="${id}">
  <div class="ann-header">
    <span class="ann-icon">${icon}</span>
    <span class="ann-target">${label}</span>
    <span class="ann-kind">${kind}</span>
    <span class="ann-date">${date}</span>
  </div>
  <div class="ann-note">${note}</div>
  <div class="ann-actions">
    <button class="btn" data-action="edit" data-id="${id}">Edit</button>
    <button class="btn btn-danger" data-action="remove" data-id="${id}">
      Remove
    </button>
  </div>
</div>`;
}

function renderGroup(
  table: string,
  annotations: IAnnotation[],
): string {
  const items = annotations.map(renderAnnotation).join('\n');
  return `<details open>
  <summary class="group-header">
    <span class="group-name">${esc(table)}</span>
    <span class="group-count">${annotations.length}</span>
  </summary>
  <div class="group-body">${items}</div>
</details>`;
}

function renderEmpty(): string {
  return `<div class="empty">
  <p>No annotations yet.</p>
  <p class="hint">
    Right-click a table or column in the Database Explorer
    to add an annotation.
  </p>
</div>`;
}

function renderToolbar(count: number): string {
  return `<div class="toolbar">
  <span class="toolbar-title">Annotations</span>
  <span class="badge">${count}</span>
  <button class="btn" data-action="copyJson" title="Copy as JSON">
    Copy JSON
  </button>
</div>`;
}

/** Build the complete HTML for the annotations panel. */
export function buildAnnotationHtml(
  annotations: readonly IAnnotation[],
): string {
  const grouped = new Map<string, IAnnotation[]>();
  for (const ann of annotations) {
    const list = grouped.get(ann.target.table) ?? [];
    list.push(ann);
    grouped.set(ann.target.table, list);
  }

  const toolbar = renderToolbar(annotations.length);
  let body: string;
  if (annotations.length === 0) {
    body = renderEmpty();
  } else {
    const groups = [...grouped.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([table, anns]) => renderGroup(table, anns))
      .join('\n');
    body = groups;
  }

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<style>
  body {
    font-family: var(--vscode-font-family);
    font-size: var(--vscode-font-size);
    color: var(--vscode-foreground);
    padding: 0 16px 16px;
    margin: 0;
  }
  .toolbar {
    display: flex; align-items: center; gap: 8px;
    padding: 12px 0; border-bottom: 1px solid
      var(--vscode-widget-border, #444);
    margin-bottom: 12px; position: sticky; top: 0;
    background: var(--vscode-editor-background);
    z-index: 10;
  }
  .toolbar-title {
    font-weight: 600; font-size: 14px; flex: 1;
  }
  .badge {
    background: var(--vscode-badge-background);
    color: var(--vscode-badge-foreground);
    border-radius: 10px; padding: 2px 8px;
    font-size: 11px; font-weight: 600;
  }
  .btn {
    background: var(--vscode-button-secondaryBackground);
    color: var(--vscode-button-secondaryForeground);
    border: none; border-radius: 4px;
    padding: 4px 10px; cursor: pointer;
    font-size: 12px;
  }
  .btn:hover {
    background: var(--vscode-button-secondaryHoverBackground);
  }
  .btn-danger:hover {
    background: rgba(229, 57, 53, 0.3);
  }
  details { margin-bottom: 8px; }
  summary {
    cursor: pointer; padding: 6px 0;
    list-style: none; display: flex;
    align-items: center; gap: 8px;
  }
  summary::-webkit-details-marker { display: none; }
  summary::before {
    content: '\\25B6'; font-size: 10px;
    transition: transform 0.15s;
  }
  details[open] > summary::before {
    transform: rotate(90deg);
  }
  .group-header {
    font-weight: 600; font-size: 13px;
    border-bottom: 1px solid
      var(--vscode-widget-border, #333);
    padding-bottom: 4px;
  }
  .group-name { flex: 1; }
  .group-count {
    background: var(--vscode-badge-background);
    color: var(--vscode-badge-foreground);
    border-radius: 10px; padding: 1px 7px;
    font-size: 11px;
  }
  .group-body { padding-left: 8px; }
  .annotation {
    padding: 8px; margin: 6px 0;
    border-radius: 4px;
    background: var(--vscode-editor-inactiveSelectionBackground,
      rgba(255,255,255,0.04));
    border-left: 3px solid
      var(--vscode-textLink-foreground, #3794ff);
  }
  .ann-header {
    display: flex; align-items: center;
    gap: 6px; margin-bottom: 4px;
  }
  .ann-icon { font-size: 14px; }
  .ann-target { font-weight: 600; font-size: 13px; }
  .ann-kind {
    opacity: 0.6; font-size: 11px;
    text-transform: uppercase;
  }
  .ann-date {
    margin-left: auto; opacity: 0.5;
    font-size: 11px;
  }
  .ann-note {
    font-size: 13px; line-height: 1.4;
    padding: 2px 0 6px 20px;
    white-space: pre-wrap;
  }
  .ann-actions {
    display: flex; gap: 6px;
    padding-left: 20px;
  }
  .empty {
    text-align: center; padding: 48px 16px;
    opacity: 0.6;
  }
  .hint { font-size: 12px; opacity: 0.7; }
</style>
</head>
<body>
${toolbar}
${body}
<script>
  const vscode = acquireVsCodeApi();
  document.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-action]');
    if (!btn) return;
    const action = btn.dataset.action;
    const id = btn.dataset.id;

    if (action === 'edit' && id) {
      const card = btn.closest('.annotation');
      const noteEl = card?.querySelector('.ann-note');
      if (!noteEl) return;
      const current = noteEl.textContent ?? '';
      const input = document.createElement('input');
      input.type = 'text';
      input.value = current.trim();
      input.className = 'btn';
      input.style.width = '100%';
      input.style.marginBottom = '4px';
      noteEl.textContent = '';
      noteEl.appendChild(input);
      input.focus();
      input.addEventListener('keydown', (ev) => {
        if (ev.key === 'Enter') {
          vscode.postMessage({
            command: 'edit', id, note: input.value,
          });
        }
        if (ev.key === 'Escape') {
          noteEl.textContent = current;
        }
      });
      input.addEventListener('blur', () => {
        noteEl.textContent = current;
      });
      return;
    }

    vscode.postMessage({ command: action, id });
  });
</script>
</body>
</html>`;
}
