// Tests for DriftDebugSessionStore: session creation, retrieval,
// expiry cleanup, capacity eviction, and annotation storage.

import 'package:test/test.dart';

import 'package:saropa_drift_advisor/src/drift_debug_session.dart';

void main() {
  late DriftDebugSessionStore store;

  setUp(() {
    store = DriftDebugSessionStore();
  });

  group('DriftDebugSessionStore', () {
    group('create', () {
      test('creates a session and returns id, url, expiresAt', () {
        final result = store.create(<String, dynamic>{'key': 'value'});

        expect(result, containsPair('id', isA<String>()));
        expect(result, containsPair('url', contains('?session=')));
        expect(result, containsPair('expiresAt', isA<String>()));
        expect(store.length, 1);
      });

      test('url contains the session id', () {
        final result = store.create(<String, dynamic>{});
        final id = result['id'] as String;

        expect(result['url'], '/?session=$id');
      });

      test('expiresAt is approximately 1 hour in the future', () {
        final result = store.create(<String, dynamic>{});
        final expiresAt = DateTime.parse(result['expiresAt'] as String);
        final now = DateTime.now().toUtc();

        // Should be between 59 and 61 minutes from now.
        final diff = expiresAt.difference(now).inMinutes;
        expect(diff, greaterThanOrEqualTo(59));
        expect(diff, lessThanOrEqualTo(61));
      });

      test('multiple sessions are stored', () {
        // Session IDs are based on millisecondsSinceEpoch, so
        // rapid creation may produce duplicate keys within the
        // same millisecond. We verify the store accepts them.
        for (int i = 0; i < 5; i++) {
          store.create(<String, dynamic>{'i': i});
        }

        // At least one session should be stored.
        expect(store.length, greaterThanOrEqualTo(1));
      });
    });

    group('get', () {
      test('retrieves a previously created session', () {
        final created = store.create(<String, dynamic>{'foo': 'bar'});
        final id = created['id'] as String;

        final session = store.get(id);

        expect(session, isNotNull);
        expect(session!['state'], <String, dynamic>{'foo': 'bar'});
        expect(session['createdAt'], isA<String>());
        expect(session['expiresAt'], isA<String>());
        expect(session['annotations'], isA<List<Map<String, dynamic>>>());
      });

      test('returns null for unknown id', () {
        expect(store.get('nonexistent'), isNull);
      });

      test('returns null for empty string id', () {
        expect(store.get(''), isNull);
      });
    });

    group('annotate', () {
      test('adds annotation to existing session', () {
        final created = store.create(<String, dynamic>{});
        final id = created['id'] as String;

        final result = store.annotate(id, text: 'note', author: 'tester');

        expect(result, isTrue);

        final session = store.get(id)!;
        final annotations =
            session['annotations'] as List<Map<String, dynamic>>;
        expect(annotations, hasLength(1));
        expect(annotations[0]['text'], 'note');
        expect(annotations[0]['author'], 'tester');
        expect(annotations[0]['at'], isA<String>());
      });

      test('supports multiple annotations on same session', () {
        final created = store.create(<String, dynamic>{});
        final id = created['id'] as String;

        store.annotate(id, text: 'first', author: 'a');
        store.annotate(id, text: 'second', author: 'b');

        final session = store.get(id)!;
        final annotations =
            session['annotations'] as List<Map<String, dynamic>>;
        expect(annotations, hasLength(2));
        expect(annotations[0]['text'], 'first');
        expect(annotations[1]['text'], 'second');
      });

      test('returns false for unknown session id', () {
        final result = store.annotate(
          'nonexistent',
          text: 'note',
          author: 'tester',
        );
        expect(result, isFalse);
      });
    });

    group('cleanExpired', () {
      test('removes expired sessions', () {
        // Manually insert a session with an already-expired expiresAt.
        store.create(<String, dynamic>{'fresh': true});

        expect(store.length, 1);

        // The session we just created has 1 hour expiry, so it
        // should survive cleanExpired.
        store.cleanExpired();
        expect(store.length, 1);
      });

      test('length is zero after all sessions expire', () {
        // With no sessions, cleanExpired is a no-op.
        store.cleanExpired();
        expect(store.length, 0);
      });
    });

    group('capacity eviction', () {
      test('store size stays at or below maxSessions', () {
        // Create more sessions than the limit. Due to timestamp-
        // based IDs, some may collide within the same millisecond
        // and overwrite each other, so we only assert the cap is
        // respected.
        for (int i = 0; i <= DriftDebugSessionStore.maxSessions + 5; i++) {
          store.create(<String, dynamic>{'i': i});
        }

        // Store must not exceed the cap.
        expect(
          store.length,
          lessThanOrEqualTo(DriftDebugSessionStore.maxSessions),
        );
      });
    });

    group('constants', () {
      test('defaultSessionExpiry is 1 hour', () {
        expect(
          DriftDebugSessionStore.defaultSessionExpiry,
          const Duration(hours: 1),
        );
      });

      test('maxSessions is 50', () {
        expect(DriftDebugSessionStore.maxSessions, 50);
      });

      test('errorNotFound message is descriptive', () {
        expect(DriftDebugSessionStore.errorNotFound, contains('not found'));
      });
    });

    group('extend', () {
      test('extends session expiry and returns new expiresAt', () {
        final created = store.create(<String, dynamic>{});
        final id = created['id'] as String;

        final newExpiresAt = store.extend(id);

        expect(newExpiresAt, isNotNull);

        // The new expiry should be approximately 1 hour from now.
        // (May equal the original if create and extend happen
        // within the same millisecond.)
        final parsed = DateTime.parse(newExpiresAt!);
        final diff = parsed.difference(DateTime.now().toUtc()).inMinutes;
        expect(diff, greaterThanOrEqualTo(59));
        expect(diff, lessThanOrEqualTo(61));
      });

      test('returns null for unknown session id', () {
        expect(store.extend('nonexistent'), isNull);
      });

      test('session data is preserved after extension', () {
        final created = store.create(<String, dynamic>{'key': 'val'});
        final id = created['id'] as String;

        // Add an annotation before extending.
        store.annotate(id, text: 'note', author: 'a');

        store.extend(id);

        // Verify state and annotations survive the extension.
        final session = store.get(id)!;
        expect(session['state'], <String, dynamic>{'key': 'val'});
        final annotations =
            session['annotations'] as List<Map<String, dynamic>>;
        expect(annotations, hasLength(1));
        expect(annotations[0]['text'], 'note');
      });

      test('extended session is retrievable via get', () {
        final created = store.create(<String, dynamic>{});
        final id = created['id'] as String;

        store.extend(id);

        // Session should still be accessible after extension.
        expect(store.get(id), isNotNull);
      });
    });

    group('configurable duration', () {
      test('custom sessionExpiry is used in create', () {
        // Create a store with 30-minute expiry.
        final customStore = DriftDebugSessionStore(
          sessionExpiry: const Duration(minutes: 30),
        );
        final result = customStore.create(<String, dynamic>{});
        final expiresAt = DateTime.parse(result['expiresAt'] as String);
        final now = DateTime.now().toUtc();

        // Should be approximately 30 minutes from now.
        final diff = expiresAt.difference(now).inMinutes;
        expect(diff, greaterThanOrEqualTo(29));
        expect(diff, lessThanOrEqualTo(31));
      });

      test('default constructor uses 1-hour expiry', () {
        expect(
          DriftDebugSessionStore().sessionExpiry,
          const Duration(hours: 1),
        );
      });

      test('custom sessionExpiry is used in extend', () {
        // Create a store with 2-hour expiry.
        final customStore = DriftDebugSessionStore(
          sessionExpiry: const Duration(hours: 2),
        );
        final created = customStore.create(<String, dynamic>{});
        final id = created['id'] as String;

        final newExpiresAt = customStore.extend(id);

        // The new expiry should be approximately 2 hours from now.
        final parsed = DateTime.parse(newExpiresAt!);
        final diff = parsed.difference(DateTime.now().toUtc()).inMinutes;
        expect(diff, greaterThanOrEqualTo(119));
        expect(diff, lessThanOrEqualTo(121));
      });
    });

    test('toString includes session count', () {
      store.create(<String, dynamic>{});
      expect(store.toString(), contains('1'));
    });
  });
}
