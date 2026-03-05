// Flutter overlay: floating button that opens the Drift viewer in browser or WebView.
//
// Apps that use this widget must configure url_launcher for their platform:
// - Android: add <queries> with intent filters in AndroidManifest.xml (see url_launcher docs).
// - iOS: add LSApplicationQueriesSchemes in Info.plist for the schemes you launch (e.g. http).

import 'dart:async';

import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:intl/intl.dart';
import 'package:meta/meta.dart';
import 'package:url_launcher/url_launcher.dart';
import 'package:webview_flutter/webview_flutter.dart';
import 'package:webview_flutter_android/webview_flutter_android.dart';

import 'drift_debug_server.dart';

// ---------------------------------------------------------------------------
// Constants (named to satisfy avoid_hardcoded_duration / avoid_time_limits)
// ---------------------------------------------------------------------------

/// SnackBar display duration for overlay messages. Long enough to read; debug-only UI.
const Duration _kSnackBarDuration = Duration(seconds: 10);

/// App bar title for the in-app WebView screen.
const String _kDriftViewerScreenTitle = 'Drift Viewer';

/// Skeleton placeholder dimensions (debug-only; fixed for consistency).
const double _kSkeletonBarWidth = 200;
const double _kSkeletonBarHeight = 16;
const double _kSkeletonBarGap = 12;
const double _kSkeletonCornerRadius = 4;
const double _kSkeletonBlockWidth = 280;
const double _kSkeletonBlockHeight = 80;
/// Skeleton bar color (const so [_SkeletonBars] can be a const subtree per prefer_split_widget_const).
const Color _kSkeletonColor = Color(0xFFE0E0E0);

// ---------------------------------------------------------------------------
// Localized strings (Intl.message for avoid_hardcoded_locale_strings)
// ---------------------------------------------------------------------------

String get _sOpenDriftViewer => Intl.message(
  'Open Drift Viewer',
  name: 'sOpenDriftViewer',
  desc: 'Tooltip for the Drift Viewer overlay floating button',
);
String get _sOpenInBrowser => Intl.message(
  'Open in browser',
  name: 'sOpenInBrowser',
  desc: 'Menu item to open the viewer in the external browser',
);
String get _sOpenInWebView => Intl.message(
  'Open in WebView',
  name: 'sOpenInWebView',
  desc: 'Menu item to open the viewer in an in-app WebView',
);
String get _sBrowser => Intl.message(
  'Browser',
  name: 'sBrowser',
  desc: 'Semantic label for the open-in-browser icon',
);
String get _sWebView => Intl.message(
  'WebView',
  name: 'sWebView',
  desc: 'Semantic label for the open-in-WebView icon',
);
String get _sBack => Intl.message(
  'Back',
  name: 'sBack',
  desc: 'Back button tooltip and semantic label on WebView screen',
);
String _sCouldNotOpen(Uri uri) => Intl.message(
  'Could not open $uri',
  name: 'sCouldNotOpen',
  desc: 'SnackBar when url_launcher cannot open the viewer URL',
  args: [uri.toString()],
);
String get _sFailedToOpenViewer => Intl.message(
  'Failed to open viewer. Try opening the URL manually.',
  name: 'sFailedToOpenViewer',
  desc: 'SnackBar when launchUrl throws an exception',
);
String _sInvalidOrUnsupportedUrl(String urlSample) => Intl.message(
  'Invalid or unsupported URL: $urlSample',
  name: 'sInvalidOrUnsupportedUrl',
  desc: 'WebView route error when URI is invalid or not http(s)',
  args: [urlSample],
);

// ---------------------------------------------------------------------------
// URI and visibility
// ---------------------------------------------------------------------------

/// Builds the viewer URI for the current server port (localhost only).
Uri? _viewerUri() {
  final port = DriftDebugServer.port;
  if (port == null) return null;
  return Uri(scheme: 'http', host: '127.0.0.1', port: port);
}

/// Returns true when the overlay button should be shown (debug mode and server running).
bool get isDriftViewerOverlayVisible =>
    kDebugMode && DriftDebugServer.port != null;

// ---------------------------------------------------------------------------
// DriftViewerFloatingButton
// ---------------------------------------------------------------------------

/// Floating button that opens the Drift viewer in the browser or in an in-app WebView.
///
/// Only builds a visible widget when [kDebugMode] is true and [DriftDebugServer.port]
/// is non-null (server running). Otherwise builds [SizedBox.shrink].
///
/// Place in a [Stack] or use [DriftViewerOverlay] to wrap your app with a default position.
///
/// See also: [DriftViewerOverlay].
final class DriftViewerFloatingButton extends StatelessWidget {
  /// Creates a floating button that opens the Drift viewer.
  const DriftViewerFloatingButton({super.key});

  /// Route name for the in-app WebView screen. Register in [MaterialApp.onGenerateRoute]
  /// or [MaterialApp.routes] so [openInWebView] can use named routes for deep linking.
  /// Example: `onGenerateRoute: (s) => s.name == DriftViewerFloatingButton.webViewRouteName
  ///   ? DriftViewerFloatingButton.buildWebViewRoute(s.arguments as String) : null`
  static const String webViewRouteName = '/drift-viewer-webview';

  /// Builds the route for the in-app WebView. Use when registering [webViewRouteName].
  ///
  /// Returns a [MaterialPageRoute] that displays the WebView for the given [uriString].
  /// Pass [uriString] from [RouteSettings.arguments] when using path-style deep links.
  /// Only http and https schemes are allowed; invalid or unsupported URLs yield an error screen.
  @useResult
  static Route<void> buildWebViewRoute(String uriString) {
    final uri = Uri.tryParse(uriString);
    if (uri == null ||
        (uri.scheme != 'http' && uri.scheme != 'https')) {
      final urlSample = uriString.length > 80
          ? '${uriString.substring(0, 80)}...'
          : uriString;
      return MaterialPageRoute<void>(
        settings: const RouteSettings(name: webViewRouteName),
        builder: (BuildContext _) => Scaffold(
          body: Center(
            child: Text(
              _sInvalidOrUnsupportedUrl(urlSample),
              maxLines: 3,
              overflow: TextOverflow.ellipsis,
            ),
          ),
        ),
      );
    }
    return MaterialPageRoute<void>(
      settings: const RouteSettings(name: webViewRouteName),
      builder: (BuildContext _) => _DriftViewerWebViewScreen(uri: uri),
    );
  }

  @override
  @useResult
  Widget build(BuildContext context) {
    if (!isDriftViewerOverlayVisible) return const SizedBox.shrink();
    final uri = _viewerUri();
    if (uri == null) return const SizedBox.shrink();

    final colorScheme = Theme.of(context).colorScheme;
    final transparentSurface = colorScheme.surface.withValues(alpha: 0);

    return Material(
      color: transparentSurface,
      child: PopupMenuButton<String>(
        tooltip: _sOpenDriftViewer,
        icon: const Icon(Icons.storage, semanticLabel: 'Drift Viewer'),
        onSelected: (String value) {
          if (value == 'browser') {
            unawaited(_openInBrowser(context, uri));
          } else if (value == 'webview') {
            _openInWebView(context, uri);
          }
        },
        itemBuilder: (BuildContext _) => <PopupMenuEntry<String>>[
          PopupMenuItem<String>(
            value: 'browser',
            child: ListTile(
              leading: Icon(Icons.open_in_browser, semanticLabel: _sBrowser),
              title: Text(
                _sOpenInBrowser,
                overflow: TextOverflow.ellipsis,
                maxLines: 1,
              ),
            ),
          ),
          PopupMenuItem<String>(
            value: 'webview',
            child: ListTile(
              leading: Icon(Icons.web, semanticLabel: _sWebView),
              title: Text(
                _sOpenInWebView,
                overflow: TextOverflow.ellipsis,
                maxLines: 1,
              ),
            ),
          ),
        ],
      ),
    );
  }
}

// ---------------------------------------------------------------------------
// SnackBar helpers (extracted from _openInBrowser per avoid_local_functions)
// ---------------------------------------------------------------------------

void _showCouldNotOpenSnackBar(ScaffoldMessengerState messenger, Uri uri) {
  messenger.clearSnackBars();
  final snackBar = SnackBar(
    duration: _kSnackBarDuration,
    content: Text(
      _sCouldNotOpen(uri),
      overflow: TextOverflow.ellipsis,
      maxLines: 2,
    ),
  );
  final _ = messenger.showSnackBar(snackBar);
}

void _showFailedToOpenSnackBar(ScaffoldMessengerState messenger) {
  messenger.clearSnackBars();
  final _ = messenger.showSnackBar(
    SnackBar(
      duration: _kSnackBarDuration,
      content: Text(
        _sFailedToOpenViewer,
        overflow: TextOverflow.ellipsis,
        maxLines: 2,
      ),
    ),
  );
}

// ---------------------------------------------------------------------------
// Open in browser (specific exception types per avoid_catching_generic_exception)
// ---------------------------------------------------------------------------

Future<void> _openInBrowser(BuildContext context, Uri uri) async {
  final messenger = ScaffoldMessenger.maybeOf(context);
  if (messenger == null) return;

  try {
    // Call launchUrl directly; avoid canLaunchUrl so apps need not add
    // <queries> (Android) / LSApplicationQueriesSchemes (iOS) for this debug-only flow.
    final launched = await launchUrl(
      uri,
      mode: LaunchMode.externalApplication,
    );
    if (!context.mounted) return;
    if (!launched) {
      _showCouldNotOpenSnackBar(messenger, uri);
    }
  } on PlatformException catch (e, st) {
    if (kDebugMode) {
      debugPrint('DriftViewer launchUrl PlatformException: $e');
      debugPrint('$st');
    }
    if (!context.mounted) return;
    _showFailedToOpenSnackBar(messenger);
  } on ArgumentError catch (e, st) {
    if (kDebugMode) {
      debugPrint('DriftViewer launchUrl ArgumentError: $e');
      debugPrint('$st');
    }
    if (!context.mounted) return;
    _showFailedToOpenSnackBar(messenger);
  } on FormatException catch (e, st) {
    if (kDebugMode) {
      debugPrint('DriftViewer launchUrl FormatException: $e');
      debugPrint('$st');
    }
    if (!context.mounted) return;
    _showFailedToOpenSnackBar(messenger);
  }
}

void _openInWebView(BuildContext context, Uri uri) {
  final future = Navigator.of(context).pushNamed<void>(
    DriftViewerFloatingButton.webViewRouteName,
    arguments: uri.toString(),
  );
  unawaited(future.catchError((Object e, StackTrace st) {
    if (kDebugMode) {
      debugPrint('DriftViewer pushNamed failed: $e');
      debugPrint('$st');
    }
  }));
}

// ---------------------------------------------------------------------------
// WebView navigation delegate (extracted per prefer_extracting_function_callbacks)
// ---------------------------------------------------------------------------

NavigationDelegate _createWebViewNavigationDelegate(Uri allowedUri) {
  final allowedHost = allowedUri.host;
  final allowedPort = allowedUri.port;
  return NavigationDelegate(
    onNavigationRequest: (NavigationRequest request) {
      final requestUri = Uri.tryParse(request.url);
      if (requestUri != null &&
          requestUri.host == allowedHost &&
          requestUri.port == allowedPort) {
        return NavigationDecision.navigate;
      }
      return NavigationDecision.prevent;
    },
    onWebResourceError: (WebResourceError error) {
      if (kDebugMode) {
        debugPrint('DriftViewer WebView error: ${error.description}');
      }
    },
    onSslAuthError: (SslAuthError request) {
      unawaited(request.cancel());
    },
  );
}

// ---------------------------------------------------------------------------
// Loading skeleton (prefer_skeleton_over_spinner; theme color per require_theme_color_from_scheme)
// ---------------------------------------------------------------------------

/// Skeleton placeholder shown while the WebView controller is not yet ready.
class _DriftViewerLoadingPlaceholder extends StatelessWidget {
  const _DriftViewerLoadingPlaceholder();

  @override
  @useResult
  Widget build(BuildContext context) {
    return const Center(
      child: _SkeletonBars(),
    );
  }
}

/// Skeleton bars with const constructor; reads theme in build for prefer_split_widget_const.
class _SkeletonBars extends StatelessWidget {
  const _SkeletonBars();

  @override
  String toString({DiagnosticLevel minLevel = DiagnosticLevel.info}) =>
      '_SkeletonBars()';

  @override
  @useResult
  Widget build(BuildContext context) {
    return Column(
      mainAxisSize: MainAxisSize.min,
      children: <Widget>[
        Container(
          width: _kSkeletonBarWidth,
          height: _kSkeletonBarHeight,
          margin: const EdgeInsets.only(bottom: _kSkeletonBarGap),
          clipBehavior: Clip.hardEdge,
          decoration: const BoxDecoration(
            color: _kSkeletonColor,
            borderRadius: BorderRadius.all(Radius.circular(_kSkeletonCornerRadius)),
          ),
        ),
        Container(
          width: _kSkeletonBlockWidth,
          height: _kSkeletonBlockHeight,
          clipBehavior: Clip.hardEdge,
          decoration: const BoxDecoration(
            color: _kSkeletonColor,
            borderRadius: BorderRadius.all(Radius.circular(_kSkeletonCornerRadius)),
          ),
        ),
      ],
    );
  }
}

// ---------------------------------------------------------------------------
// Full-screen WebView (StatefulWidget required for initState + controller)
// ---------------------------------------------------------------------------

/// Full-screen WebView that loads the Drift viewer. Controller and navigation
/// delegate are set in [initState]; [WebViewWidget] receives the configured
/// controller (navigation delegate and error handling are on the controller).
class _DriftViewerWebViewScreen extends StatefulWidget {
  const _DriftViewerWebViewScreen({required this.uri});

  final Uri uri;

  @override
  @useResult
  State<_DriftViewerWebViewScreen> createState() =>
      _DriftViewerWebViewScreenState();

  @override
  String toString({DiagnosticLevel minLevel = DiagnosticLevel.info}) =>
      '_DriftViewerWebViewScreen(uri: $uri)';
}

class _DriftViewerWebViewScreenState extends State<_DriftViewerWebViewScreen> {
  /// Set in [initState]; non-null by first [build]. Avoids [late] per avoid_late_keyword.
  WebViewController? _controller;

  static void _logLoadError(Object e, StackTrace st) {
    if (kDebugMode) {
      debugPrint('DriftViewer loadRequest failed: $e');
      debugPrint('$st');
    }
  }

  @override
  String toString({DiagnosticLevel minLevel = DiagnosticLevel.info}) =>
      '_DriftViewerWebViewScreenState(uri: ${widget.uri})';

  @override
  void initState() {
    super.initState();
    final uri = widget.uri;
    final controller = WebViewController()
      ..setNavigationDelegate(_createWebViewNavigationDelegate(uri));
    final platform = controller.platform;
    if (platform is AndroidWebViewController) {
      platform.setAllowFileAccess(false);
    }
    _controller = controller;
    unawaited(
      controller
          .loadRequest(uri)
          .catchError((Object e, StackTrace st) => _logLoadError(e, st)),
    );
  }

  @override
  void dispose() {
    _controller = null;
    super.dispose();
  }

  @override
  @useResult
  Widget build(BuildContext context) {
    final controller = _controller;
    if (controller == null) {
      return Scaffold(
        appBar: AppBar(
          title: Text(
            _kDriftViewerScreenTitle,
            overflow: TextOverflow.ellipsis,
            maxLines: 1,
          ),
        ),
        body: SafeArea(
          child: Center(
            child: _DriftViewerLoadingPlaceholder(),
          ),
        ),
      );
    }
    return Scaffold(
      appBar: AppBar(
        title: Text(
          _kDriftViewerScreenTitle,
          overflow: TextOverflow.ellipsis,
          maxLines: 1,
        ),
        leading: IconButton(
          tooltip: _sBack,
          icon: Icon(Icons.arrow_back, semanticLabel: _sBack),
          onPressed: () => Navigator.maybePop(context),
        ),
      ),
      body: SafeArea(
        child: WebViewWidget(controller: controller),
      ),
    );
  }
}
