# BUG: Health panel executes any VS Code command id a webview message names, with no allow-list — defeating the CSP backstop for attribute injection

**Status: Open**

<!-- Status values: Open → Investigating → Fix Ready → Closed -->

Created: 2026-09-02
Component: Extension
File: `extension/src/health/health-panel.ts` (line ~94)
Severity: UX

---

## Summary

`HealthPanel._handleMessage` passes `msg.id` and `msg.actionCommand` straight to
`vscode.commands.executeCommand`, with `msg.args` spread as the argument. Any
message reaching the panel's `onDidReceiveMessage` can therefore run **any**
registered VS Code command with attacker-chosen arguments. The repo's own
cross-tool path (`executeSuiteFix`) allow-lists command ids for exactly this
reason and its call sites are commented "re-validated host-side before the
command runs" — the health panel skips that check.

This matters because the C2b CSP backstop stops injected **scripts**, not
injected **attributes**: `webview-csp.ts`'s delegated dispatcher binds handlers
from `data-*` attributes, and `health-html.ts`'s own click listener reads
`dataset.actionCommand` / `dataset.command` off any matching element. So an
escaping miss in the health markup — which renders database-derived text
(table names, column names, health-issue messages) — degrades from the
documented "inert rendering bug" to arbitrary command execution.

---

## Attribution Evidence

Both the unguarded execution and the guarded reference implementation are in
this repo's extension tree.

```bash
# Positive — the unguarded execution
grep -n "executeCommand" extension/src/health/health-panel.ts
# 105:          vscode.commands.executeCommand(msg.id);
# 112:          vscode.commands.executeCommand(msg.actionCommand, msg.args);

grep -n "_handleMessage" -A 20 extension/src/health/health-panel.ts
# 93:  private _handleMessage(
# 94:    msg: { command: string; id?: string; actionCommand?: string; args?: unknown },
# 95:  ): void {
# ...
# 103:      case 'openCommand':
# 104:        if (msg.id) {                       <-- only a truthiness check
# 105:          vscode.commands.executeCommand(msg.id);
# ...
# 110:      case 'executeAction':
# 111:        if (msg.actionCommand) {            <-- only a truthiness check
# 112:          vscode.commands.executeCommand(msg.actionCommand, msg.args);

# Positive — the project's OWN standard for this exact pattern, in the same tree
grep -n "isAllowedSuiteCommand" -A 6 extension/src/suite/suite-diagnostics.ts
# 59:export function isAllowedSuiteCommand(command: unknown): command is string {
# 60:  return (
# 61:    typeof command === 'string'
# 62:    && SUITE_COMMAND_PREFIXES.some((p) => command.startsWith(p))
# 63:  );
# 64:}

grep -n "executeSuiteFix" -A 11 extension/src/suite/suite-notes-html.ts
# 127:export async function executeSuiteFix(msg: {
# 131:  const command = msg.fixCommand;
# 132:  if (!isAllowedSuiteCommand(command)) return false;      <-- allow-list
# 133:  const registered = await vscode.commands.getCommands(true);
# 134:  if (!registered.includes(command)) return false;        <-- registration check
# 135:  const args = Array.isArray(msg.fixArgs) ? msg.fixArgs : [];
# 136:  await vscode.commands.executeCommand(command, ...args);

# Positive — the delegated dispatcher that makes ATTRIBUTE injection live
grep -n "getAttribute(attr)" -B 2 -A 3 extension/src/webview-csp.ts
# 156:      var fn = window[el.getAttribute(attr)];
# 157:      if (typeof fn === 'function') fn.apply(el, collect(el));

# Negative — no equivalent command dispatch in the Dart tree
grep -rn "executeCommand" lib/src/
# Expected: 0 matches
```

**Emit site(s) — list ALL:**
- `extension/src/health/health-panel.ts:105` (`openCommand` → any command id)
- `extension/src/health/health-panel.ts:112` (`executeAction` → any command id
  plus caller-supplied `args`)

**Diagnostic `source` / `owner` as seen in Problems panel:** n/a — this is a
hardening defect in message handling, not a diagnostic.

---

## Environment

- OS: any
- VS Code version: any
- Extension version: 4.2.5
- Dart SDK version: any
- Flutter SDK version: any
- Database type and version: SQLite — any database whose identifiers or health
  findings are rendered into the panel
- Connection method: any
- Relevant non-default settings: none
- Other potentially conflicting extensions: any extension contributing a
  destructive command widens the blast radius (e.g. terminal-sequence or
  file-write commands)

---

## Steps to Reproduce

The unguarded execution itself is directly demonstrable; the injection vector
requires an escaping miss, which is what the guard is defense against.

**A — prove the missing guard (no injection needed):**

1. Open **Drift: Health Score** so `HealthPanel` exists.
2. In the webview devtools console (Developer: Open Webview Developer Tools),
   run:
   ```js
   acquireVsCodeApi().postMessage({
     command: 'executeAction',
     actionCommand: 'workbench.action.closeWindow',
   });
   ```
3. The window closes. Substitute any registered command id — nothing in the host
   handler rejects it.

Repeat with `command: 'suiteFix', fixCommand: 'workbench.action.closeWindow'`
and observe it is **refused** by `isAllowedSuiteCommand`, demonstrating that the
two paths in the same panel family apply different rules.

**B — the vector the guard defends (requires an escaping miss):**

1. Create a table whose name or a health finding's message contains
   `" data-action-command="<some.command>" x="`.
2. Open the Health panel. If any interpolation site omits `esc()` (or escapes
   `<`/`>` but not `"`), the value closes the attribute and injects
   `data-action-command`.
3. Clicking anywhere in that element runs the named command. The CSP does not
   block this: no `<script>` is involved, and `health-html.ts`'s listener is the
   page's own nonce-stamped script reading `dataset`.

---

## Expected Behavior

The host validates before executing, matching `executeSuiteFix`:

1. `typeof command === 'string'`.
2. The id starts with an allowed prefix — for this panel, `driftViewer.`.
3. The command is actually registered (`vscode.commands.getCommands(true)`).
4. `args` is normalised (array or omitted) rather than spread through as
   `unknown`.

Then an escaping miss in the health markup is what `webview-csp.ts`'s header
promises: "an inert rendering bug instead of script execution in the developer's
editor".

---

## Actual Behavior

Both cases execute unconditionally on a non-empty value. `msg.args` is passed as
a single `unknown` argument with no shape check, so a command expecting a
structured argument receives whatever the message carried.

The panel's own emitters only ever produce `driftViewer.*` ids
(`health-html.ts:143`, `:150`, `:167`, `:193` all interpolate
`m.linkedCommand` / `a.command` from the extension-built health model), so no
current code path abuses this. That is the point: the handler is one escaping
miss away from arbitrary command execution and has no second line of defense,
while the sibling handler in the very same `switch` has two.

---

## Error Output

### VS Code Developer Tools Console

Nothing — the command simply runs.

### Extension Output Channel

Nothing — no line records which command a webview asked the host to run.

### Terminal / Command Output

n/a

### Stack Traces

n/a — no exception; that is the problem.

---

## Duplicate-Emission Check

Two handlers, one owner, one tree:

- `extension/src/health/health-panel.ts:105` — `openCommand`
- `extension/src/health/health-panel.ts:112` — `executeAction`

Both are TypeScript; `grep -rn "executeCommand" lib/src/` returns nothing, so
there is no Dart path to fix. Other in-scope panels were checked and do **not**
share the defect: `health/anomalies-panel.ts` and
`health/index-suggestions-panel.ts` only execute hard-coded ids
(`driftViewer.generateAnomalyFixes`, `driftViewer.createAllIndexes`) plus the
allow-listed `executeSuiteFix`; `debug/perf-baseline-panel.ts` executes no
commands at all.

---

## Screenshots / Recordings

n/a — the devtools repro in step A is the artifact.

---

## Minimal Reproducible Example

```js
// In the Health panel's webview devtools console:
acquireVsCodeApi().postMessage({
  command: 'executeAction',
  actionCommand: 'workbench.action.closeWindow',
});
// Expected after fix: ignored (not a driftViewer.* command).
// Actual today: the window closes.
```

---

## What I Already Tried

- [x] Confirmed `secureWebviewHtml` IS applied to this panel
      (`health-panel.ts:84`), so injected `<script>` is genuinely blocked — the
      residual vector is attribute injection, not script injection.
- [x] Read `webview-csp.ts`'s delegated dispatcher: it binds `data-click` etc.
      from attributes and calls `window[name]`, confirming that attributes are a
      live execution surface under the current CSP by design.
- [x] Audited the sibling health/debug panels — none has the same gap, so this
      is a single-file fix.
- [x] Read `extension/src/test/health-panel.test.ts` — no case posts an
      out-of-family command id.

---

## Regression Info

- Last working version: n/a — the handler has never validated.
- First broken version: the release that added the `openCommand` /
  `executeAction` messages to the Health panel.
- What changed: the suite deep-link path (plan 67 R1) later introduced
  `isAllowedSuiteCommand` for the identical problem; the pre-existing health
  handlers were not retrofitted.

---

## Root Cause

The Health panel trusts its webview as a peer rather than as an untrusted
renderer of database content. `executeSuiteFix` already encodes the correct
posture; the fix is to apply it here.

Fix sketch:

```ts
/**
 * Command ids this panel may run on a webview's request. The webview renders
 * database-derived text, and the C2b CSP stops injected <script> but NOT
 * injected data-* attributes — health-html's own listener reads
 * dataset.actionCommand off whatever element was clicked. Without this
 * allow-list an escaping miss in a table name or finding message turns into
 * arbitrary command execution instead of the inert rendering bug the CSP
 * header promises. Mirrors isAllowedSuiteCommand for the cross-tool path.
 */
const HEALTH_COMMAND_PREFIX = 'driftViewer.';

private async _runPanelCommand(id: unknown, args?: unknown): Promise<void> {
  if (typeof id !== 'string' || !id.startsWith(HEALTH_COMMAND_PREFIX)) return;
  const registered = await vscode.commands.getCommands(true);
  if (!registered.includes(id)) return;          // no dead action, no surprise
  await vscode.commands.executeCommand(id, args);
}
```

…then route both `openCommand` and `executeAction` through it. Two follow-ups
worth folding in:

1. Log a connection-channel line when a command is **rejected**, so a legitimate
   new health action that forgets the prefix fails loudly rather than silently.
2. Give `args` a real shape check for the commands that take one, rather than
   forwarding `unknown`.

---

## Changes Made

<!-- Fill in when a fix is written. -->

---

## Commits

<!-- Add commit hashes as fixes land. -->

---

## Impact

- Who is affected: any user who opens the Health panel against a database whose
  identifiers or findings they do not fully control (a shared dev database, a
  restored production snapshot, a fixture from a colleague).
- What is blocked: nothing functionally — this is a missing guard, not a broken
  feature. The exposure is that the documented CSP guarantee does not hold for
  this panel.
- Data risk: potentially high in the injection case — an executed command runs
  with full extension-host privileges, including this extension's own write and
  data-reset commands.
- Frequency: the missing guard is present on every panel open; exploitation
  additionally requires an escaping miss.
