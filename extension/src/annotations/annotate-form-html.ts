import type { AnnotationIcon } from './annotation-types';
import { ANNOTATION_ICON_EMOJI } from './annotation-types';

/** Context passed to the form so it knows what entity is being annotated. */
export interface IAnnotateFormContext {
  /** 'table' or 'column' */
  kind: 'table' | 'column';
  /** Table name */
  table: string;
  /** Column name (only when kind === 'column') */
  column?: string;
}

/**
 * Build HTML for the Annotate form webview panel.
 * Collects icon type and note text in one view instead of two sequential prompts.
 */
export function buildAnnotateFormHtml(ctx: IAnnotateFormContext): string {
  const target =
    ctx.kind === 'column'
      ? `${esc(ctx.table)}.${esc(ctx.column ?? '')}`
      : esc(ctx.table);

  // Build radio buttons for each icon type
  const iconOptions: AnnotationIcon[] = [
    'note', 'warning', 'bug', 'star', 'pin', 'todo', 'bookmark',
  ];
  const radios = iconOptions.map((icon, i) => {
    const emoji = ANNOTATION_ICON_EMOJI[icon];
    const checked = i === 0 ? ' checked' : '';
    return `<label class="icon-option">
      <input type="radio" name="icon" value="${icon}"${checked} />
      <span class="icon-label">${emoji} ${esc(icon)}</span>
    </label>`;
  }).join('\n');

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<style>
  body {
    font-family: var(--vscode-font-family);
    color: var(--vscode-foreground);
    background: var(--vscode-editor-background);
    margin: 0;
    padding: 24px;
    max-width: 500px;
  }
  h1 { font-size: 18px; margin: 0 0 4px 0; }
  .target {
    font-size: 13px;
    opacity: 0.7;
    margin-bottom: 20px;
    font-family: var(--vscode-editor-font-family);
  }
  .field { margin-bottom: 16px; }
  .field-label {
    font-size: 12px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    margin-bottom: 8px;
  }
  .icon-grid {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
  }
  .icon-option {
    cursor: pointer;
    display: flex;
    align-items: center;
    gap: 4px;
  }
  .icon-option input[type="radio"] { display: none; }
  .icon-label {
    padding: 4px 10px;
    border: 1px solid var(--vscode-widget-border);
    border-radius: 3px;
    font-size: 12px;
    transition: border-color 0.15s, background 0.15s;
  }
  .icon-option input[type="radio"]:checked + .icon-label {
    border-color: var(--vscode-focusBorder);
    background: var(--vscode-list-activeSelectionBackground);
    color: var(--vscode-list-activeSelectionForeground);
  }
  .icon-label:hover {
    background: var(--vscode-list-hoverBackground);
  }
  textarea {
    width: 100%;
    min-height: 80px;
    padding: 8px;
    font-family: var(--vscode-font-family);
    font-size: 13px;
    color: var(--vscode-input-foreground);
    background: var(--vscode-input-background);
    border: 1px solid var(--vscode-input-border, var(--vscode-widget-border));
    border-radius: 3px;
    resize: vertical;
    box-sizing: border-box;
  }
  textarea:focus {
    outline: none;
    border-color: var(--vscode-focusBorder);
  }
  .btn-row {
    display: flex;
    gap: 8px;
    margin-top: 20px;
  }
  .btn {
    padding: 6px 16px;
    border: 1px solid var(--vscode-button-border, var(--vscode-widget-border));
    border-radius: 3px;
    cursor: pointer;
    font-size: 13px;
  }
  .btn-primary {
    background: var(--vscode-button-background);
    color: var(--vscode-button-foreground);
  }
  .btn-primary:hover { opacity: 0.9; }
  .btn-secondary {
    background: var(--vscode-button-secondaryBackground, var(--vscode-editor-background));
    color: var(--vscode-button-secondaryForeground, var(--vscode-foreground));
  }
  .btn-secondary:hover {
    background: var(--vscode-button-secondaryHoverBackground, var(--vscode-list-hoverBackground));
  }
</style>
</head>
<body>
<h1>Add Annotation</h1>
<div class="target">${esc(ctx.kind)}: ${target}</div>

<div class="field">
  <div class="field-label">Type</div>
  <div class="icon-grid">
    ${radios}
  </div>
</div>

<div class="field">
  <div class="field-label">Note</div>
  <textarea id="note" placeholder='e.g. "Unused column \u2014 candidate for removal"'></textarea>
</div>

<div class="btn-row">
  <button class="btn btn-primary" id="submit">Add Annotation</button>
  <button class="btn btn-secondary" id="cancel">Cancel</button>
</div>

<script>
  const vscode = acquireVsCodeApi();

  // Focus the note textarea on load
  document.getElementById('note').focus();

  document.getElementById('submit').addEventListener('click', () => {
    const icon = document.querySelector('input[name="icon"]:checked')?.value;
    const note = document.getElementById('note').value.trim();
    if (!note) {
      document.getElementById('note').style.borderColor = '#ef4444';
      return;
    }
    vscode.postMessage({ command: 'submit', icon, note });
  });

  document.getElementById('cancel').addEventListener('click', () => {
    vscode.postMessage({ command: 'cancel' });
  });

  // Allow Ctrl+Enter to submit
  document.getElementById('note').addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
      document.getElementById('submit').click();
    }
  });
</script>
</body>
</html>`;
}

function esc(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
