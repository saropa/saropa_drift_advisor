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

---

## Finish Report (2026-06-10) — Phases 1–3

**Scope.** (B) VS Code extension (TypeScript) only. No Dart/server code.

**The bounded rule (Phase 1).** Schema Quality loses `5` points per undismissed **high**-severity refactoring suggestion, capped at `15` total, floored at 0. Only `severity === 'high'` penalizes (medium/low are tracked but do not deduct). The input is disjoint from `scoreSchemaQuality`, which scores **only** missing-primary-key tables; refactoring suggestions are normalize/split/merge/extract structural hints, so no underlying issue is counted twice. Worked example in the combine test: a missing-PK table (base 50) plus 20 high-severity suggestions → 50 − min(15, 100) = **35** (the two penalties are additive across disjoint inputs, never the same issue twice).

**What changed.**
- **`extension/src/refactoring/refactoring-advisor-state.ts`** — added `IRemainingBySeverity` and an optional `remainingBySeverity` field on `IRefactoringAdvisorSession`. `buildAdvisorSession` now takes the full suggestions (`{id, title, severity}`) plus the **dismissed-id set** (was a bare count) and computes `dismissedCount` from the set and the histogram from the **undismissed** suggestions — so dismissing a high-severity item drops it out of `high` and restores the points. The field is optional: older persisted sessions deserialize cleanly and apply zero penalty.
- **`extension/src/refactoring/refactoring-panel.ts`** — `_persistAdvisorSession` passes `this._dismissedIds` (the set) instead of `.size`. No other behavior change.
- **`extension/src/health/health-refactoring-merge.ts`** (Phase 2) — after appending the existing narrative lines, applies the bounded penalty to the Schema Quality metric: `sq.score -= min(cap, high*5)` clamped to ≥0, recomputes `sq.grade` via `toGrade`, and pushes one explanation detail line. Runs inside the existing function, which the scorer already calls after all scorers and before the overall total + `generateRecommendations`, so the adjusted score flows into both. The penalty line is a refactoring (structural) statement, not an index/FK statement, so it does not duplicate index/FK recommendations.
- **`extension/src/test/health-scorer.test.ts`** (Phase 3) — 5 cases: scored-down (100→90), cap (5 high → 85 not 75), dismissed-back-up (high 0 → 100, no penalty line), back-compat (no histogram → 100), and combined missing-PK + capped refactoring penalty (50→35).
- **`extension/src/test/refactoring-advisor-state.test.ts`** (new) — 3 cases pinning the histogram math: excludes dismissed ids, all-dismissed → zeros, topTitles capped at 5.
- **`CHANGELOG.md`** — `[Unreleased]` Changed entry.

**Explainability.** Every point change maps to a visible Schema Quality detail line ("Schema Quality reduced N point(s): M high-severity refactoring suggestion(s) remain unaddressed…"), which also becomes a recommendation through the existing `generateRecommendations` path. The health panel/HTML render `score`, `grade`, and `details` generically — no UI change needed.

**Testing.**
- Audited the existing merge test (`should merge persisted refactoring advisor session into schema quality details`): its session literal has no `remainingBySeverity`, so the new penalty is a no-op for it and it still passes unchanged.
- `npm run compile` clean. `npm test` → **2677 passing** (was 2669; +8). Commands run from `extension/`.

**Constraint compliance.** No-double-counting verified by construction (disjoint inputs) and by the combine test. Bounded (cap 15) and floored (≥0). No existing test weakened.

**Outstanding.** None. All three phases complete; acceptance criteria met (controlled change with tests; no-session baseline identical to before).

**Finish report appended:** plans/70-health-score-refactoring-session-scoring.md (this section). Plan fully complete → archived to plans/history/2026.06/2026.06.10/.
