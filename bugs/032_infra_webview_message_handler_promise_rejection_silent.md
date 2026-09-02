# BUG: Async webview message handlers are invoked with no rejection handling, so a failed export or clipboard write is silent

**Status: Open**

<!-- Status values: Open → Investigating → Fix Ready → Closed -->

Created: 2026-09-02
Component: Extension
File: `extension/src/health/index-suggestions-panel.ts` (line ~73)
Severity: UX

---

## Summary

Four panels register `onDidReceiveMessage((msg) => this._handleMessage(msg))`
where `_handleMessage` is `async`. The returned promise is neither awaited nor
given a `.catch`, so any rejection inside a message case becomes an unhandled
promise rejection in the extension host: the user clicks a button, nothing
happens, no toast, no output line, no console entry they would think to look
at. The clearest case is **Export Analysis** in the Index Suggestions panel —
`vscode.workspace.fs.writeFile` to a path that is read-only, on a full disk, or
on a disconnected network share rejects and the user is told nothing.

---

## Attribution Evidence

All four call sites are TypeScript; there is no Dart panel layer.

```bash
# Positive — async handlers passed as fire-and-forget listeners
grep -rn "onDidReceiveMessage" extension/src/health/ extension/src/debug/
# extension/src/health/anomalies-panel.ts:80:    this._panel.webview.onDidReceiveMessage(
# extension/src/health/health-panel.ts:70:    this._panel.webview.onDidReceiveMessage(
# extension/src/health/index-suggestions-panel.ts:73:    this._panel.webview.onDidReceiveMessage(
# extension/src/debug/perf-baseline-panel.ts:49:    this._panel.webview.onDidReceiveMessage(

grep -n "onDidReceiveMessage" -A 4 extension/src/health/index-suggestions-panel.ts
# 73:    this._panel.webview.onDidReceiveMessage(
# 74:      (msg) => this._handleMessage(msg),     <-- promise dropped
# 75:      null,
# 76:      this._disposables,
# 77:    );

grep -n "private async _handleMessage" extension/src/health/index-suggestions-panel.ts \
  extension/src/health/anomalies-panel.ts extension/src/debug/perf-baseline-panel.ts
# extension/src/health/index-suggestions-panel.ts:95:  private async _handleMessage(
# extension/src/health/anomalies-panel.ts:102:  private async _handleMessage(
# extension/src/debug/perf-baseline-panel.ts:69:  private async _handleMessage(

# Positive — the rejecting await with no try/catch around it
grep -n "_exportAnalysis\|fs.writeFile\|clipboard.writeText" \
  extension/src/health/index-suggestions-panel.ts
# 111:          await vscode.env.clipboard.writeText(this._suggestions[msg.index].sql);
# 123:          await vscode.env.clipboard.writeText(sql);
# 132:        await vscode.env.clipboard.writeText(allSql);
# 139:        await this._exportAnalysis();       <-- case 'exportAnalysis', no try/catch
# 173:  private async _exportAnalysis(): Promise<void> {
# 232:        await vscode.workspace.fs.writeFile(uri, Buffer.from(text, 'utf-8'));

# Negative — no webview message layer in the Dart tree
grep -rn "onDidReceiveMessage" lib/src/
# Expected: 0 matches
```

Note the asymmetry inside a single file: `anomalies-panel.ts` wraps its
`refresh` and `openBulkEdit` cases in `try/catch` with
`showErrorMessage`, but its `suiteFix` case is bare — so the same panel both
demonstrates the correct pattern and omits it.

**Emit site(s) — list ALL:**
- `extension/src/health/index-suggestions-panel.ts:74` (handler dropped)
- `extension/src/health/anomalies-panel.ts:81` (handler dropped)
- `extension/src/health/health-panel.ts:71` (handler dropped; `_handleMessage`
  is sync here but calls `this._refresh()` which is async)
- `extension/src/debug/perf-baseline-panel.ts:50` (handler dropped)

**Diagnostic `source` / `owner` as seen in Problems panel:** n/a — runtime behavior.

---

## Environment

- OS: any (Windows most likely to hit the read-only/locked-file case)
- VS Code version: any
- Extension version: 4.2.5
- Dart SDK version: any
- Flutter SDK version: any
- Database type and version: SQLite (any)
- Connection method: any
- Relevant non-default settings: none
- Other potentially conflicting extensions: none

---

## Steps to Reproduce

1. Connect to a Drift server and run **Drift: Index Suggestions** so the panel
   opens with at least one suggestion.
2. Click **Export Analysis**.
3. Pick **JSON**, then **Save to file**.
4. In the save dialog choose a location that will fail — e.g. a directory
   without write permission, a disconnected mapped network drive, or (on
   Windows) a path already held open exclusively by another process.
5. Confirm the save.

Deterministic for any path where `workspace.fs.writeFile` rejects.

A second, simpler repro: click **Copy All** while another application holds the
clipboard open (common with clipboard-manager utilities on Windows) —
`vscode.env.clipboard.writeText` rejects and the "Copied N statements" toast
never appears, with no error in its place.

---

## Expected Behavior

Every button press produces a visible outcome: on success the existing
information toast, on failure an error toast naming what went wrong
(`Export failed: EPERM: operation not permitted, open '…'`). The panel already
does this in `anomalies-panel.ts`'s `refresh` and `openBulkEdit` cases — that is
the standard the rest should meet.

---

## Actual Behavior

The rejection escapes `_handleMessage` into the dropped promise. Concretely for
step 5:

```
_handleMessage → case 'exportAnalysis' → await this._exportAnalysis()
                                       → await vscode.workspace.fs.writeFile(...)  ✗ rejects
```

`_exportAnalysis` has no `try/catch`; `_handleMessage`'s `case 'exportAnalysis'`
has none; the listener discards the promise. Result: the save dialog closes, the
"Saved index suggestions to …" toast never appears, and no error appears either.
The user's most likely reading is that the export succeeded — the file simply is
not there.

The unhandled rejection does surface in the **Extension Host** log, but that is
not a place a user (or a bug reporter) looks, and it carries no context about
which button was pressed.

---

## Error Output

### VS Code Developer Tools Console

An unhandled-rejection entry, e.g.:

```
Uncaught (in promise) Error: Unable to write file 'z:\index-suggestions.json'
  (Unknown (FileSystemError): EPERM: operation not permitted, open 'z:\index-suggestions.json')
```

### Extension Output Channel

Nothing. Neither the **Saropa Drift Advisor** channel nor any panel log records
the failure.

### Terminal / Command Output

n/a

### Stack Traces

Only the unhandled-rejection trace above, in the Extension Host log.

---

## Duplicate-Emission Check

Four emit sites, one language path. `grep -rn "onDidReceiveMessage" lib/src/`
returns nothing, so there is no Dart path to mirror the fix into.

`extension/src/panel.ts:130` uses the same listener shape but its handler is
synchronous and delegates to bridges, so it is not affected by this specific
defect — it is worth checking during the fix whether
`EditingBridge.handleMessage` / `FilterBridge.handleMessage` return promises.

---

## Screenshots / Recordings

n/a — the absence of a toast is the symptom, which a recording would show best.

---

## Minimal Reproducible Example

```ts
// The shape of the defect, reduced:
webview.onDidReceiveMessage((msg) => this._handleMessage(msg));
//                          ^ returns Promise<void>; rejection has no handler

private async _handleMessage(msg: { command: string }): Promise<void> {
  if (msg.command === 'exportAnalysis') await this._exportAnalysis(); // may reject
}
```

---

## What I Already Tried

- [x] Confirmed `anomalies-panel.ts` already wraps two of its cases in
      `try/catch` + `showErrorMessage`, establishing the intended pattern and
      proving the omission is inconsistency, not policy.
- [x] Confirmed `_exportAnalysis` has no internal `try/catch` — the rejection
      really does reach the dropped promise rather than being swallowed
      somewhere in between.
- [x] Checked the in-scope panels for a shared helper that already does this —
      there is none; each panel wires its listener by hand.

---

## Regression Info

- Last working version: n/a — the pattern dates from each panel's introduction.
- First broken version: n/a.
- What changed: `_handleMessage` became `async` in these panels as cases that
  await were added, without updating the listener registration.

---

## Root Cause

A `vscode.Webview.onDidReceiveMessage` listener is typed to return `any`, so
handing it an `async` function compiles cleanly and silently discards the
promise. Nothing in the type system or the lint config catches it, and the
failing paths (permission errors, clipboard contention) are rare enough in
development to go unnoticed.

Fix sketch — one small helper, applied at all four sites:

```ts
/**
 * Wraps an async webview message handler so a rejection becomes a visible
 * error toast instead of an unhandled promise rejection. onDidReceiveMessage
 * discards whatever the listener returns, so an `async` handler that throws
 * (a failed export, a contended clipboard) previously produced NO outcome at
 * all — the user pressed a button and nothing happened.
 */
export function webviewMessageHandler<T>(
  handle: (msg: T) => void | Promise<void>,
  label: string,
): (msg: T) => void {
  return (msg) => {
    void Promise.resolve()
      .then(() => handle(msg))
      .catch((err: unknown) => {
        const m = err instanceof Error ? err.message : String(err);
        void vscode.window.showErrorMessage(`${label}: ${m}`);
      });
  };
}
```

```ts
// index-suggestions-panel.ts
this._panel.webview.onDidReceiveMessage(
  webviewMessageHandler((msg) => this._handleMessage(msg), 'Index suggestions'),
  null,
  this._disposables,
);
```

Placing the helper next to `secureWebviewHtml` (the other cross-panel webview
utility) keeps it discoverable, and using it consistently means new panels get
the behavior for free rather than each re-deciding.

---

## Changes Made

<!-- Fill in when a fix is written. -->

---

## Commits

<!-- Add commit hashes as fixes land. -->

---

## Impact

- Who is affected: anyone using the export, copy, snapshot or bulk-edit actions
  in the Health, Anomalies, Index Suggestions or Perf Baseline panels.
- What is blocked: the action itself fails and the user believes it succeeded —
  the worst outcome for an export, where the missing file is discovered later.
- Data risk: low. No corruption; the risk is acting on an export that was never
  written.
- Frequency: only on the failure paths (permissions, disk, clipboard
  contention), but 100 % silent when they occur.
