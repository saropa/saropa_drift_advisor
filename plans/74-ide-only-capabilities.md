# Feature 74: IDE-Only Capabilities (No Website Parity Planned)

**Status: CLASSIFIED — intentionally IDE-only.** Split out of the archived GAP
parity analysis (originally A-02 / section 18). These capabilities depend on the
editor's language-server and runtime debugger surfaces; they have no meaningful
website equivalent and are NOT tracked as parity gaps.

Source: [GAP_FIT_PLAN.md (archive)](./history/2026.06/2026.06.10/GAP_FIT_PLAN.md) §18.

## Decision

The following were carried as ambiguous `[ ]` rows in the parity tables. They are
reclassified here as intentionally IDE-only so they no longer read as unresolved
cross-surface gaps.

| Capability                 | Why IDE-only                                                        |
| -------------------------- | ------------------------------------------------------------------- |
| Go-to-definition           | Requires the IDE language-server symbol index; no website analogue. |
| Code actions / quick fixes | Requires the IDE code-action protocol bound to a live editor.       |
| Data breakpoints           | Requires the runtime debugger; not available to a read-only viewer. |

## Reopening criteria

Revisit only if a realistic website approximation is proposed (e.g. a static
symbol jump within the schema browser). Until then these are closed, not
deferred — no owner or milestone is owed.

## Implementation Plan

**There is no build work in scope.** This plan records a classification
decision, not a feature. The three capabilities are intentionally IDE-only;
the only action this plan ever needed — removing them from the active parity
tables — happened when the GAP analysis was archived. Nothing to start.

The plan exists so the decision is greppable and the rows do not silently
reappear as "open gaps" in a future audit. If a website approximation is later
proposed, do **not** extend this plan in place — open a new numbered feature
plan for that specific approximation (e.g. "website schema-symbol jump") and
link back here, because each of the three has a different shape:

- **Go-to-definition** — a website analogue would be a static jump from a column
  reference to its declared table within the existing schema browser
  (`assets/web/schema.ts`). No language server; purely intra-schema navigation.
- **Code actions / quick fixes** — would require a write-back-to-source channel
  the website does not have; realistically out of reach without the editor.
- **Data breakpoints** — needs the runtime debugger; no read-only-viewer path
  exists. Closed barring a fundamentally different architecture.

### Exit gate

No verification — closed by classification. Reopening starts a new plan, not a
revision of this one.
