# saropa_drift_viewer

Debug-only HTTP server that exposes SQLite/Drift table data as JSON and a minimal web UI. Use from any Flutter/Dart app that has a Drift (or other SQLite) database.

## Setup

### 1. Add the dependency

**From pub.dev:**

```yaml
# pubspec.yaml
dependencies:
  saropa_drift_viewer: ^0.1.0
```

**Path dependency (local or monorepo):**

```yaml
dependencies:
  saropa_drift_viewer:
    path: ../path/to/saropa_drift_viewer
```

Then run `flutter pub get` or `dart pub get`.

### 2. Start the viewer (Drift apps)

After your Drift database is initialized, call `startDriftViewer` on it (e.g. in `main()` or right after DB init):

```dart
import 'package:saropa_drift_viewer/saropa_drift_viewer.dart';

// After your database is ready (e.g. AppDatabase, or your GeneratedDatabase subclass):
await myDb.startDriftViewer(enabled: kDebugMode);
```

### 3. Open in a browser

Open **http://127.0.0.1:8642**. You'll see a list of tables; click one to view its rows as JSON.

---

## Drift: one-line setup

For Drift apps, the extension on `GeneratedDatabase` is the simplest option:

```dart
import 'package:saropa_drift_viewer/saropa_drift_viewer.dart';

// One call after DB is initialized:
await myDb.startDriftViewer(enabled: kDebugMode);
```

Optional parameters:

- **`port`** — default `8642`.
- **`onLog`** — e.g. `(msg) => debugPrint(msg)`.
- **`onError`** — e.g. `(err, stack) => debugPrint('$err\n$stack')`.

Example with logging:

```dart
await myDb.startDriftViewer(
  enabled: kDebugMode,
  onLog: (String message) => debugPrint(message),
  onError: (Object error, StackTrace stack) => debugPrint('$error\n$stack'),
);
```

---

## Callback-based API (non-Drift or custom)

If you don't use Drift or want to plug in another SQL source, use `DriftDebugServer.start` with a `query` callback:

```dart
import 'package:saropa_drift_viewer/saropa_drift_viewer.dart';

await DriftDebugServer.start(
  query: (String sql) async {
    // Run [sql] with your executor and return rows as list of maps.
    final rows = await yourExecutor.customSelect(sql).get();
    return rows.map((r) => Map<String, dynamic>.from(r.data)).toList();
  },
  enabled: kDebugMode,
  onLog: debugPrint,
  onError: (e, s) => debugPrint('$e\n$s'),
);
```

---

## API summary

| API | Use when |
|-----|----------|
| **`db.startDriftViewer(enabled: ...)`** | You have a Drift `GeneratedDatabase` (one-line setup). |
| **`DriftDebugServer.start(query: ..., enabled: ...)`** | You use raw SQLite, or want to supply the query callback yourself. |

Common parameters:

- **`enabled`** — typically `kDebugMode`. If `false`, the server is not started.
- **`port`** — default `8642`.
- **`onLog`**, **`onError`** — optional; for your logger or `debugPrint` / `print`.

Only one server can run per process; calling start again when already running is a no-op.

---

## Security

**Debug only.** Do not enable in production. The server binds to `0.0.0.0` and serves read-only table listing and table data. It does not accept arbitrary SQL from the client; table names and limit are taken from allow-lists and clamped values.

---

## Publishing

**Publish script (from repo root):**

```bash
python scripts/publish_pub_dev.py
```

**Manual:** Bump version in `pubspec.yaml`, then `git tag v0.1.0` and `git push origin v0.1.0`. GitHub Actions publishes to pub.dev.

- [Package on pub.dev](https://pub.dev/packages/saropa_drift_viewer)
