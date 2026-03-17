// Example app database: multi-table schema with FKs for demonstrating
// Drift Advisor features (ER diagrams, FK navigation, schema diff, import).

import 'dart:io';

import 'package:drift/drift.dart';
import 'package:drift/native.dart';
import 'package:path/path.dart' as p;
import 'package:path_provider/path_provider.dart';

part 'app_database.g.dart';

/// Users table: author of posts and comments.
class Users extends Table {
  IntColumn get id => integer().autoIncrement()();
  TextColumn get email => text()();
  TextColumn get displayName => text()();
  DateTimeColumn get createdAt => dateTime()();
}

/// Posts table: blog-style posts with optional publish date.
class Posts extends Table {
  IntColumn get id => integer().autoIncrement()();
  IntColumn get userId => integer().references(Users, #id)();
  TextColumn get title => text()();
  TextColumn get body => text()();

  /// When null, post is a draft (demonstrates null handling in UI).
  DateTimeColumn get publishedAt => dateTime().nullable()();
  DateTimeColumn get createdAt => dateTime()();
}

/// Comments on posts; demonstrates FK to both posts and users.
class Comments extends Table {
  IntColumn get id => integer().autoIncrement()();
  IntColumn get postId => integer().references(Posts, #id)();
  IntColumn get userId => integer().references(Users, #id)();
  TextColumn get body => text()();
  DateTimeColumn get createdAt => dateTime()();
}

/// Tags for categorizing posts (many-to-many via [PostTags]).
class Tags extends Table {
  IntColumn get id => integer().autoIncrement()();
  TextColumn get name => text()();
}

/// Junction table: posts <-> tags (many-to-many).
class PostTags extends Table {
  IntColumn get postId => integer().references(Posts, #id)();
  IntColumn get tagId => integer().references(Tags, #id)();
  @override
  Set<Column> get primaryKey => {postId, tagId};
}

@DriftDatabase(tables: [Users, Posts, Comments, Tags, PostTags])
class AppDatabase extends _$AppDatabase {
  AppDatabase._(super.e, {required this.dbPath});

  static const String _dbFileName = 'example_db.sqlite';

  /// Absolute path to the SQLite file backing this database.
  final String dbPath;

  /// Creates an [AppDatabase] that stores the SQLite file in app documents.
  ///
  /// Throws if the application documents directory or file cannot be created;
  /// the error is rethrown with context "Failed to create app database".
  static Future<AppDatabase> create() async {
    try {
      final dir = await getApplicationDocumentsDirectory();
      final dirPath = dir.path;
      if (dirPath.isEmpty) {
        throw StateError(
          'Application documents directory path is empty; cannot create database file.',
        );
      }
      final path = p.join(dirPath, _dbFileName);
      final file = File(path);
      final executor = NativeDatabase(file);
      return AppDatabase._(executor, dbPath: path);
    } on Object catch (e, st) {
      Error.throwWithStackTrace(
        StateError(
          'Failed to create app database: $e',
        ),
        st,
      );
    }
  }

  @override
  int get schemaVersion => 2;

  @override
  MigrationStrategy get migration => MigrationStrategy(
        onCreate: (Migrator m) async {
          await m.createAll();
        },
        onUpgrade: (Migrator m, int from, int to) async {
          if (from == 1 && to == 2) {
            // Add multi-table schema (legacy "items" table may still exist).
            await m.createTable(users);
            await m.createTable(posts);
            await m.createTable(comments);
            await m.createTable(tags);
            await m.createTable(postTags);
          }
        },
      );
}
