# BUG-020: No formal API specification for REST endpoints

## Severity: Significant

## Component: Documentation

## Files

- `lib/src/server/router.dart` (route definitions)
- `lib/src/server/server_constants.dart` (path constants)
- `README.md` (partial API table)

## Description

The debug server exposes ~30 REST API endpoints but has no formal API
specification. The README contains a summary table of endpoints, but lacks:

1. Request/response body schemas with examples
2. Error response format documentation
3. HTTP status code reference per endpoint
4. Query parameter documentation (types, defaults, valid ranges)
5. Authentication requirement details per endpoint
6. Rate limiting information (if any)

Users building custom integrations (CI pipelines, custom dashboards, or
alternative frontends) must read the Dart source code to understand the API.

## Impact

- Custom integration development requires reading source code
- No contract testing between server and extension (both evolve independently)
- API changes may break the extension without detection
- Third-party tool integration is unnecessarily difficult

## Steps to Reproduce

1. Read the README API summary table
2. Try to build a custom API client from the documentation alone
3. Realize request/response formats, error codes, and parameter types are
   undocumented

## Expected Behavior

- Create an API specification document (OpenAPI/Swagger or structured Markdown)
- Document request/response schemas with JSON examples for every endpoint
- Document error response format (`{"error": "message"}`) and HTTP status codes
- Document query parameters with types, defaults, and valid ranges
- Consider generating the spec from route definitions and handler code
- Add contract tests between server and extension to catch API drift

## Resolution

All six requirements addressed:

1. **API specification** — `doc/API.md`: structured Markdown reference covering
   all ~30 endpoints, grouped by functional area (Health, Tables, SQL, Schema,
   Snapshots, Compare, Analytics, Performance, Sessions, Import, Change
   Detection). Chose Markdown over OpenAPI because this is a debug tool, not a
   production API; no client generation or Swagger UI needed.

2. **Request/response schemas** — every endpoint section includes JSON request
   and response examples with field-level type tables.

3. **Error format** — dedicated "Error Format" and "HTTP Status Codes" sections
   document the standard `{"error": "message"}` shape and all status codes
   (200, 204, 400, 401, 404, 429, 500, 501). Each endpoint lists its specific
   error conditions.

4. **Query parameters** — reference table documents `limit`, `offset`, `since`,
   `format`, and `detail` with types, defaults, and valid ranges. Per-endpoint
   sections repeat the relevant parameters inline.

5. **Auto-generation** — evaluated and rejected: ~30 endpoints don't justify a
   Dart annotation/reflection framework. Manual docs with contract tests provide
   equivalent drift protection at far lower complexity.

6. **Contract tests** — response shape assertions added to
   `test/handler_integration_test.dart` (Dart, server-side) and new
   `extension/src/test/api-contract.test.ts` (TypeScript, extension-side).
   Server tests validate JSON keys and types on every endpoint. TypeScript tests
   validate all 20 `api-types.ts` interfaces at compile-time and runtime.

### Files Changed

- `doc/API.md` — new: full API reference
- `test/handler_integration_test.dart` — enhanced: shape assertions on all
  endpoint tests
- `extension/src/test/api-contract.test.ts` — new: TypeScript contract tests
- `README.md` — added API Reference link
- `CHANGELOG.md` — added entry under [Unreleased]
