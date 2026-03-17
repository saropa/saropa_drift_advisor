// Stub implementation when dart:io is not available (e.g. web). The conditional export in
// drift_debug_server.dart selects this file on web and drift_debug_server_io.dart on VM.
// Typedefs are imported from the shared server_typedefs.dart file.

export 'server/server_typedefs.dart';

/// Unsupported-error message when VM (dart:io) is not available.
const String _kUnsupportedMessage =
    'Drift debug server requires dart:io (VM). Not available on web.';

/// Debug-only HTTP server (stub when dart:io unavailable).
///
/// All methods throw or return placeholder values. Use the VM build
/// (drift_debug_server_io.dart) for real functionality.
///
/// On web, do not pass sensitive data (e.g. auth tokens) to [start]—parameters
/// are ignored and [start] only throws; no server is started.
mixin DriftDebugServer {
  /// Stub: always throws [UnsupportedError].
  ///
  /// Throws [UnsupportedError] because dart:io is not available on web.
  static Future<void> start({
    required Future<List<Map<String, dynamic>>> Function(String sql) query,
    bool enabled = true,
    int port = 8642,
    bool loopbackOnly = false,
    String? corsOrigin = '*',
    String? authToken,
    String? basicAuthUser,
    String? basicAuthPassword,
    Future<List<int>> Function()? getDatabaseBytes,
    Future<List<Map<String, dynamic>>> Function(String sql)? queryCompare,
    Future<void> Function(String sql)? writeQuery,
    void Function(String message)? onLog,
    void Function(Object error, StackTrace stack)? onError,
    Duration? sessionDuration,
    int? maxRequestsPerSecond,
  }) {
    throw UnsupportedError(_kUnsupportedMessage);
  }

  /// Stub: always returns null (server not running).
  static int? get port => null;

  /// Stub: always returns null (server not available
  /// on web).
  static bool? get changeDetectionEnabled => null;

  /// Stub: no-op (server not available on web).
  static void setChangeDetection(bool enabled) {}

  /// Stub: no-op.
  static Future<void> stop() => Future<void>.value();
}
