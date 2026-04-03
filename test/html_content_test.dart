// Contract tests for the HTML shell served by the debug server.
//
// Verifies that inlined assets, CDN fallback, loading overlay, and
// error state listener are present in the generated HTML. The HTML
// inlines CSS/JS directly when available, and falls back to CDN
// URLs when local asset files cannot be found.

import 'package:saropa_drift_advisor/src/server/html_content.dart';
import 'package:test/test.dart';

void main() {
  group('HtmlContent with inlined assets', () {
    late String html;

    setUp(() {
      // Simulate local assets being available.
      html = HtmlContent.buildIndexHtml(
        inlineCss: '/* test-css-marker */',
        inlineJs: '/* test-js-marker */',
      );
    });

    test('inlines CSS in a <style> tag', () {
      expect(html, contains('<style>/* test-css-marker */</style>'));
    });

    test('inlines JS in a <script> tag', () {
      expect(html, contains('<script>/* test-js-marker */</script>'));
    });

    test('does not reference local asset URLs', () {
      expect(html, isNot(contains('/assets/web/style.css')));
      expect(html, isNot(contains('/assets/web/app.js')));
    });

    test('does not reference CDN URLs when assets are inlined', () {
      expect(html, isNot(contains('cdn.jsdelivr.net')));
    });
  });

  group('HtmlContent with CDN fallback', () {
    late String html;

    setUp(() {
      // Simulate local assets unavailable — triggers CDN references.
      html = HtmlContent.buildIndexHtml();
    });

    test('CSS link points to version-pinned CDN', () {
      expect(
        html,
        contains('cdn.jsdelivr.net/gh/saropa/saropa_drift_advisor@v'),
        reason: 'CSS must use version-pinned jsDelivr',
      );
      expect(
        html,
        contains('assets/web/style.css'),
        reason: 'CSS link must reference style.css',
      );
    });

    test('CSS link has onerror fallback to @main', () {
      expect(
        html,
        contains(
          'cdn.jsdelivr.net/gh/saropa/saropa_drift_advisor@main/assets/web/style.css',
        ),
        reason: 'CSS must fall back to @main for publish-to-tag window',
      );
    });

    test('JS fetch-based loader includes version-pinned CDN URL', () {
      expect(
        html,
        contains('cdn.jsdelivr.net/gh/saropa/saropa_drift_advisor@v'),
        reason: 'JS loader must include version-pinned jsDelivr',
      );
    });

    test('JS fetch-based loader includes @main fallback', () {
      expect(
        html,
        contains(
          'cdn.jsdelivr.net/gh/saropa/saropa_drift_advisor@main/assets/web/app.js',
        ),
        reason: 'JS loader must include @main jsDelivr fallback',
      );
    });

    test('JS loader dispatches sda-asset-failed when all sources fail', () {
      expect(
        html,
        contains("sda-asset-failed"),
        reason:
            'Must dispatch sda-asset-failed event when CDN chain is exhausted',
      );
    });

    test('does not reference local server asset URLs', () {
      // In CDN mode, the HTML should not try local URLs first —
      // the whole point is that local serving is unavailable.
      expect(
        html,
        isNot(contains('href="/assets/web/')),
        reason: 'CDN mode must not attempt local asset URLs',
      );
      expect(
        html,
        isNot(contains('src="/assets/web/')),
        reason: 'CDN mode must not attempt local asset URLs',
      );
    });
  });

  group('HtmlContent loading overlay', () {
    // Loading overlay behavior is the same regardless of asset mode.
    late String html;

    setUp(() {
      html = HtmlContent.buildIndexHtml();
    });

    test('contains sda-loading overlay element', () {
      expect(
        html,
        contains('id="sda-loading"'),
        reason: 'Loading overlay must be present for JS-failed error state',
      );
    });

    test('loading overlay has inline styles (no CSS dependency)', () {
      // The overlay must be self-contained with inline styles because
      // it needs to render even when style.css fails to load.
      expect(
        html,
        matches(RegExp(r'id="sda-loading"[^>]*style="[^"]*position:fixed')),
        reason: 'Overlay must use inline styles, not depend on style.css',
      );
    });

    test('contains sda-loading-msg element for dynamic error messages', () {
      expect(
        html,
        contains('id="sda-loading-msg"'),
        reason:
            'Error state listener needs this element to show failure details',
      );
    });

    test('listens for sda-asset-failed custom event', () {
      // The error state listener updates the loading overlay when
      // all CDN sources are exhausted.
      expect(
        html,
        contains("'sda-asset-failed'"),
        reason: 'Must listen for the event dispatched by CDN loader',
      );
    });

    test('loading overlay appears before connection banner in DOM order', () {
      // The overlay must be the first visible element so it covers
      // the unstyled page when CSS/JS both fail.
      final loadingIdx = html.indexOf('id="sda-loading"');
      final bannerIdx = html.indexOf('id="connection-banner"');
      expect(
        loadingIdx,
        lessThan(bannerIdx),
        reason: 'Loading overlay must appear before connection banner',
      );
    });
  });
}
