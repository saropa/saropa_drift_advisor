/**
 * Webview shell for the Time-Travel Data Slider (Feature 60, Phase 3).
 *
 * The HTML is a static scaffold; all data arrives via `postMessage` from the panel:
 *   - `tables`       — populate the table picker
 *   - `snapshotInfo` — slider range + tick timestamps
 *   - `state`        — the current frame (rows + diff classification) to render
 *
 * The slider, table picker, and play/pause controls post `seekTo` / `setTable` / `play` /
 * `pause` / `setSpeed` back to the panel. Playback is a client-side timer that advances the
 * slider and asks the panel for each successive frame, so the heavy diff stays extension-side.
 */

import { t, getWebviewL10nMap } from '../l10n';

/** Build the self-contained interactive HTML for the time-travel panel. */
export function buildTimeTravelHtml(): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<style>
  body {
    font-family: var(--vscode-font-family, sans-serif);
    color: var(--vscode-editor-foreground, #ccc);
    background: var(--vscode-editor-background, #1e1e1e);
    padding: 12px;
    line-height: 1.4;
  }
  .controls {
    position: sticky;
    top: 0;
    background: var(--vscode-editor-background, #1e1e1e);
    padding-bottom: 8px;
    border-bottom: 1px solid var(--vscode-panel-border, #444);
    margin-bottom: 8px;
  }
  .row { display: flex; align-items: center; gap: 8px; margin: 4px 0; }
  button {
    background: var(--vscode-button-background, #0e639c);
    color: var(--vscode-button-foreground, #fff);
    border: none;
    padding: 4px 10px;
    border-radius: 3px;
    cursor: pointer;
  }
  button:disabled { opacity: 0.4; cursor: default; }
  select {
    background: var(--vscode-dropdown-background, #3c3c3c);
    color: var(--vscode-dropdown-foreground, #ccc);
    border: 1px solid var(--vscode-dropdown-border, #555);
    padding: 3px 6px;
  }
  input[type=range] { flex: 1; }
  .meta { font-size: 12px; opacity: 0.8; }
  .summary .added { color: #28a745; }
  .summary .removed { color: #dc3545; }
  .summary .changed { color: #d6a92b; }
  table { border-collapse: collapse; width: 100%; margin-top: 8px; font-size: 13px; }
  th, td { border: 1px solid var(--vscode-panel-border, #444); padding: 4px 8px; text-align: left; }
  th { background: var(--vscode-editor-inactiveSelectionBackground, #333); font-weight: 600; }
  tr.added td { background: rgba(40, 167, 69, 0.15); border-left: 3px solid #28a745; }
  tr.removed td { background: rgba(220, 53, 69, 0.15); border-left: 3px solid #dc3545; text-decoration: line-through; opacity: 0.8; }
  tr.changed td { background: rgba(255, 193, 7, 0.06); }
  td.cell-changed { background: rgba(255, 193, 7, 0.25); font-weight: 600; }
  .empty { font-style: italic; opacity: 0.6; margin-top: 12px; }
</style>
</head>
<body>
  <div class="controls">
    <div class="row">
      <label for="tablePicker">${t('panel.replay.timeTravel.table')}</label>
      <select id="tablePicker"></select>
      <label for="speed">${t('panel.replay.timeTravel.speed')}</label>
      <select id="speed">
        <option value="2000">0.5x</option>
        <option value="1000" selected>1x</option>
        <option value="500">2x</option>
        <option value="250">4x</option>
      </select>
    </div>
    <div class="row">
      <button id="prev" title="${t('panel.replay.timeTravel.prev.title')}">&#9664;</button>
      <button id="playPause" title="${t('panel.replay.timeTravel.playPause.title')}">&#9654;</button>
      <button id="next" title="${t('panel.replay.timeTravel.next.title')}">&#9654;|</button>
      <input type="range" id="slider" min="0" max="0" value="0" />
    </div>
    <div class="row meta">
      <span id="position">${t('panel.replay.timeTravel.position.empty')}</span>
      <span id="summary" class="summary"></span>
    </div>
  </div>
  <div id="grid"></div>

  <script>
    const vscode = acquireVsCodeApi();

    // __VT bridge (plan 75 §3.3): the host resolves this panel's keys to the active
    // display language and injects them here, because client-side render functions
    // have no host t(). vt() does the same {0}/{1} substitution as the host runtime,
    // fail-soft to the key. Only this panel's keys are shipped (prefix-filtered).
    const __VT = ${JSON.stringify(getWebviewL10nMap(['panel.replay.timeTravel.']))};
    function vt(key) {
      const args = arguments;
      return (__VT[key] || key).replace(/\\{(\\d+)\\}/g, (m, d) => {
        const i = Number(d) + 1;
        return i < args.length ? args[i] : m;
      });
    }

    const slider = document.getElementById('slider');
    const tablePicker = document.getElementById('tablePicker');
    const speed = document.getElementById('speed');
    const playPause = document.getElementById('playPause');
    const positionEl = document.getElementById('position');
    const summaryEl = document.getElementById('summary');
    const grid = document.getElementById('grid');

    let total = 0;
    let playing = false;
    let timer = null;

    function esc(v) {
      if (v === null || v === undefined) return '';
      return String(v).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    }

    function fmtTime(ts) {
      if (!ts) return '';
      try { return new Date(ts).toLocaleTimeString(); } catch (e) { return String(ts); }
    }

    function stopPlayback() {
      playing = false;
      playPause.innerHTML = '&#9654;';
      if (timer !== null) { clearInterval(timer); timer = null; }
    }

    function startPlayback() {
      if (total <= 1) return;
      playing = true;
      playPause.innerHTML = '&#10074;&#10074;';
      const ms = parseInt(speed.value, 10) || 1000;
      timer = setInterval(() => {
        const next = parseInt(slider.value, 10) + 1;
        if (next >= total) { stopPlayback(); return; }
        slider.value = String(next);
        vscode.postMessage({ command: 'seekTo', index: next });
      }, ms);
    }

    playPause.addEventListener('click', () => { playing ? stopPlayback() : startPlayback(); });
    document.getElementById('prev').addEventListener('click', () => {
      stopPlayback();
      const i = Math.max(0, parseInt(slider.value, 10) - 1);
      slider.value = String(i); vscode.postMessage({ command: 'seekTo', index: i });
    });
    document.getElementById('next').addEventListener('click', () => {
      stopPlayback();
      const i = Math.min(total - 1, parseInt(slider.value, 10) + 1);
      slider.value = String(i); vscode.postMessage({ command: 'seekTo', index: i });
    });
    slider.addEventListener('input', () => {
      stopPlayback();
      vscode.postMessage({ command: 'seekTo', index: parseInt(slider.value, 10) });
    });
    tablePicker.addEventListener('change', () => {
      stopPlayback();
      vscode.postMessage({ command: 'setTable', table: tablePicker.value });
    });

    function renderState(state) {
      const s = state.diffSummary || { added: 0, removed: 0, changed: 0 };
      positionEl.textContent = state.totalSnapshots > 0
        ? vt('panel.replay.timeTravel.position.snapshot', state.snapshotIndex + 1, state.totalSnapshots, fmtTime(state.timestamp))
        : vt('panel.replay.timeTravel.position.none');
      summaryEl.innerHTML = '<span class="added">+' + s.added + '</span> · '
        + '<span class="changed">~' + s.changed + '</span> · '
        + '<span class="removed">-' + s.removed + '</span>';

      if (!state.rows || state.rows.length === 0) {
        grid.innerHTML = '<p class="empty">' + vt('panel.replay.timeTravel.grid.empty', esc(state.table)) + '</p>';
        return;
      }
      const cols = state.columns;
      const head = '<tr>' + cols.map((c) => '<th>' + esc(c) + '</th>').join('') + '</tr>';
      const body = state.rows.map((r) => {
        const cells = cols.map((c) => {
          const changed = r.changedColumns && r.changedColumns.indexOf(c) >= 0;
          return '<td' + (changed ? ' class="cell-changed"' : '') + '>' + esc(r.data[c]) + '</td>';
        }).join('');
        return '<tr class="' + r.status + '">' + cells + '</tr>';
      }).join('');
      grid.innerHTML = '<table>' + head + body + '</table>';
    }

    window.addEventListener('message', (event) => {
      const msg = event.data;
      if (msg.command === 'tables') {
        tablePicker.innerHTML = msg.names.map((n) => '<option value="' + esc(n) + '">' + esc(n) + '</option>').join('');
        if (msg.selected) tablePicker.value = msg.selected;
      } else if (msg.command === 'snapshotInfo') {
        total = msg.count;
        slider.max = String(Math.max(0, msg.count - 1));
        slider.disabled = msg.count <= 1;
      } else if (msg.command === 'state') {
        slider.value = String(msg.state.snapshotIndex);
        renderState(msg.state);
      }
    });

    vscode.postMessage({ command: 'ready' });
  </script>
</body>
</html>`;
}
