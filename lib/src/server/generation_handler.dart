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
//   1. [Isolate.resolvePackageUri] → `lib/` parent → package root (Dart VM /
//      desktop). Unimplemented on Flutter iOS/Android (throws [UnsupportedError]
//      from underlying package URI sync resolution). The resolved root is
//      validated by probing for `assets/web/style.css` — if absent (e.g. pub
//      cache contains only `lib/`), this candidate is skipped.
//   2. Ancestor walk from [Directory.current] (flutter test / CI / device cwd).
//
// The resolved path is cached so repeated asset requests do not re-resolve.
// This is process-global (tests share the same isolate). Asset file contents
// (style.css, app.js) are also cached in memory during resolution, so
// subsequent HTTP requests serve from static fields — no per-request I/O.

import 'dart:convert';
import 'dart:developer' as developer;
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

  /// Cached CSS content, populated once during package root resolution.
  /// Eliminates per-request disk I/O for the most common asset path.
  /// ~51 KB for style.css — acceptable for a debug-only tool.
  static String? _cachedStyleCss;

  /// Cached JS content, populated once during package root resolution.
  /// Eliminates per-request disk I/O for the most common asset path.
  /// ~313 KB for app.js — acceptable for a debug-only tool.
  static String? _cachedAppJs;

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
  /// On failure (no package root, missing file, or read error), sends 404
  /// so the browser `onerror` handler can load version-pinned assets from
  /// jsDelivr instead of shipping duplicate content inside consumer app
  /// binaries.
  ///
  /// The file is read into memory **before** any response headers are
  /// committed. This guarantees that a read failure produces a clean 404
  /// (not a 200 with default `text/plain`), which is required for the CDN
  /// fallback `onerror` to fire — browsers do not trigger `onerror` on
  /// HTTP 200 responses, even with an empty body or wrong MIME type.
  Future<void> _sendWebAsset({
    required HttpResponse response,
    required String relativePath,
    required ContentType contentType,
  }) async {
    // ── Check in-memory cache first (populated once during root resolution) ──
    // This avoids per-request disk I/O for the two known web UI assets.
    final String? cached = switch (relativePath) {
      'assets/web/style.css' => _cachedStyleCss,
      'assets/web/app.js' => _cachedAppJs,
      _ => null,
    };
    if (cached != null) {
      response.headers.contentType = contentType;
      response.write(cached);
      try {
        await response.close();
      } on Object catch (error, stack) {
        // Socket / close races after headers sent; log but nothing to do.
        _ctx.logError(error, stack);
      }
      return;
    }

    // ── Try file-based serving first ──
    // Read the file content before committing any response headers.
    // If the read fails for any reason (permissions, encoding, missing
    // package root), we fall through to the 404 path cleanly.
    final packageRoot = await _resolvePackageRootPath();
    String? contents;
    if (packageRoot != null) {
      final file = File('$packageRoot/$relativePath');
      try {
        if (await file.exists()) {
          contents = await file.readAsString();
        }
      } on Object catch (error, stack) {
        // File exists but could not be read (permissions, encoding, I/O).
        // Log and fall through to 404 so the CDN onerror fallback fires.
        _ctx.logError(error, stack);
      }
    }

    // ── Successfully read: serve with the correct MIME type ──
    if (contents != null) {
      response.headers.contentType = contentType;
      response.write(contents);
      try {
        await response.close();
      } on Object catch (error, stack) {
        // Socket / close races after headers sent; log but nothing to do.
        _ctx.logError(error, stack);
      }
      return;
    }

    // ── No on-disk asset: let the HTML shell's onerror switch to jsDelivr ──
    response.statusCode = HttpStatus.notFound;
    response.headers.contentType = ContentType.text;
    response.write('Not found: $relativePath');
    await response.close();
  }

  /// Resolves the local package root once and reuses it for asset serving.
  ///
  /// Resolution order:
  ///   1. [Isolate.resolvePackageUri] → `lib/` parent → package root. This
  ///      works on the Dart VM / Flutter desktop in debug mode. Throws
  ///      [UnsupportedError] on Flutter iOS/Android embedders.
  ///   2. If the resolved root does not contain `assets/web/style.css`, the
  ///      path may point at the pub cache (which strips non-`lib` assets).
  ///      Fall through to the ancestor walk instead.
  ///   3. Ancestor walk from [Directory.current] (flutter test / CI / example
  ///      apps running via path dependency).
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
        final candidate = File.fromUri(packageLibUri).parent.parent.path;

        // Verify the resolved root actually contains the web assets.
        // Isolate.resolvePackageUri can resolve to the pub cache where
        // only lib/ is guaranteed to exist — assets/ may be absent.
        // When that happens, skip this candidate so the ancestor walk
        // can find the local source tree (which does have the assets).
        final assetProbe = File('$candidate/assets/web/style.css');
        if (await assetProbe.exists()) {
          root = candidate;
        }
      }
    } on UnsupportedError catch (e) {
      // Expected on Flutter iOS/Android: embedders do not resolve package: URIs
      // to host paths. Fall through to the ancestor walk (often null on device).
      developer.log(
        'Package URI resolution unsupported (expected on mobile): $e',
        name: 'SDA',
      );
    } on Object catch (error, stack) {
      // Unexpected failures during resolution; keep telemetry without treating
      // UnsupportedError as an application bug (handled above).
      _ctx.logError(error, stack);
    }

    root ??= await _discoverPackageRootPathFromAncestorWalk();

    // Eagerly cache both web assets into memory so subsequent requests
    // skip disk I/O entirely. Non-fatal: if either read fails, that
    // asset falls through to the per-request disk read → 404 → CDN path.
    if (root != null) {
      await _cacheWebAssets(root);
    }

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

  /// Reads web UI assets into static fields for fast in-memory serving.
  ///
  /// Called once during package root resolution. Failures are non-fatal:
  /// a missed cache entry simply falls through to the per-request disk
  /// read in [_sendWebAsset], which itself falls through to 404 → CDN.
  static Future<void> _cacheWebAssets(String packageRoot) async {
    try {
      final cssFile = File('$packageRoot/assets/web/style.css');
      if (await cssFile.exists()) {
        _cachedStyleCss = await cssFile.readAsString();
      }
    } on Object catch (e) {
      // Non-fatal: per-request disk read is the fallback.
      developer.log('CSS asset cache failed: $e', name: 'SDA');
    }
    try {
      final jsFile = File('$packageRoot/assets/web/app.js');
      if (await jsFile.exists()) {
        _cachedAppJs = await jsFile.readAsString();
      }
    } on Object catch (e) {
      // Non-fatal: per-request disk read is the fallback.
      developer.log('JS asset cache failed: $e', name: 'SDA');
    }
  }

  /// Finds this package's root when [Isolate.resolvePackageUri] cannot run.
  ///
  /// Used by `flutter test` (which throws from that API) and as a fallback
  /// for Flutter desktop apps where `Isolate.resolvePackageUri` may resolve
  /// to the pub cache instead of the local path dependency.
  ///
  /// Walks ancestors of [Directory.current] looking for the barrel file
  /// `lib/saropa_drift_advisor.dart`. Only that sentinel is checked —
  /// requiring `assets/web/style.css` too would fail for published packages
  /// where assets live inside the pub cache, and was overly restrictive
  /// for Flutter Windows desktop apps running from `example/` via path
  /// dependency (the working directory is the example folder, not the
  /// package root).
  static Future<String?> _discoverPackageRootPathFromAncestorWalk() async {
    Directory dir = Directory.current.absolute;
    while (true) {
      final libEntry = File('${dir.path}/lib/saropa_drift_advisor.dart');
      if (await libEntry.exists()) {
        return dir.path;
      }
      final parent = dir.parent;
      if (parent.path == dir.path) break;
      dir = parent;
    }
    return null;
  }
}
