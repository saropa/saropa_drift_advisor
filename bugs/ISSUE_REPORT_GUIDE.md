# Issue Report Guide

<!-- Formerly bugs/BUG_REPORT_GUIDE.md — renamed 2026-09-02 -->

How to file, investigate, and close bugs and feature requests in `saropa_drift_advisor`.

**False positives are in scope.** If a diagnostic flags code that is correct (or the diagnostic is clearly wrong), file it here under `bugs/` using the [False positive](#false-positive) naming pattern and the [bug report template](#bug-report-template). Downstream repos can link to the issue file once filed; the fix lives in `saropa_drift_advisor`.

**Feature requests are in scope.** New diagnostic proposals, UX improvements, extension features, infrastructure improvements, and tooling enhancements belong here under `bugs/` using the [Feature request](#feature-request) naming pattern and the [feature request template](#feature-request-template).

---

## File Naming

| Type | Pattern | Example |
|------|---------|---------|
| False positive | `diagnostic_name_false_positive_description.md` | `schema_divergence_false_positive_datetime_text.md` |
| False negative | `diagnostic_name_false_negative_description.md` | `missing_column_false_negative_view_alias.md` |
| Crash / error | `diagnostic_name_crash_description.md` | `snapshot_diff_crash_null_schema.md` |
| Quick fix bug | `diagnostic_name_fix_description.md` | `add_column_fix_wrong_type_mapping.md` |
| Infrastructure | `infra_description.md` | `infra_server_startup_timeout.md` |
| New diagnostic proposal | `proposal_diagnostic_name.md` | `proposal_detect_missing_index.md` |
| Quick fix request | `proposal_fix_diagnostic_name_description.md` | `proposal_fix_schema_divergence_add_migration.md` |
| Tooling / infra request | `proposal_infra_description.md` | `proposal_infra_cli_export_json.md` |
| UX / extension request | `proposal_ux_description.md` | `proposal_ux_inline_diff_view.md` |

Every feature request — new diagnostic, quick fix, tooling, or UX — uses a `proposal_*` prefix. There is no separate `feature_*` pattern; pick the row above that matches the request's kind.

Use lowercase with underscores. Check existing files before creating.

---

## Confirm Attribution Before Filing

**Before filing a bug here, grep to prove the diagnostic or behavior lives in `saropa_drift_advisor`.** A diagnostic's `source` / `owner` label in the VS Code Problems panel is not attribution — it is a label the emitter chose. Sibling analyzer plugins and extensions (`saropa_lints`, `saropa_dart_utils`, other `custom_lint`-based plugins, etc.) emit diagnostics that can look similar or carry similar-looking code names. Filing here without proof forces the first fix agent to waste a round-trip discovering the bug lives elsewhere — or worse, the agent guesses and ships a half-fix in the wrong repo.

### Positive attribution (required)

`saropa_drift_advisor` is **both** a Dart analyzer (under `lib/src/`) and a TypeScript VS Code extension (under `extension/src/`). Many diagnostics have a Dart emit path **and** a TypeScript emit path that flag the same underlying condition. When filing a diagnostic bug:

- Grep **both** trees for the diagnostic/code name:

```bash
grep -rn "'<code_name>'" lib/src/
grep -rn "'<code_name>'" extension/src/
```

- List every match from each tree. A fix that only touches one language path will leave the other emitting the same diagnostic forever.

### Negative attribution (required when multiple sources may overlap)

If the diagnostic's `source` / `owner` label is ambiguous across sibling repos, also grep the suspected sibling repos to confirm the diagnostic is NOT defined there:

```bash
grep -rn "'<code_name>'" ../saropa_lints/lib/src/rules/
```

Paste the zero-match result. If you get a match, file the bug in that repo instead.

### Reverse case: diagnostics whose emitter is not here

If the report is about a diagnostic whose label resembles `saropa_drift_advisor` but the positive grep returns nothing, **stop**. The emitter lives in another plugin or extension. Name the suspected emitter, paste the positive grep from that repo, and file the bug in that repo's `bugs/` folder. Do not open a bug here on the theory that "drift_advisor probably registers it somehow" — that guess has cost us real round-trips.

### Why this section exists

We have had bugs misattributed in both directions — `saropa_lints` rules filed against `saropa_drift_advisor` and `drift_advisor` diagnostics filed against `saropa_lints`. In every case, the fix agent saw a label, assumed a repo, and either punted the work as "somebody else's" or shipped a fix in the wrong tree. The only defense is grep evidence pasted directly in the bug report.

---

## Bug Report Template

Copy the block below into a new file.

````markdown
# BUG: Short, Specific Title

**Status: Open**

<!-- Status values: Open → Investigating → Fix Ready → Closed -->

Created: YYYY-MM-DD
Component: Extension / Analyzer / Server / CLI
File: `path/to/file.ts` or `lib/src/path/file.dart` (line ~NNN)
Severity: False positive / False negative / Crash / Wrong fix / Performance / UX

---

## Summary

One or two sentences: what happens, what should happen instead.

---

## Attribution Evidence

Grep proof that this diagnostic or behavior lives in `saropa_drift_advisor`. If the positive grep is empty, the bug does not belong in this repo — do not file here. See "Confirm Attribution Before Filing" in the guide.

```bash
# Positive — diagnostic IS defined here (grep BOTH trees)
grep -rn "'code_name'" lib/src/
grep -rn "'code_name'" extension/src/
# Expected: file:NN: ... 'code_name' ...

# Negative — diagnostic is NOT in sibling repos (paste only if source label is ambiguous)
grep -rn "'code_name'" ../saropa_lints/lib/src/rules/
# Expected: 0 matches
```

**Emit site(s) — list ALL:** `path/to/file:NN`
**Diagnostic `source` / `owner` as seen in Problems panel:** `...`

---

## Environment

- OS:
- VS Code version:
- Extension version:
- Dart SDK version:
- Flutter SDK version (if applicable):
- Database type and version:
- Connection method:
- Relevant non-default settings:
- Other potentially conflicting extensions:

---

## Steps to Reproduce

1. Start from a clean state.
2. ...
3. ...

Rules:
- Specify exact input values, not "type some SQL."
- Specify which UI element was clicked, not "click the button."
- Specify whether you used keyboard shortcut, context menu, command palette, or mouse click — they can trigger different code paths.
- If the bug is intermittent, say so and estimate how often (e.g., "~3 out of 10 attempts").

---

## Expected Behavior

[What should happen]

---

## Actual Behavior

[What actually happens]

---

## Error Output

Include ALL of the following that exist. Do not summarize or truncate.

### VS Code Developer Tools Console

1. Open with: Help > Toggle Developer Tools (or Ctrl+Shift+I / Cmd+Option+I)
2. Click the Console tab
3. Reproduce the bug
4. Copy everything logged during reproduction

### Extension Output Channel

1. Open the Output panel (View > Output)
2. Select "Saropa Drift Advisor" from the dropdown
3. Copy the full content

### Terminal / Command Output

If the bug involves CLI commands or background processes, paste the full terminal output including the command you ran.

### Stack Traces

If there is an error dialog, notification, or stack trace — copy the full text. Screenshot alone is not enough because stack traces need to be searchable.

---

## Duplicate-Emission Check

If two diagnostics carry different `(owner, code)` pairs, enumerate **every** emit site for each one. "Two labels, one repo" is a valid finding, but only with the grep that proves both emit sites live in the same tree.

For mixed-language repos (this one), grep **both** `lib/src/` **and** `extension/src/` for the code name and list matches from each.

---

## Screenshots / Recordings

- **Annotate screenshots.** Circle or arrow the relevant area.
- **Screen recordings** are ideal for timing-dependent bugs, UI glitches, or multi-step interactions.
- **Before and after** if the bug is visual.
- **Capture the full window** when layout or positioning is relevant.

---

## Minimal Reproducible Example

Strip down the scenario to the absolute minimum that still triggers the bug.

- If it happens with a specific SQL query, find the shortest query that still fails.
- If it happens with specific data, provide the smallest dataset that reproduces it.
- If it happens with a specific schema, provide the CREATE TABLE statement(s).
- If it depends on extension settings, provide the exact JSON from settings.json.

The goal: someone else can copy-paste your example and see the bug within 60 seconds.

---

## What I Already Tried

- [ ] Restarted VS Code
- [ ] Disabled other extensions
- [ ] Tested on a different database
- [ ] Tested on a previous extension version
- [Other attempts and their results]

---

## Regression Info

- Last working version:
- First broken version:
- What changed:

---

## Root Cause

<!-- Fill in during investigation. -->

---

## Changes Made

<!-- Fill in when a fix is written. -->

---

## Commits

<!-- Add commit hashes as fixes land. -->
- `abcdef0` fix: description

---

## Impact

- Who is affected:
- What is blocked:
- Data risk:
- Frequency:
````

---

## Feature Request Template

Copy the block below into a new file.

````markdown
# PROPOSAL: Short, Specific Title

**Status: Open**

<!-- Status values: Open → Accepted → In Progress → Closed -->
<!-- Use "Declined" if rejected, with rationale in the Decision section -->

Created: YYYY-MM-DD
Type: New diagnostic / Quick fix / UX improvement / Tooling / Infrastructure
Related diagnostics: `code_name` (if modifying or extending an existing diagnostic)

---

## Summary

One or two sentences: what the feature does and why it matters.

---

## Motivation

Why this feature is needed. Include concrete examples from real usage where this would have caught a bug, improved code quality, or saved developer time.

---

## Detection / Behavior

<!-- For new diagnostics: describe what code/state should be flagged and what should pass -->
<!-- For quick fixes: describe the transformation -->
<!-- For UX: describe the interaction flow -->
<!-- For tooling: describe the expected input/output -->

### Should flag (problematic)

```
Example of what the diagnostic should report on
```

### Should pass (correct)

```
Example of what the diagnostic should NOT flag
```

---

## Edge Cases

1. **Case description** — should flag / should pass / needs discussion
2. ...

---

## Alternatives Considered

---

## Decision

<!-- Fill in when the proposal is accepted or declined -->

---

## Implementation Notes

<!-- Fill in when work begins -->

---

## Commits

<!-- Add commit hashes as implementation lands -->
- `abcdef0` feat: description
````

---

## Bug Categories

### False Positive

The diagnostic fires on correct code or valid schema.

**How to report:** Create `bugs/diagnostic_name_false_positive_<description>.md`, copy the [Bug Report Template](#bug-report-template), and complete **Steps to Reproduce** plus **Attribution Evidence** (grep).

**Investigation focus:**
- What pattern does the diagnostic fail to recognize as valid?
- Which condition in the detection logic is too broad?
- Does it handle all schema/SQL variations that can appear in this position?

### False Negative

The diagnostic misses a condition it should flag.

**Investigation focus:**
- Is the detection registered for the right event or node type?
- Does the condition have an early return that excludes this case?
- Is the violation pattern structurally different from what the check covers?

### Crash / Exception

The extension or analyzer throws during operation.

**Investigation focus:**
- Include the full stack trace
- Which property is null that the code assumes is non-null?
- Does the code cast without checking?

### Wrong Quick Fix

The fix applies incorrectly or produces broken code/SQL.

**Investigation focus:**
- Show the code/schema before and after the fix is applied
- Does the fix account for the full context?

### Performance

A diagnostic or operation causes the extension to hang or consume excessive resources.

**Investigation focus:**
- Which file, schema, or pattern triggers the slowdown?
- Is there an O(n²) loop or repeated query?
- Check memory/CPU during reproduction

---

## Feature Request Categories

### New Diagnostic Proposal

A diagnostic that does not exist yet.

**How to report:** Create `bugs/proposal_diagnostic_name.md`, copy the [Feature Request Template](#feature-request-template), and complete **Detection / Behavior** with examples.

**Evaluation criteria:**
- Does the diagnostic catch real drift issues or enforce a meaningful quality bar?
- Does it overlap with an existing diagnostic? Check existing diagnostics in `lib/src/` and `extension/src/`
- Is the detection feasible with available schema/SQL information?

### Quick Fix Request

A new automated fix for an existing diagnostic, or an improvement to an existing fix.

**Evaluation criteria:**
- Is the transformation always safe, or does it require user judgment?
- Does the fix handle all database type variations?

### UX / Extension Request

Improvements to the VS Code extension UI, interactions, or developer experience.

**How to report:** Create `bugs/proposal_ux_description.md` and describe the current behavior, desired behavior, and motivation.

### Tooling / Infrastructure Request

Improvements to the server, CLI, build pipeline, test harness, or other infrastructure.

**How to report:** Create `bugs/proposal_infra_description.md` and describe the current behavior, desired behavior, and motivation.

---

## Investigation Checklist

Use this when diagnosing a new bug.

- [ ] **Positive attribution grep** — grep both `lib/src/` and `extension/src/` for the code name; at least one tree returns a match, pasted in the report. Zero matches = do not file here
- [ ] **Negative attribution grep** — if the diagnostic's `source` / `owner` label is ambiguous across sibling repos, paste the zero-match grep from each suspected sibling repo
- [ ] **Reproduce it** — create a minimal scenario that triggers the behavior
- [ ] **Read the source** — find the emit site and trace the logic
- [ ] **Check both language paths** — `lib/src/` (Dart) and `extension/src/` (TypeScript); a fix that only touches one path may leave the other emitting the same diagnostic
- [ ] **Check null safety** — does the code handle nullable properties without crashing?
- [ ] **Run the tests** — confirm current behavior with existing tests
- [ ] **Check the error output** — Developer Tools Console, Extension Output Channel, stack traces

---

## Common Pitfalls

These patterns have caused bugs before. Check for them during investigation.

| Pitfall | Why It Breaks | Correct Pattern |
|---------|---------------|-----------------|
| Attributing a diagnostic by its label | `source: "drift-advisor"` does not mean "defined in `drift_advisor` repo" — it is a label the emitter chose | Grep the code name in every plausible repo; attribution is `file:line`, not a label |
| Filing here without positive grep | Wastes a fix agent's round-trip when the diagnostic actually lives in a sibling plugin | Grep both `lib/src/` and `extension/src/` — must return at least one match before filing |
| Fixing only one language path | Dart analyzer and TypeScript extension can emit the same diagnostic independently | Grep both trees; fix both emit paths |
| No cross-repo attribution without grep | "Likely lives in repo X" without evidence | `grep -rn '<code>' ../saropa_lints/lib/src/rules/` must be pasted |
| SELECT * in capture queries | OOM on large blob columns | Use `blobSafeSelectList()` — enumerate columns explicitly |
| Missing `onError` classification | Error callback lacks context to distinguish user-query vs server errors | Use `onClassifiedError` with error type discrimination |

---

## Fix Requirements

Every bug fix must satisfy these before it can be closed.

### Code

- [ ] Fix addresses the **root cause**, not just the symptom
- [ ] Fix includes a comment explaining what was wrong and why the new code is correct
- [ ] No `// ignore:` comments added to suppress diagnostics

### Tests

- [ ] Test covers the exact reproduction case
- [ ] Existing tests still pass

### Quality Gates

- [ ] Analyzer — zero issues
- [ ] Formatter — no changes needed
- [ ] Tests — all pass

### Documentation

- [ ] `CHANGELOG.md` updated under `[Unreleased]`
- [ ] Bug report file updated with root cause, changes, and commit hashes
- [ ] Status updated to `Closed`

---

## Lifecycle

### Bugs

```
Open
  │
  ▼
Investigating       ← actively diagnosing, root cause section being filled in
  │
  ▼
Fix Ready           ← code written, tests pass, awaiting commit
  │
  ▼
Closed              ← merged, verified, file moved to history
```

### Feature Requests

```
Open
  │
  ├──► Declined     ← rejected with rationale, file moved to history
  │
  ▼
Accepted            ← approved, scope decided
  │
  ▼
In Progress         ← implementation underway
  │
  ▼
Closed              ← merged, verified, file moved to history
```

### Moving to History

When an issue is closed (or a proposal is declined), `git mv` its file into the shared history root — the same `plans/history/` tree the `/finish` workflow archives closed plans into, not a separate `bugs/history/`:

```
bugs/diagnostic_name_false_positive_description.md
  → plans/history/YYYY.MM/YYYYMMDD/diagnostic_name_false_positive_description.md

bugs/proposal_diagnostic_name.md
  → plans/history/YYYY.MM/YYYYMMDD/proposal_diagnostic_name.md
```

Use the date the issue was closed. Create the `YYYY.MM/YYYYMMDD` folders if they do not exist. Grep and repoint any `bugs/<file>.md` references (CHANGELOG, other issue files) to the new path in the same commit.

---

## Severity Guide

| Severity | Meaning | Examples |
|----------|---------|---------|
| Critical | Extension crashes, blocks all analysis | Null dereference in server, infinite loop, extension fails to activate |
| High | False positive on common pattern, forces workaround | Flags valid schema as divergent, reports correct SQL as error |
| Medium | False negative on important condition | Misses actual schema drift, skips column type mismatch |
| Low | Cosmetic or edge case | Wrong message text, UI alignment issue |

---

## Linking

- Reference bugs from commits: `fix: description (diagnostic_name false positive)`
- Reference proposals from commits: `feat: description (proposal_name)`
- Reference issues from docs: `[issue file](bugs/diagnostic_name_false_positive_description.md)` or `[proposal](bugs/proposal_diagnostic_name.md)`
- Reference related history: `Related: plans/history/YYYY.MM/YYYYMMDD/filename.md`

---

## Policy Note

Do not log project-specific findings or proposals directly in this guide.

- This file is process documentation only.
- Every concrete bug or feature request must live in a separate file under `bugs/` using the naming rules above.
- If you discover this happened again, move the content into dedicated issue files immediately and leave only this policy note.
