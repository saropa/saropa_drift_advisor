# Extension 300-line limit — final batch

**Date**: 2026-03-17  
**Context**: Ten extension source/test files still exceeded the 300-line limit; this batch modularizes them so all files comply.

## Summary

All 10 reported files are now under 300 lines. New modules and test splits were added; behavior unchanged. All 1810 tests pass.

## Source files modularized

| Original file | New modules / changes |
|---------------|------------------------|
| `api-client.ts` | `api-client-http.ts` (HTTP endpoint helpers) |
| `server-discovery.ts` | `server-discovery-constants.ts`, `server-discovery-scan.ts`, `server-discovery-notify.ts` |
| `debug/debug-commands-vm.ts` | `debug/debug-vm-connect.ts` (WebSocket + health retry, constants) |
| `rollback/rollback-generator.ts` | `rollback-order.ts`, `rollback-dart.ts`, `rollback-helpers.ts`, `rollback-utils.ts` |
| `transport/vm-service-client.ts` | `transport/vm-service-api.ts` (ext.saropa.drift.* wrappers) |
| `troubleshooting/troubleshooting-html.ts` | `troubleshooting-styles.ts` (CSS string) |

## Test files modularized

| Original file | New files / helpers |
|---------------|--------------------|
| `api-contract.test.ts` | `api-contract-helpers.ts` (assertHasKeys), `api-contract-sessions.test.ts` |
| `compliance-checker.test.ts` | `compliance-checker-test-helpers.ts` (makeTable, makeFk, makeDartTable), `compliance-checker-rules.test.ts`, `compliance-checker-general.test.ts` |
| `rollback-generator.test.ts` | `rollback-generator-test-helpers.ts` (snap, col), `rollback-generator-ordering.test.ts`, `rollback-generator-dart.test.ts` |
| `schema-provider.test.ts` | `schema-provider-test-helpers.ts` (createContext) |

## Verification

- `npm run compile` succeeds.
- All 1810 extension tests pass.
- No logic or behavior changes; pure extraction and split.
- No new circular dependencies.

## Status

Complete — no extension source or test file exceeds the 300-line limit.
