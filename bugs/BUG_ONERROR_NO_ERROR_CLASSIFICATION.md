# onError callback receives no error classification — host apps cannot distinguish user-input errors from server bugs

## Status: Open

## Summary

The `DriftDebugOnError` callback (`void Function(Object error, StackTrace stack)`)
fires for every error the server encounters, with no classification. The host app
receives an opaque `Object` and cannot distinguish a bad-SQL user-input error
(harmless, expected) from a genuine server bug (bind failure, corrupted snapshot,
internal assertion). This forces a lowest-common-denominator error handler: either
halt on everything (breaking the app on typos in the SQL editor) or log everything
at warning level (potentially missing real bugs).

## Observed impact

In `saropa/contacts`, the `startDriftViewer` `onError` callback originally routed
through `debugExceptionWithoutLog`, which calls `debugger()`. A user running
`SELECT nickname FROM contacts` (column is `nicknames`, plural) in the Drift
Advisor web UI halted the entire app's Dart VM. The fix (2026-07-24) downgraded
all errors to a warning-level log — safe, but now genuine server bugs (port
conflict, snapshot corruption, internal state errors) also log at warning level
instead of halting.

## Root cause

`ServerContext.logError` (server_context.dart:489) calls the `onError` callback
unconditionally for all errors. The callback signature carries no metadata:

```dart
typedef DriftDebugOnError = void Function(Object error, StackTrace stack);
```

Error sources that reach `logError`:
- `SqlHandler._handleQueryError` — user SQL errors (bad column, syntax error)
- `Router._dispatch` catch-all — unhandled exceptions in request handlers
- `ServerContext.checkDataChange` — change-detection sweep failures
- `SnapshotStore.save`/`load` — snapshot persistence failures
- Various schema derivation paths — duck-typing failures on non-Drift DBs

The first category is expected user input; the rest are genuine server issues.

## Proposed fix

Add an error category enum and a richer callback signature:

```dart
enum DriftDebugErrorKind {
  /// Bad SQL from the user (syntax error, unknown column, unknown table).
  /// The server already returned a JSON error response to the client.
  userQuery,

  /// Server-internal error (bind failure, snapshot corruption, internal state).
  server,
}

typedef DriftDebugOnError = void Function(
  Object error,
  StackTrace stack, {
  DriftDebugErrorKind kind,
});
```

Tag each `logError` call site with the appropriate kind. The `kind` parameter
should be optional with a default of `DriftDebugErrorKind.server` so existing
callers are unchanged and unclassified errors default to the severe category.

Host apps can then route:
- `userQuery` → warning-level log (no halt, no Crashlytics)
- `server` → `debugger()` halt or full exception reporting

## Files involved

| File | Role |
|---|---|
| `lib/src/server/server_typedefs.dart:31` | `DriftDebugOnError` typedef |
| `lib/src/server/server_context.dart:489` | `logError` — the single dispatch point |
| `lib/src/server/sql_handler.dart:386` | `_handleQueryError` — should tag `userQuery` |
| `lib/src/server/router.dart:242` | `_dispatch` catch-all — should tag `server` |

## Backward compatibility

The `kind` parameter is optional with a default, so existing `onError` callbacks
that accept `(Object, StackTrace)` continue to compile. The typedef change from
positional-only to optional-named is source-compatible for all known callers
(the callback is always provided as a closure, never stored as a typed reference
that would fail on the widened signature). If that assumption is wrong, a parallel
`onClassifiedError` callback alongside the existing `onError` avoids the break
entirely.

## Severity

Low — workaround exists (log all errors at warning level). The risk is a genuine
server bug going unnoticed in the console noise, which is a developer-experience
degradation, not a user-facing defect.
