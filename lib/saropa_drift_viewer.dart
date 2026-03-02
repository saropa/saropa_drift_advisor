/// Debug-only HTTP server that exposes SQLite/Drift table data as JSON and a minimal web viewer.
///
/// Use from any Flutter or Dart app that has a SQLite (or Drift) database. Add the package
/// (from pub.dev or a path dependency), then start the server with [DriftDebugServer.start],
/// passing a [DriftDebugQuery] callback that runs SQL and returns rows as maps. If you use
/// Drift, see the README for the optional `startDriftViewer` extension (when available).
///
/// Main APIs:
/// * [DriftDebugServer] — [DriftDebugServer.start] and [DriftDebugServer.stop].
/// * [DriftDebugQuery] — Typedef for the SQL query callback.
/// * [DriftDebugOnLog], [DriftDebugOnError] — Optional logging callbacks.
/// * [DriftDebugErrorLogger] — Helpers for log and error callbacks.
library saropa_drift_viewer;

export 'src/drift_debug_server.dart';
export 'src/error_logger.dart';
