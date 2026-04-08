// Generation, health, HTML shell, and static web UI asset serving.
//
// The viewer HTML inlines CSS/JS directly when the package root is
// resolved and asset files are found on disk. This eliminates the
// fragile `onerror` fallback chain that Firefox ignored (HTTP 404
// with correct MIME type does not reliably trigger `onerror` on
// `<link>` / `<script>` elements). When local assets are unavailable,
// the HTML references jsDelivr CDN URLs directly via a fetch-based
// loader.
//
// The `/assets/web/style.css` and `/assets/web/bundle.js` routes are
// retained for backward compatibility (VS Code extension, direct
// access) but are no longer required for the HTML viewer to work.
//
// Asset resolution order:
//   1. [Isolate.resolvePackageUri] → `lib/` parent → package root (Dart VM /
//      desktop). Unimplemented on Flutter iOS/Android (throws [UnsupportedError]
//      from underlying package URI sync resolution). The resolved root is
//      validated by probing for `assets/web/style.css` — if absent (e.g. pub
//      cache contains only `lib/`), this candidate is skipped.
//   2. `.dart_tool/package_config.json` parsing — walks ancestors of
//      [Directory.current] for the nearest package config, extracts the
//      `rootUri` for this package, and verifies assets exist. Works on all
//      platforms (Flutter desktop, mobile, test, CI) as long as the project
//      has run `pub get`.
//   3. Ancestor walk from [Directory.current] (flutter test / CI / device cwd).
//   4. Ancestor walk from [Platform.resolvedExecutable] directory — catches
//      Flutter Windows desktop where the executable lives in the build output
//      tree (e.g. build/windows/x64/runner/Debug/) whose ancestors include
//      the package root, but [Directory.current] may be unrelated.
//
// The resolved path is cached so repeated asset requests do not re-resolve.
// This is process-global (tests share the same isolate). Asset file contents
// (style.css, bundle.js) are also cached in memory during resolution, so
// subsequent HTTP requests serve from static fields — no per-request I/O.

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

  /// Cached CSS content, populated once during package root resolution.
  /// Eliminates per-request disk I/O for the most common asset path.
  /// ~51 KB for style.css — acceptable for a debug-only tool.
  static String? _cachedStyleCss;

  /// Cached JS bundle content, populated once during package root resolution.
  /// Eliminates per-request disk I/O for the most common asset path.
  /// Single esbuild bundle containing app + fab + masthead + table-def-toggle.
  static String? _cachedBundleJs;

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
  ///
  /// Resolves the package root (if not already cached) and inlines CSS/JS
  /// directly into the HTML when the asset files are found on disk. This
  /// avoids separate asset requests and the unreliable `onerror` fallback
  /// chain that Firefox ignores for 404 responses with correct MIME types.
  /// When local assets are unavailable, the HTML references CDN URLs
  /// directly via a fetch-based loader.
  Future<void> sendHtml(HttpResponse response, HttpRequest _) async {
    final res = response;

    // Eagerly resolve the package root so cached CSS/JS are available.
    await _resolvePackageRootPath();

    res.headers.contentType = ContentType.html;
    res.write(
      HtmlContent.buildIndexHtml(
        inlineCss: _cachedStyleCss,
        inlineBundleJs: _cachedBundleJs,
      ),
    );
    await res.close();
  }

  /// Serves the local CSS asset for backward-compatible direct access.
  ///
  /// The HTML viewer now inlines CSS, so this route is only needed by
  /// external consumers (e.g. VS Code extension). Responds with 404 if
  /// the package root cannot be resolved.
  Future<void> sendWebStyle(HttpResponse response) async {
    await _sendWebAsset(
      response: response,
      relativePath: 'assets/web/style.css',
      contentType: ContentType('text', 'css', charset: 'utf-8'),
    );
  }

  /// Serves the local JS asset for backward-compatible direct access.
  ///
  /// The HTML viewer now inlines JS, so this route is only needed by
  /// external consumers (e.g. VS Code extension). Responds with 404 if
  /// the package root cannot be resolved.
  Future<void> sendWebApp(HttpResponse response) async {
    await _sendWebAsset(
      response: response,
      relativePath: 'assets/web/bundle.js',
      contentType: ContentType('application', 'javascript', charset: 'utf-8'),
    );
  }

  /// Serves a web UI asset from the resolved package root.
  ///
  /// On failure (no package root, missing file, or read error), sends 404
  /// **with the expected [contentType]** so the browser `onerror` handler
  /// can load version-pinned assets from jsDelivr instead of shipping
  /// duplicate content inside consumer app binaries.
  ///
  /// The file is read into memory **before** any response headers are
  /// committed. This guarantees that a read failure produces a clean 404
  /// (not a 200 with default `text/plain`), which is required for the CDN
  /// fallback `onerror` to fire — browsers do not trigger `onerror` on
  /// HTTP 200 responses, even with an empty body or wrong MIME type.
  ///
  /// The 404 response uses the expected [contentType] (e.g. `text/css`)
  /// rather than `text/plain` because browsers with
  /// `X-Content-Type-Options: nosniff` (Dart's default) MIME-block
  /// responses whose type does not match the requesting element. A
  /// MIME-blocked response may suppress the `onerror` callback entirely,
  /// silently killing the CDN fallback chain.
  Future<void> _sendWebAsset({
    required HttpResponse response,
    required String relativePath,
    required ContentType contentType,
  }) async {
    // ── Check in-memory cache first (populated once during root resolution) ──
    // This avoids per-request disk I/O for the two known web UI assets.
    final String? cached = switch (relativePath) {
      'assets/web/style.css' => _cachedStyleCss,
      'assets/web/bundle.js' => _cachedBundleJs,
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
      final filePath = file.path;
      _ctx.log('[SDA] Asset probe: $filePath');
      try {
        if (await file.exists()) {
          _ctx.log('[SDA] Reading asset: $filePath');
          contents = await file.readAsString();
          _ctx.log(
            '[SDA] Asset read OK: ${contents.length} chars ($relativePath)',
          );
        } else {
          _ctx.log('[SDA] Asset not found on disk: $filePath');
        }
      } on Object catch (error, stack) {
        // File exists but could not be read (permissions, encoding, I/O).
        // Log and fall through to 404 so the CDN onerror fallback fires.
        _ctx.log('[SDA] Asset read failed: $filePath — $error');
        _ctx.logError(error, stack);
      }
    } else {
      _ctx.log(
        '[SDA] No package root resolved — serving 404 for $relativePath',
      );
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
    // Use the expected content type (not text/plain) so browsers with
    // X-Content-Type-Options: nosniff do not MIME-block the 404 response.
    // A MIME-blocked response prevents the <link>/<script> onerror handler
    // from firing, which silently kills the CDN fallback chain. With the
    // correct MIME type, the 404 status alone triggers onerror reliably
    // across Firefox and Chrome.
    response.statusCode = HttpStatus.notFound;
    response.headers.contentType = contentType;
    await response.close();
  }

  /// Resolves the local package root once and reuses it for asset serving.
  ///
  /// Resolution order:
  ///   1. [Isolate.resolvePackageUri] → `lib/` parent → package root. This
  ///      works on the Dart VM / Flutter desktop in debug mode. Throws
  ///      [UnsupportedError] on Flutter iOS/Android embedders.
  ///   The resolved root from strategy 1 is validated against
  ///   `assets/web/style.css`. If absent (pub cache path), falls through.
  ///   2. `.dart_tool/package_config.json` parsing — finds the `rootUri`
  ///      for this package and verifies assets exist.
  ///   3. Ancestor walk from [Directory.current] (flutter test / CI / example
  ///      apps running via path dependency).
  ///   4. Ancestor walk from [Platform.resolvedExecutable] — Flutter Windows
  ///      desktop where the executable is inside the build tree.
  Future<String?> _resolvePackageRootPath() async {
    if (_packageRootLookupComplete) {
      return _resolvedPackageRootPath;
    }

    final cwd = Directory.current.absolute.path;
    _ctx.log('[SDA] Resolving package root (cwd: $cwd)');

    // ── Strategy 1: Isolate.resolvePackageUri ──
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
        // When that happens, skip this candidate so the next strategy
        // can find the local source tree (which does have the assets).
        final assetProbe = File('$candidate/assets/web/style.css');
        if (await assetProbe.exists()) {
          root = candidate;
          _ctx.log('[SDA] Package root via Isolate.resolvePackageUri: $root');
        } else {
          _ctx.log(
            '[SDA] Isolate.resolvePackageUri resolved to $candidate '
            'but assets/web/style.css not found there',
          );
        }
      } else {
        _ctx.log('[SDA] Isolate.resolvePackageUri returned: $packageLibUri');
      }
    } on UnsupportedError catch (e) {
      // Expected on Flutter iOS/Android: embedders do not resolve package: URIs
      // to host paths. Fall through to the next strategy.
      _ctx.log(
        '[SDA] Package URI resolution unsupported (expected on mobile): $e',
      );
    } on Object catch (error, stack) {
      // Unexpected failures during resolution; keep telemetry without treating
      // UnsupportedError as an application bug (handled above).
      _ctx.log('[SDA] Isolate.resolvePackageUri failed: $error');
      _ctx.logError(error, stack);
    }

    // ── Strategy 2: .dart_tool/package_config.json ──
    if (root == null) {
      root = await _discoverPackageRootFromPackageConfig(_ctx.log);
      if (root != null) {
        _ctx.log('[SDA] Package root via package_config.json: $root');
      }
    }

    // ── Strategy 3: ancestor walk from Directory.current ──
    if (root == null) {
      root = await _discoverPackageRootPathFromAncestorWalk();
      if (root != null) {
        _ctx.log('[SDA] Package root via ancestor walk: $root');
      }
    }

    // ── Strategy 4: ancestor walk from Platform.resolvedExecutable ──
    // Handles Flutter Windows desktop where Directory.current may be
    // the system/IDE directory but the executable lives inside the
    // project's build tree, whose ancestors include the package root.
    if (root == null) {
      root = await _discoverPackageRootFromExecutablePath(_ctx.log);
      if (root != null) {
        _ctx.log('[SDA] Package root via executable path: $root');
      }
    }

    if (root == null) {
      _ctx.log(
        '[SDA] All package root resolution strategies failed (cwd: $cwd). '
        'Web assets will be served from CDN.',
      );
    }

    // Eagerly cache both web assets into memory so subsequent requests
    // skip disk I/O entirely. Non-fatal: if either read fails, that
    // asset falls through to the per-request disk read → 404 → CDN path.
    if (root != null) {
      await _cacheWebAssets(root, _ctx.log);
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
  static Future<void> _cacheWebAssets(
    String packageRoot,
    void Function(String) log,
  ) async {
    try {
      final cssFile = File('$packageRoot/assets/web/style.css');
      if (await cssFile.exists()) {
        _cachedStyleCss = await cssFile.readAsString();
      }
    } on Object catch (e) {
      // Non-fatal: per-request disk read is the fallback.
      log('[SDA] CSS asset cache failed: $e');
    }
    try {
      final jsFile = File('$packageRoot/assets/web/bundle.js');
      if (await jsFile.exists()) {
        _cachedBundleJs = await jsFile.readAsString();
      }
    } on Object catch (e) {
      // Non-fatal: per-request disk read is the fallback.
      log('[SDA] JS bundle asset cache failed: $e');
    }
  }

  /// Finds this package's root by parsing `.dart_tool/package_config.json`.
  ///
  /// Walks ancestors of [Directory.current] looking for the nearest
  /// `.dart_tool/package_config.json`, reads the `rootUri` for
  /// `saropa_drift_advisor`, resolves it to an absolute path, and
  /// verifies `assets/web/style.css` exists there.
  ///
  /// This strategy works on all platforms (Flutter desktop, mobile, test,
  /// CI) as long as the project has run `pub get`. It does not depend on
  /// [Isolate.resolvePackageUri] (which throws on mobile embedders) or
  /// on the barrel file sentinel (which requires CWD to be inside the
  /// package tree).
  static Future<String?> _discoverPackageRootFromPackageConfig(
    void Function(String) log,
  ) async {
    Directory dir = Directory.current.absolute;
    while (true) {
      final configFile = File('${dir.path}/.dart_tool/package_config.json');
      try {
        if (await configFile.exists()) {
          final contents = await configFile.readAsString();
          final config = jsonDecode(contents);
          if (config is Map<String, dynamic>) {
            final packages = config['packages'];
            if (packages is List<dynamic>) {
              for (final pkg in packages) {
                if (pkg is Map<String, dynamic> &&
                    pkg['name'] == 'saropa_drift_advisor') {
                  final rootUri = pkg['rootUri'];
                  if (rootUri is String) {
                    // rootUri is relative to the .dart_tool/ directory,
                    // or an absolute file: URI for pub cache packages.
                    final dartToolUri = configFile.parent.uri;
                    final resolvedUri = dartToolUri.resolve(rootUri);
                    final resolvedRoot = Directory.fromUri(
                      resolvedUri,
                    ).absolute.path;

                    // Verify the resolved root contains the web assets.
                    final assetProbe = File(
                      '$resolvedRoot/assets/web/style.css',
                    );
                    if (await assetProbe.exists()) {
                      return resolvedRoot;
                    }
                    log(
                      '[SDA] package_config.json rootUri resolved to '
                      '$resolvedRoot but assets/web/style.css not found',
                    );
                  }
                  break; // Found our package entry, stop searching packages.
                }
              }
            }
          }
        }
      } on Object catch (e) {
        // Malformed config, I/O error, or missing file — skip this
        // ancestor and keep walking up.
        log('[SDA] package_config.json parse failed at ${dir.path}: $e');
      }
      final parent = dir.parent;
      if (parent.path == dir.path) break;
      dir = parent;
    }
    return null;
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

  /// Finds this package's root by walking ancestors of the current executable.
  ///
  /// Flutter Windows desktop sets the working directory to the executable
  /// location (`build/windows/x64/runner/Debug/`) rather than the project
  /// root. [Directory.current] is therefore inside the build tree, whose
  /// ancestors include the package root. This covers scenarios where
  /// [Directory.current] is an IDE or system directory with no relation to
  /// the project.
  ///
  /// On Dart CLI, [Platform.resolvedExecutable] is the Dart VM itself
  /// (`dart.exe`), which lives in the SDK — not the project tree. Ancestor
  /// walking from there will never find the package sentinel and this method
  /// simply returns null, leaving the earlier strategies (which do work
  /// on CLI) as the definitive answer.
  static Future<String?> _discoverPackageRootFromExecutablePath(
    void Function(String) log,
  ) async {
    try {
      final execPath = Platform.resolvedExecutable;
      log('[SDA] Executable path: $execPath');
      Directory dir = File(execPath).parent.absolute;
      while (true) {
        final libEntry = File('${dir.path}/lib/saropa_drift_advisor.dart');
        if (await libEntry.exists()) {
          return dir.path;
        }
        final parent = dir.parent;
        if (parent.path == dir.path) break;
        dir = parent;
      }
    } on Object catch (e) {
      log('[SDA] Executable path strategy failed: $e');
    }
    return null;
  }
}
