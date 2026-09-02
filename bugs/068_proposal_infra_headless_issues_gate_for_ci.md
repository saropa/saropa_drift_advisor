# PROPOSAL: A headless issues gate — read `.saropa/diagnostics/advisor.json` and exit non-zero, matching the `saropa_lints` quality-gate pattern

**Status: Open**

Created: 2026-09-02
Type: Tooling
Related diagnostics: all `/api/issues` issues

---

## Summary

Drift Advisor's findings can only be reached through a running debug server plus the VS Code extension. There is no command-line entry point at all, so a project cannot fail CI on "the app introduced 40 new orphan tables" the way it already can on lint violations. The offline mirror the extension writes — `.saropa/diagnostics/advisor.json` — is a complete, versioned, on-disk copy of those findings, and a small gate over it closes the gap without needing a server in CI.

---

## Motivation

### Advisor has no CLI surface whatsoever

```bash
$ ls bin/
ls: cannot access 'bin/': No such file or directory

$ grep -n -A6 "^executables" pubspec.yaml
# 0 matches — no executables block

$ ls scripts/
__pycache__/
check_stale_overrides.py
l10n.py
modules/
publish.py
run_example.py
tests/
translate_l10n.py
```

Every script in `scripts/` is repo maintenance (publishing, l10n, stale-override checks). None reads or reports issues. So the only path from "Advisor found a problem" to "a human or a pipeline knows" is: run the app in debug, attach VS Code, open a panel.

### The sibling already solved this shape

`saropa_lints` ships both a scanner and a gate as `pubspec` executables:

```bash
$ grep -n -A10 "^executables" D:/src/saropa_lints/pubspec.yaml
33:executables:
34-  # Primary entrypoint dispatching to all saropa_lints tooling subcommands.
35-  saropa_lints: saropa_lints
36-  # Generates analysis_options.yaml with explicit per-rule configuration.
37-  init: init
38-  # Writes analysis_options.yaml from a chosen tier + analysis_options_custom.yaml.
39-  write_config: write_config
40-  # Snapshots existing violations so only NEW lints are reported going forward.
41-  baseline: baseline
42-  # Baseline snapshot of diagnostic statistics for run-to-run comparisons.
43-  diagnostic_baseline: diagnostic_baseline
```

And the gate is a plain "read a JSON summary, compare against a YAML config, exit 0/1/2":

```bash
$ sed -n '9,12p' D:/src/saropa_lints/bin/quality_gate.dart
/// CLI for [QualityGateEvaluator]: reads `violations.json` summary and gate config,
/// prints PASS / FAIL / WARN, exits 0 (pass or no config), 1 (breach with fail), 2 (errors).

$ sed -n '28,37p' D:/src/saropa_lints/bin/quality_gate.dart
  final reportPath =
      _readOption(args, '--report') ??
      _readOption(args, '-r') ??
      'reports/.saropa_lints/violations.json';
  final configPath =
      _readOption(args, '--config') ??
      _readOption(args, '-c') ??
      'saropa_quality_gate.yaml';
```

There is even a config-file convention already published for it:

```bash
$ ls D:/src/saropa_lints/saropa_quality_gate.yaml.example
D:/src/saropa_lints/saropa_quality_gate.yaml.example
```

### The input file already exists on disk, in the right shape

The extension writes Advisor's findings to a workspace file on every data-change tick:

```bash
$ sed -n '28,30p' extension/src/suite/diagnostics-mirror.ts
const MIRROR_DIR = '.saropa/diagnostics';
const MIRROR_FILE = 'advisor.json';
```

It is the canonical Saropa Diagnostic Envelope — versioned, producer-stamped, with a `category` and `severity` on every entry:

```bash
$ sed -n '415,420p' lib/src/server/analytics_handler.dart
    return <String, dynamic>{
      ServerConstants.jsonKeySchemaVersion: ServerConstants.issuesSchemaVersion,
      ServerConstants.jsonKeyProducer: <String, dynamic>{
        ServerConstants.jsonKeyName: ServerConstants.productName,
        ServerConstants.jsonKeyVersion: ServerConstants.packageVersion,
      },
```

And Advisor already accumulates per-commit counts next to it:

```bash
$ grep -n "recordCommitSnapshot" extension/src/suite/diagnostics-mirror.ts
25:import { recordCommitSnapshot } from './commit-history-store';
```

So the data a gate needs is already produced, already durable, and already committed to a stable schema. What is missing is the ten lines that read it and set an exit code.

---

## Detection / Behavior

A `dart run saropa_drift_advisor gate` (or a `scripts/issues_gate.py`, see Alternatives) that reads the mirror and evaluates thresholds.

### Should flag (problematic)

```yaml
# saropa_drift_gate.yaml
drift_advisor_gate:
  conditions:
    - metric: severity.error
      operator: ">"
      threshold: 0
      action: fail
    - metric: category.schema
      operator: ">"
      threshold: 5
      action: warn
```

```
$ dart run saropa_drift_advisor gate
Saropa Drift Advisor gate — reports/.saropa/diagnostics/advisor.json
  producer: saropa_drift_advisor 4.2.5   generatedAt: 2026-09-02T10:14:02Z
  FAIL  severity.error  3 > 0
  WARN  category.schema 7 > 5
exit 1
```

### Should pass (correct)

```
$ dart run saropa_drift_advisor gate
Saropa Drift Advisor gate — no conditions configured (saropa_drift_gate.yaml absent).
exit 0
```

Absent config must be exit 0, matching `quality_gate.dart`'s "Missing file or empty conditions: not an error (nothing to enforce)."

---

## Edge Cases

1. **Mirror file absent** — needs discussion, and it is the important one. `quality_gate.dart` exits 2 on a missing report. For Advisor, absence is the *normal* state on a machine that has never run the app in debug, so a hard failure would break every CI job that merely has the config file. Proposed: exit 0 with a clear "no mirror found — Advisor findings not evaluated" line, and a `--require-report` flag for teams that want absence to be a failure.
2. **Stale mirror** — should flag. The mirror can be days old. The envelope carries `generatedAt`, and once the per-diagnostic `commitSha` defect is fixed (see `bugs/050_infra_diagnostics_mirror_commitsha_not_per_diagnostic.md`) it will carry the capture commit too. A `--max-age` and a "captured at a different commit than HEAD" warning are both cheap and both necessary, or the gate will confidently pass on data from last week.
3. **Higher `schemaVersion`** — should flag. Refuse a higher major and exit 2 rather than mis-count, consistent with the envelope's stated compatibility contract.
4. **Adding a runtime dependency for YAML parsing** — blocked. `pubspec.yaml` declares zero runtime dependencies by explicit policy (see Alternatives).
5. **Baseline / "only new issues"** — should pass initially. Deliberately out of scope for v1; `saropa_lints` has a whole `baseline/` subsystem for it, and duplicating that here before the basic gate exists is premature.

---

## Alternatives Considered

- **Add the gate as a Dart executable in `bin/`.** This is the shape that matches the sibling, but it collides with a hard constraint:

  ```bash
  $ sed -n '32,42p' pubspec.yaml
  dependencies:
    # !! KEEP THIS LIST MINIMAL !!
    # This package ships inside consumer apps. Every
    # dependency here increases their install size and
    # attack surface. Add features to the VS Code
    # extension (extension/) instead of adding packages
    # here. Before adding a dependency, exhaust
    # dart:* standard library alternatives first.
  ```

  A YAML config would need a `yaml` dependency shipped into every consumer app, which the policy forbids. Workable if the config is JSON (`dart:convert` only) — worth deciding before implementing.

- **A Python script in `scripts/`.** Fits the existing tooling convention in this repo (`publish.py`, `l10n.py`, `check_stale_overrides.py` are all Python) and adds nothing to the shipped package. Cheapest option; the cost is that it is not `dart run`-able the way the sibling's gate is, so a Dart-only CI would need Python on the runner.

- **Feed Advisor's issues into the existing `saropa_lints` quality gate instead.** Rejected: `QualityGateEvaluator` reads `violations.json`'s `summary` shape, not the diagnostic envelope, and bending Advisor's output into a lints report shape violates the standing "neither project subsumes the other" commitment in README.md.

- **Do nothing; CI does not need runtime findings.** Rejected on the evidence that the mirror was built specifically so the findings survive the server going away — the offline use case is already an accepted design goal, and CI is its most obvious consumer.

---

## Decision

<!-- Fill in when the proposal is accepted or declined -->

Open question for the owner before any work starts: **Dart executable with JSON config, or Python script in `scripts/`?** The dependency policy makes this a real fork, not a style preference, and it should be settled first.

---

## Implementation Notes

<!-- Fill in when work begins -->

Sequencing note: the `commitSha` placement bug (`bugs/050_infra_diagnostics_mirror_commitsha_not_per_diagnostic.md`) should land first, since edge case 2 depends on reading a usable capture commit out of the mirror.

---

## Commits

<!-- Add commit hashes as implementation lands -->
