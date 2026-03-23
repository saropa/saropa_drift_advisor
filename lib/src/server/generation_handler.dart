// Generation, health, HTML shell, and static web UI asset serving.
//
// The viewer HTML ([HtmlContent.indexHtml]) loads `/assets/web/style.css` and
// `/assets/web/app.js` from this server first, with a CDN fallback in the
// markup if those requests fail (see `html_content.dart`). Serving assets
// locally avoids third-party MIME / `X-Content-Type-Options: nosniff`
// mismatches and works offline during development.
//
// Package root is resolved once via [Isolate.resolvePackageUri] against
// `package:saropa_drift_advisor/saropa_drift_advisor.dart`, then stepping from
// `lib/` to the package directory. The result is cached in a static field so
// repeated asset requests do not re-resolve. This is process-global (tests
// share the same isolate); resolution always points at the loaded package.

import 'dart:convert';
import 'dart:io';
import 'dart:isolate';

import 'html_content.dart';
import 'server_constants.dart';
import 'server_context.dart';

/// Handles health check, generation long-poll, and HTML serving.
final class GenerationHandler {
  /// Creates a [GenerationHandler] with the given [ServerContext].
  GenerationHandler(this._ctx);

  final ServerContext _ctx;
  static String? _resolvedPackageRootPath;

  /// GET /api/health — returns {"ok": true}.
  Future<void> sendHealth(HttpResponse response) async {
    final res = response;

    _ctx.setJsonHeaders(res);
    res.write(
      jsonEncode(<String, dynamic>{
        ServerConstants.jsonKeyOk: true,
        ServerConstants.jsonKeyExtensionConnected: _ctx.isExtensionConnected,
        ServerConstants.jsonKeyVersion: ServerConstants.packageVersion,
        ServerConstants.jsonKeyCapabilities: <String>[
          ServerConstants.capabilityIssues,
        ],
      }),
    );
    await res.close();
  }

  /// Returns current generation after checking for data changes (for VM service RPC).
  Future<int> getCurrentGeneration() async {
    await _ctx.checkDataChange();
    return _ctx.generation;
  }

  /// Handles GET /api/generation. Returns current generation. Query
  /// parameter `since` triggers long-poll until generation > since or
  /// timeout.
  Future<void> handleGeneration(HttpRequest request) async {
    final req = request;
    final res = req.response;

    await _ctx.checkDataChange();
    final sinceRaw = req.uri.queryParameters[ServerConstants.queryParamSince];
    final int? since = sinceRaw != null ? int.tryParse(sinceRaw) : null;

    if (since != null && since >= 0) {
      final deadline = DateTime.now().toUtc().add(
        ServerConstants.longPollTimeout,
      );

      while (DateTime.now().toUtc().isBefore(deadline) &&
          _ctx.generation <= since) {
        await Future<void>.delayed(ServerConstants.longPollCheckInterval);
        await _ctx.checkDataChange();
      }
    }
    _ctx.setJsonHeaders(res);
    res.write(
      jsonEncode(<String, int>{
        ServerConstants.jsonKeyGeneration: _ctx.generation,
      }),
    );
    await res.close();
  }

  /// Serves the single-page viewer UI.
  Future<void> sendHtml(HttpResponse response, HttpRequest _) async {
    final res = response;

    res.headers.contentType = ContentType.html;
    res.write(HtmlContent.indexHtml);
    await res.close();
  }

  /// Serves the local CSS asset used by the web UI shell.
  ///
  /// If the file cannot be read (for example, in unusual packaging layouts),
  /// returns 404 so the page-level CDN fallback can take over.
  Future<void> sendWebStyle(HttpResponse response) async {
    await _sendWebAsset(
      response: response,
      relativePath: 'assets/web/style.css',
      contentType: ContentType('text', 'css', charset: 'utf-8'),
    );
  }

  /// Serves the local JS asset used by the web UI shell.
  ///
  /// If the file cannot be read (for example, in unusual packaging layouts),
  /// returns 404 so the page-level CDN fallback can take over.
  Future<void> sendWebApp(HttpResponse response) async {
    await _sendWebAsset(
      response: response,
      relativePath: 'assets/web/app.js',
      contentType: ContentType('application', 'javascript', charset: 'utf-8'),
    );
  }

  /// Reads and writes a web UI static asset from the installed package root.
  ///
  /// This avoids hard dependency on CDN availability/type-mapping and keeps the
  /// viewer functional in local/offline development.
  Future<void> _sendWebAsset({
    required HttpResponse response,
    required String relativePath,
    required ContentType contentType,
  }) async {
    final packageRoot = await _resolvePackageRootPath();
    if (packageRoot == null) {
      response.statusCode = HttpStatus.notFound;
      await response.close();
      return;
    }

    final file = File('$packageRoot/$relativePath');
    if (!await file.exists()) {
      response.statusCode = HttpStatus.notFound;
      await response.close();
      return;
    }

    try {
      response.headers.contentType = contentType;
      await response.addStream(file.openRead());
    } on Object catch (error, stack) {
      // Mid-stream read or socket failures can occur after headers start
      // sending; log and close so the client does not hang.
      _ctx.logError(error, stack);
    }
    try {
      await response.close();
    } on Object {
      // Ignore double-close or already-terminated response.
    }
  }

  /// Resolves the local package root once and reuses it for asset serving.
  ///
  /// We resolve the URI for this package's public library entrypoint and then
  /// move from `lib/` up to the package root.
  Future<String?> _resolvePackageRootPath() async {
    final cached = _resolvedPackageRootPath;
    if (cached != null) return cached;

    final packageLibUri = await Isolate.resolvePackageUri(
      Uri.parse('package:saropa_drift_advisor/saropa_drift_advisor.dart'),
    );
    if (packageLibUri == null || packageLibUri.scheme != 'file') {
      return null;
    }

    final libFile = File.fromUri(packageLibUri);
    final packageRoot = libFile.parent.parent.path;
    _resolvedPackageRootPath = packageRoot;
    return packageRoot;
  }
}
