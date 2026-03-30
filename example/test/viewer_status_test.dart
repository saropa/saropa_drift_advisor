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

    // Without dbSummary, falls back to status-only layout.
    expect(
        find.text('Saropa Drift Advisor is running'), findsOneWidget);
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

    expect(find.text('Advisor failed to start'), findsOneWidget);
    expect(find.textContaining('port 8642'), findsOneWidget);
  });

  testWidgets('ReadyView with errorMessage shows error text and error style',
      (tester) async {
    await tester.pumpWidget(
      const MaterialApp(
        home: Scaffold(
          body: ReadyView(
            init: ViewerInitResult(
              enabled: true,
              running: false,
              url: null,
              errorMessage: 'Database init failed: permission denied',
            ),
          ),
        ),
      ),
    );

    expect(
        find.text('Database init failed: permission denied'), findsOneWidget);
  });

  testWidgets(
      'ReadyView with running true and url null disables copy and does not crash',
      (tester) async {
    await tester.pumpWidget(
      const MaterialApp(
        home: Scaffold(
          body: ReadyView(
            init: ViewerInitResult(
              enabled: true,
              running: true,
              url: null,
            ),
          ),
        ),
      ),
    );

    expect(
        find.text('Saropa Drift Advisor is running'), findsOneWidget);
    final copyButton = find.byType(FilledButton);
    expect(copyButton, findsOneWidget);
    final widget = tester.widget<FilledButton>(copyButton);
    expect(widget.onPressed, isNull);
  });

  // ── Dashboard tests ──────────────────────────────────────────────────

  testWidgets('ReadyView with dbSummary shows table overview and posts',
      (tester) async {
    await tester.pumpWidget(
      MaterialApp(
        home: Scaffold(
          body: ReadyView(
            init: ViewerInitResult(
              enabled: true,
              running: true,
              url: Uri.parse('http://127.0.0.1:8642'),
              dbSummary: const DatabaseSummary(
                tables: [
                  TableSummary(name: 'users', rowCount: 3),
                  TableSummary(name: 'posts', rowCount: 3),
                  TableSummary(name: 'comments', rowCount: 3),
                  TableSummary(name: 'tags', rowCount: 3),
                  TableSummary(name: 'post_tags', rowCount: 2),
                ],
                recentPosts: [
                  PostPreview(
                    title: 'Getting started with Drift',
                    authorName: 'Alice',
                    published: true,
                    commentCount: 2,
                  ),
                  PostPreview(
                    title: 'Draft: Advanced migrations',
                    authorName: 'Alice',
                    published: false,
                    commentCount: 0,
                  ),
                  PostPreview(
                    title: 'Schema design tips',
                    authorName: 'Bob',
                    published: true,
                    commentCount: 1,
                  ),
                ],
              ),
            ),
          ),
        ),
      ),
    );

    // Status header shows compact running state.
    expect(find.text('Drift Advisor is running'), findsOneWidget);

    // Table overview section visible with section title.
    expect(find.text('Tables'), findsOneWidget);

    // Table names and row counts are displayed.
    expect(find.text('users'), findsOneWidget);
    expect(find.text('posts'), findsOneWidget);
    expect(find.text('comments'), findsOneWidget);
    expect(find.text('tags'), findsOneWidget);
    expect(find.text('post_tags'), findsOneWidget);
    // Row count badges.
    expect(find.text('3'), findsNWidgets(4)); // users, posts, comments, tags
    expect(find.text('2'), findsOneWidget); // post_tags

    // Recent posts section visible.
    expect(find.text('Recent Posts'), findsOneWidget);
    expect(find.text('Getting started with Drift'), findsOneWidget);
    expect(find.text('Draft: Advanced migrations'), findsOneWidget);
    expect(find.text('Schema design tips'), findsOneWidget);

    // Subtitle text includes author, status, and comment count.
    expect(find.textContaining('Alice'), findsNWidgets(2));
    expect(find.textContaining('Bob'), findsOneWidget);
    expect(find.textContaining('Published'), findsNWidgets(2));
    expect(find.textContaining('Draft'), findsNWidgets(2)); // title + subtitle
    expect(find.textContaining('2 comments'), findsOneWidget);
    expect(find.textContaining('0 comments'), findsOneWidget);
    expect(find.textContaining('1 comment'), findsOneWidget);
  });

  testWidgets(
      'ReadyView dashboard still shows copy button in status header',
      (tester) async {
    await tester.pumpWidget(
      MaterialApp(
        home: Scaffold(
          body: ReadyView(
            init: ViewerInitResult(
              enabled: true,
              running: true,
              url: Uri.parse('http://127.0.0.1:8642'),
              dbSummary: const DatabaseSummary(
                tables: [TableSummary(name: 'users', rowCount: 1)],
                recentPosts: [],
              ),
            ),
          ),
        ),
      ),
    );

    // Icon-only copy button in the header (IconButton, not FilledButton).
    final copyBtn = find.byIcon(Icons.copy);
    expect(copyBtn, findsOneWidget);
    final iconButton = find.byType(IconButton);
    expect(iconButton, findsOneWidget);
  });
}
