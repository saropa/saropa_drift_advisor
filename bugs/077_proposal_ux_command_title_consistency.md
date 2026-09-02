# PROPOSAL: Command-Title Consistency Pass — Double Prefixes, Two "Refresh"es, and One Export Format That Is a Lie

**Status: Open**

Created: 2026-09-02
Type: UX improvement

---

## Summary

Four concrete naming/affordance defects in the extension's 164-command surface: two commands repeat
the category inside their own title, two pairs of commands render as identical palette entries, one
operation is named two different things depending on how it is invoked, and the ER diagram offers a
**PNG** export that silently writes SVG.

**Wow: 3/10, Effort: Low**

---

## Motivation

Every defect below is read straight from `extension/package.json` +
`extension/package.nls.json` (v4.2.5). VS Code renders a palette entry as
`"<category>: <title>"`, and every command in this extension carries
`"category": "Saropa Drift Advisor"`.

### 1. Category repeated inside the title

```
command.suppressDiagnosticAtCursor.title     => "Drift Advisor: Ignore Finding for This Column"
command.suppressDiagnosticAtCursorFile.title => "Drift Advisor: Ignore Finding in This File"
```

Rendered in the palette:

```
Saropa Drift Advisor: Drift Advisor: Ignore Finding for This Column
Saropa Drift Advisor: Drift Advisor: Ignore Finding in This File
```

These are the only two of 164 titles that do this.

### 2. Same operation, two different verbs

The suppression family is deliberately four commands — `extension/src/diagnostics/suppression-commands.ts:15-19`
documents the split: `suppressDiagnosticInColumn` / `suppressDiagnosticInFile` are the quick-fix
entry points with an exact `(uri, line, code)`, and `suppressDiagnosticAtCursor` /
`suppressDiagnosticAtCursorFile` are the cursor-resolving variants. The split is sound; the naming
is not:

```
Ignore Diagnostic for This Column   (suppressDiagnosticInColumn)
Ignore Finding for This Column      (suppressDiagnosticAtCursor)
Ignore Diagnostic in This File      (suppressDiagnosticInFile)
Ignore Finding in This File         (suppressDiagnosticAtCursorFile)
```

"Diagnostic" and "Finding" are the same thing. A user searching the palette for one wording finds
half the feature.

### 3. Two pairs of identical titles

```
command.refreshTree.title            => "Refresh"
command.refreshPerformance.title     => "Refresh"

command.removeTableAnnotations.title  => "Remove Annotations"
command.removeColumnAnnotations.title => "Remove Annotations"
```

`refreshTree` and `refreshPerformance` both have `view/title` menu entries, so in context the icon
disambiguates — but in the palette they are two indistinguishable
`Saropa Drift Advisor: Refresh` rows. The annotations pair is worse: both are argument-only tree-item
commands (see `060_proposal_ux_command_palette_enablement.md`) and neither does anything useful when
typed, yet both are listed identically.

### 4. "PNG" export writes SVG

`extension/src/er-diagram/er-diagram-panel.ts:172-197`:

```ts
private async _export(format: 'svg' | 'png' | 'mermaid'): Promise<void> {
  ...
  case 'png':
    // PNG export requires webview canvas rendering
    // For now, export as SVG with a note
    vscode.window.showInformationMessage(
      'PNG export: Copy the SVG and convert to PNG using an external tool.');
    content = exporter.toSvg(...);
```

`extension/src/er-diagram/er-diagram-html.ts` offers PNG in the format dropdown, and
`extension/src/er-diagram/er-export.ts` has no PNG path at all — `toSvg` and `toMermaid` only. The
user picks PNG, gets a `.svg`, and is told to convert it themselves. (Mermaid export *does* work —
this is specifically the PNG option.)

---

## Detection / Behavior

### Should flag (problematic)

- A `contributes.commands` title that begins with the extension's own name or a shortening of it.
- Two commands whose `"<category>: <title>"` render identically.
- A user-visible format option with no implementation behind it.

### Should pass (correct)

```
command.suppressDiagnosticAtCursor.title     => "Ignore Diagnostic for This Column (at Cursor)"
command.suppressDiagnosticAtCursorFile.title => "Ignore Diagnostic in This File (at Cursor)"
command.refreshPerformance.title             => "Refresh Query Stats"     (matches its sibling
                                                 command.clearPerformance.title = "Clear Query Stats")
command.removeTableAnnotations.title         => "Remove Table Annotations"
command.removeColumnAnnotations.title        => "Remove Column Annotations"
```

For PNG, pick one:

- **Implement it** — render the SVG to a canvas in the webview and post back a data URL. The DVR and
  dashboard webviews already round-trip payloads through `postMessage`, and the browser UI already
  ships PNG chart export ("export to PNG/SVG or copy image", README), so the technique exists in the
  repo.
- **Or remove the option** from `er-diagram-html.ts` and the `'png'` arm of the message type in
  `er-diagram-types.ts:49`. An absent option is honest; a present one that produces a different file
  is not.

A unit test over `package.json` asserting (a) no title starts with `Drift Advisor` / `Saropa`, and
(b) no two `category + title` pairs collide, keeps this from recurring.

---

## Edge Cases

1. **Command ids must not change.** The suite extensions and deep links call `driftViewer.*` ids;
   only titles change here.
2. **NLS.** All four titles live in `package.nls.json` and its translations — changing the English
   string without updating the localized files leaves stale translations; the repo's NLS coverage
   check should catch it.
3. **`refreshTree` keeps the bare "Refresh" title** because it is the Database view's title-bar
   action and the view name supplies the context; only the performance one needs qualifying — or
   suppress `refreshTree` from the palette instead.
4. **Existing muscle memory** — these are low-traffic commands; a title change costs little. Do not
   batch it with an id rename.
5. **Removing the PNG option** changes a webview dropdown; state it in `CHANGELOG.md` under
   `[Unreleased]` rather than letting the option quietly vanish.

---

## Alternatives Considered

- **Leave the titles; users search by keyword anyway.** Keyword search is exactly what breaks when
  the same operation is called both "Diagnostic" and "Finding".
- **Drop the `category` instead of the in-title prefix.** The category is what groups all 164
  commands under one heading; the two in-title prefixes are the anomaly.

---

## Decision

---

## Implementation Notes

---

## Commits
