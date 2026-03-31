# Modularize 10 Files Exceeding 300-Line Limit

## Context
Quality checks flag 10 files exceeding the 300-line soft limit. The project already uses a consistent pattern: thin re-export barrels + focused `-core`/`-impl` implementation files. This plan splits each file following that established convention.

---

## 1. `api-client-http-impl.ts` (317 → 2 files)

Barely over. Split 20 endpoint wrappers into two domain groups.

| New File | Contents | ~Lines |
|----------|----------|--------|
| `api-client-http-schema.ts` | httpHealth, httpSchemaMetadata, httpTableFkMeta, httpSchemaDiagram, httpSchemaDump, httpDatabaseFile, httpCompareReport, httpMigrationPreview | ~160 |
| `api-client-http-impl.ts` (keep) | httpGeneration, httpMutations, httpSql, httpExplainSql, httpApplyEditsBatch, httpIndexSuggestions, httpAnomalies, httpPerformance, httpClearPerformance, httpGetChangeDetection, httpSetChangeDetection, httpSizeAnalytics | ~170 |

Update `api-client-http.ts` barrel to re-export from both files.

---

## 2. `extension-main.ts` (574 → 3 files)

Extract event listener wiring (the largest block) and phase utilities.

| New File | Contents | ~Lines |
|----------|----------|--------|
| `extension-event-wiring.ts` | New function `wireEventListeners(...)` — config watchers, server lifecycle, watcher events, context sync (current lines ~400-559) | ~170 |
| `extension-status-setup.ts` | New function `setupStatusBars(...)` — status bar creation, health bar, tools quick-pick, UI callbacks (current lines ~306-351) + command registration orchestration (lines ~354-382) | ~100 |
| `extension-main.ts` (keep) | activate/deactivate, runPhase, phases 0-7, call into extracted helpers | ~300 |

---

## 3. `server-discovery-core.ts` (362 → 2 files)

Extract UI state building and poll loop into a helper module.

| New File | Contents | ~Lines |
|----------|----------|--------|
| `server-discovery-ui-state.ts` | `buildDiscoveryUiState()`, `portsProbeLabel()`, `recordScanOutcome()`, `emitDiscoveryUi()` as free functions taking discovery state args | ~80 |
| `server-discovery-core.ts` (keep) | ServerDiscovery class (constructor, lifecycle, poll loop, server tracking) calling into ui-state helpers | ~285 |

---

## 4. `nav-commands-core.ts` (376 → 3 files)

Split independent command handlers by domain.

| New File | Contents | ~Lines |
|----------|----------|--------|
| `nav-commands-discovery.ts` | selectServer, retryDiscovery, pauseDiscovery, resumeDiscovery, forwardPortAndroid, openConnectionHelp, showConnectionLog | ~120 |
| `nav-commands-diagnostics.ts` | diagnoseConnection (the largest single handler ~60 lines) + openWalkthrough | ~100 |
| `nav-commands-core.ts` (keep) | Shared context (log helper, config watcher), openInBrowser, openInPanel, viewTableInPanel, runTableQuery, runLinter, copySuggestedSql, runIndexSql + calls to register sub-groups | ~180 |

Each extracted file exports a `register*Commands(context, deps)` function called from core.

---

## 5. `schema-search-html-content.ts` (401 → 2 files)

Split the two large template-literal constants.

| New File | Contents | ~Lines |
|----------|----------|--------|
| `schema-search-html-styles.ts` | `SCHEMA_SEARCH_STYLE` constant (CSS) | ~155 |
| `schema-search-html-content.ts` (keep) | `SCHEMA_SEARCH_SCRIPT` constant (JS) | ~250 |

Update `schema-search-html.ts` to import style from new file.

---

## 6. `schema-search-view-core.ts` (368 → 2 files)

Extract message routing + search operations.

| New File | Contents | ~Lines |
|----------|----------|--------|
| `schema-search-view-message-handler.ts` | Extracted `handleSearchMessage()` function covering the 20+ command cases, plus `doSearch`, `doBrowseAll`, `doRetry`, `withOptionalRetry`, `withTimeout` | ~180 |
| `schema-search-view-core.ts` (keep) | SchemaSearchViewProvider class (constructor, resolveWebviewView, connection state, diagnostics, discovery monitor, navigation) calling into message handler | ~200 |

---

## 7. `drift-tree-provider.ts` (368 → 2 files)

Extract child resolution and decoration logic.

| New File | Contents | ~Lines |
|----------|----------|--------|
| `drift-tree-children.ts` | `resolveChildren()` function (root/table/column levels), `decorateTableItems()`, `decorateColumnItems()` as free functions | ~120 |
| `drift-tree-provider.ts` (keep) | DriftTreeProvider class (refresh orchestration, lifecycle, state, getTreeItem) calling into children resolver | ~250 |

---

## 8. `dart-parser.test.ts` (358 → 2 files)

| New File | Contents | ~Lines |
|----------|----------|--------|
| `dart-parser.test.ts` (keep) | extractClassBody + parseColumn suites | ~155 |
| `dart-parser-tables.test.ts` | parseDartTables + parseDriftIndexCalls/parseDriftUniqueKeySets suites | ~205 |

---

## 9. `drift-tree-provider.test.ts` (788 → 3 files)

| New File | Contents | ~Lines |
|----------|----------|--------|
| `drift-tree-provider.test.ts` (keep) | refresh() + getChildren()-root + table expansion + item visuals + row count + click behavior + getTreeItem | ~295 |
| `drift-tree-provider-concurrency.test.ts` | refresh() concurrency guard suite | ~130 |
| `drift-tree-provider-regression.test.ts` | REGRESSION: tree root never empty suite (with loadDeclaredCommandIds helper) | ~295 |

Shared setup (beforeEach, sampleMetadata, imports) duplicated in each file (standard Mocha pattern — no shared test fixtures).

---

## 10. `extension.test.ts` (471 → 2 files)

| New File | Contents | ~Lines |
|----------|----------|--------|
| `extension.test.ts` (keep) | Activation, individual command registration, subscription count, provider registration, feature command groups, deactivate | ~250 |
| `extension-manifest-validation.test.ts` | view/title menu commands, Drift Tools quick menu, package.json structural validation, activationEvents, exhaustive forward/reverse command checks | ~220 |

---

## Execution Order

Process files with **no downstream import dependents first** (tests, leaves), then work inward:

1. Test files (8, 9, 10) — no other files import these
2. `schema-search-html-content.ts` (5) — only imported by `schema-search-html.ts`
3. `drift-tree-provider.ts` (7) — imported by tree barrel
4. `nav-commands-core.ts` (4) — imported by nav barrel
5. `server-discovery-core.ts` (3) — imported by discovery barrel
6. `schema-search-view-core.ts` (6) — imported by search barrel
7. `api-client-http-impl.ts` (1) — imported by api-client-http barrel
8. `extension-main.ts` (2) — entry point, modify last

## Verification

After each file split:
- `cd extension && npm run compile` — must pass with no errors
- `cd extension && npm test` — all tests must pass

After all splits complete:
- Re-run the quality check to confirm all files ≤ 300 lines
- `git diff --stat` to review the full changeset
