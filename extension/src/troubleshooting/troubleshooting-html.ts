/**
 * Builds the HTML content for the Troubleshooting webview panel.
 * Provides detailed setup and connection guidance with rich formatting,
 * collapsible sections, and direct links to extension commands.
 */

import { TROUBLESHOOTING_STYLES } from './troubleshooting-styles';

/** Escape HTML special characters to prevent injection. */
function esc(value: unknown): string {
  const s = value === null || value === undefined ? '' : String(value);
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** Build the full troubleshooting HTML page. */
export function buildTroubleshootingHtml(port: number): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<style>${TROUBLESHOOTING_STYLES}
</style>
</head>
<body>

<h1>Troubleshooting</h1>
<div class="subtitle">Saropa Drift Advisor — connection and setup help</div>

<!-- Quick Setup Checklist -->
<div class="section">
  <div class="section-title"><span class="icon">&#9745;</span> Quick Checklist</div>
  <ul class="checklist">
    <li><code>saropa_drift_advisor</code> is in your pubspec.yaml <code>dependencies</code></li>
    <li>Your app calls <code>DriftDebugServer.start()</code> at startup</li>
    <li>Your app is running in debug mode</li>
    <li>Server port (default: ${esc(port)}) matches your configuration</li>
    <li>No firewall is blocking localhost connections</li>
  </ul>
</div>

<!-- How Connection Works -->
<div class="section">
  <div class="section-title"><span class="icon">&#128268;</span> How the Extension Connects</div>
  <div class="diagram">┌─────────────────┐      VM Service       ┌──────────────────────┐
│   VS Code        │ ◄──── (debug mode) ──► │  Your Flutter App     │
│   Extension      │                         │                       │
│                  │      HTTP :${esc(port)}         │  DriftDebugServer    │
│                  │ ◄──── (fallback) ─────► │  .start()             │
└─────────────────┘                         └──────────────────────┘</div>
  <p>The extension uses two connection methods:</p>
  <div class="step">
    <span class="step-number">1</span>
    <strong>VM Service (preferred)</strong> — When you start a Flutter/Dart debug session,
    the extension connects automatically via VM Service. No port forwarding needed.
  </div>
  <div class="step">
    <span class="step-number">2</span>
    <strong>HTTP discovery</strong> — Falls back to scanning ports ${esc(port)}&ndash;${esc(port + 7)}
    on localhost for a running Drift debug server.
  </div>
</div>

<!-- Flutter/Dart Debugging -->
<div class="section">
  <div class="section-title"><span class="icon">&#128030;</span> Flutter / Dart Debugging</div>
  <p>Start your app in debug mode (F5 or <code>flutter run</code>). The extension auto-discovers
  the Drift debug server through the VM Service connection.</p>
  <div class="tip">
    <strong>TIP:</strong> Check <strong>Output</strong> &rarr; <strong>Saropa Drift Advisor</strong>
    for detailed connection logs and error messages.
  </div>
  <p>If you are still disconnected:</p>
  <ul>
    <li>Ensure your app calls <code>DriftDebugServer.start()</code> before the connection attempt</li>
    <li>Verify the server starts successfully in your app's console output</li>
    <li>Check the Output panel for specific error messages</li>
  </ul>
</div>

<!-- Android Emulator -->
<div class="section">
  <div class="section-title"><span class="icon">&#128241;</span> Android Emulator (HTTP)</div>
  <p>The emulator runs in a separate network namespace. The extension automatically
  tries <code>adb forward</code> when a debug session starts, but you can also do it manually:</p>
  <pre><code>adb forward tcp:${esc(port)} tcp:${esc(port)}</code></pre>
  <div class="warning">
    <strong>NOTE:</strong> After running <code>adb forward</code>, click
    <strong>Retry Connection</strong> below to re-scan for the server.
  </div>
  <details>
    <summary>Using a non-default port?</summary>
    <p>If your server uses a custom port, replace ${esc(port)} with your port number
    and update the <code>driftViewer.port</code> setting in VS Code.</p>
    <pre><code>adb forward tcp:YOUR_PORT tcp:YOUR_PORT</code></pre>
  </details>
</div>

<!-- Common Issues -->
<div class="section">
  <div class="section-title"><span class="icon">&#9888;</span> Common Issues</div>

  <details>
    <summary>Server starts but extension does not connect</summary>
    <ul>
      <li>Check that the port in your app matches <code>driftViewer.port</code> (default: ${esc(port)})</li>
      <li>On Android emulators, you need <code>adb forward</code> (see above)</li>
      <li>Verify no other process is using port ${esc(port)}: <code>lsof -i :${esc(port)}</code> (macOS/Linux)
        or <code>netstat -ano | findstr :${esc(port)}</code> (Windows)</li>
    </ul>
  </details>

  <details>
    <summary>Extension shows "No Drift debug servers found"</summary>
    <ul>
      <li>Your app must call <code>DriftDebugServer.start()</code> — check that line executes</li>
      <li>The server may not be ready yet; try <strong>Retry Connection</strong> after a few seconds</li>
      <li>If using VM Service, ensure you launched via VS Code debugger (F5), not <code>flutter run</code> in terminal</li>
    </ul>
  </details>

  <details>
    <summary>Connection drops intermittently</summary>
    <ul>
      <li>Hot restart creates a new isolate — the extension should reconnect automatically</li>
      <li>If using HTTP mode, check that <code>adb forward</code> is still active</li>
      <li>Check the Output panel for reconnection logs</li>
    </ul>
  </details>

  <details>
    <summary>Firewall or antivirus blocking connections</summary>
    <ul>
      <li>Allow connections to <code>127.0.0.1:${esc(port)}</code></li>
      <li>Some corporate VPNs block localhost traffic — try disconnecting</li>
      <li>Windows Defender Firewall: allow the <code>dart</code> / <code>flutter</code> process</li>
    </ul>
  </details>
</div>

<!-- Quick Actions -->
<div class="actions">
  <button class="btn" data-action="retryConnection">Retry Connection</button>
  <button class="btn" data-action="forwardPort">Forward Port (Android Emulator)</button>
  <button class="btn btn-secondary" data-action="selectServer">Select Server</button>
  <button class="btn btn-secondary" data-action="openOutput">Open Output Log</button>
  <button class="btn btn-secondary" data-action="openSettings">Open Settings</button>
</div>

<script>
  // Acquire the VS Code API for posting messages back to the extension
  const vscode = acquireVsCodeApi();
  document.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-action]');
    if (!btn) return;
    vscode.postMessage({ command: btn.dataset.action });
  });
</script>

</body>
</html>`;
}
