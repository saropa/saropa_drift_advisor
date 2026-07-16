# Cursor-based ignore-diagnostic commands

The lightbulb / Quick Fix suppression actions for a Drift Advisor diagnostic
only appeared when the cursor sat exactly inside the diagnostic's own
start/end range, and VS Code's Problems-panel row context menu has no
extension-contributable menu point, so double-clicking a Problems entry could
not reach a suppress action at all. Users landing on a finding via the
Problems panel had no discoverable way to ignore it short of manually typing
the `// drift-advisor:ignore` comment syntax.

## Change

Added two new commands, `driftViewer.suppressDiagnosticAtCursor` and
`driftViewer.suppressDiagnosticAtCursorFile`, resolving the intended
diagnostic from the cursor position rather than requiring an exact range
match:

- Exact match on the cursor's line first.
- Falls back to the nearest Drift Advisor diagnostic within
  `NEAR_CURSOR_LINE_WINDOW` (3) lines of the cursor — bounded, not "nearest in
  the file", so the resolver never silently acts on a diagnostic far from
  where the user actually clicked.
- When multiple diagnostics tie for closest — whether on the same line or on
  different lines equidistant from the cursor — a QuickPick lets the user
  choose, instead of a silent first-found pick.
- A diagnostic with no usable `code` is refused with a warning rather than
  written as a bare `// drift-advisor:ignore` directive, which the existing
  parser (`suppression.ts`) treats as "silence every code on this line/file",
  not "silence this one."

Both commands are wired to the editor right-click menu (gated on a new
`driftViewer.hasFindingNearCursor` context key, kept current via debounced
`onDidChangeActiveTextEditor` / `onDidChangeTextEditorSelection` /
`onDidChangeDiagnostics` listeners) and to the Command Palette. The
right-click menu's 3-line visibility window matches the resolver's own
fallback bound, so a menu click and a Palette invocation always agree on
whether a finding is reachable from the current cursor position.

Files: `extension/src/diagnostics/suppression-commands.ts`,
`extension/package.json` (commands + `editor/context` menu),
`extension/package.nls.json`.

## Review and fixes

A delegated code-review subagent (read-only, Sonnet) audited the diff and
flagged two real defects in the first implementation, both fixed before
landing:

1. **Unbounded nearest-diagnostic fallback.** The original fallback picked
   the closest Drift Advisor diagnostic anywhere in the file with no distance
   cap, inconsistent with the 3-line window gating the right-click menu's
   visibility — a Command Palette invocation could silently resolve a finding
   hundreds of lines from the cursor. Fixed by bounding the fallback to the
   same `NEAR_CURSOR_LINE_WINDOW` the menu uses, with a warning when nothing
   is within it.
2. **Silent first-found pick on cross-line ties.** The QuickPick tie-break
   only fired when multiple diagnostics shared the exact cursor line; two
   diagnostics equidistant from the cursor on different lines resolved
   silently to whichever appeared first in the diagnostics array. Fixed by
   computing the minimum distance across the whole near-cursor window and
   offering every diagnostic at that minimum distance, same line or not.
3. **Unguarded empty/non-string diagnostic code.** The command handlers
   coerced `diagnostic.code` with `String(x ?? '')`, with no check matching
   the existing `typeof codeStr !== 'string'` guard already present in
   `diagnostic-manager.ts`'s lightbulb path. An empty code would have
   inserted a bare `// drift-advisor:ignore` directive, which
   `suppression.ts`'s parser reads as "suppress every code," not "suppress
   this one." Fixed by refusing to resolve a diagnostic with no non-empty
   string code, with a warning explaining why.

The review also flagged zero test coverage for any of the new logic. Added
`extension/src/test/suppression-commands.test.ts` (12 cases covering: no
active editor, no findings in file, exact-line match, bounded-window
fallback, out-of-window refusal, same-line tie QuickPick, cross-line tie
QuickPick, QuickPick cancellation, empty-code refusal, file-scope insert, and
both states of the `hasFindingNearCursor` context key at registration). This
required extending the shared VS Code mock (`extension/src/test/vscode-mock.ts`,
new `extension/src/test/vscode-mock-textdocument.ts`) with
`languages.getDiagnostics`, `workspace.openTextDocument`/`applyEdit` against a
`MockTextDocument`/`WorkspaceEdit` pair, and widening `dialogMock.quickPickResult`
from `string` to `any` (a QuickPick in this codebase can resolve to a rich
item object, not just a label) — none of which existed in the mock before
this change, since no prior test exercised these VS Code APIs.

## Verification

- `npx tsc -p ./`, `verify-nls`, `verify:nls-coverage` — all clean.
- `npx mocha --no-config out/test/suppression-commands.test.js` — 12/12
  passing.
- Re-ran `suppression.test.ts`, `diagnostic-code-actions.test.ts`,
  `diagnostic-manager.test.ts`, `drift-terminal-link-provider.test.ts` (all
  share the widened mock infrastructure) — 48/48 passing, no regressions.
- `extension.test.ts`'s exact disposable-count assertion needed updating: the
  new commands and their four listener/debounce disposables added 8 to the
  count (243 → 251); updated the assertion and its accompanying running log
  comment, matching the file's own existing convention for every prior
  feature addition.
- A pre-existing, unrelated failure in `web-theme-enhanced.test.js` (reduced
  motion / showcase theme) was observed in an unscoped run; it is in a file
  this task never touched and was left alone per policy.

## Not done

- The 3-line `NEAR_CURSOR_LINE_WINDOW` is a fixed constant, not user
  configurable. No user request has surfaced for tuning it.
- Debounce-coalescing behavior itself (rapid selection changes collapsing to
  one context-key update) is not unit tested — it mirrors the pre-existing,
  also-untested pattern in `timeline/snapshot-commands.ts`'s
  `hasSqlAtCursor` context key.
