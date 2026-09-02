# Doc folder consolidation

Documentation files were split across two directories (`doc/` and `plans/guides/`)
with no meaningful distinction. One file (`LOG_CAPTURE_FILE_CONTRACT.md`) was a
25-line stub that already referenced `EXTENSION_API.md` for its type definition.

## Finish Report (2026-09-02)

### Changes

- **Merged `LOG_CAPTURE_FILE_CONTRACT.md` into `EXTENSION_API.md`** as a
  "File-based access (Log Capture sidecar)" section. The well-known file path,
  encoding, shape reference, and write conditions are preserved. The snapshot
  type reference (`DriftAdvisorSidecar`) was added to the References section.

- **Moved three files from `plans/guides/` to `doc/`:**
  - `DESIGN_LANGUAGE.md` — web UI design system
  - `IDE_ONLY_CAPABILITIES.md` — IDE-exclusive capability boundary doc
  - `LAUNCH_TEST.md` — manual test checklist

- **Deleted `plans/guides/`** — empty after the moves.

- **Updated CHANGELOG** with a Changed entry under [Unreleased].

### Impact

No code changes. One stale reference exists in
`plans/history/2026.03/20260319/plan_saropa_log-capture-integration.md`
pointing to the old `doc/LOG_CAPTURE_FILE_CONTRACT.md` path — acceptable
since the plan is already archived in history and the content is preserved
in `doc/EXTENSION_API.md`.

### Final doc/ contents

- `API.md` — REST/HTTP server API reference
- `APP_QUERY_TIMING.md` — query capture integration guide
- `DESIGN_LANGUAGE.md` — web UI design system rules
- `EXTENSION_API.md` — VS Code extension API + Log Capture file contract
- `IDE_ONLY_CAPABILITIES.md` — IDE-exclusive capability boundary
- `LAUNCH_TEST.md` — manual test checklist
- `api/` — generated API docs
