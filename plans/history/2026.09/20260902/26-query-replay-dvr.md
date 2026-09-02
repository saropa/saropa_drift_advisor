# Feature 26: Query Replay DVR

**Status: MVP shipped** (2026-04-30). Debug server `/api/dvr/*`, `QueryRecorder`, declared read bindings, and the extension DVR panel (timeline, search, integrations) are in the repo. **Deferred** product scope (unified scrubber with schema timeline / time-travel) stays documented in the archive only—it is not required to call the shipped feature “done.”

Full specification, contracts, testing matrix, implementation status, and deferred roadmap:

- [26-query-replay-dvr.md (archive)](./history/2026.04/2026.04.30/26-query-replay-dvr.md)

Release notes: [CHANGELOG.md](../CHANGELOG.md) `## [3.5.0]` (DVR endpoints, panel, bindings, perf baselines).

---

## Implementation Plan (as built)

Shipped as an MVP; the unified scrubber was deliberately deferred (see archive) and is not required to call this feature done.

- **Phase 1 — Server recording.** `QueryRecorder` plus declared read bindings; `/api/dvr/*` endpoints expose the recorded query log. Gate met: endpoints return recorded entries, perf baselines captured.
- **Phase 2 — Extension DVR panel.** Timeline view, history search, and cross-feature integrations. Gate met: panel renders the log, search filters, integrations wired.

**Deferred (archive only, not scheduled):** unified scrubber correlating DVR position to the schema/time-travel timeline. Picking that up depends on [60](./60-time-travel-data-slider.md) shipping its slider first.
