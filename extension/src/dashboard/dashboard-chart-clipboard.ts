/**
 * Chart-to-clipboard JS logic for the dashboard webview.
 * Extracted from dashboard-scripts to keep files under 300 lines.
 */

/**
 * Returns the inline JS defining copyChartToClipboard, showCopyFeedback,
 * and showCopyError functions for the dashboard webview script.
 */
export function getChartClipboardJs(): string {
  return `
/**
 * Copy a widget's chart SVG to the clipboard as a PNG image.
 * Serializes the SVG, renders it onto an offscreen canvas, then writes
 * the resulting PNG blob via the Clipboard API.
 */
function copyChartToClipboard(widgetEl) {
  const body = widgetEl.querySelector('.widget-body');
  if (!body) return;
  const svgEl = body.querySelector('svg.chart-svg');
  if (!svgEl) return;

  // Clone the SVG and inline computed styles for proper rendering
  const clone = svgEl.cloneNode(true);
  const computed = getComputedStyle(document.documentElement);
  // Resolve CSS variables used in chart fills/strokes
  const cssVars = [
    '--vscode-charts-blue', '--vscode-charts-green', '--vscode-charts-yellow',
    '--vscode-charts-orange', '--vscode-charts-red', '--vscode-charts-purple',
    '--vscode-foreground', '--vscode-editor-background'
  ];
  let inlineStyle = '';
  cssVars.forEach(function(v) {
    const val = computed.getPropertyValue(v).trim();
    if (val) inlineStyle += v + ':' + val + ';';
  });
  clone.setAttribute('style', (clone.getAttribute('style') || '') + ';' + inlineStyle);

  const serializer = new XMLSerializer();
  const svgStr = serializer.serializeToString(clone);
  const svgBlob = new Blob([svgStr], { type: 'image/svg+xml;charset=utf-8' });
  const url = URL.createObjectURL(svgBlob);

  const img = new Image();
  img.onload = function() {
    // Render at 2x for crisp output
    const scale = 2;
    const canvas = document.createElement('canvas');
    canvas.width = img.naturalWidth * scale;
    canvas.height = img.naturalHeight * scale;
    const ctx = canvas.getContext('2d');
    // Fill with editor background for contrast
    const bg = computed.getPropertyValue('--vscode-editor-background').trim() || '#1e1e1e';
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.scale(scale, scale);
    ctx.drawImage(img, 0, 0);
    canvas.toBlob(function(blob) {
      if (!blob) return;
      if (navigator.clipboard && navigator.clipboard.write) {
        navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })])
          .then(function() { showCopyFeedback(widgetEl); })
          .catch(function() { showCopyError(widgetEl); });
      } else {
        // Clipboard API unavailable — fall back to SVG text copy
        navigator.clipboard.writeText(svgStr)
          .then(function() { showCopyFeedback(widgetEl); })
          .catch(function() { showCopyError(widgetEl); });
      }
    }, 'image/png');
    URL.revokeObjectURL(url);
  };
  img.src = url;
}

/** Brief "Copied!" feedback on the widget header. */
function showCopyFeedback(widgetEl) {
  const btn = widgetEl.querySelector('.widget-copy-chart');
  if (!btn) return;
  const original = btn.textContent;
  btn.textContent = '\\u2713';
  setTimeout(function() { btn.textContent = original; }, 1200);
}

/** Brief error feedback when clipboard write fails. */
function showCopyError(widgetEl) {
  const btn = widgetEl.querySelector('.widget-copy-chart');
  if (!btn) return;
  const original = btn.textContent;
  btn.textContent = '\\u2717';
  btn.title = 'Copy failed — clipboard may not be available';
  setTimeout(function() { btn.textContent = original; btn.title = 'Copy chart to clipboard'; }, 2000);
}
`;
}
