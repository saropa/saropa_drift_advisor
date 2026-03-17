# Example: Drift app with saropa_drift_advisor

This Flutter app shows how to use [saropa_drift_advisor](https://pub.dev/packages/saropa_drift_advisor) with a [Drift](https://pub.dev/packages/drift) database.

## Run the example

From the **package root** (not this folder):

```bash
flutter run -d windows
# or: flutter run -d macos
# or: flutter run -d linux
# or: flutter run -d android
# or: flutter run -d ios
```

From this folder:

```bash
cd example
flutter pub get
flutter run
```

## What it does

1. Creates a Drift database with a **multi-table schema**: `users`, `posts`, `comments`, `tags`, and `post_tags` (with foreign keys) so you can try **ER diagrams**, **FK navigation**, schema diff, and migration tooling.
2. Seeds realistic data when empty (multiple users, posts including a draft with null `publishedAt`, comments, tags, and post–tag links) to demonstrate date formatting, null handling, and varied types.
3. Starts Saropa Drift Advisor in debug builds (`kDebugMode`).
4. Opens a simple Flutter UI that shows the viewer URL (**http://127.0.0.1:8642**). Open that URL in a browser (or use the overlay button in debug) to list tables, browse rows, run SQL, **navigate FKs**, use the **Import** feature, export schema/data, or download the `.sqlite` file.

Note: This example uses Drift's native (dart:io) database, so it is intended for mobile/desktop targets (not web).

## Integration pattern

The app uses the **`startDriftViewer()`** extension on the database instance; `lib/main.dart` also documents the equivalent **callback style** (`DriftDebugServer.start`) in comments.

- **`query`** — provided by the extension via `db.customSelect(sql).get()` → `List<Map<String, dynamic>>`.
- **`getDatabaseBytes`** — returns the SQLite file bytes for "Download database".
- **`writeQuery`** — executes write SQL (e.g. from Import) via `db.customStatement(sql)`.
- **`authToken`** — opt-in: set `_kExampleAuthToken` to a non-null value to require Bearer auth in the web UI.
- **`onLog` / `onError`** — uses `DriftDebugErrorLogger` for startup and errors.

See `lib/main.dart` for the full setup.
