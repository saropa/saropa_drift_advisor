# Feature 60: Time-Travel Data Slider

## What It Does

Scrub a timeline slider to see table data at any historical snapshot point. Built on the existing Snapshot Timeline infrastructure (Feature 12), this adds a visual slider control that lets you "rewind" a table to see its state at any captured snapshot. Watch rows appear, disappear, and change values frame-by-frame.

## User Experience

1. Open a table's data view
2. Click the clock icon to enable time-travel mode
3. A slider appears at the top spanning all captured snapshots
4. Drag the slider → table data updates to show the state at that snapshot
5. Changed cells highlighted with diff colors (green = added, red = removed, yellow = changed)
6. Play button auto-advances through snapshots like an animation

```
╔══════════════════════════════════════════════════════════════╗
║  TABLE: orders — Time Travel Mode                            ║
║  ◀ ▶ ⏸  ──●──────────────────────────────── ▶              ║
║  Snapshot 3 of 14 — 10:42:15 (2 min ago)                    ║
║  3 rows added, 1 changed since previous                      ║
╠══════════════════════════════════════════════════════════════╣
║  id  │ user_id │ total   │ status    │ created_at            ║
║  ────┼─────────┼─────────┼───────────┼───────────────────── ║
║   91 │ 42      │  59.99  │ shipped   │ 2026-03-08            ║
║   92 │ 42      │ 120.00  │ [pending] │ 2026-03-09  ← yellow ║
║  +93 │ 17      │  35.50  │ delivered │ 2026-03-10  ← green  ║
║  +94 │ 8       │  22.00  │ pending   │ 2026-03-10  ← green  ║
║  +95 │ 42      │  15.99  │ pending   │ 2026-03-10  ← green  ║
╚══════════════════════════════════════════════════════════════╝
```

## New Files

```
extension/src/time-travel/
  time-travel-panel.ts        # Webview panel with slider + table
  time-travel-html.ts         # HTML template
  time-travel-engine.ts       # Snapshot data retrieval + diff computation
  time-travel-types.ts        # Interfaces
extension/src/test/
  time-travel-engine.test.ts
```

## Modified Files

```
extension/src/extension.ts              # Register command
extension/src/timeline/timeline-provider.ts  # Expose snapshot data for time-travel
extension/package.json                  # Command + context menu
```

## Dependencies

- `DriftTimelineProvider` — existing snapshot capture and storage
- `api-client.ts` — `sql()` for fetching table data at current state
- Snapshot data stored in workspace state by the timeline provider

## Architecture

### Snapshot Data Model

The existing `DriftTimelineProvider` captures row snapshots on generation change. Each snapshot contains per-table row data:

```typescript
interface ITimelineSnapshot {
  id: number;
  timestamp: number;
  generation: number;
  tables: Record<string, ITableSnapshot>;
}

interface ITableSnapshot {
  rowCount: number;
  rows: Record<string, unknown>[];
  columns: string[];
}
```

### Time-Travel Engine

Retrieves snapshot data and computes diffs between adjacent snapshots:

```typescript
interface ITimeTravelState {
  snapshotIndex: number;
  table: string;
  rows: ITimeTravelRow[];
  totalSnapshots: number;
  timestamp: number;
  diffSummary: { added: number; removed: number; changed: number };
}

interface ITimeTravelRow {
  data: Record<string, unknown>;
  status: 'unchanged' | 'added' | 'removed' | 'changed';
  changedColumns: string[];
}

class TimeTravelEngine {
  constructor(private readonly _timeline: DriftTimelineProvider) {}

  getSnapshotCount(): number {
    return this._timeline.snapshots.length;
  }

  getStateAt(table: string, snapshotIndex: number): ITimeTravelState {
    const snapshots = this._timeline.snapshots;
    const current = snapshots[snapshotIndex];
    const previous = snapshotIndex > 0 ? snapshots[snapshotIndex - 1] : undefined;

    const currentRows = current.tables[table]?.rows ?? [];
    const previousRows = previous?.tables[table]?.rows ?? [];

    const rows = this._diffRows(currentRows, previousRows, current.tables[table]?.columns ?? []);

    return {
      snapshotIndex,
      table,
      rows,
      totalSnapshots: snapshots.length,
      timestamp: current.timestamp,
      diffSummary: {
        added: rows.filter(r => r.status === 'added').length,
        removed: rows.filter(r => r.status === 'removed').length,
        changed: rows.filter(r => r.status === 'changed').length,
      },
    };
  }

  private _diffRows(
    current: Record<string, unknown>[],
    previous: Record<string, unknown>[],
    columns: string[],
  ): ITimeTravelRow[] {
    const pkCol = columns[0];  // Assume first column is PK
    const prevMap = new Map(previous.map(r => [String(r[pkCol]), r]));
    const currMap = new Map(current.map(r => [String(r[pkCol]), r]));
    const rows: ITimeTravelRow[] = [];

    // Current rows: unchanged, added, or changed
    for (const row of current) {
      const pk = String(row[pkCol]);
      const prev = prevMap.get(pk);
      if (!prev) {
        rows.push({ data: row, status: 'added', changedColumns: [] });
      } else {
        const changed = columns.filter(c => row[c] !== prev[c]);
        rows.push({
          data: row,
          status: changed.length > 0 ? 'changed' : 'unchanged',
          changedColumns: changed,
        });
      }
    }

    // Removed rows (in previous but not current)
    for (const row of previous) {
      const pk = String(row[pkCol]);
      if (!currMap.has(pk)) {
        rows.push({ data: row, status: 'removed', changedColumns: [] });
      }
    }

    return rows;
  }
}
```

### Playback Controller

Client-side JS in the webview handles animation playback:

```typescript
// Webview-side
let playbackInterval: number | null = null;
const PLAYBACK_SPEED_MS = 1000;

function play(): void {
  playbackInterval = setInterval(() => {
    if (currentIndex >= totalSnapshots - 1) {
      pause();
      return;
    }
    currentIndex++;
    slider.value = String(currentIndex);
    vscode.postMessage({ command: 'seekTo', index: currentIndex });
  }, PLAYBACK_SPEED_MS);
}

function pause(): void {
  if (playbackInterval !== null) {
    clearInterval(playbackInterval);
    playbackInterval = null;
  }
}
```

### Webview Message Protocol

Webview → Extension:
```typescript
{ command: 'seekTo', index: number }
{ command: 'play' }
{ command: 'pause' }
{ command: 'setTable', table: string }
{ command: 'setSpeed', speedMs: number }
```

Extension → Webview:
```typescript
{ command: 'state', state: ITimeTravelState }
{ command: 'snapshotInfo', count: number, timestamps: number[] }
{ command: 'tables', names: string[] }
```

## Server-Side Changes

None. Uses existing snapshot data captured by `DriftTimelineProvider`.

## package.json Contributions

```jsonc
{
  "contributes": {
    "commands": [
      {
        "command": "driftViewer.timeTravel",
        "title": "Saropa Drift Advisor: Time Travel",
        "icon": "$(history)"
      }
    ],
    "menus": {
      "view/item/context": [
        {
          "command": "driftViewer.timeTravel",
          "when": "viewItem == driftTable || viewItem == driftTablePinned",
          "group": "1_view"
        }
      ]
    },
    "configuration": {
      "properties": {
        "driftViewer.timeTravel.playbackSpeedMs": {
          "type": "number",
          "default": 1000,
          "minimum": 200,
          "maximum": 5000,
          "description": "Playback speed in milliseconds per snapshot."
        }
      }
    }
  }
}
```

## Testing

- `time-travel-engine.test.ts`:
  - Single snapshot → all rows "unchanged", no diff
  - Row added between snapshots → status "added"
  - Row removed between snapshots → status "removed"
  - Row value changed → status "changed", `changedColumns` populated
  - First snapshot (no previous) → all rows "added"
  - Empty table at snapshot → empty rows array
  - Table not present in snapshot → empty rows array
  - Multiple changes in same row → all changed columns listed
  - Diff summary counts are accurate
  - Snapshot index bounds checked (0 to count-1)

## Integration Points

### Shared Services Used

| Service | Usage |
|---------|-------|
| SchemaIntelligence | Column metadata for diff display |

### Consumes From

| Feature | Data/Action |
|---------|-------------|
| Snapshot Timeline (12) | Snapshot data storage |
| Query Replay DVR (26) | Sync slider to DVR position |
| Data Branching (37) | View branch state at creation time |

### Produces For

| Feature | Data/Action |
|---------|-------------|
| Row Comparator (33) | Compare row at two time points |
| Data Branching (37) | "Create Branch from Snapshot" |
| Unified Timeline (6.1) | Visual representation of data state |

### Cross-Feature Actions

| From | Action | To |
|------|--------|-----|
| Time-Travel Slider | "Create Branch Here" | Data Branch from snapshot |
| Time-Travel Slider | "Compare to Now" | Row Comparator |
| Time-Travel Slider | "View Changes" | Snapshot Changelog Narrative |
| DVR Timeline | "Sync Time-Travel" | Slider jumps to DVR position |
| Table Data Viewer | "Show History" | Time-Travel for current table |
| Unified Timeline | "View Data at Point" | Slider jumps to event time |

### Unified Timeline Integration

Time-Travel Slider syncs with the Unified Timeline (Phase 6):

```
┌─────────────────────────────────────────────────────────┐
│ UNIFIED TIMELINE                                        │
├─────────────────────────────────────────────────────────┤
│ 15:42 │ 📊 DATA │ +3 users, +12 orders                 │
│       │         │ [View in Time-Travel]  ← clicks here │
├───────┴─────────┴───────────────────────────────────────┤
│                                                         │
│ TIME-TRAVEL: orders — Snapshot 3 of 14                 │
│ ◀ ▶ ⏸  ──────●───────────────────────── ▶             │
│              ↑ synced to 15:42                          │
└─────────────────────────────────────────────────────────┘
```

### DVR Sync Mode

When DVR is recording, Time-Travel can sync to query execution points:

```typescript
// DVR scrub triggers Time-Travel sync
dvrPanel.onQuerySelected((query) => {
  const nearestSnapshot = timeline.findSnapshotNear(query.timestamp);
  timeTravelPanel.seekTo(nearestSnapshot.id);
});
```

### Branch Creation from Snapshot

"Create Branch Here" captures the historical state:

```typescript
// Create branch from time-travel position
commands.registerCommand('driftViewer.branchFromSnapshot', async (snapshotId) => {
  const snapshot = timeline.getSnapshot(snapshotId);
  const branch = await branchManager.createFromSnapshot(snapshot);
  vscode.window.showInformationMessage(
    `Branch "${branch.name}" created from snapshot at ${snapshot.timestamp}`
  );
});
```

---

## Known Limitations

- Depends on snapshots being captured — if auto-capture is disabled or interval is too long, gaps appear in the timeline
- Maximum 20 snapshots retained (existing timeline limit) — older data is lost
- Snapshot data is stored in workspace state, which has size limits — large tables with many snapshots may be truncated
- PK detection assumes first column — tables without a clear PK may show incorrect diffs
- Removed rows shown at the bottom with strikethrough — no positional stability
- No interpolation between snapshots — data jumps discretely
- Playback doesn't capture new snapshots — it only replays existing ones

---

## Implementation Plan

Build bottom-up so the diff logic is proven before any UI consumes it. Each phase ends at a verifiable gate; do not start phase N+1 until phase N's gate is green. Files and test cases referenced below are defined in **New Files**, **Architecture**, and **Testing** above — this is the order to build them, not a restatement.

### Phase 1 — Expose snapshot data
- Extend `timeline/timeline-provider.ts` to surface per-table row snapshots (`ITimelineSnapshot` / `ITableSnapshot`) for read by the engine. The provider already captures on generation change; this only adds an accessor, no new capture path.
- **Gate:** the provider returns ordered snapshots with per-table rows + columns for a table that changed across two generations.

### Phase 2 — Time-travel engine (pure logic, no VS Code dependency)
- Implement `time-travel-engine.ts`: `getSnapshotCount()`, `getStateAt(table, index)`, and `_diffRows` (PK = first column; added/removed/changed/unchanged classification, `diffSummary` counts).
- **Gate:** `time-travel-engine.test.ts` green for all listed cases — first-snapshot-all-added, add/remove/change classification, multi-column change, bounds checks.

### Phase 3 — Webview panel + playback
- Build `time-travel-panel.ts` + `time-travel-html.ts`: slider bound to snapshot index, diff-colored cells (green added / red removed / yellow changed), and the play/pause controller driving `seekTo` messages.
- **Gate:** dragging the slider re-renders the table at each snapshot with correct cell highlighting; play auto-advances and stops at the last snapshot.

### Phase 4 — Command wiring + discovery
- Register `driftViewer.timeTravel`, the `view/item/context` entry on table items, and the playback-speed config; wire in `extension.ts`.
- **Gate:** "Time Travel" appears on a table's context menu and opens the panel for that table; speed config takes effect.

### Phase 5 — Cross-feature hooks (optional, gated on other features)
- Wire "Create Branch Here" (needs [37](./37-data-branching.md)) and DVR sync (needs [26](./26-query-replay-dvr.md)). Each is additive and behind a capability check; ship phases 1–4 without them.
- **Gate:** when 37/26 are present, the actions appear; when absent, they are hidden, not broken.

---

## Finish Report (2026-06-10) — Phases 1–4

**Feature.** Time-Travel Data Slider: a webview slider that scrubs a table through captured snapshots, diff-coloring rows added/removed/changed between adjacent snapshots, with playback.

**Scope.** (B) VS Code extension (TypeScript). New webview feature; one new user-facing command + context-menu entry. No Dart/server code.

**What changed vs the original plan.** The plan assumed snapshots lived on `DriftTimelineProvider` with a "first column is the PK" diff. Reality is richer: the existing `SnapshotStore` (Feature 12) already captures full per-table rows **with `pkColumns`**. The engine was built on `SnapshotStore` and uses the real composite primary key (via the shared `pkKey` helper), falling back to first-column then full-row signature — strictly better row identity than the plan sketched, and consistent with `computeTableDiff`.

**Files.**
- `time-travel/time-travel-types.ts` (new) — `RowStatus`, `ITimeTravelRow`, `ITimeTravelState`, `ITimeTravelDiffSummary`.
- `time-travel/time-travel-engine.ts` (new, Phase 1+2) — `TimeTravelEngine` over `SnapshotStore`: `getSnapshotCount`, `getTimestamps`, `getTableNames`, `getStateAt(table, index)` diffing each snapshot against the previous; out-of-range returns an empty frame (never throws).
- `time-travel/time-travel-html.ts` (new, Phase 3) — interactive shell: sticky controls (table picker, speed 0.5×–4×, prev/play/next, range slider), diff-colored grid, client-side playback timer, `ready`/`seekTo`/`setTable` message protocol.
- `time-travel/time-travel-panel.ts` (new, Phase 3) — singleton panel wiring the engine to the webview; opens on the latest snapshot; re-renders live on `store.onDidChange`; clamps the index when the rolling window trims old snapshots.
- `timeline/snapshot-commands.ts` (Phase 4) — registers `driftViewer.timeTravel` (accepts a `TableItem` from the context menu, else QuickPicks a table with snapshot history; info message when no snapshots exist).
- `package.json` (Phase 4) — command declaration (`$(history)` icon) + `view/item/context` entry on `driftTable`/`driftTablePinned` in the `1_view` group.
- `test/time-travel-engine.test.ts` (new) — 13 cases covering the full plan matrix plus composite-PK and empty-store.
- `test/extension.test.ts` — disposable count 210 → 211 (the new command).

**Deviation from plan (intentional).** The plan listed a `driftViewer.timeTravel.playbackSpeedMs` config. The webview ships an in-panel speed picker (0.5×–4×) instead, which is a better UX and avoids a config key with no live consumer (project rule: no dead config). Not added.

**Testing.** `npm run compile` clean; `npm test` → **2645 passing** (+13 engine + others). The exhaustive command-wiring tests pass, confirming `driftViewer.timeTravel` is both declared in `contributes.commands` and registered at runtime.

**Outstanding.** Phase 5 only — the optional cross-feature hooks ("Create Branch Here" needs Feature 37; DVR sync needs Feature 26). Both are explicitly gated/optional in the plan above ("ship phases 1–4 without them"). Feature 37 is the next build item (top-5 Item 5), after which the branch-from-snapshot hook can be wired. Plan stays active for Phase 5.

**Finish report appended:** plans/60-time-travel-data-slider.md (this section). Plan stays active — Phases 1–4 complete, Phase 5 (optional cross-feature hooks) deferred and documented in-place.
