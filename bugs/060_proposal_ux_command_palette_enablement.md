# PROPOSAL: Gate the Command Palette — 163 Always-Visible Commands, Several of Which Cannot Work When Typed

**Status: Open**

Created: 2026-09-02
Type: UX improvement

---

## Summary

`extension/package.json` declares 164 commands, contributes exactly one `commandPalette` menu entry,
and sets `enablement` on zero of them. Every command — including tree-item handlers and cross-tool
deep-link receivers that require an argument — is offered in the palette at all times, connected or
not. Add `enablement` / palette `when` clauses so the palette shows what can actually run.

**Wow: 5/10, Effort: Low**

---

## Motivation

Measured from `extension/package.json` (v4.2.5):

```
contributes.commands            : 164
contributes.menus.commandPalette:   1   (driftViewer.branchFromSnapshot, "when": "false")
commands with an "enablement"   :   0
commands with no non-palette menu entry: 102
```

Two distinct classes of breakage follow.

**1. Argument-only commands are typeable.** These are registered to receive a payload from a tree
item or a cross-extension deep link, and do something useless or confusing with no argument:

| Command | Title as shown in the palette | Real caller |
| --- | --- | --- |
| `driftViewer.openTable` | Open Table Data (Suite Deep Link) | Saropa suite deep link |
| `driftViewer.openSchemaForTable` | Open Schema for Table (Suite Deep Link) | suite deep link |
| `driftViewer.openExplainForSql` | Explain Query Plan (Suite Deep Link) | suite deep link |
| `driftViewer.openIssues` | Open Issues (Suite Deep Link) | suite deep link |
| `driftViewer.goToDefinitionForTable` | Go to Table Definition (Suite Deep Link) | suite deep link |
| `driftViewer.refactoringOpenWithHint` | Open Refactoring Advisor (External Hint) | external hint |
| `driftViewer.writeDiagnosticsMirror` | Write Diagnostics Mirror (Suite) | suite |
| `driftViewer.removeChange` | Remove Change | Pending Changes tree item |
| `driftViewer.copyTableName` / `copyColumnName` / `filterByColumn` | … | Database tree item |
| `driftViewer.removeTableAnnotations` / `removeColumnAnnotations` | Remove Annotations | tree item |

The "(Suite Deep Link)" suffixes in the titles are themselves evidence: they are apologies for
commands that should not be in the palette. Nine of them are `driftViewer.branchFromSnapshot`'s
peers, yet only `branchFromSnapshot` got the `"when": "false"` treatment.

**2. Server-dependent commands are offered while disconnected.** The extension already computes
`driftViewer.serverConnected` in a single authority (`extension/src/connection-state.ts`) and uses
it for `contributes.views`, `viewsWelcome`, and two of the four keybindings — but not for any
command. So on a fresh install with no app running, the palette offers *Seed Test Data*, *Open Query
Replay DVR*, *Compare Databases*, *Share Debug Session*, and 100 others, each of which ends in a raw
error string (see `057_proposal_ux_actionable_error_recovery.md`).

---

## Detection / Behavior

### Should flag (hidden from the palette)

```jsonc
"menus": {
  "commandPalette": [
    { "command": "driftViewer.openTable",                "when": "false" },
    { "command": "driftViewer.openSchemaForTable",       "when": "false" },
    { "command": "driftViewer.openExplainForSql",        "when": "false" },
    { "command": "driftViewer.openIssues",               "when": "false" },
    { "command": "driftViewer.goToDefinitionForTable",   "when": "false" },
    { "command": "driftViewer.refactoringOpenWithHint",  "when": "false" },
    { "command": "driftViewer.writeDiagnosticsMirror",   "when": "false" },
    { "command": "driftViewer.removeChange",             "when": "false" },
    { "command": "driftViewer.removeTableAnnotations",   "when": "false" },
    { "command": "driftViewer.removeColumnAnnotations",  "when": "false" },
    { "command": "driftViewer.copyTableName",            "when": "false" },
    { "command": "driftViewer.copyColumnName",           "when": "false" },
    { "command": "driftViewer.filterByColumn",           "when": "false" }
  ]
}
```

Once hidden, the "(Suite Deep Link)" / "(External Hint)" / "(Suite)" suffixes can be dropped from
the titles — they exist only to warn palette users away.

### Should pass (still visible)

- Offline-capable commands stay unconditional: `scanDartSchemaDefinitions`, `isarToDrift`,
  `addPackageToProject`, `openWalkthrough`, `showTroubleshooting`, `about`, `aboutSaropa`,
  `openConnectionHelp`, `showConnectionLog`, `diagnoseConnection`, `forwardPortAndroid`,
  `retryDiscovery`, `selectServer`, `openInBrowser`, `setLogVerbosity`, `openRulesConfig`.
  `isar-gen-commands.ts:3` already documents "No server connection needed"; that is the test.
- Server-dependent commands get `"enablement": "driftViewer.serverConnected"` so they stay
  *listed but greyed*, preserving discoverability while making the precondition legible.
- Write commands additionally get `driftViewer.writeEnabled` (see
  `018_proposal_ux_write_capability_gating.md`).

---

## Edge Cases

1. **Offline schema mode** — `driftViewer.database.allowOfflineSchema` lets the Database tree work
   with no server. Schema-only commands (`schemaDiff`, `showErDiagram`, `generateSchemaDocs`,
   `generateDart`) must be enabled on cached schema, not on `serverConnected`; they need a separate
   `driftViewer.schemaAvailable` key rather than being lumped in.
2. **`enablement` vs palette `when`** — `enablement` greys the entry (teaches the precondition);
   `when: false` removes it (correct for argument-only commands). Do not use `when: false` for
   server-dependent commands, or discoverability drops.
3. **Keybindings already gated** — `openSqlNotebook` and `globalSearch` use
   `when: driftViewer.serverConnected`; the command `enablement` must agree with those, not conflict.
4. **Deep links must keep working** — `vscode.commands.executeCommand` ignores palette `when`, so
   hiding these does not break the suite integration.
5. **Tests** — `extension/src/test/` should assert that every command is either in a non-palette
   menu, in a launcher index, or carries an `enablement`, so the next added command cannot regress.

---

## Alternatives Considered

- **Split the argument-only commands into a private `driftViewer.internal.*` namespace.** Cleaner
  long-term, but renames public command ids that the sibling suite extensions already call.
- **Leave it; VS Code users are used to noisy palettes.** 163 entries under one category is past the
  point where the palette is a usable index, which is why three separate launchers exist (see
  `059_proposal_ux_single_source_tool_index.md`).

---

## Decision

---

## Implementation Notes

---

## Commits
