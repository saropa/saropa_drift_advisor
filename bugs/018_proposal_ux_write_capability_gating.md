# PROPOSAL: Gate Write Commands on `health.writeEnabled` with an Actionable "Wire writeQuery" Message

**Status: Open**

Created: 2026-09-02
Type: UX improvement

---

## Summary

`GET /api/health` reports `writeEnabled`, but exactly one command in the extension checks it. Every
other write-shaped command (seed, clear, import, branch restore, index create, constraint apply)
runs against a read-only server and fails per-statement with a raw HTTP error. Add a
`driftViewer.writeEnabled` context key, gate the write commands with it, and make the blocked state
teach the one-line fix.

**Wow: 6/10, Effort: Low**

---

## Motivation

The default wiring in the README's Quick start is read-only:

```dart
await myDb.startDriftViewer(enabled: kDebugMode);          // no writeQuery
await DriftDebugServer.start(query: ..., enabled: kDebugMode);  // no writeQuery
```

So the **majority** of first-time users have a read-only server. The extension shows them a full
menu of write commands anyway.

Grep proof of the single check:

```bash
grep -rn "writeEnabled" extension/src/ | grep -v /test/
# extension/src/api-types.ts:42:  writeEnabled?: boolean;
# extension/src/editing/editing-commands.ts:149,152,158
# extension/src/host-discovery-manifest.ts:80
```

Only `extension/src/editing/editing-commands.ts:149-158` gates on it. Unguarded write commands
declared in `extension/package.json`:

`driftViewer.seedTable`, `seedAllTables`, `seedWithProfiles`, `clearTable`, `clearAllTables`,
`clearTableGroup`, `importData`, `importDataset`, `clipboardImport`, `undoClipboardImport`,
`createAllIndexes`, `createBranch`, `branchFromSnapshot`, `constraintWizard`, `commitPendingEdits`.

None declare an `enablement` — every `contributes.commands` entry in `package.json` omits it — and
none appear in `contributes.menus.commandPalette` with a `when`, so all of them are always offered.

Today's experience on a read-only server: the user picks **Seed Test Data**, confirms a modal that
says "This will modify your database", and gets an HTTP error string with no explanation that the
app never wired a write callback. `createAllIndexes` is worse — it reports
`Created 0 index(es), 12 failed.` with the errors swallowed (see
`001_proposal_ux_index_apply_with_timing.md`).

---

## Detection / Behavior

### Should flag (blocked)

Server health returns `{"ok": true, "writeEnabled": false}`:

- `driftViewer.writeEnabled` context key is `false`.
- Write commands carry `"enablement": "driftViewer.writeEnabled"` and are hidden from the palette
  via a `contributes.menus.commandPalette` entry with the same `when`.
- Tree/panel buttons for write actions are hidden by the same `when`, not left clickable.
- If a write command is reached anyway (deep link, keybinding), a single shared guard shows:

```
Writes are disabled: this debug server started without a writeQuery callback.
[Show wiring snippet]  [Open API docs]
```

where **Show wiring snippet** opens an untitled Dart document containing:

```dart
await DriftDebugServer.start(
  query: (sql) async => (await myDb.customSelect(sql).get())
      .map((r) => Map<String, dynamic>.from(r.data)).toList(),
  writeQuery: (sql) async => myDb.customStatement(sql),
  enabled: kDebugMode,
);
```

### Should pass (unchanged)

- `writeEnabled: true` — every command behaves exactly as today.
- Read-only *analysis* commands (health score, anomalies, index **suggestions**, explain, profiler,
  compare, report) stay enabled; only the apply/mutate half is gated.
- `/api/indexes/preview` is documented as working on read-only servers
  (`lib/src/server/index_batch_handler.dart`), so index **preview** must not be gated.

---

## Edge Cases

1. **Health not yet fetched** — treat as unknown, leave commands enabled, and let the shared guard
   fetch health lazily; never hide a command because discovery has not finished.
2. **Server restarts with different wiring** — the context key must be refreshed by the same writer
   that owns `driftViewer.serverConnected` (`extension/src/connection-state.ts`) so the two can
   never disagree; do not add a second writer.
3. **VM Service transport with no HTTP** — health parity is documented in the README; if
   `writeEnabled` is unavailable on that transport, treat as unknown (see case 1).
4. **Offline/cached schema mode** (`driftViewer.database.allowOfflineSchema`) — no live server, so
   writes must be blocked with the "not connected" reason, not the "no writeQuery" reason.
5. **`driftViewer.lightweight`** — must not suppress the health fetch that feeds the key.

---

## Alternatives Considered

- **Per-command health check.** That is the `editing-commands.ts` pattern; repeating it 15 times
  duplicates the message and still leaves the commands visible in the palette.
- **Only improve the error text.** Better than today, but the user still walks into a modal that
  promises to modify the database before learning it cannot.
- **Ask the server to return a friendlier 4xx.** Server-side work for an extension-side problem, and
  it cannot hide the command from the palette.

---

## Decision

---

## Implementation Notes

---

## Commits
