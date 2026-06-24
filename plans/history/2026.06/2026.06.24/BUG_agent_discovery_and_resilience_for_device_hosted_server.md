# Bug + Enhancement Report

**Status: Fixed** (Finding 1 resolved host-side in the extension; Finding 2 was
already shipped; Enhancement E3's host-manifest goal achieved via the extension
rather than the cross-repo Contacts script). See Finish Report at the end.

Found while an AI coding agent (Claude Code) used the Drift Advisor loopback
server as a live-DB research tool during a Saropa Contacts debugging session
(2026-06-24). The app runs on a **physical Motorola device** (wifi adb), which is
the configuration that exposes these gaps.

Three findings, in priority order:

1. **Discovery is effectively broken for the device-hosted case** — the
   server + its discovery manifest are written **on the device**, not the host,
   so an agent on the desktop cannot find or reach them without manual adb
   forwarding.
2. **Resilience** — twice, after an `/api/sql` POST, the server became
   unreachable on all endpoints. The first time only the advisor died (server
   wedge); the second time the whole app process stopped (VM service died too) —
   cause unconfirmed, see below. Either way the agent is left guessing.
3. **Integration opportunity** — a host-side helper script already exists in the
   Contacts repo that does device discovery/connection and could own the adb
   forward + a host manifest. See "Enhancement E3".

---

## Title

Drift Advisor's agent-discovery manifest and HTTP server are written on the
device (not the host) when the app runs on a physical device, so an external
host agent cannot discover or reach them; and the server/app can become fully
unreachable after a single `/api/sql` request.

---

## Environment

| Field | Value |
|---|---|
| OS (host) | Windows 11 Pro 10.0.22631 x64 |
| Client | Claude Code agent via `curl` (Git Bash) — headless HTTP, not the VS Code webview |
| Drift Advisor version | 4.1.10 (was 4.1.8 earlier same day); `schemaVersion:1` |
| Server flags (`/api/health`) | `ok:true`, `extensionConnected:false`, `writeEnabled:false`, `loopbackOnly:true`, `capabilities:["issues"]` |
| App under inspection | Saropa Contacts (Flutter), 351 contacts |
| Device | Motorola Edge 2022, Android 15 (API 35), connected over wifi adb (`192.168.1.151:42097`) |
| Server location | **In-app, on the device** (`lib/src/drift_debug_server_io.dart` runs in the Flutter VM on the device) |
| Reachability | Only via `adb forward tcp:8642 tcp:8642` (host→device). Direct host `127.0.0.1:8642` fails unless forwarded. |

---

## Finding 1 — Discovery manifest + server are device-side (root cause)

`lib/src/drift_debug_server_io.dart` is the VM-side server; when the app runs on
a device it executes **on the device**. Its discovery-manifest writer
(`_writeDiscoveryManifest`, ~line 600) resolves the path from the **device's**
`USERPROFILE`/`HOME` (`_discoveryManifestFile`, ~line 578) and records the
**device's** `pid` and `Directory.current.path`. So:

- The manifest is written to the **device** filesystem, never the host's
  `~/.saropa_drift_advisor/server.json`. On the host that file stays absent.
- The advertised `port` is the **device** port; the manifest advertises
  `host: 127.0.0.1`, which on the host means nothing until an adb forward exists.

Observed on host: `~/.saropa_drift_advisor/` exists but contains no
`server.json`. A full host port scan (38 listeners, IPv4+IPv6) found no
`/api/health` 200 responder. The server was only reachable after the agent
manually ran:

```
adb -s 192.168.1.151:42097 forward tcp:8642 tcp:8642
curl http://127.0.0.1:8642/api/health
-> {"ok":true,"version":"4.1.10",...,"endpoints":[...]}   # 200
```

**What's already good (v4.1.10):** `/api/health` now advertises an `endpoints`
list — partially addresses the API-contract gap. Keep that.

**Fix (E1, revised for device hosting):** the manifest must be discoverable on
the **host**. Options:
- Have the **VS Code extension / host-side bridge** (the component that knows it
  is talking to a device and sets up forwarding) write the host manifest with
  the **host-reachable** forwarded port and `transport:"adb-forward"`.
- Or, when running on Android, set up `adb reverse`/`forward` automatically and
  write the host manifest as part of "Start Drift Advisor against device".
- The in-app manifest is still fine for the desktop/emulator case; it just must
  not be the *only* manifest when the host and the DB are on different machines.

---

## Finding 2 — Server/app unreachable after an `/api/sql` request (resilience)

Two separate occurrences this session:

**Occurrence A (server wedge, advisor only).** Earlier (v4.1.8, direct 8642).
Sequence: `GET /api/health` 200 -> `POST /api/sql {COUNT(*)}` 200 ->
`POST /api/sql {SELECT name FROM pragma_table_info('contacts')}` **empty body**
-> `POST /api/sql {SELECT * FROM contacts LIMIT 1}` empty/then fail -> from then
on **every** endpoint incl. `/api/health` returned connection failure, no
self-recovery over ~10 retries.

**Occurrence B (whole app stopped).** Later (v4.1.10, forwarded 8642).
`GET /api/health` 200 -> `POST /api/sql {SELECT ... WHERE familyName LIKE ...}`
connection failure. Re-probe: **both** advisor `:8642` **and** the Dart VM
service (`:49306`) returned connection failure, while `adb devices` still listed
the device and the forward was intact. The VM service dying means the **app
process stopped**, not merely the advisor server. The user independently
observed "the app just stopped."

**Honest causation note:** the `/api/sql` body in Occurrence B was malformed (a
host-side shell quote-escaping slip produced `LIKE %Smith%` with the literal
unquoted). It is **unconfirmed** whether that malformed query crashed the app or
the app stopped for an unrelated reason. The device **logcat** at the moment of
the stop would settle it and was not captured. Do not treat "malformed query
crashes the app" as proven — but DO test it: a `/api/sql` handler must catch a
SQL parse/exec exception and return `{"error":...}`, never propagate into an
isolate/app crash.

**Ruled out (with evidence): BLOB serialization.** First theory was that
`SELECT *` pulled avatar blobs. False — the `contacts` table has no BLOB columns:
```
grep -nE "BlobColumn|Uint8List|blob" \
  d:/src/contacts/lib/database/drift/tables/user_data/contact_table.dart
-> (no matches)   # avatarUrl / avatarStringSVG are TextColumn
```

**Fix (E2):**
1. `/api/sql` must always return `{"rows":...}` or `{"error":...}` — never an
   empty body (Occurrence A returned empty bodies before the wedge).
2. Wrap query execution so a bad/slow/throwing query cannot take down the
   server or the app; `/api/health` must keep answering.
3. Add a server-side statement timeout + row cap, reported in the JSON envelope.

---

## Enhancement E3 — Use/extend the existing host-side connect script

The Contacts repo already has a host-side helper that does device discovery,
adb/wifi connection, health checks, and logcat streaming:

```
d:/src/contacts/scripts/build/wifi_connect_debug.py
```

It already establishes the adb connection to the device. It (or a Drift-Advisor-
owned equivalent) is the natural place to:
- run `adb forward tcp:8642 tcp:8642` automatically once connected, and
- write the **host** discovery manifest (`~/.saropa_drift_advisor/server.json`)
  with the host-reachable port + `transport:"adb-forward"` + device serial,

so an agent reads one host file and connects — no port scanning, no manual
forward. The Drift Advisor extension could either invoke such a script or
implement the same adb-forward + host-manifest step itself when it detects an
Android device target.

---

## Minimal Reproducible Example

```bash
# Discovery gap (device-hosted): host manifest never appears
ls ~/.saropa_drift_advisor/server.json            # absent while app runs on device
adb -s <serial> forward tcp:8642 tcp:8642          # only way to reach it
curl http://127.0.0.1:8642/api/health              # now 200

# Resilience: a malformed query
curl -s -X POST http://127.0.0.1:8642/api/sql \
  -H 'Content-Type: application/json' \
  --data-binary '{"sql":"SELECT * FROM contacts WHERE familyName LIKE %Smith%"}'
# Expected: {"error":"..."}.  Observed: connection failure; server/app unreachable.
```

---

## What I Already Tried

- Host port scan (38 listeners, IPv4 + IPv6) — no `/api/health` 200 responder.
- Looked for `~/.saropa_drift_advisor/server.json` — absent.
- `adb forward tcp:8642 tcp:8642` — made the advisor reachable (200) — proves
  device-side hosting + the forwarding requirement.
- Confirmed VM service (`:49306`) down at the same time as `:8642` in Occurrence
  B — proves the app process stopped, not just the advisor.
- Did NOT capture device logcat at the crash (the open follow-up).

---

## Impact

- **Who:** any external/automated host client when the app runs on a device
  (the normal mobile-dev case).
- **What is blocked:** discovery requires manual adb forwarding; a single
  query can end the session until a manual app/server restart.
- **Data risk:** none directly (read-only, `writeEnabled:false`). Risk is to
  workflow continuity and tool trust.
- **Frequency:** discovery gap is 100% (every device-hosted run); the
  unreachable-after-query behavior reproduced twice this session.

---

## Cross-repo note

Filed in `saropa_drift_advisor/bugs/` (the server's own repo). Evidence from the
Saropa Contacts repo (no-BLOB grep; the `wifi_connect_debug.py` path) is quoted
with exact commands/paths. No diagnostic `(owner, code)` pair is involved — this
is a runtime server/discovery bug, so the guide's Emitter Attribution section
does not apply.

---

## Finish Report (2026-06-24)

### Resolution summary

The device-hosted discovery gap (Finding 1) is closed from the **host side** in
the VS Code extension, which is the host-resident component that already
establishes the `adb forward`. Finding 2 (server/SQL resilience) was found
already implemented in the Dart server. Enhancement E3 proposed putting the
host-manifest write into the Contacts repo's `wifi_connect_debug.py`; that goal
is instead met inside this repo's extension (E1 option 1), so no cross-repo edit
was required.

### Finding 1 — host-side discovery manifest (implemented)

New module `extension/src/host-discovery-manifest.ts`:

- `writeHostManifest(host, port, transport, writtenAtIso, deps?)` publishes
  `~/.saropa_drift_advisor/server.json` on the **host** with the host-reachable
  (forwarded) port. It mirrors the in-app manifest's JSON keys (`host`, `port`,
  `version`, `schemaVersion`, `writeEnabled`, `loopbackOnly`, `capabilities`,
  `endpoints`, `startedAt`) so an agent parses one format, and adds two
  host-only fields: `source: "vscode-extension"` (ownership stamp) and
  `transport: "adb-forward" | "loopback"`.
- `/api/health` is fetched best-effort to enrich the file; when unreachable the
  writer still emits a valid `(host, port, transport)` manifest.
- **Ownership guard:** both the writer and `removeHostManifest` refuse to touch a
  manifest lacking the extension's `source` stamp. On the same-machine
  desktop/emulator case the in-app server owns that path and stays authoritative;
  the extension never clobbers or deletes it.

Wired into `extension/src/extension-bootstrap.ts`:

- On `discovery.onDidChangeServers` with a reachable server, the manifest is
  written for the primary server (configured port preferred, else first),
  deduped by port via a `lastManifestPort` closure so it is not rewritten on
  every scan. `transport` is `adb-forward` when a Flutter/Dart debug session is
  active (device/emulator), else `loopback`.
- When servers go empty, the extension-owned manifest is removed (stale-pointer
  prevention). A deactivation disposable also removes it so it does not outlive
  the session.

### Finding 2 — SQL/server resilience (already in place; verified, not changed)

`lib/src/server/sql_handler.dart` + `server_constants.dart` already satisfy E2:

- `/api/sql` always returns `{"rows": ...}` or `{"error": ...}` via
  `writeJsonResponse` (encode-safe), never an empty body.
- Query execution is bounded by `ServerConstants.sqlStatementTimeout` (30s) and
  wrapped in `try/catch` returning a JSON envelope, so a bad/slow/throwing query
  cannot wedge the handler or starve `/api/health`.
- A row cap (`maxSqlResultRows = 10_000`) clips wide results and reports the true
  count plus a `truncated` flag.

The one open item from Finding 2 — confirming whether a malformed query crashed
the **app process** (VM service down) — remains a runtime/diagnostic question
requiring device `logcat` at the moment of the stop. It is not a code defect in
this repo's server (the handler already catches SQL parse/exec exceptions); it
is left as a user-side capture if the app-stop recurs.

### Tests

`extension/src/test/host-discovery-manifest.test.ts` — 11 injected-IO unit tests
(no real disk/network) covering: manifest schema + health passthrough,
host-only stamps, the app-owned overwrite/delete guard, the unreachable-health
path, and write-error swallowing. `extension/src/test/extension.test.ts`
disposable-count assertion updated 237 -> 238 for the new deactivation cleanup
disposable. Scoped run (both files, `--no-config`): 40 passing. `tsc -p ./`
clean.

### Files touched

- `extension/src/host-discovery-manifest.ts` (new)
- `extension/src/extension-bootstrap.ts` (manifest write/remove lifecycle)
- `extension/src/test/host-discovery-manifest.test.ts` (new)
- `extension/src/test/extension.test.ts` (disposable count 237 -> 238)
- `CHANGELOG.md` (Unreleased: Added entry + Maintenance note)
