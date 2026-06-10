# Feature 66: Drift Refactoring Engine

**Status: CLOSED** (2026-04-30). Phases **1–3** delivered under `extension/src/refactoring/` plus health integration. Follow-on work is tracked only in [59-ai-schema-reviewer.md](./59-ai-schema-reviewer.md), [69-refactoring-extract-common-column-groups.md (shipped, archived)](./history/2026.06/2026.06.10/69-refactoring-extract-common-column-groups.md), and [70-health-score-refactoring-session-scoring.md (shipped, archived)](./history/2026.06/2026.06.10/70-health-score-refactoring-session-scoring.md).

Full specification (including historical execution checklists), architecture, and integration tables:

- [66-drift-refactoring-engine.md (archive)](./history/2026.04/2026.04.30/66-drift-refactoring-engine.md)

Release notes: [CHANGELOG.md](../CHANGELOG.md) `## [3.5.0]`.

---

## Implementation Plan (as built)

Delivered as phases 1–3 under `extension/src/refactoring/`; historical execution checklists are in the archive.

- **Phase 1 — Detection + types.** `IRefactoringSuggestion` union (normalize / split / merge shipped; `extract` left as a forward hook), deterministic analyzer. Gate met: analyzer emits stable suggestions on fixtures.
- **Phase 2 — Plan + migration preview.** Plan builder produces multi-step migrations with destructive/compatibility flags; webview preview. Gate met: plans render, SQL shape asserted by tests.
- **Phase 3 — Health integration.** `mergeRefactoringAdvisorIntoMetrics` appends advisor narrative to Schema Quality details. Gate met: session details surface in Health Score panel.

**Deferred (each owns its own plan):** LLM-assisted findings → [59](./59-ai-schema-reviewer.md); `extract` detection → **shipped** [69 (archived)](./history/2026.06/2026.06.10/69-refactoring-extract-common-column-groups.md); numeric health scoring of the session → **shipped** [70 (archived)](./history/2026.06/2026.06.10/70-health-score-refactoring-session-scoring.md).
