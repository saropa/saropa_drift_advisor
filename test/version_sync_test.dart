import 'dart:io';

import 'package:saropa_drift_advisor/src/server/server_constants.dart';
import 'package:test/test.dart';

void main() {
  // ------------------------------------------------------------------
  // .pubignore guard: assets/web/ must not be excluded from publishing.
  //
  // The debug server reads style.css and app.js from the installed
  // package root (via Isolate.resolvePackageUri). If .pubignore
  // accidentally excludes assets/web/, consumer apps get 404s for
  // those files, the browser falls back to CDN, and the console
  // shows MIME-type / X-Content-Type-Options: nosniff errors.
  //
  // An unanchored `web/` pattern matches at any depth (gitignore
  // spec) — including `assets/web/`. The correct pattern is `/web/`
  // (root-anchored) so only the top-level SCSS source directory is
  // excluded. This test catches the regression.
  // ------------------------------------------------------------------
  test('.pubignore does not exclude assets/web/ from the published package',
      () {
    final pubignoreFile = File('.pubignore');
    expect(
      pubignoreFile.existsSync(),
      isTrue,
      reason: '.pubignore must exist at the project root',
    );

    final lines = pubignoreFile
        .readAsLinesSync()
        .where((l) => l.trim().isNotEmpty && !l.trimLeft().startsWith('#'))
        .toList();

    // Look for any unanchored "web/" pattern that would match assets/web/.
    // Anchored patterns start with "/" and only match at the package root.
    for (final line in lines) {
      final trimmed = line.trim();

      // Patterns that contain "web/" but are NOT root-anchored would
      // exclude assets/web/ from the published package.
      if (trimmed == 'web/' || trimmed == 'web') {
        fail(
          '.pubignore contains unanchored pattern "$trimmed" which '
          'excludes assets/web/ (gitignore matches at any depth). '
          'Use "/web/" to anchor to the package root.',
        );
      }
    }

    // Also verify the required asset files actually exist on disk.
    expect(
      File('assets/web/style.css').existsSync(),
      isTrue,
      reason: 'assets/web/style.css must exist for the debug server',
    );
    expect(
      File('assets/web/app.js').existsSync(),
      isTrue,
      reason: 'assets/web/app.js must exist for the debug server',
    );
  });

  test('ServerConstants.packageVersion matches pubspec.yaml version', () {
    // Read the pubspec.yaml file from the project root to extract the
    // canonical version string. This catches cases where a developer bumps
    // pubspec.yaml but forgets to update server_constants.dart (or the
    // publish script is bypassed).
    final pubspecFile = File('pubspec.yaml');
    expect(
      pubspecFile.existsSync(),
      isTrue,
      reason: 'pubspec.yaml must exist at the project root',
    );

    final content = pubspecFile.readAsStringSync();

    // Extract the top-level "version: x.y.z" line from pubspec.yaml.
    final match = RegExp(
      r'^version:\s*(\S+)',
      multiLine: true,
    ).firstMatch(content);
    expect(
      match,
      isNotNull,
      reason: 'pubspec.yaml must contain a version field',
    );

    final pubspecVersion = match!.group(1);

    // The constant in server_constants.dart must match exactly.
    expect(
      ServerConstants.packageVersion,
      equals(pubspecVersion),
      reason:
          'ServerConstants.packageVersion (${ServerConstants.packageVersion}) '
          'does not match pubspec.yaml version ($pubspecVersion). '
          'Run publish analysis (dart/analyze) to auto-sync, or update server_constants.dart.',
    );
  });
}
