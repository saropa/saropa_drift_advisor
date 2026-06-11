/**
 * CSS rules for the Visual Query Builder webview. Split out of
 * query-builder-html.ts so the markup file stays focused on structure.
 */
export function getQueryBuilderCss(): string {
  return `
  body { margin: 0; font-family: var(--vscode-font-family); color: var(--vscode-foreground); background: var(--vscode-editor-background); }
  .root { display: grid; grid-template-columns: 280px 1fr; height: 100vh; }
  .left { border-right: 1px solid var(--vscode-widget-border); padding: 10px; overflow: auto; }
  .right { padding: 10px; overflow: auto; }
  h3 { margin: 8px 0; font-size: 12px; text-transform: uppercase; opacity: 0.9; }
  select, input, button { font: inherit; font-size: 12px; }
  select, input { width: 100%; box-sizing: border-box; margin-bottom: 6px; background: var(--vscode-input-background); color: var(--vscode-input-foreground); border: 1px solid var(--vscode-input-border); padding: 4px 6px; }
  button { background: var(--vscode-button-background); color: var(--vscode-button-foreground); border: none; padding: 5px 8px; border-radius: 2px; cursor: pointer; margin-right: 6px; }
  button.secondary { background: var(--vscode-button-secondaryBackground); color: var(--vscode-button-secondaryForeground); }
  .table-card { border: 1px solid var(--vscode-widget-border); border-radius: 4px; margin-bottom: 8px; padding: 6px; }
  .table-title { display: flex; justify-content: space-between; align-items: center; font-weight: 600; }
  .cols { max-height: 140px; overflow: auto; margin-top: 4px; padding-top: 4px; border-top: 1px solid var(--vscode-widget-border); }
  .col { display: flex; align-items: center; gap: 6px; font-size: 12px; margin: 2px 0; }
  .row { display: grid; grid-template-columns: 1fr 1fr 1fr auto; gap: 6px; margin-bottom: 6px; align-items: center; }
  .sql { background: var(--vscode-textCodeBlock-background); border: 1px solid var(--vscode-widget-border); border-radius: 4px; padding: 8px; white-space: pre-wrap; font-family: var(--vscode-editor-font-family); font-size: 12px; min-height: 120px; }
  .results { margin-top: 10px; border: 1px solid var(--vscode-widget-border); border-radius: 4px; overflow: auto; max-height: 260px; }
  table { width: 100%; border-collapse: collapse; font-size: 12px; }
  th, td { border-bottom: 1px solid var(--vscode-widget-border); padding: 4px 6px; text-align: left; }
  .error { color: var(--vscode-errorForeground); margin-top: 6px; }
  .muted { opacity: 0.75; font-size: 11px; }
`;
}
