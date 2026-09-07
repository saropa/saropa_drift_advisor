/**
 * Webview-side script for the sidebar SQL console (plan 84, work package C).
 *
 * Returned as a string and embedded in a nonce-stamped `<script>`, matching how
 * [../sql-notebook/sql-notebook-shell-js.ts](../sql-notebook/sql-notebook-shell-js.ts)
 * ships the notebook's shell. ES5-flavored (`var`, `function`) for the same reason
 * that file is: it is concatenated into HTML rather than compiled by tsc, so it
 * gets none of TypeScript's checking or downleveling.
 *
 * TWO DELIBERATE NON-BEHAVIORS, both load-bearing:
 *
 *  1. It does NOT classify SQL. Every keystroke is debounced 300 ms and shipped to
 *     the extension host as an `input` message; the host runs the one shared
 *     `classifySql()` and pushes a `validation` message back. A second classifier
 *     living here would drift from the first and start disagreeing with the icon
 *     the user sees, so there is exactly one.
 *
 *  2. It does NOT build any user-visible English. Every label, glyph, and result
 *     line arrives already localized — either in the injected `L` blob of chrome
 *     strings (built host-side by sql-console-html.ts) or inside the message that
 *     triggered the render. The script only places received text into the DOM.
 *
 * All text is written with `textContent`, never `innerHTML`: a SQL error message
 * or a column name is untrusted database-adjacent content, and textContent makes
 * an escaping mistake structurally impossible instead of merely unlikely.
 */

/** Milliseconds of keyboard idle before validation is requested (plan 84 §3). */
const VALIDATION_DEBOUNCE_MS = 300;

/**
 * Builds the console's webview script. `l10nJson` is a JSON literal of the
 * localized chrome strings, injected by the HTML builder so this script never
 * carries English of its own.
 */
export function getSqlConsoleJs(l10nJson: string): string {
  return `
  var vscode = acquireVsCodeApi();
  var L = ${l10nJson};

  var input = document.getElementById('sql-input');
  var execBtn = document.getElementById('btn-execute');
  var validation = document.getElementById('validation');
  var confirmBox = document.getElementById('confirm-destructive');
  var output = document.getElementById('output');
  var historySummary = document.getElementById('history-summary');
  var historyList = document.getElementById('history-list');
  var historyClearBtn = document.getElementById('history-clear');
  var historyEmpty = document.getElementById('history-empty');

  // Execute is gated by TWO independent conditions, tracked separately so that
  // finishing a query does not accidentally re-enable a button that validation
  // had disabled (and vice versa).
  var busy = false;
  var executable = false;
  /** Reason text shown as the tooltip while Execute is disabled. */
  var blockedReason = '';
  var debounceTimer = null;

  /** Applies the combined busy + validation gate to the Execute button. */
  function refreshExecuteState() {
    var enabled = executable && !busy;
    execBtn.disabled = !enabled;
    // A disabled control with no explanation is a dead end, so the tooltip
    // always names why: the classifier's reason when blocked, the normal
    // action title when runnable.
    execBtn.title = enabled ? L.executeTitle : (blockedReason || L.executeTitle);
  }

  /** Replaces the output area with a single line of already-localized text. */
  function setOutput(text, cssClass) {
    output.textContent = '';
    var line = document.createElement('div');
    if (cssClass) line.className = cssClass;
    line.textContent = text;
    output.appendChild(line);
    return line;
  }

  /** Appends the server's truncation warning under whatever was just rendered. */
  function appendTruncated(text) {
    var banner = document.createElement('span');
    banner.className = 'out-truncated';
    banner.textContent = text;
    output.appendChild(banner);
  }

  /**
   * Renders the severity strip. The host sends the three-tier severity name
   * ('info' | 'warning' | 'error'), matching diagnostic-config.ts, and the glyph
   * plus accessible label are looked up from the injected blob.
   */
  function renderValidation(msg) {
    if (!msg.severity) { validation.hidden = true; return; }
    validation.hidden = false;
    validation.className = 'sev-' + msg.severity;
    validation.textContent = '';

    var icon = document.createElement('span');
    icon.className = 'sev-icon';
    icon.textContent = L.severityIcon[msg.severity] || '';
    // The glyph carries meaning, so it needs a text equivalent for screen
    // readers; role=img + aria-label is the standard pairing.
    icon.setAttribute('role', 'img');
    icon.setAttribute('aria-label', L.severityLabel[msg.severity] || msg.severity);

    var text = document.createElement('span');
    text.className = 'sev-text';
    text.textContent = msg.reason || '';

    validation.appendChild(icon);
    validation.appendChild(text);
  }

  /** Max display length for a history item before truncation. */
  var HISTORY_TRUNCATE = 60;

  /**
   * Rebuilds the history list from the extension's authoritative array.
   * Most-recent-first order is the extension's responsibility; the webview
   * renders whatever it receives.
   */
  function renderHistory(items) {
    historyList.textContent = '';
    // Update the summary count so the user sees how many entries exist without
    // expanding. The l10n template is not available here — the extension sends
    // the pre-formatted summary label instead (see 'history' message handler).
    historySummary.textContent = items._label || ('History (' + items.length + ')');
    // Toggle clear link and empty-state message.
    historyClearBtn.hidden = items.length === 0;
    historyEmpty.hidden = items.length > 0;

    for (var i = 0; i < items.length; i++) {
      var li = document.createElement('li');
      // Collapse whitespace for display — a multi-line query should still be
      // readable in a single-line list item.
      var display = items[i].replace(/\\s+/g, ' ').trim();
      if (display.length > HISTORY_TRUNCATE) {
        display = display.substring(0, HISTORY_TRUNCATE) + '\\u2026';
      }
      li.textContent = display;
      li.title = items[i];
      // Closure captures the full query text so clicking recalls the whole
      // thing, not the truncated display form.
      li.addEventListener('click', (function (fullSql) {
        return function () {
          input.value = fullSql;
          // Re-trigger validation so the icon strip and Execute button agree
          // with the recalled query immediately.
          clearTimeout(debounceTimer);
          requestValidation();
        };
      })(items[i]));
      historyList.appendChild(li);
    }
  }

  // --- Extension -> webview messages ---
  window.addEventListener('message', function (event) {
    var msg = event.data || {};
    switch (msg.type) {
      case 'validation':
        executable = msg.classification.executable === true;
        blockedReason = executable ? '' : (msg.classification.reason || '');
        renderValidation({
          severity: msg.classification.severity,
          reason: msg.classification.reason
        });
        refreshExecuteState();
        break;
      case 'busy':
        busy = msg.value === true;
        refreshExecuteState();
        if (busy) setOutput(L.statusRunning);
        break;
      case 'result':
        setOutput(msg.text, msg.emphasis ? 'out-value' : '');
        if (msg.truncated) appendTruncated(msg.truncated);
        break;
      case 'error':
        setOutput(msg.message, 'out-error');
        break;
      case 'confirmDestructive':
        // Pushed on render and whenever the setting changes elsewhere (Settings
        // UI, another window), so the checkbox never shows a stale value.
        confirmBox.checked = msg.value === true;
        break;
      case 'history':
        // The extension sends the full list after every change and on initial
        // resolve, so the webview never manages its own copy.
        var items = msg.items || [];
        // Attach the pre-localized summary label so renderHistory can use it
        // without carrying its own English.
        items._label = msg.label || '';
        renderHistory(items);
        break;
    }
  });

  // --- Webview -> extension messages ---

  /** Asks the host to classify the current text. Debounced, never per keystroke. */
  function requestValidation() {
    vscode.postMessage({ type: 'input', sql: input.value });
  }

  input.addEventListener('input', function () {
    clearTimeout(debounceTimer);
    // While the user is still typing, the previous verdict may already be wrong,
    // so Execute is parked until the fresh classification lands. Failing closed
    // is the safe direction for a button that can mutate data.
    executable = false;
    refreshExecuteState();
    debounceTimer = setTimeout(requestValidation, ${VALIDATION_DEBOUNCE_MS});
  });

  function execute() {
    if (execBtn.disabled) return;
    vscode.postMessage({ type: 'execute', sql: input.value });
  }

  execBtn.addEventListener('click', execute);

  // Ctrl/Cmd+Enter mirrors the notebook panel's run shortcut so the two SQL
  // surfaces do not need separate muscle memory.
  input.addEventListener('keydown', function (e) {
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
      e.preventDefault();
      execute();
    }
  });

  confirmBox.addEventListener('change', function () {
    vscode.postMessage({ type: 'setConfirmDestructive', value: confirmBox.checked });
  });

  // Clear history — the extension wipes the persisted array and pushes an
  // empty list back, so the webview never manages its own copy.
  historyClearBtn.addEventListener('click', function () {
    vscode.postMessage({ type: 'clearHistory' });
  });

  // --- Init ---
  // Classify whatever is already in the box (restored text on a view reload) so
  // the icon strip and the button agree with the content from the first frame.
  refreshExecuteState();
  requestValidation();
`;
}
