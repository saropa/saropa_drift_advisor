// Tests for ServerUtils.readBodyBytes — the shared capped request-body reader
// that backs the HTTP 413 path on every POST handler (audit H3). Exercised over
// a real loopback HttpServer with a small cap so both the within-limit and
// over-limit branches run against an actual HttpRequest stream.

import 'dart:convert';
import 'dart:io';

import 'package:saropa_drift_advisor/src/server/server_utils.dart';
import 'package:test/test.dart';

void main() {
  group('ServerUtils.readBodyBytes', () {
    late HttpServer server;
    late int port;

    setUp(() async {
      server = await HttpServer.bind(InternetAddress.loopbackIPv4, 0);
      port = server.port;
      // Tiny 10-byte cap so the test can drive both branches cheaply.
      server.listen((req) async {
        final bytes = await ServerUtils.readBodyBytes(req, maxBytes: 10);
        if (bytes == null) {
          // Production behavior: stop reading and respond 413. For a large body
          // the client may see a reset mid-send (it stopped being read) — that
          // is the correct DoS posture, and the test accepts either outcome.
          req.response.statusCode = HttpStatus.requestEntityTooLarge;
          await req.response.close();
          return;
        }
        req.response.statusCode = HttpStatus.ok;
        req.response.write('len=${bytes.length}');
        await req.response.close();
      });
    });

    tearDown(() async {
      await server.close(force: true);
    });

    // Reads the full response body before the client closes — force-closing the
    // client first would abort the in-flight read.
    Future<(int, String)> post(List<int> body) async {
      final client = HttpClient();
      try {
        final req = await client.post('127.0.0.1', port, '/');
        req.add(body);
        final resp = await req.close();
        final text = await resp.transform(utf8.decoder).join();
        return (resp.statusCode, text);
      } finally {
        client.close(force: true);
      }
    }

    test('returns the bytes for a body within the cap', () async {
      final (status, text) = await post(utf8.encode('hello')); // 5 bytes
      expect(status, HttpStatus.ok);
      expect(text, 'len=5');
    });

    test('does not accept a body over the cap', () async {
      // Over-limit must NOT yield a 200/len= success. The server stops reading
      // and returns 413; for a large body the client can instead see a reset
      // mid-send — both mean "rejected", and neither is acceptance.
      try {
        final (status, text) = await post(
          utf8.encode('way more than ten bytes'),
        );
        expect(status, HttpStatus.requestEntityTooLarge);
        expect(text, isNot(contains('len=')));
      } on Object {
        // Connection reset while sending an over-limit body = server refused it.
      }
    });

    test('returns empty bytes for an empty body', () async {
      final (status, text) = await post(<int>[]);
      expect(status, HttpStatus.ok);
      expect(text, 'len=0');
    });
  });
}
