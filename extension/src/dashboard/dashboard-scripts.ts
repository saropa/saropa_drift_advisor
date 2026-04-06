/**
 * Dashboard webview client script (injected into dashboard HTML).
 * Extracted from dashboard-html for modularization (plan: under 300 lines per file).
 */

/**
 * Returns the inline script body. Caller must interpolate widgetTypesJson and layoutJson
 * (JSON strings) into the returned template where indicated.
 */
export function getDashboardJs(widgetTypesJson: string, layoutJson: string): string {
  return `
const vscode = acquireVsCodeApi();
const widgetTypes = ${widgetTypesJson};
let layout = ${layoutJson};
let draggingId = null;
let configWidgetId = null;
let configWidgetType = null;

// Render widget picker
const picker = document.getElementById('widgetPicker');
picker.innerHTML = widgetTypes.map(wt => 
  '<div class="widget-type-card" data-type="' + wt.type + '">' +
    '<div class="widget-type-icon">' + wt.icon + '</div>' +
    '<div class="widget-type-label">' + wt.label + '</div>' +
    '<div class="widget-type-desc">' + wt.description + '</div>' +
  '</div>'
).join('');

// Event handlers
document.getElementById('addWidgetBtn').onclick = () => {
  document.getElementById('addWidgetModal').classList.add('active');
};
document.getElementById('closeAddModal').onclick = () => {
  document.getElementById('addWidgetModal').classList.remove('active');
};
document.getElementById('layoutBtn').onclick = () => {
  document.getElementById('layoutModal').classList.add('active');
};
document.getElementById('closeLayoutModal').onclick = () => {
  document.getElementById('layoutModal').classList.remove('active');
};
document.getElementById('refreshBtn').onclick = () => {
  document.querySelectorAll('.widget-body').forEach(b => b.classList.add('refreshing'));
  vscode.postMessage({ command: 'refreshAll' });
};
document.getElementById('saveLayoutBtn').onclick = () => {
  const name = document.getElementById('layoutNameInput').value.trim();
  if (name) {
    vscode.postMessage({ command: 'saveLayout', name });
    document.getElementById('layoutModal').classList.remove('active');
  }
};

// Widget type selection
picker.onclick = (e) => {
  const card = e.target.closest('.widget-type-card');
  if (card) {
    const type = card.dataset.type;
    document.getElementById('addWidgetModal').classList.remove('active');
    showConfigModal(type, null, {});
  }
};

// Config modal handlers
document.getElementById('closeConfigModal').onclick = () => {
  document.getElementById('configModal').classList.remove('active');
};
document.getElementById('cancelConfigBtn').onclick = () => {
  document.getElementById('configModal').classList.remove('active');
};
document.getElementById('configForm').onsubmit = (e) => {
  e.preventDefault();
  const formData = new FormData(e.target);
  const config = {};
  for (const [key, value] of formData) {
    config[key] = value;
  }
  if (configWidgetId) {
    vscode.postMessage({ command: 'editWidget', id: configWidgetId, config });
  } else {
    vscode.postMessage({ command: 'addWidget', type: configWidgetType, config });
  }
  document.getElementById('configModal').classList.remove('active');
};

function showConfigModal(type, widgetId, existingConfig) {
  const wt = widgetTypes.find(w => w.type === type);
  configWidgetId = widgetId;
  configWidgetType = type;
  
  document.getElementById('configModalTitle').textContent = widgetId ? 'Edit Widget' : 'Configure ' + (wt ? wt.label : type);
  
  // Request config schema from extension
  vscode.postMessage({ command: 'getConfigSchema', type, existingConfig });
}

// Grid events
const grid = document.getElementById('grid');

grid.addEventListener('dragstart', (e) => {
  const widget = e.target.closest('.widget');
  if (widget) {
    draggingId = widget.dataset.id;
    widget.classList.add('dragging');
  }
});

grid.addEventListener('dragend', (e) => {
  const widget = e.target.closest('.widget');
  if (widget) {
    widget.classList.remove('dragging');
  }
  draggingId = null;
  document.querySelectorAll('.widget.drag-over').forEach(w => w.classList.remove('drag-over'));
});

grid.addEventListener('dragover', (e) => {
  e.preventDefault();
  const widget = e.target.closest('.widget');
  if (widget && widget.dataset.id !== draggingId) {
    document.querySelectorAll('.widget.drag-over').forEach(w => w.classList.remove('drag-over'));
    widget.classList.add('drag-over');
  }
});

grid.addEventListener('drop', (e) => {
  e.preventDefault();
  const widget = e.target.closest('.widget');
  if (widget && draggingId && widget.dataset.id !== draggingId) {
    vscode.postMessage({ command: 'swapWidgets', idA: draggingId, idB: widget.dataset.id });
  }
  document.querySelectorAll('.widget.drag-over').forEach(w => w.classList.remove('drag-over'));
});

// Widget action buttons
grid.addEventListener('click', (e) => {
  const widget = e.target.closest('.widget');
  if (!widget) return;
  
  if (e.target.closest('.widget-remove')) {
    widget.style.opacity = '0.5';
    widget.style.transform = 'scale(0.95)';
    vscode.postMessage({ command: 'removeWidget', id: widget.dataset.id });
  } else if (e.target.closest('.widget-edit')) {
    const w = layout.widgets.find(w => w.id === widget.dataset.id);
    if (w) showConfigModal(w.type, w.id, w.config);
  } else if (e.target.closest('.widget-copy-chart')) {
    // Copy the chart SVG as a PNG image to the clipboard
    copyChartToClipboard(widget);
  } else if (e.target.closest('.widget-refresh')) {
    const body = document.getElementById('body-' + widget.dataset.id);
    if (body) body.classList.add('refreshing');
    vscode.postMessage({ command: 'refreshWidget', id: widget.dataset.id });
  }
});

// Handle messages from extension
window.addEventListener('message', (event) => {
  const msg = event.data;
  switch (msg.command) {
    case 'updateWidget': {
      const body = document.getElementById('body-' + msg.id);
      if (body) {
        body.classList.remove('refreshing');
        body.innerHTML = msg.html;
      }
      break;
    }
    case 'updateAll': {
      for (const update of msg.updates) {
        const body = document.getElementById('body-' + update.id);
        if (body) {
          body.classList.remove('refreshing');
          body.innerHTML = update.html;
        }
      }
      break;
    }
    case 'layoutChanged': {
      layout = msg.layout;
      // Full re-render needed for structural changes
      location.reload();
      break;
    }
    case 'showConfigForm': {
      renderConfigForm(msg.schema, msg.existingConfig, msg.tables);
      document.getElementById('configModal').classList.add('active');
      break;
    }
    case 'showError': {
      console.error(msg.message);
      break;
    }
  }
});

function renderConfigForm(schema, existingConfig, tables) {
  const fields = document.getElementById('configFields');
  fields.innerHTML = schema.map(field => {
    const value = existingConfig[field.key] !== undefined ? existingConfig[field.key] : (field.default || '');
    let input = '';
    if (field.type === 'tableSelect') {
      input = '<select name="' + field.key + '">' +
        tables.map(t => '<option value="' + t + '"' + (value === t ? ' selected' : '') + '>' + t + '</option>').join('') +
        '</select>';
    } else if (field.type === 'select') {
      input = '<select name="' + field.key + '">' +
        (field.options || []).map(o => '<option value="' + o + '"' + (value === o ? ' selected' : '') + '>' + o + '</option>').join('') +
        '</select>';
    } else if (field.type === 'number') {
      input = '<input type="number" name="' + field.key + '" value="' + value + '">';
    } else if (field.type === 'checkbox') {
      input = '<input type="checkbox" name="' + field.key + '"' + (value ? ' checked' : '') + '>';
    } else {
      const isLong = field.key === 'sql' || field.key === 'text';
      if (isLong) {
        input = '<textarea name="' + field.key + '">' + escapeHtml(String(value)) + '</textarea>';
      } else {
        input = '<input type="text" name="' + field.key + '" value="' + escapeHtml(String(value)) + '">';
      }
    }
    return '<div class="form-group"><label>' + field.label + (field.required ? ' *' : '') + '</label>' + input + '</div>';
  }).join('');
}

function escapeHtml(s) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

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
