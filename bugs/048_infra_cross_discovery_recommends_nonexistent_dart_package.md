# BUG: Suite cross-discovery keys the Log Capture recommendation on a Dart package that does not exist

**Status: Open**

Created: 2026-09-02
Component: Extension
File: `extension/src/suite/cross-discovery.ts` (lines ~36-42)
Severity: False negative (dead code path — the recommendation can never fire)

---

## Summary

`maybeRecommendSuiteTools()` offers to install a sibling extension when the workspace's `pubspec.yaml` declares that sibling's **Dart package**. That works for Saropa Lints, which is a real pub package. It cannot work for Saropa Log Capture: the trigger package is `saropa_log_capture`, and Log Capture is a pure TypeScript VS Code extension with no Dart package at all. Half the cross-discovery feature is unreachable.

---

## Attribution Evidence

The recommendation table lives in this repo.

```bash
# Positive — the sibling table IS here
$ grep -n -A12 "const SIBLINGS" extension/src/suite/cross-discovery.ts
31:const SIBLINGS: readonly SiblingTool[] = [
32-  {
33-    package: 'saropa_lints',
34-    extensionId: 'saropa.saropa-lints',
35-    gateKey: 'suite.crossRecommend.saropa-lints',
36-    messageKey: 'host.suite.recommend.lints',
37-  },
38-  {
39-    package: 'saropa_log_capture',
40-    extensionId: 'saropa.saropa-log-capture',
41-    gateKey: 'suite.crossRecommend.saropa-log-capture',
42-    messageKey: 'host.suite.recommend.logCapture',
43-  },
44-];

$ grep -rn "saropa_log_capture" lib/src/
# 0 matches — no Dart-side involvement
```

**Emit site(s) — list ALL:** `extension/src/suite/cross-discovery.ts:39` (the `package` value) and `:57` (`pubspecDeclaresPackage`, the predicate it feeds).

### The trigger condition

```bash
$ sed -n '51,58p' extension/src/suite/cross-discovery.ts
/**
 * True when [pubspecText] declares [pkg] as a dependency — a `<pkg>:` entry on an
 * indented line. Pure and exported for tests. Requires the `:` right after the
 * name so a longer package (`saropa_lints_extra`) or a mention inside a comment
 * does not false-positive.
 */
export function pubspecDeclaresPackage(pubspecText: string, pkg: string): boolean {
  return new RegExp(`^\\s+${escapeRegExp(pkg)}\\s*:`, 'm').test(pubspecText);
}
```

The recommendation fires only if a `pubspec.yaml` line matches `^\s+saropa_log_capture\s*:`.

### Cross-repo proof: no such Dart package exists

Log Capture ships no pubspec, so it is not a Dart package:

```bash
$ ls D:/src/saropa-log-capture/pubspec.yaml
ls: cannot access 'D:/src/saropa-log-capture/pubspec.yaml': No such file or directory

$ find D:/src/saropa-log-capture -maxdepth 2 -name "pubspec.yaml" -not -path "*/node_modules/*"
# 0 matches
```

It is a VS Code extension:

```bash
$ grep -n '"name"\|"publisher"\|"version"\|"main"' D:/src/saropa-log-capture/package.json
3397:  "main": "./dist/extension.js",
3399:  "name": "saropa-log-capture",
3400:  "publisher": "saropa",
3450:  "version": "9.3.12"
```

And no package of that name exists anywhere in the local Saropa workspace:

```bash
$ grep -rn "^name:" D:/src/*/pubspec.yaml | grep -i "log"
# 0 matches
```

Contrast with the Lints entry, which is correct — `saropa_lints` is a real Dart package, and this very repo depends on it:

```bash
$ grep -n -A3 "^dev_dependencies" pubspec.yaml
dev_dependencies:
  saropa_lints: ^15.2.8
  test: ^1.31.1
```

### Corroboration: the sibling itself keys off a different signal

Log Capture recommends *its own* Drift adapter from the real Drift packages, not from a fictional `saropa_log_capture`:

```bash
$ sed -n '27,30p' D:/src/saropa-log-capture/src/modules/misc/adapter-recommendations.ts
# (recommends the driftAdvisor adapter when drift / moor / drift_dev is in pubspec)
```

That is the pattern Advisor's entry should follow.

---

## Environment

- OS: Windows 11 Pro 10.0.22631
- Extension version: 4.2.5
- Saropa Log Capture version: 9.3.12
- Relevant non-default settings: none — `maybeRecommendSuiteTools` runs fire-and-forget from activation.

---

## Steps to Reproduce

1. In a fresh VS Code profile, install **only** `saropa.drift-viewer` (no Log Capture).
2. Open any Flutter/Dart workspace that uses Drift.
3. Wait for activation to complete (`onStartupFinished`).
4. Observe: no "install Saropa Log Capture" offer, regardless of the workspace's contents — because no real pubspec can contain `saropa_log_capture`.
5. For the control case, add `saropa_lints: ^15.2.8` to `dev_dependencies`, clear `suite.crossRecommend.saropa-lints` from globalState, reload — the Lints offer appears, proving the mechanism itself works.

---

## Expected Behavior

A user who is clearly a Log Capture candidate — a Drift app being debugged in VS Code — is offered the Log Capture extension once, the same way a `saropa_lints` user is offered the Lints extension.

---

## Actual Behavior

The Log Capture branch of `SIBLINGS` is unreachable. `recommendableSiblings()` filters it out at the first predicate on every workspace that has ever existed.

---

## Error Output

None. The function is explicitly best-effort and silent (`// Advisory only — never surface into the activation path.`), so a permanently-false predicate is indistinguishable from "user already declined".

---

## Duplicate-Emission Check

Not a diagnostic. One table (`extension/src/suite/cross-discovery.ts:31`); no Dart counterpart (`grep -rn "saropa_log_capture" lib/src/` → 0 matches).

---

## Minimal Reproducible Example

```ts
// Pure function, exported for tests — no VS Code needed:
recommendableSiblings(
  'dependencies:\n  drift: ^2.31.0\n  sqlite3: ^2.4.6\n',
  () => false,   // nothing installed
  () => false,   // nothing gated
);
// Returns [] — the Log Capture entry never matches.
// No possible pubspec text makes it match, because the package does not exist.
```

---

## What I Already Tried

- [x] Confirmed Log Capture has no `pubspec.yaml` anywhere in its tree (excluding `node_modules`) — 0 matches.
- [x] Confirmed no Dart package named `saropa_log_capture` exists in the local `D:/src` workspace — 0 matches on `^name:`.
- [x] Confirmed the extension id in the same entry (`saropa.saropa-log-capture`) **is** correct against `package.json:3399,3400`, so only the `package` field is wrong.
- [x] Confirmed the sibling entry for Lints is fully correct, so the mechanism is sound and the fix is a one-field / one-predicate change.

---

## Regression Info

- Last working version: never fired.
- First broken version: the release that introduced `extension/src/suite/cross-discovery.ts` (plan 67 Phase 6).
- What changed: the table was written by symmetry with the Lints entry — "sibling tool ⇒ sibling Dart package" — but Log Capture has no Dart half, so the symmetry does not hold.

---

## Root Cause

<!-- Fill in during investigation. -->

A false assumption baked into the data model: `SiblingTool.package` presumes every suite tool ships a Dart package whose presence in `pubspec.yaml` signals adoption. Two of the four suite members (Log Capture, Workspace) are editor-only tools with no pub presence, so the "declared package" signal does not exist for them.

---

## Changes Made

<!-- Fill in when a fix is written. -->

Suggested shape:

1. Widen the trigger from one package name to a list of trigger packages, and point the Log Capture entry at the packages that actually indicate a candidate — `drift`, `drift_dev`, `moor` — matching what Log Capture itself already uses to recommend its Drift adapter.
2. Alternatively, if a pubspec signal is genuinely wrong for an editor-only tool, drop the Log Capture entry rather than leave dead code that reads as shipped behavior.
3. Whichever is chosen, add a test asserting the Log Capture entry is selectable from *some* realistic pubspec text — the current tests can only ever assert the Lints path, which is why this survived.

Note: `SiblingTool.package` is a private interface in this file, so widening it is not a public-API change.

---

## Commits

<!-- Add commit hashes as fixes land. -->

---

## Impact

- Who is affected: every Drift Advisor user who does not already have Log Capture installed — i.e. everyone who installed Advisor standalone rather than via the Saropa Suite pack.
- What is blocked: half of plan 67 Phase 6 (cross-tool discovery). The feature ships, is documented, and does nothing for one of its two targets.
- Data risk: none.
- Frequency: 100% — the branch has never been reachable.
