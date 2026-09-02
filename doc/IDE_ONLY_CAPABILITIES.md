# Saropa Drift Advisor — IDE-Only Capabilities

This guide records which capabilities are **intentionally exclusive to the IDE
extension** and will not be built for the website viewer. It exists so these
capabilities are not repeatedly re-flagged as unresolved website gaps in future
parity audits.

Origin: split out of the website-vs-extension parity sweep, §18 / A-02. The full
analysis is archived at
[GAP_FIT_PLAN.md](../history/2026.06/2026.06.10/GAP_FIT_PLAN.md).

---

## The boundary

The website viewer is **read-only** and has no language server, no code-action
channel, and no runtime debugger. The three capabilities below each depend on
one of those editor-only surfaces, so a faithful website equivalent is not
possible. They are **closed by classification — not deferred.** No owner,
milestone, or follow-up is owed.

| Capability                 | Editor surface it needs        | Why the website can't have it                                   |
| -------------------------- | ------------------------------ | --------------------------------------------------------------- |
| Go-to-definition           | Language-server symbol index   | No symbol index exists outside the editor.                      |
| Code actions / quick fixes | Code-action protocol + editor  | Requires a live write-back-to-source channel the website lacks. |
| Data breakpoints           | Runtime debugger               | A read-only viewer has no debugger to set or trip a breakpoint. |

---

## When to reopen

Reopen only if someone proposes a realistic website approximation of one of
these. Because each capability has a different shape, do **not** edit this guide
to add the work — open a new numbered feature plan for that specific
approximation and link back here.

- **Go-to-definition** — a plausible website analogue is a static jump from a
  column reference to its declared table inside the existing schema browser
  (`assets/web/schema.ts`). That is intra-schema navigation, not a language
  server, and would be its own plan.
- **Code actions / quick fixes** — needs a write-back-to-source channel the
  website does not have. Out of reach without the editor.
- **Data breakpoints** — needs the runtime debugger. No read-only-viewer path
  exists; closed barring a fundamentally different architecture.
