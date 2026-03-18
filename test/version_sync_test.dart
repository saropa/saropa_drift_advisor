import 'dart:io';

import 'package:saropa_drift_advisor/src/server/server_constants.dart';
import 'package:test/test.dart';

void main() {
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
          'Run the publish script or update server_constants.dart manually.',
    );
  });
}
