# Bug Report: Timeline snapshot auto-capture issues a full-table `SELECT *` sweep over every table on connect, hanging the host app's startup

## Title

On connect, the timeline auto-capture runs `SELECT * FROM "<table>" ORDER BY <pk> LIMIT 1000` against **every** table on the live connection with no row-count skip, monopolizing the host app's single SQLite connection and freezing its startup.

## Environment

| Field | Value |
|---|---|
| **OS** | Windows 11 Pro 10.0.22631 x64 |
| **VS Code version** | (reporter to fill — Help > About) |
| **Extension version** | drift-viewer 4.1.12 (`extension/package.json`) |
| **Dart SDK version** | (host app: Flutter/Dart; reporter to fill) |
| **Database type and version** | SQLite (Drift `NativeDatabase`), host app `saropa_contacts.db` |
| **Connection method** | Loopback HTTP server on `localhost:8642`, host app exposes the live Drift connection via `POST /api/sql` |
| **Relevant settings** | `driftViewer` enabled; host app `EnvType.DriftAdvisorEnabled` ON (debug default) |
| **Host-app specifics** | In **debug** builds the host (Saropa Contacts) opens Drift with a **same-isolate** `NativeDatabase` executor (not `createInBackground`) to dodge a VS Code debugger isolate-pause lockup. So every query the extension issues over the loopback runs on the host's **main UI isolate** and blocks the UI thread. |

## Steps to Reproduce

1. Open the Saropa Contacts Flutter app workspace in VS Code with the Drift Viewer / Advisor extension active.
2. Launch the app in **debug** mode (host opens the same-isolate Drift executor; loopback server binds `localhost:8642`).
3. The extension connects to the loopback server on app startup.
4. Observe the host app's debug console during the first ~10 seconds of launch.

## Expected Behavior

The extension's post-connect background work should not produce multi-hundred-millisecond full-table reads that serialize on the host's live connection during launch. Auto-capture should either skip large tables, project only what it needs, or yield between tables so the host's own startup queries are not starved.

## Actual Behavior

~6 seconds after connect (the grace window elapses), the timeline auto-capture fires a burst of full-row reads — one per table — that serialize on the single live connection. On the host's debug same-isolate executor these block the UI thread. Host debug log:

```
[database] Drift SLOW 188ms  SELECT * FROM "contacts" WHERE (...) ...        (host's own startup query)
[database] Drift SLOW 165ms  SELECT * FROM "contacts" ORDER BY "id" LIMIT 1000
[database] Drift SLOW 135ms  SELECT * FROM "emergency_services" ORDER BY "id" LIMIT 1000
[database] Drift SLOW 253ms  SELECT * FROM "family_groups" ORDER BY "id" LIMIT 1000
[database] Drift SLOW 261ms  SELECT * FROM "harry_potter_characters" ORDER BY "id" LIMIT 1000
[database] Drift SLOW 1407ms SELECT * FROM "inspirational_quotes" ORDER BY "id" LIMIT 1000
[database] Drift SLOW 772ms  SELECT * FROM "interesting_vocabulary" ORDER BY "id" LIMIT 1000
[database] Drift SLOW 271ms  SELECT * FROM "medical_conditions" ORDER BY "id" LIMIT 1000
[database] Drift SLOW 155ms  SELECT * FROM "mental_models" ORDER BY "id" LIMIT 1000
[database] Drift SLOW 240ms  SELECT * FROM "organizations" ORDER BY "id" LIMIT 1000
```

A later cycle in the same session also swept `star_trek_characters` (1450ms), `star_wars_characters` (1016ms), `you_tube_api_cache` (528ms), `activities` (444ms), `public_holidays`, `public_figures`, etc. — i.e. the whole schema, repeatedly.

The `ORDER BY "id" LIMIT 1000` queries account for several seconds of serialized read time across the static-content tables, with the large text-blob tables (`inspirational_quotes` 1407ms, `interesting_vocabulary` 772ms, `star_trek_characters` 1450ms) dominating. On the debug same-isolate executor this is a visible startup hang/freeze.

## Root Cause / Emit-Site Attribution (grep-proven)

The query shape `SELECT * FROM "<table>"${samplingOrderBy(pkCols)} LIMIT 1000` — ascending PK order, `LIMIT 1000` constant — is emitted by the **timeline snapshot capture**.

| Field | Value |
|---|---|
| Emit site | `extension/src/timeline/snapshot-store.ts:160` — `` `SELECT * FROM "${table.name}"${samplingOrderBy(pkCols)} LIMIT ${ROW_LIMIT}` `` |
| Constant | `extension/src/timeline/snapshot-store.ts:18` — `export const ROW_LIMIT = 1000;` |
| Loop | `extension/src/timeline/snapshot-store.ts:151-168` — `for (const table of metadata)` runs the read against **every** table, with **no `table.rowCount` skip** and no column projection |
| Trigger (startup) | `extension/src/extension-activation-event-wiring.ts:62` — `runHeavySweep()` calls `d.providers.snapshotStore.requestCapture(d.cachedClient)` |
| Grace window | `extension/src/extension-activation-event-wiring.ts:46` (`STARTUP_SWEEP_GRACE_MS = 6000`), `:153-154` (`scheduleHeavySweep(STARTUP_SWEEP_GRACE_MS)`) — **defers** the sweep 6s; does not chunk, throttle, or reduce it |

Greps used:
- `grep -rn 'LIMIT \${ROW_LIMIT}' extension/src/timeline/` → `snapshot-store.ts:160`, `snapshot-commands.ts:86`
- `grep -rn 'ROW_LIMIT =' extension/src/` → `snapshot-store.ts:18` (`= 1000`)
- `grep -rn 'requestCapture\|runHeavySweep\|scheduleHeavySweep' extension/src/` → trigger chain in `extension-activation-event-wiring.ts:50-74, 152-154, 226-230`

### The two defects

**Defect A — no large-table skip on the capture path.** The host app's integration comment claims the sweep "skips tables over 100k rows." That guard is `MAX_ROWS_FOR_NULL_SCAN = 100_000` at `extension/src/diagnostics/providers/data-quality-checks.ts:51`, and it gates only the **null-rate scan**. The **timeline capture loop** (`snapshot-store.ts:151`) has no equivalent guard: it pulls up to `ROW_LIMIT` full rows from every table unconditionally — including wide text-blob static-content tables that need no row-level capture for the timeline feature. `table.rowCount` is already available in the loop (read at `:164`) but is never used to skip.

**Defect B — one synchronous burst on a shared live connection; the grace window only moves it, it doesn't soften it.** `capture()` awaits each table's `SELECT *` in sequence with no yield/throttle between tables and no concurrency cap relief for the host. The 6s grace (`extension-activation-event-wiring.ts:153`) defers the burst past the host's *first* query wave, but the capture itself is a multi-second connection-monopolizing operation. When the host runs Drift on a same-isolate executor (its debug configuration, chosen to avoid a debugger isolate-pause hang), that burst blocks the UI thread — the freeze simply happens 6 seconds later instead of at t=0.

## Minimal Reproducible Example

Any SQLite database with a few tables containing ~1000+ rows of wide text columns (the host's `inspirational_quotes` / `interesting_vocabulary` static-content tables qualify). Connect the extension; ~6s later the per-table `SELECT * ... LIMIT 1000` burst appears in the DB query log.

## What the Reporter Already Tried / Confirmed

- Confirmed via the host's `main.dart` integration comment + the host's debug executor choice (`drift_database.dart` `_openConnection`, same-isolate `NativeDatabase` in `kDebugMode`) that extension queries run on the host's main UI isolate in debug.
- Confirmed the emit site by grep (above) — the queries are NOT host-app code; the host's static-data IO uses `COUNT` + `LIMIT/OFFSET`, never `SELECT * ORDER BY id LIMIT 1000`.
- Workaround available host-side: disabling the advisor (`EnvType.DriftAdvisorEnabled` OFF) stops the sweep. This is a workaround, not a fix — it disables the tool.

## Suggested Fixes (for the extension maintainer to evaluate)

1. **Add a row-count skip to the capture loop** mirroring the null-scan guard: in `snapshot-store.ts` `capture()`, skip (or store metadata-only, `rows: []`) any table whose `table.rowCount` exceeds a threshold (e.g. reuse/parallel the `100_000` figure, or a smaller capture-specific cap). The timeline diff over a 100k-row table is not useful at `LIMIT 1000` anyway — it silently truncates (see `branching/snapshot-to-branch.ts:43`).
2. **Throttle/yield between tables** so a startup capture cannot monopolize the host connection — e.g. `await` a short delay between table reads, or cap captured tables per tick.
3. **Project columns** — capture only PK + a hash/changed-marker rather than `SELECT *`, so wide text-blob tables don't transfer full row payloads over the loopback for a diff that only needs change detection.
4. **Skip auto-capture entirely while the host reports an active startup window** — the host could expose a "startup in progress" flag over the loopback, or the extension could lengthen the grace window adaptively when reads it issues are still logging as SLOW.

## Impact

- **Who is affected:** every developer running a host Flutter app in **debug** with this extension connected, where the host uses a same-isolate Drift executor (the standard debug configuration to avoid the debugger isolate-pause lockup). The host app freezes for several seconds on each launch.
- **What is blocked:** host app startup stalls/hangs ~6s after launch; in the worst case reads as the app being frozen.
- **Data risk:** none (read-only sweep).
- **Frequency:** every connect/launch while auto-capture is enabled.
- **Severity:** high for developer experience; not a shipped-app issue (the host gates the advisor to debug builds only).

## Resolution (FIXED)

Fixed in commit `968e6a5` (`fix(timeline): stop snapshot auto-capture from freezing host-app startup`). Both defects are closed; the grace window noted in the report was already in place and is retained.

**Defect A — large-table skip (Suggested Fix #1).** `extension/src/timeline/snapshot-store.ts` now defines `CAPTURE_MAX_ROWS = 50_000` (`:38`) and the capture loop skips any table whose live `rowCount` exceeds it, recording a metadata-only entry (`rowCount`/`columns`/`pkColumns` kept, `rows: []`, no `SELECT`) at `:198-206`. The timeline still shows the row-count delta; only per-row detail is dropped — which the `LIMIT 1000` sweep already truncated into a misleading partial slice for tables that large.

**Defect B — inter-table throttle (Suggested Fix #2).** `SnapshotStore` takes an `interTableYieldMs` constructor arg; the capture loop awaits that delay before each read after the first, gated on reads actually issued (`:214-217`). Production wires it to a 25ms default (config key `driftViewer.timeline.captureInterTableYieldMs`) at `extension/src/extension-providers.ts:143`, so the per-table reads interleave with the host's own startup queries on the shared same-isolate connection instead of monopolizing it. Defaults to 0 to keep existing fake-clock unit tests synchronous.

**Suggested Fixes #3 (column projection) and #4 (host startup flag) were not implemented** — the row-count skip plus the throttle resolve the reported hang without the loopback-protocol change #4 needs or the diff-format change #3 needs.

**Test coverage** (`extension/src/test/snapshot-store.test.ts`, all green):
- `captures tables above CAPTURE_MAX_ROWS metadata-only, issuing no SELECT for them` — Defect A.
- `throttles between per-table reads when interTableYieldMs is set` — Defect B (drives a fake clock to prove the second read is gated behind the delay).
