# saropa_drift_viewer — Roadmap

Checklist of remaining work. Completed items are documented in the README and have been removed from this list.

---

## Fixes and gaps (do first)

- [x] **P0 — `startDriftViewer` convenience API**  
  Provide a one-line `db.startDriftViewer(...)` extension without adding a `drift` dependency (runtime wiring to `customSelect`), and keep the callback-based API documented as the type-safe option.

- [x] **P1 — Example app**  
  Add an `example/` app (small Flutter or Dart app, e.g. Drift app that starts the viewer) for pub.dev and onboarding.

---

## Incremental improvements

- [ ] **Changelog discipline** — Keep CHANGELOG.md in sync with every release (publish script already encourages this).

---

## “Wow” ideas (optional / later)

- [ ] **Schema diagram** — Visualize tables and relationships (e.g. from `sqlite_master` + PRAGMA foreign_key_list). Click a table to see its data.

- [ ] **Flutter widget overlay** — In debug builds, a small floating button that opens the viewer in the browser or an in-app WebView.

- [x] **Query history** — Keep a short history of SQL runner queries and results in the UI or `localStorage` for repeat checks.

---
