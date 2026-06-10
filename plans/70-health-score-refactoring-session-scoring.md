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

---

## Implementation Plan

Extends the live Health Score (`extension/src/health/`) so the persisted refactoring-advisor session moves the **Schema Quality** number, not just narrative `details`. The hard constraint is **no double-counting** raw schema issues already scored by `scoreSchemaQuality`. Each phase ends at a verifiable gate.

### Phase 1 — Read session + define bounded rules
- Read `IRefactoringAdvisorSession` from `refactoring-advisor-state.ts`. Define explicit, bounded adjustments (e.g. cap Schema Quality when N high-risk suggestions remain undisposed, or a small per-stale-high-severity penalty) with thresholds that avoid overlapping `scoreSchemaQuality`'s inputs. If scoring needs severity histograms the session doesn't yet persist, extend the snapshot written by the panel/analyzer.
- **Gate:** rules written down with thresholds; a worked example shows no metric is penalized twice for the same underlying issue.

### Phase 2 — Implement scoring + explainability
- Apply the adjustment in the scorer alongside `mergeRefactoringAdvisorIntoMetrics`; each point change maps to a user-visible detail line or recommendation. Coordinate with `generateRecommendations` so refactoring-derived advice doesn't duplicate index/FK advice.
- **Gate:** a mocked session with high-risk undisposed items lowers Schema Quality by the documented bounded amount, and the change is explained in a visible detail line.

### Phase 3 — Tests
- Unit tests in `health-scorer.test.ts` (or a dedicated metric test) for sessions with and without dismissals, and the no-session baseline.
- **Gate:** scored-down, dismissed-back-up, and no-session-unchanged cases all pass; baseline behavior is identical to today when no session exists.
