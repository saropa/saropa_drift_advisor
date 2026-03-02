import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

import 'package:example/ui/viewer_status.dart';

void main() {
  testWidgets('LoadingView renders progress UI', (tester) async {
    await tester.pumpWidget(
      const MaterialApp(
        home: Scaffold(body: LoadingView()),
      ),
    );

    expect(find.text('Starting database + viewer…'), findsOneWidget);
    expect(find.byType(LinearProgressIndicator), findsOneWidget);
  });

  testWidgets('ReadyView shows URL and enables copy', (tester) async {
    await tester.pumpWidget(
      MaterialApp(
        home: Scaffold(
          body: ReadyView(
            init: ViewerInitResult(
              enabled: true,
              running: true,
              url: Uri.parse('http://127.0.0.1:8642'),
            ),
          ),
        ),
      ),
    );

    expect(find.text('Drift debug viewer is running'), findsOneWidget);
    expect(find.text('Copy URL'), findsOneWidget);
  });

  testWidgets('ReadyView explains failure to start', (tester) async {
    await tester.pumpWidget(
      const MaterialApp(
        home: Scaffold(
          body: ReadyView(
            init: ViewerInitResult(
              enabled: true,
              running: false,
              url: null,
            ),
          ),
        ),
      ),
    );

    expect(find.text('Viewer failed to start'), findsOneWidget);
    expect(find.textContaining('port 8642'), findsOneWidget);
  });
}

