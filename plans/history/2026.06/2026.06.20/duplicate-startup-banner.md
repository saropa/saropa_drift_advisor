# Duplicate startup banner ("DRIFT DEBUG SERVER")

The Drift debug server printed its startup banner twice when `start()` was
invoked twice in quick succession or concurrently. The cause was a
re-entrancy gap in the running-state guard, which checked a field that is
assigned only after the method's first awaits.

## Finish Report (2026-06-20)

### Defect

`_DriftDebugServerImpl.start` rejected a duplicate launch with a
`_server != null` check. `_server` is not assigned until after two `await`
points inside `start` (`ctx.loadPersistedSnapshots()` and
`HttpServer.bind`). A second `start()` arriving during that window passed the
guard while the first call was still binding. Because the bind uses
`shared: true` (SO_REUSEADDR/SO_REUSEPORT), both binds succeeded and both
calls reached the banner `print()`, so the banner appeared twice in the logs.

### Fix

`lib/src/drift_debug_server_io.dart`:

- Added a synchronous re-entrancy flag, `bool _starting`, on
  `_DriftDebugServerImpl`. It is set before the first await and cleared in a
  `finally`, closing the window the asynchronous `_server` assignment left
  open.
- The guard now rejects when `_server != null || _starting`.
- The original method body was moved into a private `_startInternal`; `start`
  performs the `enabled`/guard checks, sets `_starting`, delegates to
  `_startInternal`, and clears `_starting` in a `finally`. This guarantees the
  flag is cleared on every exit path — early return, thrown `ArgumentError`
  during validation, a bind failure, or a successful bind.

### Tests

`test/drift_debug_server_test.dart`, group `startup banner diagnostics`:

- Added `concurrent start() prints the banner only once`. It launches two
  `start()` calls together via `Future.wait` (without awaiting the first),
  captures `print` output through a zone, and asserts exactly one line
  containing `DRIFT DEBUG SERVER`. Against the pre-fix guard both calls would
  bind and print, producing a count of 2.
- The existing `banner shows adb forward hint with the actual bound port`
  test continues to pass.

Result: `dart test test/drift_debug_server_test.dart --name "startup banner diagnostics"`
→ all tests passed. `dart analyze lib/src/drift_debug_server_io.dart` → no
issues.

### Scope notes

- No localization: this package has no ARB catalog; the banner is server/dev
  log output emitted via `print()` (the only channel that surfaces as
  `I/flutter` on Android), not localized UI copy.
- No bug-report file or plan was closed by this change.
