![Saropa Drift Advisor - SQLite/Drift](https://raw.githubusercontent.com/saropa/saropa_drift_advisor/main/assets/banner_v2.png)

<!-- # Saropa Drift Advisor -->

[![pub package](https://img.shields.io/pub/v/saropa_drift_advisor.svg)](https://pub.dev/packages/saropa_drift_advisor)
[![CI](https://github.com/saropa/saropa_drift_advisor/actions/workflows/main.yaml/badge.svg)](https://github.com/saropa/saropa_drift_advisor/actions/workflows/main.yaml)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://opensource.org/licenses/MIT)

Debug-only HTTP server + VS Code extension for inspecting SQLite/Drift databases in Flutter and Dart apps. Two ways to access your data — a browser-based web UI and a full-featured VS Code extension with IDE integration.

---

## How it works

Your app runs a lightweight debug server that exposes database tables over HTTP. You inspect the data using either a **browser** or the **VS Code extension** — both connect to the same server.

| | Browser | VS Code Extension |
|---|---|---|
| **Install** | None — open `localhost:8642` | Install from Marketplace |
| **Works with** | Any editor, CI, QA, mobile | VS Code / Cursor |
| **Best for** | Quick look, sharing URLs | Daily development workflow |

---

## Features

### HTTP Debug Server (core)

The Dart package starts a lightweight HTTP server that exposes your database over a REST API.

#### Data Browsing

- **Table list** with row counts
- **View rows** as JSON with pagination (limit/offset)
- **Client-side row filter** search with **result navigation** — auto-scroll to match, "X of Y" counter, Prev/Next buttons; keyboard shortcuts (Enter/Shift+Enter, Ctrl+G, Ctrl+F, Escape); active match highlight; collapsed sections expand when navigating to a match
- **Foreign key navigation** — click FK values to jump to the referenced row; **clickable breadcrumb steps** (jump to any table in the trail); breadcrumb persistence in localStorage; "Clear path" button
- **Data type display toggle** — raw SQLite values or human-readable (epoch → ISO 8601, 0/1 → true/false)
- **One-click cell copy** on hover with toast notification

#### Query Tools

- **Read-only SQL runner** with table/column autocomplete, templates, and query history
- **SQL bookmarks** — save, name, export/import as JSON
- **Visual query builder** — SELECT checkboxes, type-aware WHERE clauses, ORDER BY, LIMIT, live SQL preview
- **Natural language → SQL** — English questions (count, average, latest, group-by) converted via pattern matching
- **EXPLAIN QUERY PLAN** — color-coded tree (red = table scans, green = index lookups)

#### Data Visualization

- **Charts** — bar, pie, line/time-series, histogram from SQL results (pure inline SVG)
- **Data anomaly detection** — NULLs, empty strings, orphaned FKs, duplicates, numeric outliers with severity icons

#### Schema & Export

- **Collapsible schema** panel with CREATE statements
- **ER diagram** — tables and FK relationship lines; click or keyboard-navigate to view table data
- **Export** — CSV per table, schema-only SQL, full dump (schema + data), raw SQLite file
- **Portable report** — self-contained HTML file with all data, schema, and anomalies inlined; opens in any browser with zero dependencies

#### Snapshots & Comparison

- **Snapshot / time travel** — capture all table state, compare to current, export diff as JSON
- **Database comparison** — diff vs another DB (schema match, row counts, migration preview DDL)

#### Live Features

- **Live refresh** via long-poll (`GET /api/generation`) when data changes; **polling toggle** (web UI and extension) to turn change detection on/off; batched row-count checks and table-name caching to reduce load
- **Connection resilience** — connection health banner when server is unreachable; reconnecting pulse and exponential backoff; offline state disables server-dependent controls; keep-alive health check when polling is off; server restart detection triggers full refresh
- **Collaborative sessions** — share viewer state as a URL with annotations; **session expiry countdown** in the info bar (warning under 10 minutes); **Extend session** button (e.g. +1 hour); configurable **session duration** (default 1 hour); 50-session cap; expired-session and expiry-warning banners

#### Data Import (opt-in)

- **Import** CSV, JSON, or SQL files into tables (requires `DriftDebugWriteQuery` callback)
- **CSV column mapping** — map file headers to table columns (or skip); no need for exact header names
- Auto-detect format, per-row error reporting, partial import support

#### Performance & Analytics

- **Query performance stats** — total queries, slow queries (>100 ms), patterns, recent queries
- **Storage size analytics** — table sizes, indexes, journal mode

#### Server Configuration

- **Port** — default 8642; configurable
- **Bind** — `0.0.0.0` by default; `loopbackOnly: true` for `127.0.0.1` only
- **CORS** — `'*'`, specific origin, or disabled
- **Auth** — optional Bearer token or HTTP Basic for dev tunnels
- **Session duration** — optional `sessionDuration` (e.g. 1 hour) for shared session URLs
- **Rate limiting** — optional `maxRequestsPerSecond`; 429 with `Retry-After` when exceeded; long-poll and health endpoints exempt
- **Health** — `GET /api/health` → `{"ok": true}`
- **Web UI assets** — CSS and JS are loaded from jsDelivr CDN (version-pinned to the package release); a matching git tag must exist for the CDN to serve them

#### API Reference

Full REST endpoint documentation with request/response schemas, error codes, and examples: **[doc/API.md](doc/API.md)**

#### Theme

- **Light/dark toggle** saved in localStorage; **OS dark-mode sync** on first visit (`prefers-color-scheme`); VS Code webview theme auto-detected when running in the extension

---

### VS Code Extension (separate install)

Install **Saropa Drift Advisor** (`saropa.drift-viewer`) from the [VS Code Marketplace](https://marketplace.visualstudio.com/items?itemName=saropa.drift-viewer). See [extension/README.md](extension/README.md) for full configuration and command reference.

> **Why `drift-viewer`?** The extension was originally a read-only table viewer. It has since grown into a full advisor — with a query builder, schema linter, performance profiler, and more — but the marketplace ID stays `drift-viewer` to preserve update continuity for existing users.

#### Database Explorer

- **Tree view** — tables with row counts, columns with type icons, FK relationships
- **Right-click menus** — view data, copy name, export CSV, watch, compare rows, profile column, seed, clear, pin, annotate
- **Status bar** — connection state, multi-server selector, auto-discovery (ports 8642–8649)
- **Polling toggle** — enable/disable change detection from the Drift Tools sidebar (VM service or HTTP)
- **File decoration badges** — row counts on Drift table files in the Explorer

#### Code Intelligence

- **Go to Definition** (F12) / **Peek** (Alt+F12) — jump from SQL table/column names in Dart to Drift class definitions
- **CodeLens** — live row counts and quick actions ("View in Saropa Drift Advisor", "Run Query") on `class ... extends Table`
- **Hover preview** — see recent rows when hovering over table class names during debug
- **Schema linter** — real-time diagnostics for missing indexes, anomalies, constraint violations; quick-fix code actions
- **Terminal link integration** — clickable SQLite error messages in terminal output

#### Query Tools

- **SQL Notebook** (Ctrl+Shift+Q) — multi-statement editor with autocomplete, results grid, inline charts, history, bookmarks
- **EXPLAIN panel** — color-coded query plan tree with index suggestions
- **Watch panel** — monitor queries with live polling, diff highlighting, desktop notifications
- **SQL snippet library** — save, organize, and reuse queries
- **Global search** (Ctrl+Shift+D) — full-text search across all tables

#### Schema & Migration

- **Schema diff** — compare Drift table definitions in code vs runtime schema
- **Schema diagram** — ER-style visualization with FK relationship lines; keyboard-navigable with screen reader support
- **Generate Dart from schema** — scaffold Drift table classes from runtime schema
- **Isar-to-Drift generator** — convert `@collection` classes to Drift tables (Dart source or JSON schema, configurable embedded/enum strategies)
- **Migration preview & code gen** — preview DDL, generate migration code
- **Migration rollback generator** — select any schema change from the timeline and generate reverse SQL + Dart `customStatement()` code to undo it
- **Constraint wizard** — interactive FK, unique, and check constraint builder
- **Schema documentation generator** — export Markdown docs from schema
- **Portable report export** — generate a self-contained HTML file with table data, schema SQL, and anomaly report; light/dark theme, search, pagination; share via Slack, attach to bug reports, or archive

#### Data Management

- **Data editing** — track cell edits, row inserts/deletes; undo/redo; generate SQL from pending changes
- **Import wizard** — 3-step flow for CSV, JSON, or SQL with auto-format detection and dependency-aware ordering
- **Seeder** — generate test data per table or bulk (configurable row count and NULL probability)
- **Clear table data** — delete rows individually, by table, by group, or all

#### Debugging & Performance

- **Query performance panel** — live in debug sidebar; slow query detection (>500 ms), timing stats, click to view full SQL
- **Query regression detector** — tracks per-query baselines across sessions; warns when queries regress beyond threshold
- **Data breakpoints** — break on table data conditions during debug sessions
- **Snapshot timeline** — capture snapshots via VS Code timeline, auto-capture on data change, generate changelog
- **Database comparison** — diff two databases (schema match, row count differences)
- **Size analytics dashboard** — table sizes, indexes, journal mode
- **Column profiler** — value distribution, type detection, NULL tracking
- **Sampling engine** — statistical row sampling for large tables
- **Row comparator** — side-by-side diff of two rows

#### Navigation

- **FK navigator** — click FK values to navigate to parent table with breadcrumb trail
- **Lineage tracer** — trace data through FK relationships; generate ordered DELETE statements

#### Sessions & Collaboration

- **Share session** — snapshot viewer state as a URL with annotations; live countdown timer, 10-minute warning, extend button, configurable duration
- **Annotations panel** — notes on tables and columns; import/export as JSON

#### Pre-launch Health Checks

- **Task provider** — wire into `launch.json` as `preLaunchTask`
- Three checks: **Health Check** (connectivity), **Anomaly Scan** (data quality), **Index Coverage** (missing indexes)
- Exit code 1 blocks launch on errors; configurable for warnings
- Problem matcher routes output to the Problems panel

#### Integrations

- **Saropa Log Capture bridge** — unified timeline, session headers/summaries, three verbosity modes (off / slow-only / all)

#### Configuration

25+ settings under `driftViewer.*` — see [extension/README.md](extension/README.md) for the full reference.

---

## Quick start

### 1. Add the dependency

**From pub.dev:**

```yaml
# pubspec.yaml
dependencies:
  saropa_drift_advisor: ^0.1.0
```

**Path dependency (local or monorepo):**

```yaml
dependencies:
  saropa_drift_advisor:
    path: ../path/to/saropa_drift_advisor
```

Run `flutter pub get` or `dart pub get`.

### 2. Start the viewer

**Drift (one line):**

```dart
import 'package:saropa_drift_advisor/saropa_drift_advisor.dart';

await myDb.startDriftViewer(enabled: kDebugMode);
```

This package does **not** depend on `drift`; it uses runtime wiring (`customSelect(sql).get()`). For compile-time type safety, use the callback API below.

**Callback API (Drift or raw SQLite):**

```dart
import 'package:saropa_drift_advisor/saropa_drift_advisor.dart';

await DriftDebugServer.start(
  query: (String sql) async {
    final rows = await myDb.customSelect(sql).get();
    return rows.map((r) => Map<String, dynamic>.from(r.data)).toList();
  },
  enabled: kDebugMode,
);
```

**Using with drift_sqlite_async:** If you use [drift_sqlite_async](https://pub.dev/packages/drift_sqlite_async), `startDriftViewer(myDb)` should work if your database class exposes `customSelect(sql).get()` and rows with `row.data`. If the web UI stays on "Loading tables…" or the VS Code extension never shows tables, use the callback API and ensure the database is **open and ready** before starting the server (e.g. call `DriftDebugServer.start` after your async DB initialization):

```dart
await DriftDebugServer.start(
  query: (String sql) async {
    final rows = await driftDb.customSelect(sql).get();
    return rows.map((r) => Map<String, dynamic>.from(r.data)).toList();
  },
  enabled: kDebugMode,
);
```

If you see **"command 'driftViewer.refreshTree' not found"** in VS Code, open a Dart file or the Drift Advisor sidebar first so the extension activates, then use the Refresh button or reload the window.

### 3. Connect a client

**VS Code extension (recommended):** Install **Saropa Drift Advisor** (`saropa.drift-viewer`) from the Marketplace. It auto-discovers the running server — no configuration needed. On Android emulator, the extension automatically forwards the debug server port when a Flutter/Dart debug session is active.

**Browser:** Open **http://127.0.0.1:8642** (on emulator, run `adb forward tcp:8642 tcp:8642` first).

**Example app:** [example/](example/) — multi-table schema (users, posts, comments, tags) with FKs, Import, and opt-in auth. From repo root: `flutter run -d windows`, then connect via VS Code or browser. See [example/README.md](example/README.md).

### 4. View your data

Use the **VS Code extension** (recommended) or open **http://127.0.0.1:8642** in any browser.

---

## API summary

| API                                                    | Use when                                            |
| ------------------------------------------------------ | --------------------------------------------------- |
| **`db.startDriftViewer(enabled: ...)`**                | Drift app; one-line setup (runtime wiring).         |
| **`DriftDebugServer.start(query: ..., enabled: ...)`** | Drift or raw SQLite; you supply the query callback. |

### Common parameters

| Parameter                                     | Description                                                                  |
| --------------------------------------------- | ---------------------------------------------------------------------------- |
| **`enabled`**                                 | Typically `kDebugMode`. If `false`, server is not started.                   |
| **`port`**                                    | Default `8642`.                                                              |
| **`loopbackOnly`**                            | Bind to loopback only (default `false`).                                     |
| **`corsOrigin`**                              | CORS header: `'*'`, specific origin, or `null` to disable.                   |
| **`authToken`**                               | Optional; requests require Bearer token or `?token=`. Use for tunnels.       |
| **`basicAuthUser`** / **`basicAuthPassword`** | Optional; HTTP Basic auth when both set.                                     |
| **`getDatabaseBytes`**                        | Optional; when set, `GET /api/database` serves raw SQLite file for download. |
| **`queryCompare`**                            | Optional; enables database diff vs another DB (e.g. staging).                |
| **`sessionDuration`**                         | Optional; expiry for shared session URLs (default 1 hour).                   |
| **`maxRequestsPerSecond`**                     | Optional; per-IP rate limiting; 429 when exceeded.                         |
| **`onLog`**, **`onError`**                    | Optional; for your logger or `debugPrint` / `print`.                         |

- Only one server per process; calling `start` again when running is a no-op. Use **`DriftDebugServer.stop()`** to shut down and restart (e.g. tests or graceful shutdown).
- **Health:** `GET /api/health` → `{"ok": true}`.
- **Live refresh:** `GET /api/generation`; use `?since=N` to long-poll until generation changes (30s timeout).

---

## Security

**Debug only.** Do not enable in production.

- Default bind: `0.0.0.0`; use **`loopbackOnly: true`** to bind to `127.0.0.1` only.
- Read-only: table listing and table data; SQL runner and EXPLAIN accept **read-only** SQL (`SELECT` / `WITH ... SELECT` only); writes and DDL are rejected. Table/column endpoints use allow-lists; table names and limit/offset are validated.

**Secure dev tunnel (ngrok, port forwarding):** use **`authToken`** or **`basicAuthUser`** / **`basicAuthPassword`**:

```dart
await DriftDebugServer.start(
  query: runQuery,
  enabled: kDebugMode,
  authToken: 'your-secret-token',  // open https://your-tunnel.example/?token=your-secret-token
  // or: basicAuthUser: 'dev', basicAuthPassword: 'pass',
);
```

With token auth, open `https://your-tunnel.example/?token=your-secret-token`; the page uses the token for all API calls. You can also send `Authorization: Bearer your-secret-token`.

---

## Development

From repo root:

- **Web viewer type-check:** `npm run typecheck:web` — runs TypeScript over `assets/web/app.js` (with `allowJs`/`checkJs`) so the viewer is type-checked without a separate build. Add JSDoc or migrate to `.ts` over time for stricter typing.
- **Web viewer styles (SCSS):** Source is `assets/web/style.scss`; compile to `style.css` with `npm run build:style`. Use `npm run build:style:watch` to recompile on save. **Edit only the `.scss`**; the committed `style.css` must match the build (CI and `scripts/publish.py` enforce this). Run `npm run build:style` before committing after any style change.
- **Extension:** `npm run compile:extension`, `npm run lint:extension`, `npm run test:extension` (run from root; they `cd` into `extension/`).

---

## Publishing

From repo root:

```bash
python scripts/publish.py dart
```

The Dart pipeline runs pub.dev score checks (downgrade + analyze, dependency up-to-date) before dry-run. Use `python scripts/publish.py` for the full menu (Dart, extension, or both).

- **Stale override check:** `python scripts/check_stale_overrides.py [--pubspec PATH] [--flutter]` — classifies `dependency_overrides` as required vs safe-to-remove by running a version solve with each override removed.

**Manual:** Bump version in `pubspec.yaml`, then `git tag v0.1.0` and `git push origin v0.1.0`. GitHub Actions publishes to pub.dev.

- [Package on pub.dev](https://pub.dev/packages/saropa_drift_advisor)
