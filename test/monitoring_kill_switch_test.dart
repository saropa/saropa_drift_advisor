// Tests for the global monitoring & logging kill switch
// (plans/PLAN_BUILD a KILL SWITCH.md):
//   - start(monitoringEnabled: false) boots a dormant server: /api/health
//     keeps answering (with monitoringEnabled: false) while every
//     data-inspection endpoint returns a structured 403.
//   - GET/POST /api/monitoring stays reachable while killed (it is the only
//     HTTP path back to a live server) and flips the switch at runtime.
//   - The kill guarantees ZERO capture: no query timings, no DVR records,
//     no change-detection sweeps — not just hidden results.
//   - The discovery manifest carries `monitoring: enabled|disabled` and is
//     rewritten on runtime flips so external tools see the live state.

import 'dart:async';
import 'dart:convert';
import 'dart:io';

import 'package:test/test.dart';

import 'package:saropa_drift_advisor/saropa_drift_advisor.dart';
import 'package:saropa_drift_advisor/src/query_recorder.dart';
import 'package:saropa_drift_advisor/src/server/server_constants.dart';
import 'package:saropa_drift_advisor/src/server/server_context.dart';

import 'helpers/test_helpers.dart';

void main() {
  // =====================================================
  // Unit — ServerContext short-circuits (no server bind needed).
  // =====================================================
  group('ServerContext kill-switch short-circuits', () {
    test('timedQuery records nothing while monitoring is disabled', () async {
      final recorder = QueryRecorder()..startRecording();
      final ctx = ServerContext(
        query: (_) async => [
          <String, dynamic>{'id': 1},
        ],
        queryRecorder: recorder,
        monitoringEnabled: false,
      );

      // The query itself still executes (rows come back) but must leave no
      // trace: no timing entry, no DVR record.
      final rows = await ctx.timedQuery('SELECT id FROM items');

      expect(rows, hasLength(1));
      expect(ctx.queryTimings, isEmpty);
      expect(recorder.queryCount, 0);
    });

    test(
      'checkDataChange issues no queries while monitoring is disabled',
      () async {
        var queryCalls = 0;
        final ctx = ServerContext(
          query: (_) async {
            queryCalls++;
            return <Map<String, dynamic>>[];
          },
          monitoringEnabled: false,
        );

        await ctx.checkDataChange();

        // The sweep must abort before the sqlite_master lookup — zero DB
        // traffic is the contract, not merely an unchanged generation.
        expect(queryCalls, 0);
        expect(ctx.generation, 0);
      },
    );

    test('setMonitoring fires the manifest-rewrite hook', () {
      final ctx = ServerContext(query: (_) async => <Map<String, dynamic>>[]);
      final observed = <bool>[];
      ctx.onMonitoringChanged = observed.add;

      ctx.setMonitoring(false);
      ctx.setMonitoring(true);

      expect(observed, [false, true]);
      expect(ctx.monitoringEnabled, isTrue);
    });
  });

  // =====================================================
  // Integration — full server over HTTP.
  // =====================================================
  group('kill switch over HTTP', () {
    int? port;
    Directory? discoveryDir;
    var queryCalls = 0;

    Future<void> startServer({required bool monitoringEnabled}) async {
      queryCalls = 0;
      discoveryDir = await Directory.systemTemp.createTemp(
        'sda_kill_switch_test_',
      );
      await DriftDebugServer.start(
        query: (sql) async {
          queryCalls++;
          return [
            <String, dynamic>{'id': 1},
          ];
        },
        port: 0,
        monitoringEnabled: monitoringEnabled,
        // Isolated manifest dir: the home default is shared process-wide and
        // parallel suites would clobber each other's server.json.
        discoveryDirectory: discoveryDir!.path,
      );
      port = DriftDebugServer.port;
    }

    Future<Map<String, dynamic>> readManifest() async {
      final file = File(
        '${discoveryDir!.path}/${ServerConstants.discoveryFileName}',
      );
      return jsonDecode(await file.readAsString()) as Map<String, dynamic>;
    }

    tearDown(() async {
      await DriftDebugServer.stop();
      port = null;
      final dir = discoveryDir;
      discoveryDir = null;
      if (dir != null && await dir.exists()) {
        await dir.delete(recursive: true);
      }
    });

    test('dormant start: health answers, data endpoints return 403', () async {
      await startServer(monitoringEnabled: false);

      // Health keeps responding so probes can tell "deliberately dormant"
      // (monitoringEnabled: false) from "server gone" (no response).
      final health = await httpGet(port!, '/api/health');
      expect(health.status, HttpStatus.ok);
      final healthBody = health.body as Map<String, dynamic>;
      expect(healthBody[ServerConstants.jsonKeyOk], isTrue);
      expect(healthBody[ServerConstants.jsonKeyMonitoringEnabled], isFalse);

      // The endpoints the spec names explicitly (POST /api/sql, GET
      // /api/views) plus a representative data route all answer the same
      // structured 403 — a kept connection contract, never a dropped socket.
      for (final probe in [
        await httpPost(
          port!,
          '/api/sql',
          json: <String, dynamic>{'sql': 'SELECT id FROM items'},
        ),
        await httpGet(port!, '/api/views'),
        await httpGet(port!, '/api/tables'),
      ]) {
        expect(probe.status, HttpStatus.forbidden);
        expect(
          (probe.body as Map<String, dynamic>)[ServerConstants.jsonKeyError],
          ServerConstants.errorMonitoringDisabled,
        );
      }

      // Zero leakage: no probe above may have reached the query callback.
      expect(queryCalls, 0);

      // The manifest advertises the dormant state for external tools.
      final manifest = await readManifest();
      expect(
        manifest[ServerConstants.jsonKeyMonitoring],
        ServerConstants.monitoringStateDisabled,
      );
    });

    test('GET /api/monitoring reports state while killed', () async {
      await startServer(monitoringEnabled: false);

      final r = await httpGet(port!, '/api/monitoring');

      expect(r.status, HttpStatus.ok);
      expect(
        (r.body
            as Map<String, dynamic>)[ServerConstants.jsonKeyMonitoringEnabled],
        isFalse,
      );
    });

    test(
      'POST /api/monitoring resumes a killed server without restart',
      () async {
        await startServer(monitoringEnabled: false);

        final resume = await httpPost(
          port!,
          '/api/monitoring',
          json: <String, dynamic>{ServerConstants.jsonKeyEnabled: true},
        );
        expect(resume.status, HttpStatus.ok);
        expect(
          (resume.body as Map<String, dynamic>)[ServerConstants
              .jsonKeyMonitoringEnabled],
          isTrue,
        );

        // Data inspection works again immediately — no reload, no rebind.
        final sql = await httpPost(
          port!,
          '/api/sql',
          json: <String, dynamic>{'sql': 'SELECT id FROM items'},
        );
        expect(sql.status, HttpStatus.ok);
        expect(
          (sql.body as Map<String, dynamic>)[ServerConstants.jsonKeyRows],
          hasLength(1),
        );

        // The manifest rewrite is fire-and-forget, so poll briefly instead of
        // asserting instantly and racing the write.
        var manifestState = '';
        for (var attempt = 0; attempt < 50; attempt++) {
          manifestState =
              (await readManifest())[ServerConstants.jsonKeyMonitoring]
                  as String? ??
              '';
          if (manifestState == ServerConstants.monitoringStateEnabled) break;
          await Future<void>.delayed(const Duration(milliseconds: 20));
        }
        expect(manifestState, ServerConstants.monitoringStateEnabled);
      },
    );

    test(
      'runtime kill via setMonitoringEnabled blocks data endpoints',
      () async {
        await startServer(monitoringEnabled: true);

        // Sanity: alive first, so the 403 below is attributable to the kill.
        final before = await httpPost(
          port!,
          '/api/sql',
          json: <String, dynamic>{'sql': 'SELECT id FROM items'},
        );
        expect(before.status, HttpStatus.ok);

        DriftDebugServer.setMonitoringEnabled(false);
        expect(DriftDebugServer.monitoringEnabled, isFalse);

        final after = await httpPost(
          port!,
          '/api/sql',
          json: <String, dynamic>{'sql': 'SELECT id FROM items'},
        );
        expect(after.status, HttpStatus.forbidden);
        expect(
          (after.body as Map<String, dynamic>)[ServerConstants.jsonKeyError],
          ServerConstants.errorMonitoringDisabled,
        );
      },
    );
  });
}
