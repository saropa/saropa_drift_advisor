/**
 * Builds the HTML content for the Troubleshooting webview panel.
 * Provides detailed setup and connection guidance with rich formatting,
 * collapsible sections, and direct links to extension commands.
 */

import { TROUBLESHOOTING_STYLES } from './troubleshooting-styles';
import { t } from '../l10n';
import { escapeHtml } from '../shared-utils';
import {
  deriveStatus,
  type ConnectionDiagnostics,
} from './connection-diagnostics';

/** Escape HTML special characters to prevent injection. */
const esc = escapeHtml;

/** Renders one key/value row in the live "Current configuration" grid. */
function kvRow(label: string, value: string): string {
  return `<div class="k">${label}</div><div class="v">${value}</div>`;
}

/**
 * Renders one collapsible explainer. [bodyArgs] are passed to the body's `t()`
 * so a value like the configured port can be interpolated by the catalog.
 */
function knowRow(
  summaryKey: string,
  bodyKey: string,
  ...bodyArgs: (string | number)[]
): string {
  return `<details>
    <summary>${t(summaryKey)}</summary>
    <p>${t(bodyKey, ...bodyArgs)}</p>
  </details>`;
}

/**
 * Build the full troubleshooting HTML page from a live diagnostics snapshot.
 * The header reflects the actual connection state and names the next step; the
 * configuration grid shows what the extension is targeting, so the page is a
 * dashboard, not just static help.
 */
export function buildTroubleshootingHtml(diag: ConnectionDiagnostics): string {
  const port = diag.port;
  const status = deriveStatus(diag);

  // Live status banner: tone + title + the single concrete next step derived
  // from the current state and whether a debug session is attached.
  const statusBanner = `<div class="status status-${status.tone}">
  <div class="status-title"><span class="status-dot"></span> ${t(status.titleKey)}</div>
  <div class="status-detail">${t(status.detailKey, esc(port))}</div>
</div>`;

  // Current configuration grid: what the extension is actually targeting right
  // now, so the user can confirm it matches their app without digging in settings.
  const debugLabel = diag.debugSessionActive
    ? t('panel.tools.trouble.state.debug.active')
    : t('panel.tools.trouble.state.debug.none');
  const discoveryLabel = diag.discoveryEnabled
    ? t(
        'panel.tools.trouble.state.discovery.on',
        esc(diag.portRangeStart),
        esc(diag.portRangeEnd),
      )
    : t('panel.tools.trouble.state.discovery.off');
  const offlineLabel = diag.allowOfflineSchema
    ? t('panel.tools.trouble.state.offline.allowed')
    : t('panel.tools.trouble.state.offline.off');
  const configGrid = `<div class="section">
  <div class="section-title"><span class="icon">&#9881;</span> ${t('panel.tools.trouble.state.title')}</div>
  <div class="kv">
    ${kvRow(t('panel.tools.trouble.state.target'), `<code>${esc(diag.host)}:${esc(port)}</code>`)}
    ${kvRow(t('panel.tools.trouble.state.discovery'), discoveryLabel)}
    ${kvRow(t('panel.tools.trouble.state.debug'), debugLabel)}
    ${kvRow(t('panel.tools.trouble.state.offlineCache'), offlineLabel)}
  </div>
</div>`;

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

${statusBanner}

${configGrid}

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

<!-- Good to know -->
<div class="section">
  <div class="section-title"><span class="icon">&#128161;</span> ${t('panel.tools.trouble.know.title')}</div>
  ${knowRow('panel.tools.trouble.know.loopback.summary', 'panel.tools.trouble.know.loopback.body')}
  ${knowRow('panel.tools.trouble.know.offline.summary', 'panel.tools.trouble.know.offline.body')}
  ${knowRow('panel.tools.trouble.know.debugBuild.summary', 'panel.tools.trouble.know.debugBuild.body')}
  ${knowRow('panel.tools.trouble.know.portReroll.summary', 'panel.tools.trouble.know.portReroll.body', esc(port))}
  ${knowRow('panel.tools.trouble.know.hotRestart.summary', 'panel.tools.trouble.know.hotRestart.body')}
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
