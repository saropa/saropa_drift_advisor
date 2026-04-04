# Bug: `DriftDebugServer.start()` fails on hot restart with `SocketException` (port already bound)

**Created:** 2026-04-03
**Resolved:** 2026-04-03
**Severity:** Medium — debug server silently fails to start after every hot restart, requiring full app restart to reconnect
**Component:** `lib/src/drift_debug_server_io.dart` line 195
**Fix:** Added `shared: true` to `HttpServer.bind()` call

---

## Summary

`HttpServer.bind(address, port)` on line 195 of `drift_debug_server_io.dart` does not pass `shared: true`. On a Flutter hot restart, the previous isolate's server socket is still bound to the port. The new isolate attempts to bind the same address+port and gets a `SocketException`, causing the debug server to silently fail. The catch block prints the error but the server never starts, leaving the VS Code extension disconnected until the developer performs a full cold restart.

## Reproduction

1. Run a Flutter app that calls `startDriftViewer()` (default port 8642).
2. Wait for the Drift Debug Server banner to appear in the console.
3. Perform a hot restart (not hot reload) — e.g., press `Shift+R` in the terminal or use the IDE restart button.
4. Observe the console output.

### Expected

The server starts successfully on the same port after hot restart.

### Actual

```
I/flutter (22302): [DriftDebugServer] FAILED TO START: SocketException: Failed to create server socket (OS Error: The shared flag to bind() needs to be `true` if binding multiple times on the same (address, port) combination.), address = 0.0.0.0, port = 8642
```

The full stack trace points to:

```
#0      _NativeSocket.bind (dart:io-patch/socket_patch.dart:1216:7)
<asynchronous suspension>
#4      _DriftDebugServerImpl.start (package:saropa_drift_advisor/src/drift_debug_server_io.dart:195:17)
<asynchronous suspension>
#5      StartDriftViewerExtension.startDriftViewer (package:saropa_drift_advisor/src/start_drift_viewer_extension.dart:94:12)
<asynchronous suspension>
```

## Root Cause

Line 195 in `drift_debug_server_io.dart`:

```dart
_server = await HttpServer.bind(address, port);
```

Dart's `HttpServer.bind()` defaults `shared` to `false`. When `shared` is false, only one isolate can bind the address+port pair at a time. During a hot restart, Dart creates a new isolate before the old one has fully released its socket, so the bind call fails.

The Android error message itself prescribes the fix: *"The shared flag to bind() needs to be `true` if binding multiple times on the same (address, port) combination."*

## Proposed Fix

Pass `shared: true` to `HttpServer.bind()`:

```dart
// Allow re-binding after hot restart — the old isolate's socket
// may not have been released yet.
_server = await HttpServer.bind(address, port, shared: true);
```

This is safe because:

- The `shared` flag enables `SO_REUSEADDR`/`SO_REUSEPORT` at the OS level.
- The guard on line 104-107 (`if (existing != null) return;`) already prevents duplicate servers within the same isolate.
- The old isolate is being torn down and will stop accepting connections, so there is no risk of two live servers handling requests simultaneously.
- This is the standard Dart pattern for debug servers that survive hot restart (e.g., DevTools, Observatory).

## Impact

- **Every hot restart** breaks the debug server connection.
- Developers must perform a full stop + cold start to reconnect the VS Code extension.
- The error is printed to the console but easily missed in the noise of other Android log lines.
- The VS Code extension shows "No Drift debug server connected" with no indication that a hot restart caused the disconnect.

## Affected Code Path

| File | Line | Role |
|------|------|------|
| `lib/src/drift_debug_server_io.dart` | 195 | `HttpServer.bind()` call without `shared: true` |
| `lib/src/drift_debug_server_io.dart` | 234-240 | Catch block that prints the failure |
| `lib/src/start_drift_viewer_extension.dart` | 94 | Entry point that calls `DriftDebugServer.start()` |

## Additional Context

- Observed on Android emulator (API 33), but the issue is platform-independent — any Dart VM hot restart will trigger it.
- The error also fires when the user taps "restart" in the Flutter DevTools or when the IDE triggers an automatic restart.
- Hot reload (without restart) does NOT trigger this bug because it reuses the same isolate.
