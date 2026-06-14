# Constant-time auth compare no longer leaks secret length (audit L1)

The Bearer-token / Basic-auth comparison short-circuited with `if (a.length != b.length) return false` before the constant-time XOR loop. That early return makes a length-mismatched candidate resolve measurably faster than an equal-length one, leaking the expected secret's length through response timing.

## Finish Report (2026-06-13)

### Scope

(A) Dart package code (`lib/`). No extension/Flutter/docs beyond the changelog. No dedicated test (the method is private); exercised by the existing auth integration tests.

### What changed

- **`lib/src/server/auth_handler.dart`** — `_secureCompare` no longer early-returns on a length mismatch. It seeds the accumulator with `lenA ^ lenB` (so any length difference already fails), then always loops for the expected secret's length `b` (a per-config constant), reading the candidate `a` modulo its own length so a shorter candidate costs the same iterations.

### Design notes

- Timing now depends only on the configured secret's length (constant for a given server), not on the candidate's length, removing the per-attempt length side channel. This is hardening, not a cryptographic guarantee (no HMAC dependency is added — the package is zero-runtime-dependency by design).

### Verification

- `dart analyze lib/src/server/auth_handler.dart` — no issues.
- Auth integration tests (correct token accepted; empty/wrong/malformed credentials of differing lengths rejected; Basic auth valid/invalid) pass.

### Outstanding

None.
