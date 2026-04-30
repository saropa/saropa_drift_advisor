// Shared callback typedefs for the Drift Debug Server.
//
// Defined here so both the VM implementation
// (drift_debug_server_io.dart) and the web stub
// (drift_debug_server_stub.dart) share a single
// source of truth.

/// Callback that runs a single SQL query and returns
/// rows as list of maps.
typedef DriftDebugQuery =
    Future<List<Map<String, dynamic>>> Function(String sql);

/// Optional read callback that receives declared positional/named bindings.
///
/// Used when the host executor can supply bound values for DVR / tooling.
/// Implementations may ignore [positionalArgs] and [namedArgs] and execute
/// [sql] only — the debug server still records declared bindings for DVR when
/// provided via HTTP/VM metadata.
typedef DriftDebugQueryWithBindings =
    Future<List<Map<String, dynamic>>> Function(
      String sql, {
      List<Object?>? positionalArgs,
      Map<String, Object?>? namedArgs,
    });

/// Optional callback for log messages.
typedef DriftDebugOnLog = void Function(String message);

/// Optional callback for errors (and optional stack
/// trace).
typedef DriftDebugOnError = void Function(Object error, StackTrace stack);

/// Optional callback that returns the raw SQLite
/// database file bytes.
typedef DriftDebugGetDatabaseBytes = Future<List<int>> Function();

/// Optional callback for write queries
/// (INSERT/UPDATE/DELETE).
/// Debug-only: used exclusively by the import endpoint.
typedef DriftDebugWriteQuery = Future<void> Function(String sql);

/// Optional write callback that receives declared positional/named bindings.
///
/// When supplied to [DriftDebugServer.start] alongside or instead of
/// [DriftDebugWriteQuery], the mutation wrapper invokes this implementation.
/// Current HTTP/VM batch paths still pass SQL strings only; bindings are
/// forwarded when callers add metadata in a future protocol revision.
typedef DriftDebugWriteQueryWithBindings =
    Future<void> Function(
      String sql, {
      List<Object?>? positionalArgs,
      Map<String, Object?>? namedArgs,
    });
