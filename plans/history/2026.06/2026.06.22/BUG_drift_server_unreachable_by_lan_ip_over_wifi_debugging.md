# Bug / Friction Report

**Status:** Fixed

## Title

Drift debug server is unreachable by its device LAN IP over Wi-Fi debugging — loopback-only default refuses the connection, and the startup banner only documents the `adb forward` path, so a LAN-IP client gets a silent connection-refused indistinguishable from "no server."

> Filed from the `saropa_lints` side. The Saropa Lints VS Code extension consumes this server's `GET /api/health` + `GET /api/issues`. The lints client was just enhanced to probe multiple hosts/ports (`saropaLints.driftAdvisor.hosts`, accepting `host` and `host:port` entries), so a user can now point it at a device's LAN IP. This report covers the **server-side** half: even with the client pointed at the device IP, the connection is refused unless the server binds a non-loopback interface, and nothing in-product tells the user that.

---

## Environment

| Field | Value |
|---|---|
| **OS (dev machine)** | Windows 11 Pro 10.0.22631 x64 |
| **Device** | motorola edge 2022 — Android 15 (API 35), `android-arm64` |
| **Connection method** | Wi-Fi ADB (wireless debugging). Device reachable at `192.168.1.151:38317` (the adb daemon port, **not** the drift HTTP port). |
| **Drift server port** | Default `8642` (`ServerConstants.defaultPort`) |
| **Drift Advisor version** | _needs fill — check the running app's `pubspec.lock` / `/api/health` `version`_ |
| **Saropa Lints extension version** | v14.0.7 (consumer; client-side multi-host support is in the next release) |
| **Relevant server settings** | `DriftDebugServer.start(loopbackOnly: <default true>, authToken: <unset>)` |

---

## Steps to Reproduce

1. Build/run a Flutter app that embeds `saropa_drift_advisor` and calls `DriftDebugServer.start(...)` with default options (i.e. `loopbackOnly: true`, no `authToken`).
2. Deploy that app to a physical Android device.
3. Connect the device to the dev machine over **Wi-Fi debugging** (not USB, not emulator): `adb connect 192.168.1.151:38317`. Confirm `flutter devices` lists it.
4. Note the server's startup banner in logcat: it prints `http://127.0.0.1:8642` and `adb forward tcp:8642 tcp:8642`.
5. From the dev machine, attempt to reach the server by the **device's LAN IP**, not localhost: `curl http://192.168.1.151:8642/api/health`.

---

## Expected Behavior

One of the following, so a developer debugging over Wi-Fi by IP is not left guessing:

- The server is reachable at `http://192.168.1.151:8642/api/health` (i.e. it bound a LAN-accessible interface), **or**
- The startup banner / docs explicitly state that LAN-IP access requires `loopbackOnly: false` (+ an `authToken`), and show the reachable `http://<lan-ip>:<port>` URL once that is set — alongside the existing `adb forward` hint, not instead of it.

---

## Actual Behavior

- With the default `loopbackOnly: true`, the server binds `InternetAddress.loopbackIPv4` **inside the device's network namespace** (`lib/src/drift_debug_server_io.dart:344-346`, `:351`). The LAN IP `192.168.1.151:8642` is therefore refused: `curl` returns connection-refused.
- The startup banner (`lib/src/drift_debug_server_io.dart:390-402`) only emits the loopback URL `http://127.0.0.1:8642` and the `adb forward tcp:8642 tcp:8642` command. It never mentions the LAN-IP path or the loopback-only constraint, so a user doing Wi-Fi-by-IP debugging has no in-product signal that the IP route is closed by design.
- A client that scans the LAN IP (Saropa Lints) sees a plain connection-refused, which is indistinguishable from "no server running" — so the lints dashboard shows **"No Drift Advisor server found on configured ports"** with no hint that the server is up but loopback-bound.

---

## Error Output

No error is produced — that is the core of the report. The connection is silently refused at the socket layer; the server logs nothing (the request never reaches it), and the client cannot tell "absent" from "loopback-only."

- Server startup banner (logcat `I/flutter`): prints `http://127.0.0.1:8642` + `adb forward tcp:8642 tcp:8642` (see `lib/src/drift_debug_server_io.dart:406-418`).
- `GET /api/health` does **not** advertise the bind interface / `loopbackOnly` state, so a reachable-but-loopback server cannot be distinguished from an absent one by a remote probe.

---

## Emitter Attribution (diagnostic / linter / analyzer bugs only)

N/A — this is a networking / discoverability issue, not a diagnostic with an `(owner, code)` payload. No emitter attribution applies.

---

## Minimal Reproducible Example

```dart
// In the device app:
await DriftDebugServer.start(
  // loopbackOnly defaults to true -> binds 127.0.0.1 in the DEVICE namespace.
  // Reachable from the dev machine only via `adb forward`, never by LAN IP.
  port: 8642,
);
```

```bash
# From the dev machine, over Wi-Fi debugging, by device IP:
curl http://192.168.1.151:8642/api/health      # connection refused (loopback-only)

# Contrast — the only documented path works:
adb -s 192.168.1.151:38317 forward tcp:8642 tcp:8642
curl http://127.0.0.1:8642/api/health           # 200 OK
```

---

## What I Already Tried

- `adb forward tcp:8642 tcp:8642` then connecting to `127.0.0.1:8642` **does** work — confirming the server is healthy and the only blocker is the bind interface + the missing LAN-IP guidance.
- Pointing the Saropa Lints client at the device LAN IP (`saropaLints.driftAdvisor.hosts: ["192.168.1.151"]`, port range covering 8642) does **not** connect while the server is loopback-only — as expected, since the socket is refused before any HTTP.
- Confirmed in source that `loopbackOnly` defaults to `true` (`lib/src/drift_debug_server_io.dart:125`, `:193`) and selects `InternetAddress.loopbackIPv4` (`:344-346`).

---

## Regression Info

Not a regression. The loopback-only default is an **intentional** security hardening (CHANGELOG.md ~v line 327: "The debug server is now private by default: it binds to your machine only (127.0.0.1) … If you relied on connecting from another device, pass `loopbackOnly: false` (and set an `authToken`)."). This report is about the **discoverability gap** that hardening left, not a request to reverse it.

---

## Impact

- **Who is affected:** Developers debugging on a physical device over Wi-Fi who try to reach the server by the device's LAN IP (the natural mental model when the device is already on the network), and anyone wiring a remote client (Saropa Lints) to a device server by IP.
- **What is blocked:** Direct LAN-IP access to the debug server and its IDE integration; the failure looks like "server absent," sending users down the wrong diagnostic path.
- **Data risk:** None. (The loopback-only default that causes this is itself the data-safety control.)
- **Frequency:** Every time, for the Wi-Fi-by-IP path with default settings.

---

## Suggested Direction (server-side, for the maintainers to decide)

Documentation/UX only — no reversal of the security default:

1. **Banner:** when `loopbackOnly: true`, add one line noting LAN-IP access is disabled and how to enable it (`loopbackOnly: false` + `authToken`). When `loopbackOnly: false`, also print the reachable `http://<lan-ip>:<port>` so Wi-Fi-by-IP users get a copy-paste URL beside the existing `adb forward` hint.
2. **`/api/health`:** advertise the bind mode (e.g. `loopbackOnly: true|false` or the bound interface) so a remote client can distinguish "up but loopback-only" from "absent" and show the user actionable guidance instead of a bare "not found."
3. **Docs:** in the Wi-Fi/remote-debugging section, state the two supported paths explicitly — (a) `adb forward` + `127.0.0.1`, or (b) `loopbackOnly: false` + `authToken` + device LAN IP — so users stop trying the IP against a loopback-only server.

---

## Cross-repo note

The consumer side (`saropa_lints`) already handles its half: the client now accepts a `hosts` list with optional `host:port` entries and probes them in order, so once the server is reachable on a LAN interface the lints integration connects without further client changes. No change is requested in `saropa_lints` by this report.

---

## Resolution (server-side, implemented)

All three suggested directions landed in `saropa_drift_advisor` (documentation/UX only — the loopback-only security default is unchanged):

1. **Banner** (`lib/src/drift_debug_server_io.dart`). When `loopbackOnly: true`, the startup banner now prints two lines stating LAN-IP access is off and how to enable it (`loopbackOnly: false` + `authToken`), alongside the existing `adb forward` hint. When `loopbackOnly: false`, it enumerates the host's non-loopback IPv4 interfaces (`NetworkInterface.list`) and prints a copy-paste `http://<lan-ip>:<port>` for each (or a generic "LAN access on" line if none enumerate). New strings live in `ServerConstants` (`bannerLanDisabledHint`, `bannerLanEnableHint`, `bannerLanReachableHeader`, `bannerLanNoInterface`).
2. **`/api/health`** (`lib/src/server/generation_handler.dart`). The response now carries `loopbackOnly: true|false` (threaded through `ServerContext.loopbackOnly`), so a remote probe distinguishes "up but loopback-only" from "absent." Asserted in `test/handler_integration_test.dart`.
3. **Docs** (`README.md`). The "Connect a client" section now states the two supported physical-device-over-Wi-Fi paths explicitly (`adb forward` + loopback, or `loopbackOnly: false` + `authToken` + device LAN IP), and the health summary documents the new `loopbackOnly` field.

---

## Finish Report (2026-06-22)

### Defect

The debug server binds `InternetAddress.loopbackIPv4` inside the host app's network namespace under the secure default (`loopbackOnly: true`). On a physical device debugged over Wi-Fi, a connection to the device's LAN IP (`http://<device-lan-ip>:<port>`) is refused at the socket layer before any HTTP, producing a silent connection-refused indistinguishable from "no server running." Nothing in the startup banner or the `/api/health` payload disclosed the bind mode, so a developer (or the Saropa Lints client probing by IP) had no in-product signal that the IP route was closed by design rather than the server being absent.

### Change

Documentation/UX surfacing only; the loopback-only security default is unchanged.

- **Banner bind-mode block** — `lib/src/drift_debug_server_io.dart`. The startup banner gained a conditional block after the `adb forward` hint. Under `loopbackOnly: true` it prints two centered lines: that LAN-IP access is off, and the opt-in that enables it. Under `loopbackOnly: false` it enumerates non-loopback IPv4 interfaces via a new best-effort static helper `_lanIpv4Addresses(logError)` and prints a copy-paste `http://<lan-ip>:<port>` per interface, or a generic "LAN access on" line when none enumerate. The helper routes enumeration failures to the context error logger and returns an empty list rather than failing the banner.
- **Bind-mode constants** — `lib/src/server/server_constants.dart`. Added `bannerLanDisabledHint`, `bannerLanEnableHint`, `bannerLanReachableHeader`, `bannerLanNoInterface` (all ≤ `bannerInnerWidth` so the box pads correctly) and the `jsonKeyLoopbackOnly` health key.
- **Health advertisement** — `lib/src/server/generation_handler.dart` + `lib/src/server/server_context.dart`. `ServerContext` carries a `loopbackOnly` field (defaulting to true to match the secure start default), threaded from `_startInternal`. `GET /api/health` now emits `loopbackOnly`, letting a remote probe distinguish "up but loopback-only" from "absent."
- **Tests** — `test/handler_integration_test.dart`. The health-shape test now asserts `loopbackOnly` is present and true by default.
- **Docs** — `README.md` documents the two supported Wi-Fi access paths and the new health field; `CHANGELOG.md` records the change under `[Unreleased]`.

### Verification

- `dart analyze` on the five touched files: no issues (an initial `require_catch_logging` warning on the enumeration catch was resolved by logging the failure rather than swallowing it).
- `dart test test/handler_integration_test.dart --name "health"`: all 12 tests pass; the captured banner output confirms the new LAN lines render centered within the box.
