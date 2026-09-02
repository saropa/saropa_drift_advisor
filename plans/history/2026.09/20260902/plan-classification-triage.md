# Plan Classification Triage (2026-09-02)

Twelve plan files in `plans/` were reviewed and reclassified into the correct
status directories: `history/` (complete), `deferred/` (not started), or
`blocked/` (waiting on external dependency). Several files sat in the active
`plans/` root or in incorrect status directories despite being shipped months
earlier or never started.

## Finish Report (2026-09-02)

**Scope.** (C) docs only — plan file moves between directories. No code changes.

**Moved to `history/2026.09/20260902/` (complete/shipped):**

| File | Rationale |
|------|-----------|
| `26-query-replay-dvr.md` | MVP shipped 2026-04-30; finish report present |
| `37-data-branching.md` | Phases 1-5 complete (2026-06-10 finish report); one additive cross-feature hook remains |
| `60-time-travel-data-slider.md` | Phases 1-4 complete (2026-06-10), Phase 5 partial (2026-06-25); only optional DVR sync hook deferred |
| `connection-reliability-ongoing.md` | CLOSED 2026-07-16 — all 5 structural phases + 2 campaign candidates complete |
| `fix-pub-dev-publisher.md` | Phases 1-3 complete; Phase 4 (poison pill) split into its own blocked plan |
| `full-codebase-audit-2026.06.12.md` | CLOSED — archived; stub pointing to archive copy |

**Moved to `deferred/` (design only, no code):**

| File | Rationale |
|------|-----------|
| `28-pii-anonymizer.md` | Web UI masking partial; extension anonymizer not started |
| `35-multi-server-federation.md` | Design only, no finish reports |
| `59-ai-schema-reviewer.md` | Design only, no finish reports |
| `62-instrumentation-status-signal.md` | Explicitly "proposed (design only; no code yet)" |

**Moved to `blocked/` (waiting on external dependency):**

| File | Rationale |
|------|-----------|
| `poison-pill-old-package.md` | Was in `deferred/` — actually blocked on pub.dev admin access, not a voluntary deferral |

**Deleted (stale duplicate):**

| File | Rationale |
|------|-----------|
| `discussion/60-time-travel-data-slider.md` | Duplicate of the main `plans/60-…` which had finish reports; this copy was the original spec without finish reports |
| `discussion/fix-pub-dev-publisher.md` | Duplicate of `blocked/fix-pub-dev-publisher.md` with finish reports; moved to history |

**Active plans after triage:** none. No plan files remain in the `plans/` root.
