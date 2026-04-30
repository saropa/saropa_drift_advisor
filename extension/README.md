# Saropa Drift Advisor — VS Code Extension

Full IDE integration for [saropa_drift_advisor](https://pub.dev/packages/saropa_drift_advisor), the debug-only SQLite/Drift database inspector for Flutter and Dart apps.

## Requirements

Your Flutter/Dart app must be running with the Drift debug server started. See the [Dart package README](https://pub.dev/packages/saropa_drift_advisor) for setup (two lines of code).

## Features

### Database Explorer

A **database icon** in the activity bar opens a tree view:

- Tables with row counts
- Columns with type icons (key, number, string, blob)
- Foreign key relationships
- Right-click: **View Data**, **Copy Name**, **Export CSV**, **Watch Table**
- Auto-refreshes when the app writes to the database
- Mutation Stream panel — real-time semantic INSERT/UPDATE/DELETE feed with schema column filtering and row navigation

### Code Intelligence

Works in Dart files with Drift table definitions:

- **Go to Definition** (F12) — jump from SQL table/column names to their definitions; the same lookup is available from the Database tree (context menu **Go to … Definition (Dart)** opens the table or column getter when found)
- **CodeLens** — row counts and quick actions on Drift table classes
- **Hover Preview** — see recent rows when hovering over table class names
- **Schema Linter** — diagnostics with quick-fix code actions for missing indexes and anomalies
- **File Badges** — row count badges on Drift table files in the explorer

### Query Tools

- **SQL Notebook** (`Ctrl+Shift+Q`) — multi-statement editor with autocomplete, results grid, and inline charts
- **Visual Query Builder** — compose `SELECT`s from the live schema (joins, filters, aggregates) with SQL preview/run; **Import SQL into Visual Query Builder** maps matching flat `SELECT` text back into the graph (best-effort)
- **Natural language SQL** — ask in plain language for a `SELECT` against the current schema (OpenAI-compatible endpoint); then open in the SQL Notebook or **Edit in Visual Query Builder**
- **EXPLAIN Panel** — color-coded query plan tree with index suggestions
- **Live Watch** — monitor queries with diff highlighting; persists across sessions
- **Query Replay DVR** — record SQL during debug sessions, then inspect recent queries in a timeline panel with filters, semantic search over captured row snapshots, stepping (buttons + keyboard), selection detail, JSON export, SQL editor / SQL Notebook / Query Cost actions, and a status-bar indicator; the panel refreshes when schema generation changes (`Open Query Replay DVR`). The debug server exposes `POST /api/dvr/config` for runtime buffer tuning and accepts optional `args` / `namedArgs` on `POST /api/sql` so DVR can store declared bindings (the executed SQL string is unchanged).

### Schema & Migration

- **Scan Dart schema definitions** — Command Palette: lists tables, columns, indexes, and `uniqueKeys` from Dart sources only; **no connected server** required (Output → Drift Dart schema)
- **Schema Diff** — compare code-defined tables vs runtime schema
- **Schema Diagram** — ER-style visualization of tables and FK relationships
- **Generate Dart** — scaffold Drift table classes from the runtime schema
- **Isar-to-Drift Generator** — scan workspace or pick files to convert Isar `@collection` classes (Dart source or JSON schema) to Drift table definitions with configurable embedded/enum strategies
- **Migration Preview** — preview migration DDL from database comparison
- **Suggest Schema Refactorings** — Command Palette and Database view (when connected): heuristic suggestions (normalize low-cardinality text, wide-table split hints, overlap-based merge hints) with advisory SQL/Dart snippets; per-suggestion actions open **migration preview with plan appendix**, **ER diagram focused on a table**, or **Ask in English** with a pre-filled NL question; last run summary appears on the **Database Health Score** panel; does not execute SQL against the database

### Data Management

- **Import Data** — 3-step wizard for JSON, CSV, or SQL files
- **Data Editing** — track cell edits, row inserts/deletes; generate SQL from pending changes
- **Export SQL Dump** — full schema + data to `.sql`
- **Download Database** — save the raw `.db` file

### Debugging

- **Query Performance** — debug sidebar with slow query stats and timing
- **Snapshot Timeline** — capture snapshots, compare to current state, view diffs
- **Database Comparison** — diff two databases (schema match, row count differences)
- **Size Analytics** — storage dashboard with table sizes, indexes, journal mode
- **Terminal Links** — clickable SQLite error messages
- **Pre-launch Tasks** — health check, anomaly scan, index coverage

### Sessions

- **Share Session** — snapshot state, copy shareable URL
- **Open Session** — view a shared session by ID
- **Annotate Session** — add notes to shared sessions

## Configuration

| Setting | Default | Description |
|---|---|---|
| `driftViewer.enabled` | `true` | Master switch: when false, no server discovery or connection and all features are off |
| `driftViewer.host` | `127.0.0.1` | Debug server host |
| `driftViewer.port` | `8642` | Debug server port |
| `driftViewer.authToken` | *(empty)* | Bearer token for authenticated servers |
| `driftViewer.discovery.enabled` | `true` | Auto-scan for running servers |
| `driftViewer.discovery.portRangeStart` | `8642` | Scan range start |
| `driftViewer.discovery.portRangeEnd` | `8649` | Scan range end |
| `driftViewer.fileBadges.enabled` | `true` | Row count badges on table files |
| `driftViewer.hover.enabled` | `true` | Hover preview during debug |
| `driftViewer.hover.maxRows` | `3` | Rows shown in hover preview |
| `driftViewer.linter.enabled` | `true` | Schema linter diagnostics |
| `driftViewer.timeline.autoCapture` | `true` | Auto-capture snapshots on data change |
| `driftViewer.watch.notifications` | `false` | Desktop notifications for watch changes |
| `driftViewer.database.loadOnConnect` | `true` | When false, Database tree loads on first view focus instead of on connect |
| `driftViewer.database.allowOfflineSchema` | `true` | When the server is unreachable, try to fill the Database tree from last-known persisted schema for this workspace |
| `driftViewer.dartSchemaScan.openOutput` | `true` | When running **Scan Dart schema definitions**, open the Drift Dart schema output channel automatically |
| `driftViewer.schemaCache.ttlMs` | `30000` | Schema cache TTL (ms); 0 disables in-memory cache |
| `driftViewer.connection.logEveryUiRefresh` | `false` | Log every connection UI refresh even when state is unchanged (verbose troubleshooting) |
| `driftViewer.lightweight` | `false` | When true, skips badges/timeline/tree refresh on generation change |
| `driftViewer.performance.slowThresholdMs` | `500` | Slow query threshold (ms) |
| `driftViewer.integrations.includeInLogCaptureSession` | `full` | Controls what Drift Advisor contributes to Log Capture sessions: `none` (opt out), `header` (lightweight headers only), `full` (structured metadata + sidecar file) |
| `driftViewer.dvr.autoRecord` | `true` | Automatically start Query Replay DVR recording on Dart/Flutter debug session start |
| `driftViewer.dvr.maxQueries` | `5000` | Maximum number of DVR query events retained by the server ring buffer |
| `driftViewer.dvr.captureBeforeAfter` | `true` | Request before/after snapshot capture for write queries when supported by the server |
| `driftViewer.nlSql.apiUrl` | OpenAI-compatible chat URL | Full URL for NL-to-SQL chat completions (default targets OpenAI; override for other providers) |
| `driftViewer.nlSql.model` | `gpt-4o-mini` | Model name sent to the NL-SQL endpoint |
| `driftViewer.nlSql.maxTokens` | `500` | Max completion tokens for NL-SQL generation |

## Design: extension enablement

**Drift Advisor** has a master switch: `driftViewer.enabled` (default true). When false, the extension does not discover or connect to servers and all Drift Advisor features are off; the Database view shows “Saropa Drift Advisor is disabled” and the status bar shows “Drift: Disabled”. When true, activation is as before (`onLanguage:dart`). About, About Saropa, and Save Current Filter use `onCommand` activation so they work from the Database view or Command Palette even before a Dart file is opened; individual features can still be turned off via other settings. Use **Add package to project** to add the Dart package to your app so the extension and package stay in sync.

## Server Discovery

The extension automatically scans ports 8642-8649 for running debug servers. When no server is found and a Flutter/Dart debug session is active (e.g. app on Android emulator), it tries to forward the port with `adb forward` and retries discovery so the host can connect. You can also run **Saropa Drift Advisor: Forward Port (Android Emulator)** manually. When multiple servers are found, use **Saropa Drift Advisor: Select Server** from the command palette.

**Troubleshooting:** Use **Show Connection Log** (Output → Saropa Drift Advisor), **Diagnose Connection** (writes a snapshot and optional clipboard copy), or **Refresh Connection UI** if the sidebar looks wrong while the app is running. If you see a connection but the Database tree stays empty (REST schema error), use the **named action rows** under DATABASE — they run the same commands as the welcome text but via native tree clicks, which is more reliable than welcome links in some editors.

The status bar shows connection state:

- **Drift: :8642** — connected to a single server
- **Drift: 3 servers** — multiple servers found (click to select)
- **Drift: Searching...** — scanning for servers
- **Drift: Offline** — no servers found (click to retry)

## Commands

All commands are available via the command palette (`Ctrl+Shift+P`):

| Command | Description |
|---|---|
| Add package to project | Add saropa_drift_advisor to pubspec (dependencies) and run pub get |
| Open in Browser | Open web UI in default browser |
| Open in Editor Panel | Open web UI in VS Code tab |
| Scan Dart Schema Definitions | List tables/columns/indexes from `.dart` files without a server |
| Schema Diff | Compare code vs runtime schema |
| Schema Diagram | ER-style table visualization |
| Open SQL Notebook | Multi-statement SQL editor |
| Visual Query Builder | Schema-driven SELECT composer with run/preview |
| Import SQL into Visual Query Builder | Map flat `SELECT` text into the visual model (best-effort) |
| Ask Natural Language | NL-to-SQL using configured LLM endpoint |
| NL Query History | Re-open or re-run prior NL-SQL generations |
| Explain Query Plan | EXPLAIN for selected SQL (context menu when cursor/selection has SQL) |
| Generate Dart from Schema | Scaffold Drift table classes |
| Export SQL Dump | Save schema + data as `.sql` |
| Download Database File | Save raw `.db` file |
| Preview Migration SQL | Show migration DDL |
| Compare Databases | Diff two databases |
| Database Size Analytics | Storage dashboard |
| Import Data | JSON/CSV/SQL import wizard |
| Capture Snapshot | Snapshot current database state |
| Share Debug Session | Create shareable session URL |
| Run Schema Linter | Manual linter scan |
| Show All Tables | QuickPick table selector |
| Open Mutation Stream | Open the real-time mutation feed panel |
| Retry Server Discovery | Re-scan ports and adb-forward path; opens Output |
| Select Server | Pick among multiple discovered servers |
| Forward Port (Android Emulator) | Run adb forward for the configured port |
| Show Connection Log | Focus Output → Saropa Drift Advisor |
| Refresh Connection UI | Re-sync `driftViewer.serverConnected` and sidebar views |
| Diagnose Connection | Log settings, discovery state, and `health()` to Output; copy summary |

## Development

```bash
cd extension && npm install && npm run compile
```

Run/debug: **Run > Run Extension** (F5) in VS Code.

```bash
cd extension && npm test
```
