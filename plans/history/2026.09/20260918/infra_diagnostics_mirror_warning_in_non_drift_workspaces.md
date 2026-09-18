# BUG: "Could not write the diagnostics mirror" warning in workspaces that don't use Drift

**Status: Closed**

Created: 2026-09-18
Closed: 2026-09-18 (released in 4.4.2, PR #64)
Component: Extension / Saropa suite integration
File: `extension/src/suite/diagnostics-mirror.ts`, `extension/package.json`
Severity: Stray warning — Low

---

## Summary

With Saropa Log Capture installed, every workspace without Drift showed:

```
Could not write the diagnostics mirror — is the Drift debug server running and a workspace folder open?
```

Log Capture's "installed but silent" check sees no `.saropa/diagnostics/advisor.json` and runs `driftViewer.writeDiagnosticsMirror` so Advisor can emit one. The command handler was written for a person running it from the Command Palette. It showed a warning whenever the write failed, and in a non-Drift workspace the write always fails because no debug server exists.

## Fix

- In a workspace whose `pubspec.yaml` has no `drift`/`saropa_drift_advisor` dependency, the command returns `false` without showing any message (`workspaceUsesDrift`).
- The command accepts `{ silent: true }`, which suppresses both result messages for automated callers, and returns whether the mirror was written.
- The command appears in the Command Palette only when `driftViewer.isDriftProject` is true.

## Tests

`extension/src/test/suite-diagnostics-mirror.test.ts`, `writeDiagnosticsMirror command`:
- A non-Drift workspace returns `false`, writes nothing, and shows no warning or info message (regression).
- A Drift workspace that cannot write still shows the warning.
- `{ silent: true }` suppresses the warning.

## Related work in the same change

- **Pre-commit hook** (`.husky/pre-commit`): now picks a working Python 3 (`python3`, `python`, `py`) on macOS and Windows. The gates used to call bare `python`, which macOS doesn't have. It's a shell script with no unit-test harness; it was verified by running commits through it on macOS.
- **Index-suggestions Markdown export** (`extension/src/health/index-suggestions-panel.ts`): the SQL column is a backtick code span, so it escapes only pipes and newlines. Escaping backslashes there, as the CodeQL change did, rendered them doubled. Test: `index-suggestions-panel.test.ts`, "Markdown export escapes cells but leaves backslashes in the SQL code span alone".

## Commits

- `cf95fb9` fix(extension): no mirror warning in workspaces without Drift
- `2f8811e` chore(hooks): resolve a Python 3 interpreter on macOS and Windows
- `d9e7bc0` fix(extension): don't double backslashes inside the index-suggestion SQL code span
- `5fd1ea9` docs(changelog): note the cross-platform pre-commit Python fix in 4.4.2
- Released in `1c6d50d` Release 4.4.2 (#64)
