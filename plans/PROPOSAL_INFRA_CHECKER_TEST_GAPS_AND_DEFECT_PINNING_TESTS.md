# PROPOSAL: Close the checker test gaps, and unpin the two tests that certify current defects

**Status: Open**

Created: 2026-09-02
Type: Tooling / Infrastructure
Related diagnostics: `anomaly`, `slow-query-pattern`, `n-plus-one`, `raw-sql-unknown-column`, `getter-table-mismatch`, `data-skew`

---

## Summary

The diagnostic checkers are well covered at the *provider* level but have three specific gaps where a defect can land without any test noticing, and two existing tests that actively assert current defective behaviour as correct. This proposal enumerates both, with the evidence, so a fix agent does not have to rediscover them per bug.

---

## Motivation

Coverage was audited by mapping every file in `extension/src/diagnostics/checkers/` to the tests that exercise it:

```bash
cd extension/src
for f in anomaly-checker column-checker index-checker n-plus-one-checker pk-checker \
         query-pattern-checker raw-sql-column-checker raw-sql-parser raw-sql-tokenizer \
         slow-query-checker table-checker; do
  echo "$f -> $(grep -rl "$f" test/*.ts | tr '\n' ' ')"
done
```

```
anomaly-checker       -> test/anomaly-checker.test.ts
column-checker        -> test/raw-sql-column-checker.test.ts
index-checker         -> NONE          (covered indirectly by schema-provider-index.test.ts)
n-plus-one-checker    -> NONE          (covered indirectly by performance-provider-nplus1.test.ts)
pk-checker            -> NONE          (covered indirectly by schema-provider.test.ts)
query-pattern-checker -> NONE          (covered indirectly by performance-provider.test.ts)
raw-sql-column-checker-> test/raw-sql-column-checker.test.ts
raw-sql-parser        -> test/raw-sql-parser.test.ts
raw-sql-tokenizer     -> NONE          (no direct or indirect coverage)
slow-query-checker    -> NONE          (covered indirectly by performance-provider.test.ts)
table-checker         -> test/table-checker.test.ts
```

The four "covered indirectly" entries are fine as they stand — the provider tests drive the checkers through their real call path, which is arguably better than unit-testing them in isolation. The three items below are the real gaps, and each is already implicated in a filed bug.

---

## Detection / Behavior

### Gap 1 — `raw-sql-tokenizer.ts` has no test of any kind

`blankLiteralsAndComments` is the security-shaped half of the raw-SQL parser: everything downstream assumes literals, comments and quoted identifiers have been masked *with offsets preserved*. It has no direct test, and the parser tests exercise only one masking case (`raw-sql-parser.test.ts:107`, a single-quoted literal containing the word `from`).

Untested behaviours that the parser depends on:

- offsets preserved exactly (a masking off-by-one silently mis-ranges every downstream diagnostic);
- doubled-quote escapes (`'it''s'`);
- an unterminated literal at end of input (the `while` loop's exit condition);
- block comments, including an unterminated `/*`;
- newlines preserved inside masked spans (`out[i] = sql[i] === '\n' ? '\n' : ' '`), which is what keeps line numbers correct.

This same function is the proposed fix vehicle for `045_nl_sql_validator_false_positive_keywords_inside_literals.md`, which would give it a second consumer with a security-adjacent contract. It should not gain that consumer untested.

### Gap 2 — `caller-location-utils.ts` has no test

`resolveCallerLocation` is the sole decision point for where every `slow-query-pattern` and `n-plus-one` diagnostic is pinned, and it is exercised only incidentally through two provider tests (see Gap 3). There is no test for:

- a `package:` input (the normal case — see `025_infra_caller_pinned_diagnostics_use_unresolvable_package_uri.md`);
- a `file:///` input;
- `callerLine` of `0` or `1` (the `Math.max(0, callerLine - 1)` clamp);
- `callerFile` present but `callerLine` absent, and vice versa;
- a malformed path that `Uri.parse` accepts but nothing can open.

### Gap 3 — two tests assert current defects as correct

These are worse than missing tests, because they will fail when the defect is fixed and read as a regression.

**3a. `extension/src/test/anomaly-checker.test.ts:109-124`** — `skips anomalies whose message has no table.column pattern`. Asserts `issues.length === 0` for a `duplicate_rows` anomaly. Its comment justifies the skip as "no Dart location to attach to", which is false: the server sends `'table'`, and the checker already resolves a table-only location. Filed as `046_anomaly_false_negative_duplicate_rows.md`.

*Replacement:* keep the test's real intent (a table-scoped anomaly must not be attached to an arbitrary column getter) and add the positive case (it must be attached to the class line).

**3b. `extension/src/test/performance-provider.test.ts:74-103`** and **`performance-provider-nplus1.test.ts:63`** — both feed `callerFile: 'package:myapp/src/order_io.dart'` and assert only `issue.fileUri.toString().includes('order_io.dart')`. A `package:` URI satisfies that substring while being unopenable in VS Code. Filed as `025_infra_caller_pinned_diagnostics_use_unresolvable_package_uri.md`.

*Replacement:* assert `issue.fileUri.scheme === 'file'` and the full resolved workspace path.

### Should flag (problematic)

A test whose assertion is satisfied by both the correct and the incorrect output:

```ts
assert.ok(issue.fileUri.toString().includes('order_io.dart'));
// passes for file:///w/lib/src/order_io.dart  AND  package:myapp/src/order_io.dart
```

### Should pass (correct)

```ts
assert.strictEqual(issue.fileUri.scheme, 'file');
assert.ok(issue.fileUri.fsPath.endsWith(path.join('lib', 'src', 'order_io.dart')));
```

---

## Edge Cases

1. **Masking tests must assert offsets, not just output text** — a masker that returns the right characters at the wrong offsets passes a naive string comparison and mis-ranges every diagnostic. Assert `output.length === input.length` and spot-check a token's index.
2. **`package:` resolution tests need a workspace fixture** — `resolveCallerLocation` will need `pubspec.yaml`'s `name:` once the linked bug is fixed. The existing `diagnostic-test-helpers.ts` fixture pattern should be extended rather than mocking `vscode.workspace` ad hoc in each test.
3. **Do not convert the four "covered indirectly" checkers to isolated unit tests** — the provider-level tests drive the real call path including the config gating (`ctx.config.categories.runtime`), which an isolated checker test would miss. Add direct tests only where a branch is unreachable from the provider.
4. **Test-count inflation** — per `drift-advisor-testing-and-validation`, a one-file change should not run the whole suite; new files should be addable to a scoped mocha spec.

---

## Alternatives Considered

- **Leave Gap 1 and 2 and rely on provider-level tests.** Rejected: `blankLiteralsAndComments` is about to gain a second consumer in the NL-to-SQL safety gate, where a masking bug is a security-relevant escape, not a false positive.
- **Delete the two defect-pinning tests when the bugs are fixed.** Rejected: 3a encodes a genuine concern (do not attach table-scoped findings to arbitrary columns) that must survive; it needs rewriting, not deleting.

---

## Decision

<!-- Fill in when the proposal is accepted or declined -->

---

## Implementation Notes

Suggested new files:

- `extension/src/test/raw-sql-tokenizer.test.ts` — masking and offset preservation.
- `extension/src/test/caller-location-utils.test.ts` — URI scheme resolution and line clamping.

Suggested edits:

- `extension/src/test/anomaly-checker.test.ts` — rewrite the skip test per 3a.
- `extension/src/test/performance-provider.test.ts`, `performance-provider-nplus1.test.ts` — tighten the caller-pin assertions per 3b.

---

## Commits

<!-- Add commit hashes as implementation lands -->
