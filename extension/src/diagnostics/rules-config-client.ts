/**
 * Client-side script for the Drift Advisor Rules configuration webview.
 * Extracted from rules-config-html to keep the builder under the line cap; the
 * HTML builder inlines this string inside its nonce-guarded `<script>` element.
 *
 * Wires the rule checkboxes, severity dropdowns, toolbar buttons, and the live
 * search filter back to the host via `postMessage`. The host owns the data
 * model: every change posts a command and the host re-renders, so the rendered
 * control state always reflects persisted config rather than local edits.
 */
export const RULES_CONFIG_CLIENT_SCRIPT = `
  const vscode = acquireVsCodeApi();

  // Enable/disable checkbox → toggleRule. The host writes disabledRules and
  // re-renders, so the checked state always reflects persisted config.
  document.addEventListener('change', (e) => {
    const toggle = e.target.closest('.rule-toggle');
    if (toggle) {
      vscode.postMessage({
        command: 'toggleRule',
        code: toggle.dataset.code,
        disabled: !toggle.checked,
      });
      return;
    }
    const sev = e.target.closest('.sev-select');
    if (sev) {
      vscode.postMessage({
        command: 'setSeverity',
        code: sev.dataset.code,
        severity: sev.value,
      });
    }
  });

  // Toolbar buttons.
  document.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-action]');
    if (btn) {
      vscode.postMessage({ command: btn.dataset.action });
    }
  });

  // Client-side filter: hide non-matching rows and any category left with no
  // visible rows, then toggle the empty-state notice.
  const search = document.getElementById('search');
  const emptyState = document.getElementById('emptyState');
  search.addEventListener('input', () => {
    const q = search.value.trim().toLowerCase();
    let anyVisible = false;
    document.querySelectorAll('.category').forEach((cat) => {
      let catVisible = false;
      cat.querySelectorAll('.rule-row').forEach((row) => {
        const match = !q || row.dataset.text.indexOf(q) !== -1;
        row.classList.toggle('hidden', !match);
        if (match) catVisible = true;
      });
      cat.classList.toggle('hidden', !catVisible);
      if (catVisible) anyVisible = true;
    });
    emptyState.classList.toggle('hidden', anyVisible);
  });
`;
