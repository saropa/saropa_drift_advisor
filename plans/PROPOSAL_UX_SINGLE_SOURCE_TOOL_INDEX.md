# PROPOSAL: One Tool Registry Behind the Hub, Quick Pick, and Toolbox — 26 Headline Features Are in No Launcher

**Status: Open**

Created: 2026-09-02
Type: UX improvement

---

## Summary

The extension has three launchers with three hand-maintained lists: the Tools Hub webview (25 tiles),
the status-bar quick pick (16 items), and the Toolbox tree (4 entries, mostly a door into the Hub).
26 of the product's headline features — DVR, Time Travel, Data Branches, Profiler, Compare
Databases, Portable Report, Watch Panel, Ask in English, Visual Query Builder, Explain — appear in
none of them. Derive all three from one registry.

**Wow: 6/10, Effort: Medium**

---

## Motivation

`extension/src/hub/hub-tiles.ts:4` states the intent in its own header comment: the Hub is an
"index rather than a partial subset". It is a partial subset — 25 of 164 commands. And it disagrees
with the quick pick, which is a different partial subset.

Measured from `extension/src/hub/hub-tiles.ts` and `extension/src/status-bar-tools.ts` (v4.2.5):

```
hub tiles                : 25
status-bar quick pick    : 16
in quick pick, not in hub: driftViewer.openMutationStream
in hub, not in quick pick: about, clearAllTables, downloadDatabase, exportDataset, generateDart,
                           isarToDrift, openRulesConfig, openWalkthrough, showAnomalies, togglePolling
```

**In neither launcher** (command id → palette title):

```
openDvr                    Open Query Replay DVR
timeTravel                 Time Travel
openBranches               Data Branches
profileColumn              Profile Column
compareReport              Compare Databases
exportReport               Export Portable Report
openWatchPanel             Open Watch Panel
askNaturalLanguage         Ask in English
openQueryBuilder           Visual Query Builder
explainQuery               Explain Query Plan
constraintWizard           Constraint Wizard
shareSession               Share Debug Session
snapshotChangelog          Generate Snapshot Changelog
openBookmarks              Open Bookmarks
sizeAnalytics              Database Size Analytics
showIndexSuggestions       Show Index Suggestions
importData                 Import Data
migrationPreview           Preview Migration SQL
validateMigrationPaths     Validate Migration Paths
suggestSchemaRefactorings  Suggest Schema Refactorings
narrateRow                 Tell This Row's Story
sampleTable                Sample Table Data
compareRows                Compare Two Rows
generateSchemaVerifierTest Generate SchemaVerifier Test
scanDartSchemaDefinitions  Scan Dart Schema Definitions
captureSnapshot            Capture Snapshot
```

Every one of these is advertised in `README.md` under "VS Code Extension". A user who has not read
the README will not find them: the only remaining route is a 163-entry command palette with no
`enablement` (see `060_proposal_ux_command_palette_enablement.md`). `openDvr` in particular is the whole
of roadmap item 26 (Query Replay DVR, Wow 5→7) and is unreachable from any UI affordance.

This also violates the repo's own single-source-of-truth rule: the same command id, label, and icon
are typed out in `hub-tiles.ts`, `status-bar-tools.ts`, and — for the 27 `view/item/context` and 32
`view/title` entries — in `package.json`.

---

## Detection / Behavior

### Should flag (problematic)

A new feature command is added and appears in the palette but in no launcher — exactly what happened
to the 26 above.

### Should pass (correct)

One exported registry, e.g. `extension/src/hub/tool-registry.ts`:

```ts
export interface IToolEntry {
  id: string;                 // driftViewer.* command id
  labelKey: string;           // NLS key, shared by every surface
  icon: string;               // codicon name
  category: ToolCategory;     // Schema | Health | Data | Visualize | Query | Time | Collaborate
  requires: 'none' | 'server' | 'schema' | 'write';
  inQuickPick?: boolean;      // curated top-N for the status bar
  danger?: boolean;
}
```

- `hub/hub-tiles.ts` renders every entry, grouped by `category`.
- `status-bar-tools.ts` renders the `inQuickPick` subset — a deliberate curation, not an accident.
- The Toolbox tree renders the same categories as collapsible nodes, so the sidebar becomes a real
  index instead of a single "Drift Tools Hub" button.
- `requires` feeds the `enablement` / `when` work in the palette proposal from one place.
- A unit test asserts every `contributes.commands` id is either in the registry or on an explicit
  `INTERNAL_COMMANDS` allowlist (deep-link receivers, tree-item handlers). That test is what stops
  the 26-feature gap from re-forming.

---

## Edge Cases

1. **Quick pick must stay short.** The status-bar pick is a shortcut, not an index; `inQuickPick`
   keeps it curated while the Hub grows.
2. **Argument-only commands** (`removeChange`, `copyTableName`, suite deep links) belong on the
   allowlist, not in the registry — they are not user-launchable.
3. **NLS.** `hub-tiles.ts` already uses `labelKey`; `status-bar-tools.ts` uses hard-coded English
   strings (`'$(heart) Health Score'`). Unifying on `labelKey` fixes an existing localization hole.
4. **Icon divergence.** Hub uses its own icon names (`hub/hub-icons.ts`), the quick pick uses
   codicons, `package.json` uses codicons. The registry should carry the codicon name and let the
   Hub map it, so `$(pulse)` cannot mean two different pictures in two places.
5. **Danger tiles** (`clearAllTables`) must keep their existing `danger: true` styling.
6. **Ordering** must be stable so muscle memory survives a release.

---

## Alternatives Considered

- **Add the 26 missing commands to both lists by hand.** Fixes today, guarantees the same drift
  next release; the lists have already diverged twice (one item in the quick pick only, ten in the
  Hub only).
- **Delete the quick pick, keep only the Hub.** Loses the one-keystroke path from the status bar,
  which is the fastest route for the connected-and-working case.
- **Generate the Hub from `package.json` alone.** `package.json` has no category or precondition
  metadata, and 102 commands have no menu entry to categorize them by.

---

## Decision

---

## Implementation Notes

---

## Commits
