# Bug + Enhancement Report

Found while an AI coding agent (Claude Code) used the Drift Advisor loopback
server as a live-DB research tool during a Saropa Contacts debugging session
(2026-06-24). The app runs on a **physical Motorola device** (wifi adb).

NOTE: this file was created twice earlier and disappeared both times — likely a
git clean/reset/checkout in this repo while it was being edited. If it vanishes
again, preserve it manually.

Three findings, priority order:

1. **Resilience (CONFIRMED, with stack trace)** — a query with an invalid column
   name throws `SqliteException` at `prepare()`, the exception escapes the SQL
   handler, and the server stops answering ALL endpoints. The app process stays
   alive; only the advisor HTTP server dies. Requires a manual app restart.
2. **Discovery is broken for the device-hosted case** — server + discovery
   manifest are written ON THE DEVICE, so a host agent cannot find or reach them
   without manual `adb forward`.
3. **Integration opportunity** — `d:/src/contacts/scripts/build/wifi_connect_debug.py`
   already connects the device and could own the adb forward + a host manifest.

---

## Title

Drift Advisor in-app server is killed by any malformed `/api/sql` query
(uncaught `SqliteException`), and its agent-discovery manifest/port are
written on the device, unreachable from the host without manual adb forwarding.

---

## Environment

| Field | Value |
|---|---|
| OS (host) | Windows 11 Pro 10.0.22631 x64 |
| Client | Claude Code via `curl` (Git Bash) — headless HTTP |
| Drift Advisor version | 4.1.10 (embedded in the app on the device) |
| App | Saropa Contacts (Flutter), pkg `com.saropamobile.app`, 351 contacts |
| Device | Motorola Edge 2022, Android 15 (API 35), wifi adb `192.168.1.151:42097` |
| Server location | In-app, on the device (`lib/src/drift_debug_server_io.dart`) |
| Reachability | Only via `adb forward tcp:8642 tcp:8642` |
| Server flags (`/api/health`) | `ok:true`, `extensionConnected:false`, `writeEnabled:false`, `loopbackOnly:true` |

---

## Finding 1 — Resilience: uncaught SqliteException kills the server (CONFIRMED)

A query with an invalid column name throws at `prepare()`; the exception
propagates out of the SQL handler instead of being returned as `{"error":...}`.
After it throws, the server answers nothing (incl. `/api/health`). The app
process stays alive — verified `pid 3785 com.saropamobile.app` still running via
`adb shell ps`; only the advisor HTTP server is dead. No self-recovery; needs a
manual app restart.

Trigger here: the agent's SQL used camelCase column names while the schema is
snake_case. Device logcat (`adb logcat -d`, pid 3785):

```
I flutter : SqliteException(1): while preparing statement, no such column: givenName, SQL logic error (code 1)
I flutter : #0  throwException (package:sqlite3/.../exception.dart:101:3)
I flutter : #1  DatabaseImplementation._prepareInternal (.../database.dart:378:9)
I flutter : #4  Sqlite3Delegate._getPreparedStatement (package:drift/.../sqlite3/database.dart:183:29)
I flutter : #17 _runDriftQuery (package:saropa_drift_advisor/src/start_drift_viewer_extension.dart:21:26)
I flutter : #18 ServerContext.timedQuery (package:saropa_drift_advisor/src/server/server_context.dart:457:22)
I flutter : #20 SqlHandler.runSqlResult (package:saropa_drift_advisor/src/server/sql_handler.dart:63:13)
I flutter : #21 SqlHandler.handleRunSql (package:saropa_drift_advisor/src/server/sql_handler.dart:131:20)
I flutter : #22 Router._routeSqlApi (package:saropa_drift_advisor/src/server/router.dart:430:7)
I flutter : #23 Router._dispatch (package:saropa_drift_advisor/src/server/router.dart:124:7)
```

**Fix:** wrap `_runDriftQuery` / `ServerContext.timedQuery` /
`SqlHandler.runSqlResult` so any `SqliteException` (and any other throw) is
caught and returned as a JSON error (HTTP 400) — never allowed to escape the
request handler. `/api/health` must keep answering regardless. Also: `/api/sql`
must never return an empty body (earlier `pragma_table_info(...)` and `SELECT *`
queries returned empty bodies before wedging). Add a statement timeout + row cap
in the JSON envelope.

**Deployment note:** the advisor is embedded in the Contacts app. A source fix in
this repo only reaches the device after the **app is rebuilt and redeployed**
with the updated package. The device is currently running v4.1.10 — confirm the
fix is in the deployed build before closing.

**Ruled out (evidence): BLOB serialization.** `contacts` has no BLOB columns —
`grep -nE "BlobColumn|Uint8List|blob" d:/src/contacts/lib/database/drift/tables/user_data/contact_table.dart` → no matches.

---

## Finding 2 — Discovery is device-side, unreachable from the host

`drift_debug_server_io.dart` runs in the app on the device, so
`_writeDiscoveryManifest` (~line 600) resolves the **device's** `USERPROFILE`/
`HOME` and records the **device's** `pid`/cwd/port. The manifest lands on the
device; the host `~/.saropa_drift_advisor/server.json` stays absent. A full host
port scan (38 listeners, IPv4+IPv6) found no `/api/health` responder. Reachable
only after:

```
adb -s 192.168.1.151:42097 forward tcp:8642 tcp:8642
curl http://127.0.0.1:8642/api/health    # -> 200, version 4.1.10, endpoints[...]
```

(Good in v4.1.10: `/api/health` now advertises an `endpoints` list.)

**Fix:** the host-side component (VS Code extension / bridge) must write a HOST
manifest with the host-reachable forwarded port + `transport:"adb-forward"` +
device serial, and ideally set up the adb forward automatically when targeting
an Android device.

---

## Finding 3 / Enhancement — reuse the host connect script

`d:/src/contacts/scripts/build/wifi_connect_debug.py` already does device
discovery, wifi/adb connection, health checks, and logcat streaming. It (or a
Drift-Advisor-owned equivalent) is the natural owner of: `adb forward tcp:8642
tcp:8642` after connect, plus writing the host discovery manifest. Then an agent
reads one host file and connects — no scanning, no manual forward.

---

## Impact

- A single malformed query ends the session until a manual app restart (the
  agent cannot restart the app).
- Discovery requires manual adb forwarding on every device-hosted run.
- Read-only (`writeEnabled:false`), so no data-corruption risk; the cost is
  workflow continuity and tool trust.
- Resilience wedge reproduced 2× this session; discovery gap is 100% on device.

---

## Cross-repo note

Filed in `saropa_drift_advisor/bugs/` (the server's own repo). Contacts-repo
evidence (no-BLOB grep, the script path, the device logcat) is quoted with exact
commands. No diagnostic `(owner, code)` pair — runtime server bug, so the guide's
Emitter Attribution section does not apply.
