# PROPOSAL: Adopt `saropa_dart_utils` helpers in place of hand-rolled code in `lib/src/` — evidence and verdict

**Status: Open**

Created: 2026-09-02
Type: Infrastructure
Related diagnostics: none

---

## Summary

Filed to record a **negative** result with its evidence, so it is not re-proposed. `saropa_dart_utils` is a large, well-catalogued sibling library and looks like an obvious source of replacements for hand-rolled helpers here. It is not one: this package has a zero-runtime-dependency policy, the sibling pulls in the Flutter SDK plus four packages, and the hand-rolled helpers that would actually be replaced are on the TypeScript side where a Dart library cannot reach them. Recommend **Declined**.

---

## Motivation

The obvious version of this proposal is attractive on its face:

```bash
$ head -6 D:/src/saropa_dart_utils/CAPABILITIES.md
# Capabilities Index

**Release 1.6.3** · Generated 2026-06-14

A complete, per-symbol catalog of every public utility in `saropa_dart_utils` — for teams evaluating or adopting the library. Covers **2622 public symbols** across **476 files**.
```

2622 symbols across Collections, DateTime, Parsing, Number, and String categories, from the same publisher, already depended on by the flagship consumer:

```bash
$ grep -n "saropa_dart_utils" D:/src/contacts/pubspec.yaml
515:  saropa_dart_utils: ^1.6.3
```

Three independent facts kill it.

---

## Detection / Behavior

### Blocker 1 — this package has zero runtime dependencies, deliberately

```bash
$ sed -n '32,43p' pubspec.yaml
dependencies:
  # !! KEEP THIS LIST MINIMAL !!
  # This package ships inside consumer apps. Every
  # dependency here increases their install size and
  # attack surface. Add features to the VS Code
  # extension (extension/) instead of adding packages
  # here. Before adding a dependency, exhaust
  # dart:* standard library alternatives first.
  # (No runtime dependencies: Bearer auth uses plain
  # in-memory token comparison; Basic auth uses
  # dart:convert base64 only.)
```

The `dependencies:` block is empty. Not "small" — empty. The policy is explicit, reasoned, and enforced by a comment that pre-empts exactly this proposal ("exhaust `dart:*` standard library alternatives first").

### Blocker 2 — `saropa_dart_utils` is a Flutter package, and this one is pure Dart

```bash
$ sed -n '/^dependencies:/,/^dev_dependencies:/p' D:/src/saropa_dart_utils/pubspec.yaml | grep -v "^\s*#"
dependencies:
  characters: ^1.4.1

  collection: ^1.19.1

  flutter:
    sdk: flutter

  intl: ^0.20.2

  jiffy: ^6.4.5

  meta: ^1.18.0

$ grep -n "^  sdk\|^  flutter" D:/src/saropa_dart_utils/pubspec.yaml
16:  sdk: ">=3.9.0 <4.0.0"
17:  flutter: ">=3.41.4"

$ grep -rln "package:flutter/" D:/src/saropa_dart_utils/lib/ | wc -l
16
```

It depends on the Flutter SDK and 16 of its library files import `package:flutter/`.

This package's environment declares no Flutter constraint at all, and its `lib/` tree contains exactly one occurrence of the string `package:flutter/` — inside a string comparison, not an import:

```bash
$ grep -n -A4 "^environment" pubspec.yaml
29:environment:
30-  sdk: ">=3.9.0 <4.0.0"

$ grep -rn "package:flutter/" lib/
lib/src/server/server_context.dart:665:      if (file.startsWith('dart:') || file.startsWith('package:flutter/')) {
```

Adding `saropa_dart_utils` would make `saropa_drift_advisor` a Flutter-only package. It would stop resolving under plain `dart pub get`, and `dart test` — this repo's test command for the pure-Dart suite — would break. That is a categorical incompatibility, not a cost to weigh.

This also rules out the "dev_dependencies only, for tests" carve-out: a dev dependency on a Flutter package still forces Flutter into the resolution of a package that currently has none.

### Blocker 3 — the overlap that exists is on the TypeScript side

The search for hand-rolled helpers a Dart utility library could replace comes up nearly empty in `lib/`:

```bash
$ ls lib/src/ lib/src/server/ | grep -i "util\|helper"
server_utils.dart

$ grep -rn "String _toCamel\|toPascal\|_camelCase\|_snakeCase\|_pascal" lib/src/
# 0 matches
```

The case-conversion helpers — the single most plausible overlap with a general-purpose string library — exist only in the extension:

```bash
$ grep -n "^export function" extension/src/dart-names.ts
10:export function snakeToPascal(name: string): string {
21:export function snakeToCamel(name: string): string {
26:export function escapeRegex(s: string): string {
```

`extension/src/` is TypeScript. A Dart package cannot replace a line of it.

### Should pass (correct)

The status quo. `lib/src/` uses `dart:core`, `dart:io`, and `dart:convert` only, and the extension uses its own local TypeScript helpers.

---

## Edge Cases

1. **`saropa_dart_utils` publishing a pure-Dart subset package** — would reopen this. If a `saropa_dart_utils_core` with no Flutter constraint ever ships, Blocker 2 falls and the proposal is worth re-examining; Blocker 1 would still apply and would still need an explicit owner exception.
2. **A test-only helper need that `dart:*` genuinely cannot cover** — still blocked by Blocker 2 (Flutter in dev resolution). The correct move is a private helper under `test/`, not a dependency.
3. **The reverse direction** — `saropa_dart_utils` adopting something from here. Not applicable: this package is a debug server, not a utility library, and exports nothing general-purpose.

---

## Alternatives Considered

- **Vendor (copy) individual functions from `saropa_dart_utils` into `lib/src/`.** Rejected on the evidence above: there is nothing in `lib/src/` to replace. The `grep` for hand-rolled case conversion, and the single `*_utils.dart` file, are the whole surface. Copying code to solve a problem that does not exist adds a silent divergence risk for no gain.
- **Port the TypeScript helpers to consume a Dart utility via a subprocess.** Not seriously considered; noted only to close it off. `extension/src/dart-names.ts` is 28 lines of string handling on a hot path (it runs per table, per column, during navigation and codegen). Shelling out to Dart to lower-case a string is not a trade anyone should make.
- **Share the naming logic across the three Saropa extensions as an npm package.** This is a real idea, but it is a *TypeScript* idea and has nothing to do with `saropa_dart_utils`. It is covered separately in `bugs/067_proposal_infra_publish_canonical_table_to_dart_name_mapping.md`, which documents an actual behavioral divergence between this repo's `snakeToCamel` and the Saropa Lints extension's `toCamelCase`.

---

## Decision

**Recommend: Declined.**

Rationale, in one line each:

1. `pubspec.yaml` declares zero runtime dependencies under an explicit, reasoned policy; adopting the library requires overturning that policy.
2. `saropa_dart_utils` 1.6.3 requires the Flutter SDK; this package is pure Dart with no Flutter constraint, so adoption changes what kind of package this is and breaks `dart test`.
3. `lib/src/` has no hand-rolled utility code the library would replace — the only real overlap is in `extension/src/` (TypeScript), which is out of reach for a Dart package.

Any two of these would be enough. Re-open only if a pure-Dart subset of `saropa_dart_utils` is published **and** the owner grants an explicit exception to the zero-dependency policy.

---

## Implementation Notes

Not applicable — no implementation proposed.

---

## Commits

<!-- Add commit hashes as implementation lands -->
