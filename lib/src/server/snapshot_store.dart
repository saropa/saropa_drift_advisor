// On-disk persistence for the website snapshot list (Feature 72, Phase 4).
//
// Snapshots live in memory on [ServerContext]; a browser reload re-fetches them
// via GET /api/snapshots, but a *server* restart would otherwise lose them.
// When the host opts in by passing `snapshotStorePath` to `DriftDebugServer.start`,
// the list is mirrored to that JSON file and reloaded on the next start.
//
// Writes are atomic (temp file + rename) so a crash mid-write can never leave a
// half-written file that fails to parse; loads skip individually-corrupt records
// rather than discarding the whole list. Persistence is strictly best-effort —
// every failure is reported to [onError] (the caller logs it) and then absorbed
// so disk problems never break a snapshot capture, delete, or rename.

import 'dart:convert';
import 'dart:io';

import 'server_constants.dart';
import 'server_types.dart';

/// Callback used to surface a best-effort persistence failure to the host's
/// logger without letting it abort the in-memory snapshot operation.
typedef SnapshotStoreErrorLogger =
    void Function(Object error, StackTrace stack);

/// Reads and writes the snapshot list as a single JSON file.
///
/// The `path` is host configuration supplied by the app developer to
/// `DriftDebugServer.start` (like a config-file path), never network or
/// end-user input — so it is trusted and used as given.
abstract final class SnapshotStore {
  /// Loads snapshots from [path]. Returns an empty list when the file is
  /// absent, empty, unparseable, or not the expected shape — never throws.
  /// Individually malformed records are skipped (see [Snapshot.fromJson]).
  static Future<List<Snapshot>> load(
    String path, {
    SnapshotStoreErrorLogger? onError,
  }) async {
    try {
      // ignore: avoid_path_traversal, require_file_path_sanitization -- path is trusted host config passed to DriftDebugServer.start, never user/network input
      final File file = File(path);
      if (!await file.exists()) return <Snapshot>[];
      final String raw = await file.readAsString();
      if (raw.trim().isEmpty) return <Snapshot>[];
      final Object? decoded = jsonDecode(raw);
      final Object? list = decoded is Map<String, dynamic>
          ? decoded[ServerConstants.jsonKeySnapshots]
          : decoded;
      if (list is! List) return <Snapshot>[];
      final List<Snapshot> out = <Snapshot>[];
      for (final Object? entry in list) {
        final Snapshot? snap = Snapshot.fromJson(entry);
        if (snap != null) out.add(snap);
      }
      return out;
    } on Object catch (error, stack) {
      // Corrupt/unreadable store must not block startup — log and start empty.
      onError?.call(error, stack);
      return <Snapshot>[];
    }
  }

  /// Atomically writes [snapshots] to [path]: serialize, write a sibling
  /// `.tmp`, then rename over the target so readers never see a partial file.
  /// Reports failures to [onError] (best-effort); never throws.
  static Future<void> save(
    String path,
    List<Snapshot> snapshots, {
    SnapshotStoreErrorLogger? onError,
  }) async {
    try {
      final String json = jsonEncode(<String, dynamic>{
        ServerConstants.jsonKeySnapshots: snapshots
            .map((Snapshot s) => s.toJson())
            .toList(growable: false),
      });
      // ignore: avoid_path_traversal, require_file_path_sanitization -- path is trusted host config passed to DriftDebugServer.start, never user/network input
      final File tmp = File('$path.tmp');
      await tmp.parent.create(recursive: true);
      await tmp.writeAsString(json, flush: true);
      // rename is atomic on the same filesystem; replaces any existing target.
      await tmp.rename(path);
    } on Object catch (error, stack) {
      // Best-effort: a failed persist never breaks the in-memory operation.
      onError?.call(error, stack);
    }
  }
}
