import 'dart:io';

import 'package:drift/drift.dart' hide Column;
import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:saropa_drift_advisor/saropa_drift_advisor.dart';

import 'database/app_database.dart';
import 'ui/viewer_status.dart';

/// Optional auth token for the Drift Advisor server.
/// Set to a non-null value (e.g. 'demo-token') to require Bearer auth in the web UI.
const String? _kExampleAuthToken = null;

void main() {
  WidgetsFlutterBinding.ensureInitialized();
  runApp(const ExampleApp());
}

class ExampleApp extends StatelessWidget {
  const ExampleApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'Saropa Drift Advisor Example',
      theme: ThemeData(
        colorScheme: ColorScheme.fromSeed(seedColor: Colors.teal),
        useMaterial3: true,
      ),
      home: const HomePage(title: 'Saropa Drift Advisor Example'),
    );
  }
}

class HomePage extends StatefulWidget {
  const HomePage({required this.title, super.key});
  final String title;

  @override
  State<HomePage> createState() => _HomePageState();
}

/// Timeout for viewer initialization so the UI does not hang if DB or server never completes.
const Duration _kInitTimeout = Duration(seconds: 30);

class _HomePageState extends State<HomePage> {
  late final Future<ViewerInitResult> _initFuture = _initialize().timeout(
    _kInitTimeout,
    onTimeout: () {
      return ViewerInitResult(
        enabled: kDebugMode,
        running: false,
        url: null,
        errorMessage:
            'Initialization timed out after ${_kInitTimeout.inSeconds} seconds.',
      );
    },
  );

  @override
  Widget build(BuildContext context) {
    // Show loading until DB + viewer are ready; on error show ReadyView with error message.
    return FutureBuilder<ViewerInitResult>(
      future: _initFuture,
      builder: (context, snapshot) {
        final Widget bodyChild;
        if (snapshot.connectionState == ConnectionState.done) {
          if (snapshot.hasError) {
            bodyChild = ReadyView(
              init: ViewerInitResult(
                enabled: kDebugMode,
                running: false,
                url: null,
                errorMessage: snapshot.error.toString(),
              ),
            );
          } else if (snapshot.data != null) {
            bodyChild = ReadyView(init: snapshot.data!);
          } else {
            bodyChild = const LoadingView();
          }
        } else {
          bodyChild = const LoadingView();
        }

        return Scaffold(
          appBar: AppBar(
            title: Text(widget.title),
            backgroundColor: Theme.of(context).colorScheme.inversePrimary,
          ),
          body: Center(
            child: Padding(
              padding: const EdgeInsets.all(24),
              child: AnimatedSwitcher(
                duration: const Duration(milliseconds: 250),
                switchInCurve: Curves.easeOut,
                switchOutCurve: Curves.easeIn,
                transitionBuilder: (child, animation) {
                  final slide =
                      Tween<Offset>(
                        begin: const Offset(0, 0.04),
                        end: Offset.zero,
                      ).animate(
                        CurvedAnimation(
                          parent: animation,
                          curve: Curves.easeOutCubic,
                        ),
                      );
                  return FadeTransition(
                    opacity: animation,
                    child: SlideTransition(position: slide, child: child),
                  );
                },
                child: bodyChild,
              ),
            ),
          ),
        );
      },
    );
  }

  Future<ViewerInitResult> _initialize() async {
    final db = await AppDatabase.create();

    await _seedIfEmpty(db);

    // Start the Drift Advisor using the extension method (recommended).
    // This wires: query via customSelect, getDatabaseBytes, writeQuery for import, optional auth.
    // Alternative (callback style): use DriftDebugServer.start(
    //   query: (sql) async {
    //     final rows = await db.customSelect(sql).get();
    //     return rows.map((r) => Map<String, dynamic>.from(r.data)).toList();
    //   },
    //   writeQuery: (sql) => db.customStatement(sql),
    //   getDatabaseBytes: () => File(db.dbPath).readAsBytes(),
    //   authToken: _kExampleAuthToken,
    //   ... );
    await db.startDriftViewer(
      enabled: kDebugMode,
      getDatabaseBytes: () => File(db.dbPath).readAsBytes(),
      // Enables Import (CSV/JSON/SQL) in the web UI; executes each statement via Drift.
      writeQuery: (String sql) => db.customStatement(sql),
      authToken: _kExampleAuthToken,
      onLog: DriftDebugErrorLogger.logCallback(prefix: 'DriftViewer'),
      onError: DriftDebugErrorLogger.errorCallback(prefix: 'DriftViewer'),
    );

    final runningPort = DriftDebugServer.port;
    final isRunning = kDebugMode && runningPort != null;

    // Build a summary snapshot of the database for the dashboard UI.
    final dbSummary = await _queryDatabaseSummary(db);

    return ViewerInitResult(
      enabled: kDebugMode,
      running: isRunning,
      url: isRunning ? Uri.parse('http://127.0.0.1:$runningPort') : null,
      dbSummary: dbSummary,
    );
  }

  /// Queries table row counts and recent posts for the dashboard display.
  static Future<DatabaseSummary> _queryDatabaseSummary(AppDatabase db) async {
    // Table names to show in the overview.
    const tableNames = ['users', 'posts', 'comments', 'tags', 'post_tags'];

    // Query row counts for each table.
    final tables = <TableSummary>[];
    for (final name in tableNames) {
      final result = await db
          .customSelect('SELECT COUNT(*) AS cnt FROM $name')
          .get();
      final count = result.firstOrNull?.data['cnt'] as int? ?? 0;
      tables.add(TableSummary(name: name, rowCount: count));
    }

    // Query recent posts joined with author name and comment count.
    final postRows = await db
        .customSelect(
          'SELECT p.title, u.display_name, p.published_at, '
          '(SELECT COUNT(*) FROM comments c WHERE c.post_id = p.id) AS comment_count '
          'FROM posts p '
          'JOIN users u ON p.user_id = u.id '
          'ORDER BY p.created_at DESC',
        )
        .get();

    final recentPosts = postRows.map((row) {
      return PostPreview(
        title: row.data['title'] as String,
        authorName: row.data['display_name'] as String,
        published: row.data['published_at'] != null,
        commentCount: (row.data['comment_count'] as int?) ?? 0,
      );
    }).toList();

    return DatabaseSummary(tables: tables, recentPosts: recentPosts);
  }

  /// Seeds users, posts, comments, and tags with realistic data when the DB is empty.
  /// Demonstrates date formatting, nulls (draft posts), and various data types.
  static Future<void> _seedIfEmpty(AppDatabase db) async {
    final countExp = db.users.id.count();
    final existing = await (db.selectOnly(db.users)..addColumns([countExp]))
        .map((row) => row.read(countExp) ?? 0)
        .getSingle();
    if (existing > 0) return;

    final now = DateTime.now();
    final yesterday = now.subtract(const Duration(days: 1));
    final lastWeek = now.subtract(const Duration(days: 7));

    await db.batch((batch) {
      batch.insertAll(db.users, [
        UsersCompanion.insert(
          email: 'alice@example.com',
          displayName: 'Alice',
          createdAt: lastWeek,
        ),
        UsersCompanion.insert(
          email: 'bob@example.com',
          displayName: 'Bob',
          createdAt: lastWeek,
        ),
        UsersCompanion.insert(
          email: 'charlie@example.com',
          displayName: 'Charlie',
          createdAt: yesterday,
        ),
      ]);
    });

    final users = await db.select(db.users).get();
    final aliceId = _idForEmail(users, 'alice@example.com');
    final bobId = _idForEmail(users, 'bob@example.com');
    final charlieId = _idForEmail(users, 'charlie@example.com');

    await db.batch((batch) {
      batch.insertAll(db.posts, [
        PostsCompanion.insert(
          userId: aliceId,
          title: 'Getting started with Drift',
          body: 'Drift is a reactive persistence library for Dart.',
          publishedAt: Value(lastWeek),
          createdAt: lastWeek,
        ),
        PostsCompanion.insert(
          userId: aliceId,
          title: 'Draft: Advanced migrations',
          body: 'Work in progress...',
          publishedAt: const Value.absent(),
          createdAt: yesterday,
        ),
        PostsCompanion.insert(
          userId: bobId,
          title: 'Schema design tips',
          body: 'Use foreign keys for relationships.',
          publishedAt: Value(yesterday),
          createdAt: yesterday,
        ),
      ]);
    });

    final posts = await db.select(db.posts).get();
    final post1Id = _postIdByTitleSubstring(posts, 'Getting started');
    final post2Id = _postIdByTitleSubstring(posts, 'Schema');

    await db.batch((batch) {
      batch.insertAll(db.comments, [
        CommentsCompanion.insert(
          postId: post1Id,
          userId: bobId,
          body: 'Great intro!',
          createdAt: lastWeek.add(const Duration(hours: 2)),
        ),
        CommentsCompanion.insert(
          postId: post1Id,
          userId: charlieId,
          body: 'Helped me set up FKs.',
          createdAt: yesterday,
        ),
        CommentsCompanion.insert(
          postId: post2Id,
          userId: aliceId,
          body: 'Agree on using FKs.',
          createdAt: now,
        ),
      ]);
    });

    await db.batch((batch) {
      batch.insertAll(db.tags, [
        TagsCompanion.insert(name: 'dart'),
        TagsCompanion.insert(name: 'drift'),
        TagsCompanion.insert(name: 'sql'),
      ]);
    });

    final tags = await db.select(db.tags).get();
    final dartId = _tagIdByName(tags, 'dart');
    final driftId = _tagIdByName(tags, 'drift');
    final sqlId = _tagIdByName(tags, 'sql');

    await db.batch((batch) {
      batch.insertAll(db.postTags, [
        PostTagsCompanion.insert(postId: post1Id, tagId: dartId),
        PostTagsCompanion.insert(postId: post1Id, tagId: driftId),
        PostTagsCompanion.insert(postId: post2Id, tagId: sqlId),
      ]);
    });
  }

  static int _idForEmail(List<User> users, String email) {
    return users
        .firstWhere(
          (u) => u.email == email,
          orElse: () => throw StateError('Seed user "$email" not found'),
        )
        .id;
  }

  static int _postIdByTitleSubstring(List<Post> posts, String substring) {
    return posts
        .firstWhere(
          (p) => p.title.contains(substring),
          orElse: () => throw StateError(
            'Seed post with title containing "$substring" not found',
          ),
        )
        .id;
  }

  static int _tagIdByName(List<Tag> tags, String name) {
    return tags
        .firstWhere(
          (t) => t.name == name,
          orElse: () => throw StateError('Seed tag "$name" not found'),
        )
        .id;
  }
}
