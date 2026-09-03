import 'dart:math';

/// In-memory session store for collaborative debug sessions.
///
/// Provides create / get / annotate / extend / cleanup semantics with a
/// configurable expiry ([sessionExpiry]) and a hard cap on stored sessions
/// ([maxSessions]). Sessions are keyed by a base-36 timestamp plus a random
/// suffix and auto-evicted when expired or when the cap is reached.
final class DriftDebugSessionStore {
  /// Creates a session store with the given [sessionExpiry] duration.
  ///
  /// Defaults to [defaultSessionExpiry] (1 hour) if not provided.
  DriftDebugSessionStore({Duration? sessionExpiry})
    : sessionExpiry = sessionExpiry ?? defaultSessionExpiry;

  /// Default session expiry duration when no custom value is provided.
  static const Duration defaultSessionExpiry = Duration(hours: 1);

  /// How long a session is valid after creation (or extension).
  ///
  /// Configurable at construction time; defaults to [defaultSessionExpiry].
  final Duration sessionExpiry;

  /// Maximum number of sessions stored simultaneously.
  static const int maxSessions = 50;

  static const int _radixBase36 = 36;

  // --- JSON keys (session payload contract) ---
  static const String keyState = 'state';
  static const String keyCreatedAt = 'createdAt';
  static const String keyExpiresAt = 'expiresAt';
  static const String keyAnnotations = 'annotations';
  static const String keyId = 'id';
  static const String keyUrl = 'url';
  static const String keyStatus = 'status';
  static const String keyText = 'text';
  static const String keyAuthor = 'author';
  static const String keyAt = 'at';
  static const String keyError = 'error';

  /// Human-readable error returned when a session ID is not found or expired.
  static const String errorNotFound = 'Session not found or expired.';

  final Map<String, Map<String, dynamic>> _sessions = {};

  /// Number of sessions currently stored (visible for testing).
  int get length => _sessions.length;

  /// Removes all sessions whose [keyExpiresAt] is in the past.
  void cleanExpired() {
    final now = DateTime.now().toUtc();

    _sessions.removeWhere((_, v) {
      final expiresAt = DateTime.tryParse(v[keyExpiresAt] as String? ?? '');

      return expiresAt == null || now.isAfter(expiresAt);
    });
  }

  /// Number of random base-36 characters appended to the timestamp when
  /// generating a session ID (see [_generateId]).
  static const int _randomSuffixLength = 8;

  /// Generates a collision-resistant, non-enumerable session ID.
  ///
  /// Bug 037: the old ID was `millisecondsSinceEpoch.toRadixString(36)`
  /// alone — two `create()` calls landing in the same millisecond (easily
  /// triggered by concurrent requests, or fast automated test loops)
  /// produced identical IDs, and the second `_sessions[id] = ...` silently
  /// overwrote the first session. The timestamp was also fully predictable,
  /// letting a client guess/enumerate another user's session ID. Appending
  /// a `Random.secure()` suffix fixes both: the suffix makes same-millisecond
  /// IDs distinct with overwhelming probability, and it is cryptographically
  /// unpredictable so an attacker can't guess a live session ID just by
  /// knowing when it was created.
  String _generateId() {
    final timestamp = DateTime.now()
        .toUtc()
        .millisecondsSinceEpoch
        .toRadixString(_radixBase36);
    final random = List.generate(
      _randomSuffixLength,
      (_) => Random.secure().nextInt(_radixBase36).toRadixString(_radixBase36),
    ).join();

    return '$timestamp$random';
  }

  /// Creates a new session with the given [state] map.
  ///
  /// Returns `{id, url, expiresAt}` on success.
  Map<String, dynamic> create(Map<String, dynamic> state) {
    // Regenerate on the (astronomically unlikely) chance the random suffix
    // collides with an existing, still-live session ID — belt-and-braces
    // on top of the entropy added in _generateId (bug 037).
    var id = _generateId();
    while (_sessions.containsKey(id)) {
      id = _generateId();
    }

    cleanExpired();

    // Evict oldest sessions when at capacity.
    while (_sessions.length >= maxSessions) {
      final oldest = _sessions.keys.firstOrNull;
      if (oldest == null) {
        break;
      }
      _sessions.remove(oldest);
    }

    final now = DateTime.now().toUtc();
    final expiresAt = now.add(sessionExpiry).toIso8601String();

    _sessions[id] = <String, dynamic>{
      keyState: state,
      keyCreatedAt: now.toIso8601String(),
      keyExpiresAt: expiresAt,
      keyAnnotations: <Map<String, dynamic>>[],
    };

    return <String, dynamic>{
      keyId: id,
      keyUrl: '/?session=$id',
      keyExpiresAt: expiresAt,
    };
  }

  /// Returns the session for [id], or `null` if not found / expired.
  Map<String, dynamic>? get(String id) {
    cleanExpired();

    return _sessions[id];
  }

  /// Extends the expiry of session [id] by [sessionExpiry] from now.
  ///
  /// Returns the new `expiresAt` ISO 8601 string if the session exists
  /// and was extended, or `null` if the session was not found or already
  /// expired.
  String? extend(String id) {
    cleanExpired();

    final session = _sessions[id];
    if (session == null) {
      return null;
    }

    // Extend from the current moment (not the old expiresAt) so the
    // user always receives a full-duration extension.
    final newExpiresAt = DateTime.now()
        .toUtc()
        .add(sessionExpiry)
        .toIso8601String();
    session[keyExpiresAt] = newExpiresAt;

    return newExpiresAt;
  }

  /// Appends an annotation to the session identified by [id].
  ///
  /// Returns `true` if the session was found and annotated, `false` otherwise.
  bool annotate(String id, {required String text, required String author}) {
    final session = _sessions[id];
    if (session == null) {
      return false;
    }

    final annotations = session[keyAnnotations];

    if (annotations is! List<Map<String, dynamic>>) {
      return false;
    }

    annotations.add(<String, dynamic>{
      keyText: text,
      keyAuthor: author,
      keyAt: DateTime.now().toUtc().toIso8601String(),
    });

    return true;
  }

  @override
  String toString() => 'DriftDebugSessionStore(sessions: ${_sessions.length})';
}
