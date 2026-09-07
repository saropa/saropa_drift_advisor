# PROPOSAL: Compute the Health Score on Connect So the Status Bar Grade Is the First Thing a User Sees

**Status: Open**

Created: 2026-09-02
Type: UX improvement

---

## Summary

`HealthStatusBar` renders a colour-coded grade (`$(heart) Health: B (82)`) but is hidden until the
user finds and runs `driftViewer.healthScore` from a 163-entry palette — the score is never computed
on connect. Compute it once when a server is first discovered and show the grade, turning the
product's single best summary signal into a zero-click one.

**Wow: 7/10, Effort: Low**

---

## Motivation

The scoring machinery is complete and already colour-codes itself:

- `extension/src/status-bar-health.ts` — priority 80 item, `testing.iconPassed` green for A, default
  for B, `statusBarItem.warningBackground` for C/D/F. Header comment: "Hidden until the first health
  check is run."
- `extension/src/health/health-scorer.ts:48` — weighted metric roll-up into `{overall, grade}`.

Grep proof that the only writer is the command handler:

```bash
grep -rn "healthStatusBar" extension/src/ | grep -v /test/
# extension/src/health/health-commands.ts:47:  healthStatusBar?.update(score.overall, score.grade);
# extension/src/extension-activation-event-wiring.ts:77,105:  statusBars?.healthStatusBar.hide();
```

`update()` is called from exactly one place — inside `driftViewer.healthScore`. Everywhere else only
calls `hide()`. So the sequence for a new user is: install → run app → server discovered →
`driftViewer.dashboard.showOnConnect` (default `true`) opens the Dashboard → **and the health grade
is still blank**, because nothing asked for it.

The precedent for auto-work on connect already exists in this codebase and is on by default
(`driftViewer.dashboard.showOnConnect`). The health score is cheaper to justify than opening a panel:
one status-bar item, no focus steal, and it is the one number that summarises whether the database
needs attention.

Competitive framing: DB Browser for SQLite, DataGrip, and the Drift DevTools extension all show you
a database. None of them greet you with a graded verdict on it. That greeting is currently built and
switched off.

---

## Detection / Behavior

### Should flag (problematic)

Server connects, tree populates, status bar shows only the connection item. Health grade requires a
palette round-trip.

### Should pass (correct)

On the first transition into a connected state (owned by
`extension/src/connection-state.ts` — do not add a second writer):

1. Debounce ~2 s after `driftViewer.serverConnected` becomes true and the Database tree is non-empty
   (`driftViewer.databaseTreeEmpty === false`), so a flapping discovery cannot trigger repeated
   scans.
2. Run the same scorer the command runs, and call `healthStatusBar.update(...)`.
3. Tooltip becomes the metric breakdown plus "click to re-check" (it currently says only the latter).
4. On a C/D/F grade, the warning background is already the nudge — no toast, no focus steal.
5. Recompute on explicit refresh and on server change, not on every generation tick.

New setting, mirroring the dashboard one:

```jsonc
"driftViewer.health.computeOnConnect": {
  "type": "boolean",
  "default": true,
  "description": "%config.health.computeOnConnect.description%"
}
```

---

## Edge Cases

1. **`driftViewer.lightweight` is `true`** — skip the auto-scan; that setting exists to keep the
   extension quiet.
2. **Large databases** — the scorer issues analytics queries against the user's live app. Run once,
   not on a timer, and respect `driftViewer.performance.slowThresholdMs` semantics by logging rather
   than warning if the scan itself is slow.
3. **Offline / cached schema** (`driftViewer.database.allowOfflineSchema`) — no live data, so no
   score; keep the item hidden rather than showing a stale grade.
4. **Write-disabled server** — scoring is read-only, so it must work; do not gate it on
   `writeEnabled`.
5. **Scan failure** — hide the item and log; never show a grade the extension could not compute, and
   never toast on connect.
6. **Multi-server** (`driftViewer.selectServer`) — the grade must be re-computed when the selected
   server changes, and cleared in between, or it silently describes the wrong database.

---

## Alternatives Considered

- **Toast the grade on connect.** Rejected: a notification on every debug session is the fastest way
  to get the extension muted.
- **Put the grade in the Dashboard only.** The Dashboard is a panel the user may close;
  the status bar is the persistent surface, and the item is already built for it.
- **Run health as a pre-launch task.** That already exists (`contributes.taskDefinitions`) but is
  opt-in via `launch.json` — it does not help the fresh install.

---

## Decision

---

## Implementation Notes

---

## Commits
