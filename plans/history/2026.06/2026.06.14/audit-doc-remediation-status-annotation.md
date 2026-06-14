# Audit document remediation-status annotation

The full-codebase audit (`plans/full-codebase-audit-2026.06.12.md`) listed every
finding in present-tense "here is the defect" form with no indication that
remediation had occurred. In reality 15 commits on branch
`security/audit-phases-1-2` had already closed every Critical, High, and Medium
finding plus several Low ones, with the record living only in commit messages and
a separate closeout file. A reader opening the audit document could not tell which
findings were fixed, which were reviewed without change, and which still needed
building. The annotation makes the document self-describing.

## Finish Report (2026-06-14)

### Scope

(C) docs only — two Markdown files under `plans/`. No Dart, TypeScript, ARB, or
test code was touched.

### What changed

- `plans/full-codebase-audit-2026.06.12.md`
  - A new **Remediation status** section sits directly after the verdict. It
    states that every Critical/High/Medium finding is fixed and verified (Dart
    `analyze` clean + 648 tests; extension `tsc` clean + 2749 tests), links the
    per-finding closeout, and buckets the remaining work: needs-building
    engineering (C2b CSP backstop, L5 `esc()` consolidation, L6 stale-artifact
    removal), user action (L3 token rotation), optional cosmetic (L4
    `safeSubstring`, L7 helper-dedup remainder), and reviewed-no-change (L2, L8).
  - Every finding now carries an inline status tag. C1 and C3 are `DONE`. C2 is
    split into its fixed sinks (C2a), the allowlist (C2c), and the still-open CSP
    backstop (C2b). A blanket `DONE` banner heads the High and Medium sections.
    The Low section carries per-item tags because its statuses differ.
  - A status banner heads the Detailed Remediation Plan: Phases 1–4 shipped, only
    parts of Phase 5 remain.
- `plans/history/2026.06/2026.06.13/audit-remediation-closeout.md`
  - The "Handed off" and "Outstanding" lists previously named only C2b, L5, and
    L3. They now also carry L6 and the L7 remainder, which the original closeout
    omitted, plus L4. Both documents now agree on the open-item set.

### Why the closeout was under-counted

Verification against the working tree found `analysis_options_custom.yaml.bak`
(163 KB) and `assets/web/app.js.bak` (322 KB) still on disk, and three separate
`makeId` definitions still present (`annotation-store.ts`, `filter-store.ts`,
`query-model.ts`). The commit that referenced "audit L7" had removed a duplicate
CSV parser (`ServerUtils.parseCsvLines`) — which is the L6/M10 duplicate-parser
concern, not the L7 helper-dedup concern as the audit document defines L7. Both
the L6 artifact removal and the L7 TS-helper dedup remain open; the annotation
records that split so the two findings are no longer conflated.

### Verification

- `git log` confirmed the 15 remediation commits and their per-finding tags.
- `grep` confirmed `loopbackOnly: true` is the shipped default in
  `drift_debug_server_io.dart` and `start_drift_viewer_extension.dart`.
- Filesystem check confirmed both `.bak` artifacts are present (L6 open) and that
  `makeId` has three copies (L7 remainder open).
- No automated tests reference the edited Markdown files (test-directory grep for
  both filenames returned no matches), so no test run applies.

### Outstanding

None for this annotation task. The audit document itself remains an active plan
because of its open engineering items (C2b, L5, L6) and the user-only token
rotation (L3); those are tracked in the document's own status section and are out
of scope for this documentation pass.
