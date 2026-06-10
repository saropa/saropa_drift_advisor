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
