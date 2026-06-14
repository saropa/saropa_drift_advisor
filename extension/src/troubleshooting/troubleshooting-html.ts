/**
 * Builds the HTML content for the Troubleshooting webview panel.
 * Provides detailed setup and connection guidance with rich formatting,
 * collapsible sections, and direct links to extension commands.
 */

import { TROUBLESHOOTING_STYLES } from './troubleshooting-styles';
import { t } from '../l10n';

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

<h1>${t('panel.tools.trouble.title')}</h1>
<div class="subtitle">${t('panel.tools.trouble.subtitle')}</div>

<!-- Quick Setup Checklist -->
<div class="section">
  <div class="section-title"><span class="icon">&#9745;</span> ${t('panel.tools.trouble.checklist.title')}</div>
  <ul class="checklist">
    <li><code>saropa_drift_advisor</code> ${t('panel.tools.trouble.checklist.pubspec')}</li>
    <li>${t('panel.tools.trouble.checklist.startup')}</li>
    <li>${t('panel.tools.trouble.checklist.debug')}</li>
    <li>${t('panel.tools.trouble.checklist.port', esc(port))}</li>
    <li>${t('panel.tools.trouble.checklist.firewall')}</li>
  </ul>
</div>

<!-- How Connection Works -->
<div class="section">
  <div class="section-title"><span class="icon">&#128268;</span> ${t('panel.tools.trouble.connects.title')}</div>
  <div class="diagram">┌─────────────────┐      VM Service       ┌──────────────────────┐
│   VS Code        │ ◄──── (debug mode) ──► │  Your Flutter App     │
│   Extension      │                         │                       │
│                  │      HTTP :${esc(port)}         │  DriftDebugServer    │
│                  │ ◄──── (fallback) ─────► │  .start()             │
└─────────────────┘                         └──────────────────────┘</div>
  <p>${t('panel.tools.trouble.connects.intro')}</p>
  <div class="step">
    <span class="step-number">1</span>
    ${t('panel.tools.trouble.connects.vm')}
  </div>
  <div class="step">
    <span class="step-number">2</span>
    ${t('panel.tools.trouble.connects.http', esc(port), esc(port + 7))}
  </div>
</div>

<!-- Flutter/Dart Debugging -->
<div class="section">
  <div class="section-title"><span class="icon">&#128030;</span> ${t('panel.tools.trouble.flutter.title')}</div>
  <p>${t('panel.tools.trouble.flutter.intro')}</p>
  <div class="tip">
    ${t('panel.tools.trouble.flutter.tip')}
  </div>
  <p>${t('panel.tools.trouble.flutter.stillDisconnected')}</p>
  <ul>
    <li>${t('panel.tools.trouble.flutter.li.start')}</li>
    <li>${t('panel.tools.trouble.flutter.li.verify')}</li>
    <li>${t('panel.tools.trouble.flutter.li.output')}</li>
  </ul>
</div>

<!-- Android Emulator -->
<div class="section">
  <div class="section-title"><span class="icon">&#128241;</span> ${t('panel.tools.trouble.android.title')}</div>
  <p>${t('panel.tools.trouble.android.intro')}</p>
  <pre><code>adb forward tcp:${esc(port)} tcp:${esc(port)}</code></pre>
  <div class="warning">
    ${t('panel.tools.trouble.android.note')}
  </div>
  <details>
    <summary>${t('panel.tools.trouble.android.customSummary')}</summary>
    <p>${t('panel.tools.trouble.android.customBody', esc(port))}</p>
    <pre><code>adb forward tcp:YOUR_PORT tcp:YOUR_PORT</code></pre>
  </details>
</div>

<!-- Common Issues -->
<div class="section">
  <div class="section-title"><span class="icon">&#9888;</span> ${t('panel.tools.trouble.issues.title')}</div>

  <details>
    <summary>${t('panel.tools.trouble.issues.noConnect.summary')}</summary>
    <ul>
      <li>${t('panel.tools.trouble.issues.noConnect.li.match', esc(port))}</li>
      <li>${t('panel.tools.trouble.issues.noConnect.li.adb')}</li>
      <li>${t('panel.tools.trouble.issues.noConnect.li.inUse', esc(port))} <code>lsof -i :${esc(port)}</code> (macOS/Linux)
        or <code>netstat -ano | findstr :${esc(port)}</code> (Windows)</li>
    </ul>
  </details>

  <details>
    <summary>${t('panel.tools.trouble.issues.notFound.summary')}</summary>
    <ul>
      <li>${t('panel.tools.trouble.issues.notFound.li.start')}</li>
      <li>${t('panel.tools.trouble.issues.notFound.li.notReady')}</li>
      <li>${t('panel.tools.trouble.issues.notFound.li.vm')}</li>
    </ul>
  </details>

  <details>
    <summary>${t('panel.tools.trouble.issues.drops.summary')}</summary>
    <ul>
      <li>${t('panel.tools.trouble.issues.drops.li.isolate')}</li>
      <li>${t('panel.tools.trouble.issues.drops.li.adb')}</li>
      <li>${t('panel.tools.trouble.issues.drops.li.output')}</li>
    </ul>
  </details>

  <details>
    <summary>${t('panel.tools.trouble.issues.firewall.summary')}</summary>
    <ul>
      <li>${t('panel.tools.trouble.issues.firewall.li.allow', `<code>127.0.0.1:${esc(port)}</code>`)}</li>
      <li>${t('panel.tools.trouble.issues.firewall.li.vpn')}</li>
      <li>${t('panel.tools.trouble.issues.firewall.li.defender')}</li>
    </ul>
  </details>

</div>

<!-- Quick Actions -->
<div class="actions">
  <button class="btn" data-action="retryConnection">${t('panel.tools.trouble.btn.retry')}</button>
  <button class="btn" data-action="forwardPort">${t('panel.tools.trouble.btn.forward')}</button>
  <button class="btn btn-secondary" data-action="selectServer">${t('panel.tools.trouble.btn.select')}</button>
  <button class="btn btn-secondary" data-action="openOutput">${t('panel.tools.trouble.btn.output')}</button>
  <button class="btn btn-secondary" data-action="openSettings">${t('panel.tools.trouble.btn.settings')}</button>
</div>

<script nonce="__CSP_NONCE__">
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
