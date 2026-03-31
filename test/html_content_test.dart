// Contract tests for the HTML shell served by the debug server.
//
// Verifies that the multi-CDN fallback chain, loading overlay, and
// error state listener are present in the generated HTML. These are
// critical for the web UI to load when local asset serving fails.

import 'package:saropa_drift_advisor/src/server/html_content.dart';
import 'package:test/test.dart';

void main() {
  // Grab the HTML once; it is a static getter with string interpolation.
  late String html;

  setUp(() {
    html = HtmlContent.indexHtml;
  });

  group('HtmlContent asset loading', () {
    test('contains _sda_fb fallback helper function', () {
      // The helper is the backbone of the multi-CDN chain. Without it,
      // onerror handlers on <link> and <script> have no fallback logic.
      expect(html, contains('function _sda_fb('));
    });

    test('CSS link uses multi-CDN fallback chain via _sda_fb', () {
      // Must call _sda_fb, not inline a single onerror URL swap.
      expect(html, contains("_sda_fb(this,'href',["));
      // Chain must include version-pinned jsDelivr URL.
      expect(
        html,
        contains('cdn.jsdelivr.net/gh/saropa/saropa_drift_advisor@v'),
        reason: 'CSS fallback chain must include version-pinned jsDelivr',
      );
      // Chain must include @main fallback for the window between
      // publishing and tag creation.
      expect(
        html,
        contains(
          'cdn.jsdelivr.net/gh/saropa/saropa_drift_advisor@main/assets/web/style.css',
        ),
        reason: 'CSS fallback chain must include @main jsDelivr',
      );
    });

    test('JS script uses multi-CDN fallback chain via _sda_fb', () {
      // Same chain structure as CSS but for the script tag.
      expect(html, contains("_sda_fb(this,'src',["));
      expect(
        html,
        contains(
          'cdn.jsdelivr.net/gh/saropa/saropa_drift_advisor@main/assets/web/app.js',
        ),
        reason: 'JS fallback chain must include @main jsDelivr',
      );
    });

    test('CSS link loads from local server first', () {
      expect(
        html,
        contains('href="/assets/web/style.css"'),
        reason: 'CSS must load from local server before CDN fallback',
      );
    });

    test('JS script loads from local server first', () {
      expect(
        html,
        contains('src="/assets/web/app.js"'),
        reason: 'JS must load from local server before CDN fallback',
      );
    });

    test('_sda_fb receives human-readable asset name for CSS', () {
      // The 4th argument to _sda_fb is the display name shown in the
      // error overlay. Must be a file name, not the HTML attribute.
      expect(
        html,
        contains(",'style.css')"),
        reason: 'CSS fallback must pass "style.css" as display name, '
            'not the HTML attribute "href"',
      );
    });

    test('_sda_fb receives human-readable asset name for JS', () {
      expect(
        html,
        contains(",'app.js')"),
        reason: 'JS fallback must pass "app.js" as display name, '
            'not the HTML attribute "src"',
      );
    });
  });

  group('HtmlContent loading overlay', () {
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
        reason: 'Error state listener needs this element to show failure details',
      );
    });

    test('listens for sda-asset-failed custom event', () {
      // The error state listener updates the loading overlay when
      // all CDN sources are exhausted.
      expect(
        html,
        contains("'sda-asset-failed'"),
        reason: 'Must listen for the event dispatched by _sda_fb',
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
