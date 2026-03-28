# Plan 48 — Log Capture ↔ Drift viewer SQL link

**Canonical API and behavior:** `doc/API.md` — **SQL** section:

- **Web viewer deep link:** `#api-sql-web-viewer` (`?sql=` prefill, `replaceState`, privacy/limits)
- **Execution:** `#api-post-sql` (`POST /api/sql`)

This plan file only tracks **cross-repo wiring** (Saropa Log Capture SQL history → `openUrl` with `{baseUrl}/?sql=…`, optional `driftAdvisorDbPanelMeta.baseUrl`). Do not duplicate `doc/API.md` here.
