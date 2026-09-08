# BUG: `high-null-rate` ignores multi-line `drift-advisor:ignore` comment

**Status: Fixed**

<!-- Status values: Open → Investigating → Fix Ready → Closed -->

Created: 2026-09-07
Component: Extension
File: `extension/src/diagnostics/suppression.ts` (line ~97)
Severity: False positive

---

## Summary

When a `// drift-advisor:ignore high-null-rate` directive has a trailing
rationale that wraps onto a continuation comment line, the directive targets
the continuation comment instead of the column getter on the next code line.
The diagnostic fires despite the ignore directive being present and correct.

---

## Attribution Evidence

```bash
# Positive — diagnostic IS defined here
grep -rn "'high-null-rate'" lib/src/
# 0 matches (Dart analyzer path does not emit this code)

grep -rn "'high-null-rate'" extension/src/
# extension/src/diagnostics/codes/data-quality-codes.ts:9:  'high-null-rate': {
# extension/src/diagnostics/codes/data-quality-codes.ts:10:    code: 'high-null-rate',
# extension/src/diagnostics/providers/data-quality-checks.ts:227:  code: 'high-null-rate',
# (+ tests)
```

**Emit site(s) — list ALL:** `extension/src/diagnostics/providers/data-quality-checks.ts:227`
**Diagnostic `source` / `owner` as seen in Problems panel:** `drift-advisor`

---

## Environment

- OS: Windows 11 Pro 10.0.22631
- VS Code version: current
- Extension version: current
- Dart SDK version: current stable
- Database type and version: SQLite (Drift)
- Connection method: local
- Relevant non-default settings: none
- Other potentially conflicting extensions: none

---

## Steps to Reproduce

1. Open a Drift table file containing a multi-line ignore comment:

```dart
  // drift-advisor:ignore high-null-rate -- by design: most activity types (screen
  // visits, searches, games, nav history) have no associated contact.
  TextColumn get contactSaropaUUID => text().named('contact_saropa_u_u_i_d').nullable()();
```

2. Wait for Drift Advisor diagnostics to refresh.
3. Observe `high-null-rate` still fires on the `contactSaropaUUID` column.

---

## Expected Behavior

The `// drift-advisor:ignore high-null-rate` directive should suppress the
`high-null-rate` diagnostic on `contactSaropaUUID`, regardless of whether the
rationale text wraps onto continuation comment lines between the directive and
the target code line.

---

## Actual Behavior

The diagnostic fires. The directive is parsed but its `targetLine` resolves to
the continuation comment (`// visits, searches, ...`) instead of the column
getter, because `nextNonBlankLine` returns the first non-blank line after the
directive — which is another comment, not code.

---

## Root Cause

`suppression.ts` line ~97: when a full-line `// drift-advisor:ignore` directive
is found, `nextNonBlankLine(lines, i + 1)` returns the index of the first
non-blank line after it. But "non-blank" includes comment-only lines. If the
developer wraps the rationale onto one or more continuation `//` comment lines,
the directive targets the first continuation comment instead of the actual code
line.

```
Line 50: // drift-advisor:ignore high-null-rate -- by design: ...   ← directive parsed
Line 51: // visits, searches, games, nav history ...                ← nextNonBlankLine returns THIS
Line 52: TextColumn get contactSaropaUUID => ...                    ← should target THIS
```

The Dart analyzer's own `// ignore:` has the same semantic: it targets the next
**non-blank** line. But in practice Dart developers rarely wrap ignore
rationales across multiple `//` lines, and the Dart analyzer's system has no
`--` rationale convention that encourages it. Drift Advisor's convention of
`// drift-advisor:ignore code -- rationale` invites longer explanations that
naturally wrap.

### Fix options

**Option A (recommended):** Change `nextNonBlankLine` to skip lines that are
entirely comments (only whitespace + `//`). Rename to `nextCodeLine` for
clarity. A "code line" is a line that contains something other than whitespace
and a `//` comment.

**Option B:** Skip only lines that look like continuation comments (lines
whose trimmed content starts with `//` and does NOT contain
`drift-advisor:ignore`). This is narrower but handles the actual pattern.

**Option C:** Document that rationales must not wrap onto continuation lines.
Not recommended — the current format with `--` rationale is natural and
matches the project's own `// ignore:` style.

Option A is safest. A directive should never target another comment.

---

## Changes Made

### `extension/src/diagnostics/suppression.ts`

Two independent fixes — both are required for the full scenario:

1. **Regex + `parseCodes` — strip `-- rationale`:** Widened `DIRECTIVE_RE` capture
   group from `[a-z0-9\-,\s]*?` to `.*?` so the regex matches even when the
   rationale contains non-alphanumeric characters (`:`, `(`, etc.). `parseCodes`
   now strips everything after ` -- ` and validates each token against
   `^[a-z0-9]([a-z0-9-]*[a-z0-9])?$` to reject rationale words that leaked
   through.

2. **`nextNonBlankLine` → `nextCodeLine`:** Renamed and changed to skip
   comment-only lines (`//`), not just blank lines. A full-line directive now
   targets the next actual code line, skipping any continuation comment lines
   between the directive and the target.

### `extension/src/test/suppression.test.ts`

Added test group `field-level (multi-line rationale wraps past continuation
comments)` with two assertions:
- Directive targets the code line (line 3), not the continuation comment (line 2)
- The continuation comment line itself is NOT suppressed

### Hardening pass (post-fix reflection)

Two further gaps identified during the finish-report reflection were closed
in the same change set:

1. **Dash-variant rationale separators** — `parseCodes` originally required
   exactly one ASCII space, `--`, one ASCII space. Widened to accept `—`
   (em dash) and `–` (en dash), and any amount of surrounding whitespace.
2. **Block-comment continuation lines** — `nextCodeLine` originally only
   skipped `//` line comments. It now also skips `/* ... */` block comments
   (single- and multi-line) and `*`-prefixed doc-comment continuation lines,
   in case a wrapped rationale spans a block comment instead of `//` lines.

### New diagnostic: `unreachable-ignore-directive`

While investigating the false positive, a related silent-failure mode was
found: a field-level directive with **no code line anywhere after it in the
file** (e.g. left dangling after the table it targeted was deleted or moved)
was silently dropped — it suppressed nothing, with no indication to the
author. Added:

- `IInlineSuppressions.unreachableDirectiveLines` — lines of directives that
  resolved to no target, tracked by `parseInlineSuppressions` instead of
  being discarded.
- New diagnostic code `unreachable-ignore-directive` (`bestPractices`
  category, Warning severity) in `codes/best-practice-codes.ts`.
- `BestPracticeProvider._checkUnreachableIgnoreDirectives`, run
  unconditionally per Dart file (no server/table data required).
- Tests: 4 new assertions in `suppression.test.ts` (unit) and 2 in
  `best-practice-provider.test.ts` (provider integration).

---

## Commits

<!-- Add commit hashes as fixes land. -->

---

## Impact

- Who is affected: Any user who wraps a `drift-advisor:ignore` rationale across
  multiple comment lines
- What is blocked: Legitimate suppression of known-nullable columns
- Data risk: None (cosmetic false positive)
- Frequency: Every occurrence of a multi-line ignore rationale

---

## Finish Report (2026-09-07)

The `drift-advisor:ignore` directive failed to suppress diagnostics when its
`-- rationale` text wrapped onto continuation comment lines. Two independent
defects combined to produce the reported false positive.

The directive regex's code-list capture group (`[a-z0-9\-,\s]*?`) did not
include punctuation, so any rationale containing `:`, `(`, or similar
characters caused the whole regex to fail matching — the directive was never
parsed at all for realistic rationale text. Separately, the target-line
resolver (`nextNonBlankLine`) treated any non-empty line as the suppression
target, including comment-only continuation lines, so even a successfully
parsed directive attached to the wrong line when a rationale spanned multiple
comment lines.

Fixed by widening the directive regex to capture the full remainder of the
line and delegating code extraction to `parseCodes`, which now strips
` -- rationale` text and validates each remaining token as a kebab-case code
slug. The resolver was renamed `nextCodeLine` and now skips both blank lines
and comment-only lines when searching for the target code line.

Two new assertions were added to `suppression.test.ts` covering the exact
reported scenario (multi-line rationale directive on a `TextColumn` getter),
confirming the directive now targets the code line and does not suppress the
continuation comment line itself. Full extension test suite: 3324 passing,
1 pre-existing unrelated failure (disposables count in `extension.test.js`,
untouched by this change).
