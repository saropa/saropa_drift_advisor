import 'dart:io';

import 'package:drift/drift.dart';
import 'package:drift/native.dart';
import 'package:path/path.dart' as p;
import 'package:path_provider/path_provider.dart';

part 'app_database.g.dart';

class Items extends Table {
  IntColumn get id => integer().autoIncrement()();
  TextColumn get title => text()();
  DateTimeColumn get createdAt => dateTime()();
}

@DriftDatabase(tables: [Items])
class AppDatabase extends _$AppDatabase {
  AppDatabase._(super.e, {required this.dbPath});

  static const String _dbFileName = 'example_db.sqlite';

  /// Absolute path to the SQLite file backing this database.
  final String dbPath;

  /// Creates an [AppDatabase] that stores the SQLite file in app documents.
  static Future<AppDatabase> create() async {
    final dir = await getApplicationDocumentsDirectory();
    final path = p.join(dir.path, _dbFileName);
    final file = File(path);
    final executor = NativeDatabase(file);
    return AppDatabase._(executor, dbPath: path);
  }

  @override
  int get schemaVersion => 1;
}
