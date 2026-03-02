/// Debug-only HTTP server that exposes SQLite/Drift table data as JSON and a minimal web viewer.
///
/// Add the package to your project (path or pub.dev), then call [DriftDebugServer.start]
/// with a [DriftDebugQuery] callback that runs SQL and returns rows as maps.
/// See the package README for Drift and non-Drift examples.
library saropa_drift_viewer;

export 'src/drift_debug_server.dart';
