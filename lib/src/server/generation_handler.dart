// Generation, health, HTML shell, and static web UI asset serving.
//
// The viewer HTML ([HtmlContent.indexHtml]) loads `/assets/web/style.css` and
// `/assets/web/app.js` from this server first, with a CDN fallback in the
// markup if those requests fail (see `html_content.dart`). Serving assets
// locally avoids third-party MIME / `X-Content-Type-Options: nosniff`
// mismatches and works offline during development.
//
// When the package root cannot be resolved or the files are missing,
// these routes respond with HTTP 404 so the browser `onerror` handlers
// can switch to version-pinned jsDelivr URLs. We intentionally do **not**
// embed CSS/JS as Dart string constants: that duplicated hundreds of KB in
// every app binary that references this library.
//
// Asset resolution order:
//   1. [Isolate.resolvePackageUri] → `lib/` parent → package root (Dart VM).
//   2. Ancestor walk from [Directory.current] (flutter test / CI).
//
// The resolved path is cached so repeated asset requests do not re-resolve.
// This is process-global (tests share the same isolate).

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
  static bool _packageRootLookupComplete = false;

  /// GET /api/health — returns {"ok": true}.
  Future<void> sendHealth(HttpResponse response) async {
    final res = response;

    _ctx.setJsonHeaders(res);
    res.write(
      jsonEncode(<String, dynamic>{
        ServerConstants.jsonKeyOk: true,
        ServerConstants.jsonKeyExtensionConnected: _ctx.isExtensionConnected,
        ServerConstants.jsonKeyVersion: ServerConstants.packageVersion,
        ServerConstants.jsonKeyWriteEnabled: _ctx.writeQuery != null,
        ServerConstants.jsonKeyCapabilities: _ctx.writeQuery != null
            ? <String>[
                ServerConstants.capabilityIssues,
                ServerConstants.capabilityCellUpdate,
                ServerConstants.capabilityEditsApply,
              ]
            : <String>[ServerConstants.capabilityIssues],
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
  /// Reads from the package root on disk. Responds with 404 if unavailable
  /// so [HtmlContent.indexHtml] can fall back to the CDN `onerror` handler.
  Future<void> sendWebStyle(HttpResponse response) async {
    await _sendWebAsset(
      response: response,
      relativePath: 'assets/web/style.css',
      contentType: ContentType('text', 'css', charset: 'utf-8'),
    );
  }

  /// Serves the local JS asset used by the web UI shell.
  ///
  /// Reads from the package root on disk. Responds with 404 if unavailable
  /// so [HtmlContent.indexHtml] can fall back to the CDN `onerror` handler.
  Future<void> sendWebApp(HttpResponse response) async {
    await _sendWebAsset(
      response: response,
      relativePath: 'assets/web/app.js',
      contentType: ContentType('application', 'javascript', charset: 'utf-8'),
    );
  }

  /// Serves a web UI asset from the resolved package root.
  ///
  /// On failure (no package root or missing file), sends 404 so the browser
  /// can load version-pinned assets from jsDelivr instead of shipping
  /// duplicate content inside consumer app binaries.
  Future<void> _sendWebAsset({
    required HttpResponse response,
    required String relativePath,
    required ContentType contentType,
  }) async {
    // ── Try file-based serving first ──
    final packageRoot = await _resolvePackageRootPath();
    if (packageRoot != null) {
      final file = File('$packageRoot/$relativePath');
      if (await file.exists()) {
        try {
          // Read full text to avoid leaked file handles on stream interruption.
          final contents = await file.readAsString();
          response.headers.contentType = contentType;
          response.write(contents);
        } on Object catch (error, stack) {
          // Mid-stream read or socket failures can occur
          // after headers start sending; log and close so
          // the client does not hang.
          _ctx.logError(error, stack);
        }
        try {
          await response.close();
        } on Object catch (error, stack) {
          // Ignore close races, but keep telemetry for diagnostics.
          _ctx.logError(error, stack);
        }
        return;
      }
    }

    // ── No on-disk asset: let the HTML shell's onerror switch to jsDelivr ──
    response.statusCode = HttpStatus.notFound;
    response.headers.contentType = ContentType.text;
    response.write('Not found: $relativePath');
    await response.close();
  }

  /// Resolves the local package root once and reuses it for asset serving.
  ///
  /// Prefer [Isolate.resolvePackageUri] for the public library entrypoint, then
  /// step from `lib/` to the package root. When that API is unavailable (for
  /// example under `flutter test`), discover the root by walking ancestors of
  /// [Directory.current] until both expected paths exist.
  Future<String?> _resolvePackageRootPath() async {
    if (_packageRootLookupComplete) {
      return _resolvedPackageRootPath;
    }

    String? root;
    try {
      final packageLibUri = await Isolate.resolvePackageUri(
        Uri.parse('package:saropa_drift_advisor/saropa_drift_advisor.dart'),
      );
      if (packageLibUri != null && packageLibUri.scheme == 'file') {
        final libFile = File.fromUri(packageLibUri);
        root = libFile.parent.parent.path;
      }
    } on Object catch (error, stack) {
      // Flutter's test VM does not implement package URI resolution; use the
      // directory walk below instead of failing every asset request.
      _ctx.logError(error, stack);
    }

    root ??= await _discoverPackageRootPathFromAncestorWalk();
    return _cacheResolvedPackageRootPath(root);
  }

  /// Caches package root lookup result once per process.
  ///
  /// Kept static so cache writes are not performed from instance methods,
  /// which prevents accidental coupling of instance behavior to global state.
  static String? _cacheResolvedPackageRootPath(String? root) {
    _resolvedPackageRootPath = root;
    _packageRootLookupComplete = true;
    return root;
  }

  /// Finds this package's root when [Isolate.resolvePackageUri] cannot run.
  ///
  /// Used by `flutter test`, which throws from that API. Walking from the
  /// process working directory matches publish/CI runs from the repo root.
  static Future<String?> _discoverPackageRootPathFromAncestorWalk() async {
    Directory dir = Directory.current.absolute;
    while (true) {
      final libEntry = File('${dir.path}/lib/saropa_drift_advisor.dart');
      final styleAsset = File('${dir.path}/assets/web/style.css');
      if (await libEntry.exists() && await styleAsset.exists()) {
        return dir.path;
      }
      final parent = dir.parent;
      if (parent.path == dir.path) break;
      dir = parent;
    }
    return null;
  }
}
