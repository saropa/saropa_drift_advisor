// Contract checks for the browser Size analytics panel in the bundled JS.
//
// The debug viewer is built from TypeScript modules and bundled by esbuild
// into bundle.js. These tests lock in user-facing behaviors so refactors
// do not drop session caching, table links, or tooltip copy without an
// intentional change.
import 'dart:io';

import 'package:test/test.dart';

void main() {
  final bundleJs = File('assets/web/bundle.js');

  test('assets/web/bundle.js exists', () {
    expect(bundleJs.existsSync(), isTrue);
  });

  group('Size tab contract (bundle.js)', () {
    late String src;

    setUp(() {
      src = bundleJs.readAsStringSync().replaceAll('\r\n', '\n');
    });

    test('skips auto size analyze when lastSizeAnalyticsData is already set', () {
      // Before: onTabSwitch always triggered size-analyze. After: only when null.
      // esbuild normalizes quotes to double-quotes.
      expect(
        src.contains(
          'if (tabId === "size" && lastSizeAnalyticsData == null) triggerToolButtonIfReady("size-analyze"',
        ),
        isTrue,
      );
      expect(src.contains("var lastSizeAnalyticsData = null"), isTrue);
    });

    test('exposes SIZE_TT tooltips for summary and table headers', () {
      expect(src.contains('var SIZE_TT = {'), isTrue);
      expect(src.contains('journalCard:'), isTrue);
      expect(src.contains('pagesTotal:'), isTrue);
      expect(src.contains('thIndexes:'), isTrue);
    });

    test('table names open via delegated size-table-link and openTableTab', () {
      expect(src.contains('a.size-table-link'), isTrue);
      expect(src.contains("if (name) openTableTab(name)"), isTrue);
    });

    test('pages card shows product with dimmed PRAGMA formula line', () {
      expect(src.contains('var pageBytes = pc * ps'), isTrue);
      expect(src.contains('class="meta size-pages-formula"'), isTrue);
    });
  });
}
