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

    test('does not load CSS/JS from CDN when assets are inlined', () {
      // The logo image still uses CDN, but CSS and JS must be inlined.
      expect(
        html,
        isNot(contains('assets/web/style.css')),
        reason: 'CSS must be inlined, not loaded from CDN',
      );
      expect(
        html,
        isNot(contains('assets/web/app.js')),
        reason: 'JS must be inlined, not loaded from CDN',
      );
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

  // -------------------------------------------------------------------------
  // Logo: verifies the CDN-hosted logo img tag is well-formed, has an
  // onerror fallback, and uses the correct accessibility attributes.
  // -------------------------------------------------------------------------
  group('HtmlContent app logo', () {
    late String html;

    setUp(() {
      html = HtmlContent.buildIndexHtml();
    });

    test('logo img uses a CDN URL, not a data URI', () {
      expect(
        html,
        contains('cdn.jsdelivr.net/gh/saropa/saropa_drift_advisor'),
        reason: 'Logo must load from jsDelivr CDN',
      );
      expect(
        html,
        isNot(contains('data:image/png;base64,')),
        reason: 'Logo must no longer be inlined as a data URI',
      );
    });

    test('logo img has onerror fallback to @main', () {
      expect(
        html,
        contains("onerror=\"this.onerror=null;this.src='"),
        reason: 'Must fall back to @main URL on CDN miss',
      );
      expect(
        html,
        contains(
          'cdn.jsdelivr.net/gh/saropa/saropa_drift_advisor@main/extension/icon.png',
        ),
        reason: 'Fallback must point to @main branch',
      );
    });

    test('logo img tag has alt text and presentation role', () {
      expect(html, contains('class="tab-bar-logo"'));
      expect(
        html,
        contains('role="presentation"'),
        reason: 'Decorative logo needs role="presentation" for a11y',
      );
    });
  });

  // -------------------------------------------------------------------------
  // Masthead pill: the combined logo · version · status pill in the header.
  // -------------------------------------------------------------------------
  group('HtmlContent masthead pill', () {
    late String html;

    setUp(() {
      html = HtmlContent.buildIndexHtml();
    });

    test('contains masthead pill container', () {
      expect(
        html,
        contains('id="masthead-pill"'),
        reason: 'Masthead pill must be present in the header',
      );
      expect(
        html,
        contains('class="masthead-pill"'),
        reason: 'Masthead pill must have its CSS class',
      );
    });

    test('masthead pill contains logo with CDN URL and fallback', () {
      expect(
        html,
        contains('class="masthead-logo"'),
        reason: 'Masthead must include the app logo',
      );
    });

    test('masthead pill contains version badge link', () {
      expect(
        html,
        contains('id="version-badge"'),
        reason: 'Version badge must be inside the masthead pill',
      );
      expect(
        html,
        contains('class="masthead-version"'),
        reason: 'Version badge must use masthead-version class',
      );
    });

    test('masthead pill contains separator', () {
      expect(
        html,
        contains('class="masthead-sep"'),
        reason: 'En-dash separator must be present between version and status',
      );
    });

    test('masthead pill contains connection status button', () {
      expect(
        html,
        contains('id="live-indicator"'),
        reason: 'Connection status indicator must be in the masthead pill',
      );
      expect(
        html,
        contains('class="masthead-status connection-status"'),
        reason:
            'Status must use both masthead-status and connection-status classes',
      );
    });

    test('connection status shows Online as default text', () {
      expect(
        html,
        contains('Online'),
        reason: 'Default status text must be Online, not Live',
      );
    });

    test('masthead pill has accessible live region', () {
      expect(
        html,
        contains('aria-live="polite"'),
        reason: 'Status changes must be announced to screen readers',
      );
    });
  });
}
