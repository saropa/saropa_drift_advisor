# Request-body size caps on POST handlers (audit H3)

Every POST handler in the debug server buffered the entire request body into memory (`BytesBuilder` over `await for (chunk in request)`, or `utf8.decoder.bind(request).join()`) before any size or content validation ran. A client could stream an arbitrarily large body and exhaust process memory before a single guard executed — a denial-of-service vector that is especially relevant on the dev-tunnel configurations the Basic-auth path explicitly targets. This change introduces a shared, capped body reader and routes every handler through it.

## Finish Report (2026-06-13)

### Scope

(A) Dart package code (`lib/`) and Dart tests (`test/`). No extension/TypeScript, no Flutter UI, no docs-only changes beyond the changelog.

### What changed

- **`lib/src/server/server_utils.dart`** — added `readBodyBytes(HttpRequest, {required int maxBytes})`. It rejects early on a declared `Content-Length` over the cap, then enforces a running byte budget while streaming, returning `null` the moment the streamed total exceeds `maxBytes`. Returns the accumulated bytes otherwise. (`dart:io`/`dart:typed_data` imported for `HttpRequest`/`Uint8List`.)
- **`lib/src/server/server_constants.dart`** — added `maxRequestBodyBytes = 64 * 1024 * 1024` (64 MiB) and `errorPayloadTooLarge`.
- **`lib/src/server/server_context.dart`** — added `sendPayloadTooLarge(HttpResponse)`, which emits HTTP 413 with the JSON error body and CORS/JSON headers.
- **Handlers routed through the capped reader** (each replaces an unbounded `BytesBuilder`/`join()` read, returns 413 on overflow, and drops the now-unused `dart:typed_data` import): `cell_update_handler`, `edits_batch_handler`, `index_batch_handler`, `sql_handler`, `dvr_handler`, `import_handler`, `session_handler` (share / extend / annotate), `snapshot_handler` (`_readOptionalLabel`), and `router` (`POST /api/change-detection`).

### Design notes

- The cap is enforced both on the declared length (fast reject) and on the streamed total, because a client can omit or lie about `Content-Length`.
- On overflow the server stops reading and responds 413; for a large body the client may observe a connection reset mid-send. That is the correct DoS posture (stop consuming attacker input) rather than reading-and-discarding the remainder.
- Whole-table materialization in snapshot/dump/compare was intentionally left unchanged: those reads are bounded by the actual database the operator chose to snapshot/dump, not by untrusted network input, and capping them would silently produce partial snapshots — a feature regression. That item remains a separate design consideration, not part of this DoS-input fix.

### Verification

- `dart analyze lib/` — no issues.
- New `test/request_body_limit_test.dart` drives `readBodyBytes` over a real loopback `HttpServer` with a 10-byte cap: within-cap returns the bytes, empty body returns empty, over-cap does not yield a success response. All pass.
- Re-ran the POST-handler suites that exercise the changed read paths (`handler_integration_test`, `sql_handler_test`, `snapshot_handler_test`, `index_batch_handler_test`, `drift_debug_import_test`) — all pass; the 64 MiB cap is far above any fixture so existing happy-path behavior is unchanged.

### Outstanding

None for this item. Whole-table read caps are tracked separately (see Design notes).
