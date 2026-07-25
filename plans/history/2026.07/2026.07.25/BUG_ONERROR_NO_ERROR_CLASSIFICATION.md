# onError callback receives no error classification — host apps cannot distinguish user-input errors from server bugs

## Status: Fixed

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

## Finish Report (2026-07-25)

### Resolution

Error classification was added via a parallel callback rather than by widening
the existing `DriftDebugOnError` typedef. The proposed-fix approach of changing
`DriftDebugOnError` to `void Function(Object, StackTrace, {DriftDebugErrorKind kind})`
is **not** source-compatible in Dart: a host closure written as
`(Object e, StackTrace s) => ...` cannot be assigned to a type declaring a
named parameter, so every existing caller would fail to compile. The backward-
compatibility claim in the original proposal was wrong for that reason; the
report's own fallback (a separate callback) was taken instead.

### Changes

- `server_typedefs.dart`: added `DriftDebugErrorKind` enum (`userQuery`,
  `server`) and `DriftDebugOnClassifiedError` typedef.
- `server_context.dart`: added optional `onClassifiedError` field. `logError`
  now takes an optional `kind:` (default `DriftDebugErrorKind.server`). When
  `onClassifiedError` is set it fires with the kind and `onError` is skipped;
  otherwise the legacy `onError` path is unchanged.
- `sql_handler.dart`: five user-input error sites tagged `userQuery` — the two
  statement-timeout catches, the query-error handler, JSON-decode failure, and
  request-body decode failure.
- `drift_debug_server_io.dart` / `start_drift_viewer_extension.dart`: threaded
  `onClassifiedError` through all three `start` overloads, `_startInternal`,
  the `ServerContext` constructor, and `startDriftViewer`.
- `error_logger.dart`: added `classifiedErrorCallback()` factory routing
  `userQuery` to info-level logging and `server` to SEVERE with stack traces.

### Classification boundary

The ~45 other `logError` sites across the server default to `server` and were
left unclassified. The `SqlErrorEnricher.enrich` `onError` tear-off intentionally
reports at the default `server` level: it signals a failure of the internal
column-suggestion PRAGMA lookup, not the user's original query (which is already
logged as `userQuery` immediately before enrichment). Write-path handlers
(`cell_update_handler`, `edits_batch_handler`, `index_batch_handler`) still
report unclassified; extending classification to constraint-violation errors
there is a follow-up, not part of this fix.

### Verification

`dart test test/server_context_test.dart test/sql_handler_test.dart` — all pass.
Two tests added in `server_context_test.dart`: classified-callback priority over
`onError`, and the `server` default kind.
