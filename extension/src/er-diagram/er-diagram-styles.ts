/**
 * ER Diagram webview styles.
 * Extracted from er-diagram-html for modularization (plan: under 300 lines per file).
 */

export function getErDiagramCss(): string {
  return `
  * { box-sizing: border-box; }
  body {
    font-family: var(--vscode-font-family);
    color: var(--vscode-foreground);
    background: var(--vscode-editor-background);
    margin: 0;
    padding: 0;
    overflow: hidden;
  }
  .toolbar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 8px 16px;
    border-bottom: 1px solid var(--vscode-widget-border);
    background: var(--vscode-editor-background);
  }
  .toolbar-title {
    font-size: 14px;
    font-weight: bold;
  }
  .toolbar-group {
    display: flex;
    gap: 6px;
    align-items: center;
  }
  .btn {
    padding: 4px 10px;
    border: 1px solid var(--vscode-button-border, var(--vscode-widget-border));
    background: var(--vscode-button-secondaryBackground, var(--vscode-editor-background));
    color: var(--vscode-button-secondaryForeground, var(--vscode-foreground));
    border-radius: 3px;
    cursor: pointer;
    font-size: 12px;
    display: inline-flex;
    align-items: center;
    gap: 4px;
  }
  .btn:hover { background: var(--vscode-button-secondaryHoverBackground, var(--vscode-list-hoverBackground)); }
  .btn.active {
    background: var(--vscode-button-background);
    color: var(--vscode-button-foreground);
    border-color: var(--vscode-button-background);
  }
  select {
    padding: 4px 8px;
    border: 1px solid var(--vscode-widget-border);
    background: var(--vscode-dropdown-background);
    color: var(--vscode-dropdown-foreground);
    border-radius: 3px;
    font-size: 12px;
  }
  .canvas-container {
    width: 100%;
    height: calc(100vh - 50px);
    overflow: hidden;
    cursor: grab;
  }
  .canvas-container.dragging { cursor: grabbing; }
  svg {
    display: block;
  }
  .er-node {
    cursor: move;
  }
  .er-node rect {
    fill: var(--vscode-editor-background);
    stroke: var(--vscode-widget-border);
    stroke-width: 1;
    transition: stroke 0.15s ease, stroke-width 0.15s ease;
  }
  .er-node:hover rect {
    stroke: var(--vscode-focusBorder);
    stroke-width: 2;
  }
  .er-node.selected rect {
    stroke: var(--vscode-button-background);
    stroke-width: 2;
  }
  .loading-overlay {
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background: var(--vscode-editor-background);
    opacity: 0.8;
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 100;
  }
  .loading-overlay.hidden { display: none; }
  .spinner {
    width: 32px;
    height: 32px;
    border: 3px solid var(--vscode-widget-border);
    border-top-color: var(--vscode-button-background);
    border-radius: 50%;
    animation: spin 0.8s linear infinite;
  }
  @keyframes spin {
    to { transform: rotate(360deg); }
  }
  .er-table-name {
    fill: var(--vscode-foreground);
    font-family: var(--vscode-font-family);
    font-size: 12px;
    font-weight: bold;
  }
  .er-column {
    fill: var(--vscode-descriptionForeground);
    font-family: var(--vscode-editor-font-family, monospace);
    font-size: 10px;
  }
  .er-column.pk { fill: #fbbf24; }
  .er-column.fk { fill: #60a5fa; }
  .er-edge {
    fill: none;
    stroke: var(--vscode-editorLineNumber-foreground);
    stroke-width: 1.5;
    transition: stroke 0.15s;
  }
  .er-edge:hover, .er-edge.highlight {
    stroke: var(--vscode-focusBorder);
    stroke-width: 2;
  }
  .context-menu {
    position: absolute;
    background: var(--vscode-menu-background);
    border: 1px solid var(--vscode-menu-border);
    border-radius: 4px;
    box-shadow: 0 4px 12px rgba(0,0,0,0.3);
    min-width: 140px;
    z-index: 1000;
    display: none;
  }
  .context-menu.visible { display: block; }
  .context-menu-item {
    padding: 6px 12px;
    font-size: 12px;
    cursor: pointer;
  }
  .context-menu-item:hover {
    background: var(--vscode-menu-selectionBackground);
    color: var(--vscode-menu-selectionForeground);
  }
`;
}
