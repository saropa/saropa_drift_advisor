# PROPOSAL: Make the issue `fix` deep-link the only supported table→Dart navigation path, so siblings stop re-implementing name mapping divergently

**Status: Open**

Created: 2026-09-02
Type: Infrastructure
Related diagnostics: all `/api/issues` issues (the `fix` field attached by `_attachFix`)

---

## Summary

Every table-scoped issue on `/api/issues` already carries a `fix` deep-link to `driftViewer.goToDefinitionForTable`, added so consumers would not have to work out which Dart class a SQL table maps to. The Saropa Lints extension does not read that field — it does its own snake_case→PascalCase mapping and its own workspace file scan. The two implementations disagree on real inputs, so the same issue can navigate to two different symbols depending on which extension the user clicked in.

---

## Motivation

### Advisor already ships the answer

```bash
$ sed -n '434,451p' lib/src/server/analytics_handler.dart
  /// Attaches a `fix` deep-link to a table-scoped issue (plan 67 R1) so a
  /// consumer can jump to the table's Drift class. Targets Advisor's own
  /// navigation command — Advisor's runtime detectors have no static Lints
  /// counterpart to point at. Issues with no table get no fix (nothing to
  /// navigate to). The title is plain English, matching the English-only debug
  /// API surface; consumers may relabel via the command if they localize.
  void _attachFix(Map<String, dynamic> issue) {
    final table = issue[ServerConstants.jsonKeyTable] as String? ?? '';
    if (table.isEmpty) return;
    issue[ServerConstants.jsonKeyFix] = <String, dynamic>{
      ServerConstants.jsonKeyKind: ServerConstants.fixKindCommand,
      ServerConstants.jsonKeyCommand:
          ServerConstants.commandGoToTableDefinition,
      ServerConstants.jsonKeyArgs: <Map<String, dynamic>>[
        <String, dynamic>{ServerConstants.jsonKeyTable: table},
      ],
      ServerConstants.jsonKeyTitle: 'Go to table definition',
    };
  }
```

`driftViewer.goToDefinitionForTable` is one of the five committed-stable public deep-link ids:

```bash
$ grep -n "goToDefinitionForTable" extension/src/suite/suite-commands.ts
133:      'driftViewer.goToDefinitionForTable',
```

Behind it, Advisor's mapping is centralized and shared by codegen, source location, and Isar generation:

```bash
$ grep -rn "snakeToPascal\|snakeToCamel" extension/src/ | grep -v "dart-names.ts"
extension/src/codegen/dart-codegen.ts:7:import { snakeToCamel, snakeToPascal } from '../dart-names';
extension/src/codegen/dart-codegen.ts:46:  const getter = snakeToCamel(col.name);
extension/src/codegen/dart-codegen.ts:67:  const className = snakeToPascal(table.name);
extension/src/definition/drift-source-locator.ts:7:import { escapeRegex, snakeToCamel, snakeToPascal } from '../dart-names';
extension/src/definition/drift-source-locator.ts:25:  const className = escapeRegex(snakeToPascal(sqlTableName));
extension/src/definition/drift-source-locator.ts:75:  const className = escapeRegex(snakeToPascal(sqlTableName));
extension/src/definition/drift-source-locator.ts:93:    const camelName = snakeToCamel(columnName);
extension/src/isar-gen/isar-drift-codegen.ts:5:import { snakeToCamel, snakeToPascal } from '../dart-names';
```

### The consumer does not use it, and re-derives the mapping

The Lints client's issue type has no `fix` field at all, so the deep-link is dropped at the parse boundary:

```bash
$ sed -n '14,23p' D:/src/saropa_lints/extension/src/driftAdvisor/types.ts
/** Stable issue shape (matches plan §2.1; server may expose GET /api/issues or we merge from two endpoints). */
export interface DriftIssueRaw {
  source: DriftIssueSource;
  severity: DriftIssueSeverity;
  table: string;
  column: string | null;
  message: string;
  suggestedSql?: string | null;
  type?: string | null;
}

$ grep -rn "fix" D:/src/saropa_lints/extension/src/driftAdvisor/
# 0 matches
```

Instead it reimplements the mapping and scans the workspace itself:

```bash
$ sed -n '15,27p' D:/src/saropa_lints/extension/src/driftAdvisor/mapper.ts
/** snake_case → PascalCase (e.g. users → Users, user_tasks → UserTasks). */
function toPascalCase(s: string): string {
  return s
    .split('_')
    .map((part) => (part.length > 0 ? part[0].toUpperCase() + part.slice(1).toLowerCase() : ''))
    .join('');
}

/** snake_case → camelCase (e.g. user_id → userId). */
function toCamelCase(s: string): string {
  const pascal = toPascalCase(s);
  return pascal.length > 0 ? pascal[0].toLowerCase() + pascal.slice(1) : s;
}
```

### The two implementations disagree

Advisor:

```bash
$ sed -n '10,23p' extension/src/dart-names.ts
export function snakeToPascal(name: string): string {
  return name
    .split('_')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join('');
}

/**
 * Convert snake_case to camelCase.
 * e.g. "created_at" → "createdAt"
 */
export function snakeToCamel(name: string): string {
  return name.replace(/_([a-z])/g, (_, c: string) => c.toUpperCase());
}
```

`snakeToPascal` and Lints' `toPascalCase` agree. The **camelCase** functions do not — they are structurally different algorithms:

| Input column | Advisor `snakeToCamel` | Lints `toCamelCase` | Same? |
|---|---|---|---|
| `created_at` | `createdAt` | `createdAt` | yes |
| `user_id` | `userId` | `userId` | yes |
| `userName` (already camel) | `userName` | `username` | **no** |
| `user_ID` | `user_ID` | `userId` | **no** |
| `HTTPStatus` | `HTTPStatus` | `Httpstatus`→`httpstatus` | **no** |

Advisor's is a targeted `_x`→`X` substitution that leaves everything else alone; Lints' round-trips through PascalCase and therefore lower-cases every character it did not capitalize. A Drift column declared as `userName` or `user_ID` — both legal, and both things people write — resolves to a different getter name in each extension. The user clicks "go to this column" in one tool and lands somewhere; clicks the equivalent in the other and lands somewhere else, or nowhere.

There is a second, quieter cost: Lints scans up to 8000 Dart files per refresh to do work Advisor has already done.

```bash
$ sed -n '30,44p' D:/src/saropa_lints/extension/src/driftAdvisor/mapper.ts
/** Find Dart files under workspace that might define Drift tables. Excludes build/. */
async function findDartFiles(): Promise<vscode.Uri[]> {
  const folders = vscode.workspace.workspaceFolders;
  if (!folders?.length) return [];
  const out: vscode.Uri[] = [];
  for (const folder of folders) {
    const uris = await vscode.workspace.findFiles(
      new vscode.RelativePattern(folder, '**/*.dart'),
      '**/build/**',
      8000,
    );
    out.push(...uris);
  }
  return out;
}
```

---

## Detection / Behavior

This is a contract-and-documentation change, not a new diagnostic.

### Should flag (problematic)

A consumer that reads `table` and `column` off an issue and derives a Dart symbol name itself. There is no way for it to stay in step with Advisor's mapping, because Advisor's mapping is not published anywhere — it lives in an un-exported module inside a compiled VS Code extension.

### Should pass (correct)

A consumer that reads the issue's `fix` object and executes `fix.command` with `fix.args`. Navigation is then performed by the tool that owns the mapping, and the consumer needs no knowledge of Drift naming at all.

---

## Edge Cases

1. **Issue with no table** — should pass. `_attachFix` already skips these (`if (table.isEmpty) return;`), so a consumer must handle an absent `fix` and fall back to a non-navigating row.
2. **Column-scoped navigation** — needs discussion. `_attachFix` currently passes only `{table}`, so a consumer that wants to land on the *column* getter still has nothing to use and will keep re-deriving. Extending the args to `{table, column}` (additive) is the change that would actually remove the incentive to reimplement.
3. **Advisor extension not installed** — should pass with a documented fallback. A `fix.command` in the `driftViewer.` namespace is unusable without Advisor. Consumers already check installation before offering Advisor deep-links; the docs should say the fallback is "no navigation", not "guess the name".
4. **Localization** — already handled: the `title` is English by design (see the `_attachFix` doc comment), and consumers are told they may relabel.

---

## Alternatives Considered

- **Publish `dart-names.ts` as a shared npm package.** Rejected for now: it creates a build-order dependency between three extension repos for ~20 lines of string handling, and shared infrastructure is a blast-radius decision. The deep-link already exists and costs nothing.
- **Serve the mapping from the Dart server** (e.g. a `dartClassName` field on each issue). Rejected: the server cannot see source code — that separation is the repo's architecture contract, and the class name it guessed would be no more authoritative than the consumer's guess.
- **Reconcile the two `toCamelCase` implementations by matching Lints' behavior.** Rejected: Advisor's is the more correct of the two (it preserves author intent for `userName` and `HTTPStatus`), so converging on Lints' would be a regression here. Convergence should happen by consumers stopping deriving, not by Advisor matching a lossier algorithm.

---

## Decision

<!-- Fill in when the proposal is accepted or declined -->

---

## Implementation Notes

<!-- Fill in when work begins -->

Work that belongs in this repo:

1. Extend `_attachFix` in `lib/src/server/analytics_handler.dart` to include `column` in `fix.args` when the issue has one. Additive; no `schemaVersion` bump.
2. Document the `fix` field prominently in `doc/API.md` under `GET /api/issues` — currently it is emitted but a consumer reading the docs would not know it is the *intended* navigation path. Add one sentence stating that consumers should execute `fix.command` rather than derive Dart names from `table`/`column`, and that Advisor's naming heuristics are not part of the published contract.
3. Add the same statement to `.claude/skills/drift-advisor-ecosystem-and-positioning/SKILL.md` §2.1, where the `fix` field is already described.
4. Regression test asserting `fix.args[0]` carries both `table` and `column` for a column-scoped issue.

Work that belongs in `D:/src/saropa_lints/bugs/` and must NOT be done here: adding `fix` to `DriftIssueRaw`, preferring it over `mapper.ts`, and dropping the 8000-file scan when a `fix` is present.

---

## Commits

<!-- Add commit hashes as implementation lands -->
