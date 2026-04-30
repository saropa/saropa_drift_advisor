# Feature 70: Health score — numeric integration with refactoring advisor

## Purpose

Extend the Health Score ([Feature 30](history/2026.03/20260311/30-health-score.md) archive; live code in `extension/src/health/`) so the **Schema Quality** metric (and optionally overall score) reacts numerically to the persisted refactoring-advisor session, not only narrative lines merged in [Feature 66 Phase 3](66-drift-refactoring-engine.md) (`mergeRefactoringAdvisorIntoMetrics` in `health-refactoring-merge.ts`).

Today: session data appends human-readable `details` and adds a panel action. **This plan:** define explicit scoring rules so the grade reflects unresolved structural hints the advisor already surfaced.

## Goals

- Document and implement **bounded** score adjustments (e.g. cap Schema Quality when N high-risk suggestions remain undisposed, or small penalty per stale high-severity item) with clear thresholds to avoid double-counting raw schema issues already scored by `scoreSchemaQuality`.
- Preserve **explainability**: each point change should map to a user-visible detail line or recommendation.
- Unit tests in `health-scorer.test.ts` (or dedicated metric tests) for sessions with / without dismissals.

## Non-goals

- Replacing deterministic schema checks with LLM output (see [59](59-ai-schema-reviewer.md)).
- Historical time-series of health vs. refactoring (separate product idea).

## Design notes

- Read `IRefactoringAdvisorSession` from `refactoring-advisor-state.ts`; consider extending the persisted snapshot if scoring needs severity histograms (requires panel + analyzer to write richer session).
- Coordinate with `generateRecommendations` so refactoring-derived recommendations do not duplicate index/FK advice already emitted.

## Acceptance criteria

- Schema Quality score or documented sub-component changes in a controlled way given a mocked session, with tests.
- Default behavior remains sensible when no session exists (no change from current baseline).
