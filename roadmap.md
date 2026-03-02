# saropa_drift_viewer — Roadmap

This document captures improvement ideas from a full project review: gaps to fix, incremental enhancements, and “wow” ideas that could make the package stand out.

---

## Project summary

**What it is:** A debug-only HTTP server that exposes SQLite/Drift table data as JSON and a minimal web UI. Apps pass a query callback (e.g. from Drift’s `customSelect` or any SQLite executor); the server lists tables and serves table rows and schema.

**Current state:** Single package, ~260 lines of Dart in `lib/`, zero runtime dependencies, strict analysis, CI (analyze + format + test), publish workflow and a detailed Python publish script. The web UI is one inline HTML page (dark theme, table list + JSON `pre`).

---

## Fixes and gaps (do first)

| Priority | Item | Notes |
|----------|------|--------|
| **P0** | **Implement or correct `startDriftViewer`** | README documents `myDb.startDriftViewer(enabled: kDebugMode)` and an extension on `GeneratedDatabase`, but this API does not exist in the package (no Drift dependency, no such function). Either: (1) add an optional Drift dependency and an extension that wires `customSelect` into `DriftDebugServer.start`, or (2) remove/adjust README so it only documents `DriftDebugServer.start(query: ...)`. |
| **P0** | **CI branch** | `.github/workflows/main.yaml` uses `branches: main`; default branch in repo is `master`. Either rename branch to `main` or change the workflow to `master` so CI runs on push/PR. |
| **P1** | **Tests for the server** | Current tests cover `enabled: false` and `DriftDebugErrorLogger` only. Add tests (or integration tests) for: server start, `GET /`, `GET /api/tables`, `GET /api/table/<name>`, `GET /api/schema`, error handling, and invalid table name. |
| **P1** | **Example app** | No `example/` in the repo. A small Flutter or Dart example (e.g. Drift app that starts the viewer) would help pub.dev and onboarding. |

---

## Incremental improvements

### API and server

- ~~**Bind address option**~~ — *Implemented:* `loopbackOnly` in `start()`.
- ~~**Optional CORS**~~ — *Implemented:* `corsOrigin` in `start()`.
- ~~**Health/readiness endpoint**~~ — *Implemented:* `GET /api/health`.
- ~~**Shutdown hook**~~ — *Implemented:* `DriftDebugServer.stop()`.

### Web UI

- **Pagination control** — Let the user change limit and offset (e.g. “Next 200”) instead of fixed 200 rows.
- **Search / filter** — Client-side filter on the current table’s JSON or a simple “filter by column value” to reduce noise.
- **Schema in the UI** — Show schema (e.g. from `/api/schema`) in a collapsible section or tab so you don’t have to open the export link.
- **Export table as CSV** — Button or link that fetches table data and triggers a CSV download.
- **Theme toggle** — Light/dark switch; persist preference in `localStorage`.
- **Row count** — Display “Table X (N rows)” using a lightweight count query or `COUNT(*)` when feasible.

### Developer experience

- **Dart doc** — Expand doc comments and ensure public API is well documented; consider `@example` for `DriftDebugServer.start` and the Drift extension (once it exists).
- **Changelog discipline** — Keep CHANGELOG.md in sync with every release (already encouraged by publish script).
- **README badges** — Add pub version, build status, and maybe “license” badges.

### Infrastructure

- ~~**Dependabot**~~ — *Implemented:* Grouping for `pub` and `github-actions`; `open-pull-requests-limit: 5`. Auto-merge remains optional (repo rules or workflow).
- ~~**Branch consistency**~~ — *Implemented:* Workflow triggers use `master` to match default branch (see P0).

---

## “Wow” ideas

High-impact or differentiator features that could make the package memorable and widely used.

| Idea | Description |
|------|-------------|
| **Live refresh** | WebSocket or long-polling so the table view updates when data changes (e.g. after app writes). No manual refresh. |
| **Read-only SQL runner** | A small input in the UI to run **read-only** SQL (e.g. only `SELECT`; reject `INSERT/UPDATE/DELETE` and DDL). Results shown in the same JSON/pre or a simple table. Huge for ad-hoc debugging. |
| **Schema diagram** | Visualize tables and relationships (e.g. from `sqlite_master` + PRAGMA foreign_key_list). Click a table to see its data. |
| **DevTools / IDE integration** | Flutter DevTools plugin or VS Code / Cursor extension: “Open Drift viewer” or a sidebar that lists tables and opens the browser at the right URL. Feels native to the toolchain. |
| **Database diff** | Compare two databases (e.g. local vs staging): same schema, diff of row counts or row content per table. Export diff report. |
| **Snapshot / time travel** | Optional “snapshot” of table state at a point in time (e.g. in-memory or file); later, “compare to now” to see what changed. |
| **Export full DB** | “Download database” that streams the SQLite file (or a copy) so devs can inspect it in DB Browser or another tool. |
| ~~**Secure dev tunnel**~~ | *Implemented:* Optional `authToken` (Bearer or `?token=`) and/or HTTP Basic (`basicAuthUser`/`basicAuthPassword`) so the viewer can be used over a tunnel (e.g. ngrok) or port forwarding without exposing an open server. |
| **Flutter widget overlay** | In debug builds, a small floating button that opens the viewer in the browser (or an in-app WebView). One tap from the app. |
| **Query history** | If read-only SQL is added, keep a short history of queries and results in the UI or in `localStorage` for repeat checks. |

---

## Suggested order

1. **Short term:** Fix P0 (API/README or implement `startDriftViewer`; fix CI branch). Add P1 tests and an example app.
2. **Next:** Incremental UI and API improvements (pagination, schema in UI, bind address, shutdown).
3. **Later:** Pick 1–2 “wow” items (e.g. read-only SQL runner + live refresh, or DevTools/IDE integration) and ship them as major/minor features.

---

*Generated from a full project review. Treat this as a living list: re-prioritize and add/remove items as the project evolves.*
