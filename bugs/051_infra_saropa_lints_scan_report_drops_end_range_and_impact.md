# BUG: Saropa Lints scan ingestion discards `endLine`/`endColumn`/`impact`, producing one-character squiggles

**Status: Open**

Created: 2026-09-02
Component: Extension
File: `extension/src/saropa-lints-report.ts` (lines ~18-30, ~84-95)
Severity: UX (wrong highlight range) + False negative (dropped severity signal)

---

## Summary

`saropa_lints scan . --format json` emits a full diagnostic span (`endLine`, `endColumn`) and a rule-declared `impact`. Drift Advisor's parser declares neither field on `IScanDiagnostic` and never reads them, so every ingested Lints finding is rendered as a **single-character** range at the start offset. The scanner's own source comment says the end position exists specifically so "the extension" can highlight the full span — that is this extension, and it is not doing it.

---

## Attribution Evidence

The ingestion parser lives in this repo.

```bash
# Positive — the parser IS here (both files)
$ grep -rn "IScanDiagnostic\|endLine\|endColumn\|impact" extension/src/saropa-lints-report.ts extension/src/saropa-lints-diagnostics.ts
extension/src/saropa-lints-report.ts:18:export interface IScanDiagnostic {
extension/src/saropa-lints-diagnostics.ts:26:  type IScanReport,
extension/src/saropa-lints-diagnostics.ts:35:export type { IScanDiagnostic, IScanReport } from './saropa-lints-report';
# 0 matches for endLine / endColumn / impact anywhere in extension/src

$ grep -rn "endLine\|endColumn" extension/src/
# 0 matches

$ grep -rn "saropa_lints" lib/src/
# 0 matches — no Dart emit path; this is a TypeScript-only ingestion surface
```

**Emit site(s) — list ALL:** `extension/src/saropa-lints-report.ts:84` (`toDiagnostic`, builds the range) and `:18` (the interface that omits the fields).
**Diagnostic `source` as seen in Problems panel:** `Saropa Lints` (`extension/src/saropa-lints-report.ts:13`).

### What Drift Advisor declares and builds

```bash
$ sed -n '17,30p' extension/src/saropa-lints-report.ts
/** One finding from the scanner's `--format json` report (schema v1). */
export interface IScanDiagnostic {
  filePath: string;
  /** 1-based line (analyzer convention). */
  line: number;
  /** 1-based column (analyzer convention). */
  column: number;
  ruleName: string;
  /** Analyzer severity name: 'ERROR' | 'WARNING' | 'INFO' (case-insensitive). */
  severity: string;
  problemMessage?: string | null;
  correctionMessage?: string | null;
}

$ sed -n '83,93p' extension/src/saropa-lints-report.ts
function toDiagnostic(d: IScanDiagnostic): vscode.Diagnostic {
  // Analyzer line/column are 1-based; VS Code ranges are 0-based. Clamp so a
  // 0/negative coordinate (defensive against a malformed report) can't throw.
  const line = Math.max(0, d.line - 1);
  const col = Math.max(0, d.column - 1);
  // No length is reported, so highlight a single character at the location;
  // VS Code widens to the token under the cursor when needed.
  const range = new vscode.Range(line, col, line, col + 1);
```

The comment "No length is reported" is the stale assumption. It **is** reported.

### What saropa_lints actually emits (cross-repo, positive)

```bash
$ sed -n '18,27p' D:/src/saropa_lints/lib/src/scan/scan_json.dart
/// Serializes [diagnostics] to the same JSON structure used by
/// `dart run saropa_lints scan --format json`.
///
/// Schema:
/// - `version`: 1 (int)
/// - `diagnostics`: list of objects with: filePath, line, column, endLine,
///   endColumn, ruleName, severity, problemMessage, correctionMessage (opt)
/// - `summary`: object with totalCount, byFile (map filePath -> count),
///   byRule (map ruleName -> count)
/// - `failOn` (optional): object with `threshold` and `thresholdMet` when
///   `--fail-on` is active — explains why exit code may differ from the
///   diagnostic list contents.

$ sed -n '33,47p' D:/src/saropa_lints/lib/src/scan/scan_json.dart
          'filePath': d.filePath,
          'line': d.line,
          'column': d.column,
          'endLine': d.endLine,
          'endColumn': d.endColumn,
          'ruleName': d.ruleName,
          'severity': d.severity,
          // Rule-declared impact when available (null for non-saropa rules).
          'impact': d.impact,
          'problemMessage': d.problemMessage,
          'correctionMessage': d.correctionMessage,
```

And the reason the field exists, in the scanner's own words:

```bash
$ sed -n '809,822p' D:/src/saropa_lints/lib/src/scan/scan_runner.dart
    for (final d in listener.diagnostics) {
      final loc = unit.lineInfo.getLocation(d.offset);
      // End position lets the extension highlight the full diagnostic span
      // instead of a single character (which triggers "find all occurrences").
      final endLoc = unit.lineInfo.getLocation(d.offset + d.length);
```

Semantics are unambiguous — 1-based, `endColumn` exclusive:

```bash
$ sed -n '30,42p' D:/src/saropa_lints/lib/src/scan/scan_diagnostic.dart
  /// 1-based end line (inclusive).
  final int endLine;

  /// 1-based end column (exclusive — one past the last highlighted character).
  final int endColumn;
  final String severity;
  final String? problemMessage;
  final String? correctionMessage;

  /// Rule-declared impact level (error, warning, info), independent of the
  /// analyzer severity. Null for non-saropa diagnostics that have no impact.
  final String? impact;
```

The severity mapping *is* correct, for the record — `scan_runner.dart:825: severity: d.diagnosticCode.severity.name` yields `ERROR`/`WARNING`/`INFO`, which `mapScanSeverity` upper-cases and matches. Only the range and `impact` are dropped.

---

## Environment

- OS: Windows 11 Pro 10.0.22631
- Extension version: 4.2.5
- `saropa_lints` package version: pinned at `^15.2.8` in this repo's own `pubspec.yaml` dev_dependencies
- Command used: `driftViewer.runSaropaLintsDiagnostics`
- Relevant non-default settings: none — the workspace only needs `saropa_lints` in `dev_dependencies`.

---

## Steps to Reproduce

1. Open a Dart workspace with `saropa_lints: ^15.2.8` in `dev_dependencies` and at least one rule violation spanning more than one character (any rule flagging an identifier, a method call, or a whole statement).
2. Run **Command Palette → Saropa Lints: Run Diagnostics** (`driftViewer.runSaropaLintsDiagnostics`).
3. Look at the squiggle in the editor for any published finding.

For a direct comparison of the two shapes:

```bash
dart run saropa_lints scan . --format json
# each diagnostics[] entry carries endLine, endColumn, impact
```

---

## Expected Behavior

The squiggle covers the diagnostic's real span — from `(line, column)` to `(endLine, endColumn)` — matching what the analyzer plugin shows for the same rule and what the scanner explicitly provides the data for.

---

## Actual Behavior

A one-character squiggle at the start position. VS Code's widening (which the code comment relies on) resolves to the token under the cursor, which is not the same thing: for a finding that spans a whole argument list, a chained call, or a multi-line expression it under-highlights, and per the scanner's comment it is what "triggers 'find all occurrences'" behavior.

Separately, `impact` — the rule-declared level, deliberately independent of analyzer severity — is discarded entirely, so a rule configured at `INFO` severity but declaring high impact is indistinguishable from any other info.

---

## Error Output

None. `JSON.parse` succeeds and unknown fields are ignored, so the loss is silent.

---

## Duplicate-Emission Check

Two consumers of the same `saropa_lints` findings exist, but they do not duplicate: the Lints extension publishes into its own collection, and this repo publishes into a collection named `saropa-lints` (`extension/src/saropa-lints-diagnostics.ts:37`) only on explicit user command. There is no Dart emit path here (`grep -rn "saropa_lints" lib/src/` → 0 matches). The bug is loss of fidelity, not duplication.

---

## Minimal Reproducible Example

Scanner output for one finding (fields present):

```json
{ "filePath": "lib/main.dart", "line": 12, "column": 7,
  "endLine": 12, "endColumn": 34,
  "ruleName": "some_rule", "severity": "WARNING", "impact": "warning",
  "problemMessage": "…", "correctionMessage": "…" }
```

Range Advisor builds: `new vscode.Range(11, 6, 11, 7)` — one character.
Range it should build: `new vscode.Range(11, 6, 11, 33)` — 27 characters.

---

## What I Already Tried

- [x] Grepped `extension/src/` for `endLine`/`endColumn`/`impact` — 0 matches; the fields are not read anywhere, not just unread in `toDiagnostic`.
- [x] Verified the scanner emits them unconditionally (not behind a flag) — `scan_json.dart:36-41` builds them into every entry with no conditional.
- [x] Verified the coordinate conventions match (both 1-based; `endColumn` exclusive, which is exactly what `vscode.Range` wants after the −1 shift).
- [x] Confirmed the severity mapping is *not* affected — that path is correct.

---

## Regression Info

- Last working version: never — Advisor's parser was written against an earlier scan schema that had no end position.
- First broken version: the `saropa_lints` release that added `endLine`/`endColumn` (the fields are present in 15.2.8; the comment at `scan_runner.dart:811` shows they were added *for* an extension consumer).
- What changed: the producer widened its schema additively; the consumer never picked the fields up. Because the widening was additive, nothing failed loudly.

---

## Root Cause

<!-- Fill in during investigation. -->

Stale assumption encoded as a comment: `saropa-lints-report.ts:88` states "No length is reported", which was true of an older `scan --format json` and is not true of schema v1 as shipped in `saropa_lints` 15.2.8. The interface `IScanDiagnostic` was written to match that older shape and never revisited.

---

## Changes Made

<!-- Fill in when a fix is written. -->

Suggested shape:

1. Add `endLine?: number` and `endColumn?: number` to `IScanDiagnostic` as **optional**, so an older scanner that omits them still parses.
2. In `toDiagnostic`, build the range from the end position when both are present and produce a range that is not before the start; fall back to the current `col + 1` single-character range otherwise. Keep the existing clamping.
3. Add `impact?: string | null` and surface it — at minimum append it to the diagnostic message or carry it on `diag.code`, so the rule-declared level is not lost.
4. Consider reading the optional root-level `failOn` object (`scan_json.dart:66`) so the Output-channel summary can explain a non-zero exit that has an empty diagnostics array.
5. Regression test in `extension/src/test/` over `mapReportToFileDiagnostics` with a fixture carrying an end position, asserting the multi-character range.

---

## Commits

<!-- Add commit hashes as fixes land. -->

---

## Impact

- Who is affected: every user of `driftViewer.runSaropaLintsDiagnostics`.
- What is blocked: accurate inline highlighting for Lints findings surfaced through Advisor, and any use of the rule-declared `impact` level.
- Data risk: none.
- Frequency: every published finding, 100%.
