# BUG-019: VS Code extension test coverage is ~40%

## Status

**Implemented.** New tests added for command handlers, webview HTML, API error paths, and tree view (Tools provider). No production code or UI changed. Disposable count assertion updated to 173.

### Delivered

- **Command handlers:** `dashboard-commands.test.ts` (open/save/load/delete, empty-state and save path), `polling-commands.test.ts` (toggle success and error).
- **Webview HTML:** `dashboard-html.test.ts` (DOCTYPE, widgets, XSS escaping, layout name), `health-html.test.ts` (empty state, grade, metrics, recommendations, XSS).
- **API error paths:** `api-client.test.ts` — getChangeDetection/setChangeDetection (success and non-200 throw).
- **Tree view:** `tools-tree-provider.test.ts` — root/category children, connection state (enabled/disabled), Add Package visibility, refresh event, version in label.

### Not done (lower priority)

- Polling loop tests with simulated timing (only toggle command covered).
- VM Service transport failover tests.

---

## Severity: Significant

## Component: VS Code Extension

## Directory: `extension/src/`

## Description

The VS Code extension has 138 test files for 346 source files (~40% coverage).
Several critical areas are undertested:

### Well-tested modules
- Annotation storage and panel
- Change tracking and changelog generation
- API client communication
- Clipboard parsing
- Constraint validation
- Data generation (seeder)
- Diff algorithms
- Dart parsing and code generation
- Schema parsing

### Undertested or untested modules
- Command execution handlers (the actual command implementations)
- Webview panel HTML rendering
- Dashboard state management
- Sampling engines
- Real-time polling loops
- Error recovery paths
- Editor UI integration edge cases
- Tree view data providers under error conditions
- VM Service transport failover

## Impact

- Command handlers are the most user-facing code but have the least coverage
- Webview rendering bugs (broken HTML, missing data) may not be caught
- Error recovery paths are untested — failures may cascade unpredictably
- Polling loops may have timing bugs that only manifest under load

## Steps to Reproduce

1. Navigate to `extension/src/`
2. Count source files vs test files per module
3. Observe: many modules have source files but no corresponding test files

## Expected Behavior

- Target 70%+ test coverage for command handlers
- Add webview rendering tests (validate HTML output)
- Add error scenario tests for all transport/API calls
- Add polling loop tests with simulated timing
- Add tree view tests with error and empty states
