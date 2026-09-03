# BUG: Shared-session IDs are a base-36 millisecond timestamp — predictable, enumerable, and collision-prone

**Status: Fixed**

Created: 2026-09-02
Component: Server
File: `lib/src/drift_debug_session.dart` (lines ~62-90)
Severity: Crash

---

## Summary

`DriftDebugSessionStore.create` derives the session ID from
`DateTime.now().toUtc().millisecondsSinceEpoch.toRadixString(36)` — nothing else. There is no random
component. Two consequences: (1) any client that knows roughly when a session was shared can
enumerate a few thousand candidate IDs and `GET /api/session/<id>` its way to the saved viewer state
(SQL text, query results, annotations); (2) two `create()` calls in the same millisecond produce the
**same** ID, and the second `_sessions[id] = ...` silently overwrites the first — the first caller's
returned share URL then resolves to somebody else's state.

---

## Attribution Evidence

```bash
# Positive — the ID generator
grep -rn "millisecondsSinceEpoch.toRadixString" lib/src/
# lib/src/drift_debug_session.dart:63:    final id = DateTime.now().toUtc().millisecondsSinceEpoch.toRadixString(

# Negative — no randomness is used for session identity anywhere
grep -rn "Random\|randomBytes\|Uuid\|uuid" lib/src/drift_debug_session.dart lib/src/server/session_handler.dart
# (0 matches)

# The overwrite: no collision check before assignment
grep -n "_sessions\[id\]" lib/src/drift_debug_session.dart
# 81:    _sessions[id] = <String, dynamic>{

# The lookup that makes enumeration payable
grep -n "handleSessionGet" lib/src/server/router.dart
# 1084:        await _session.handleSessionGet(response, suffix);
```

**Emit site(s) — list ALL:** `lib/src/drift_debug_session.dart:63` (generation),
`lib/src/drift_debug_session.dart:81` (unchecked assignment),
`lib/src/server/router.dart:1084` (`GET /api/session/{id}` lookup).
**Diagnostic `source` / `owner` as seen in Problems panel:** n/a (runtime server behavior).

---

## Environment

- OS:
- VS Code version:
- Extension version:
- Dart SDK version:
- Flutter SDK version (if applicable):
- Database type and version: n/a
- Connection method: HTTP
- Relevant non-default settings: none — session sharing is always on
- Other potentially conflicting extensions:

---

## Minimal Reproducible Example

**Enumeration.** Share a session, note the time, then walk the neighbourhood:

```bash
NOW=$(python -c "import time;print(int(time.time()*1000))")
for i in $(seq 0 5000); do
  ID=$(python -c "print(numpy.base_repr($NOW-$i,36).lower())" 2>/dev/null || \
       python -c "
n=$NOW-$i
d='0123456789abcdefghijklmnopqrstuvwxyz';s=''
while n: s=d[n%36]+s; n//=36
print(s)")
  curl -s "http://127.0.0.1:8642/api/session/$ID" | grep -q '"state"' && echo "HIT $ID"
done
```

Every session shared in the last five seconds is recovered.

**Collision.** Two shares in the same millisecond:

```bash
curl -s -X POST http://127.0.0.1:8642/api/session/share -H 'Content-Type: application/json' \
  -d '{"state":{"tag":"A"}}' &
curl -s -X POST http://127.0.0.1:8642/api/session/share -H 'Content-Type: application/json' \
  -d '{"state":{"tag":"B"}}' &
wait
```

Both responses can carry the same `id`; `GET /api/session/<id>` returns `B` for both.

---

## Expected Behavior

Session IDs should be unguessable — at least 128 bits from `Random.secure()`, base-36 or hex
encoded — and `create` should never overwrite an existing key (regenerate on collision, which with a
secure random is effectively never).

---

## Actual Behavior

The ID is a monotonic, publicly-inferable clock reading. Overlapping shares collide and silently
clobber.

---

## Error Output

None. Both failure modes are silent.

---

## Duplicate-Emission Check

Dart-only; the extension and web viewer consume the returned `id` and never mint one.

---

## What I Already Tried

- [x] Grepped `lib/src/` for any use of `Random`, `Random.secure`, or a UUID dependency in the
      session path — none
- [x] Confirmed `create` calls `cleanExpired()` and the eviction loop but performs no
      `_sessions.containsKey(id)` check
- [x] Confirmed `handleSessionGet` performs a plain map lookup with no rate-limit exemption removal
      (the generic limiter allows the default requests/second, which is ample for enumeration)

---

## Regression Info

- Last working version: n/a — the generator has always been timestamp-only
- First broken version:
- What changed:

---

## Root Cause

The ID was chosen for readability and natural ordering in the eviction loop
(`_sessions.keys.firstOrNull` relies on insertion order, not on the ID being sortable — so the
timestamp buys nothing there either).

**Proposed fix sketch:**

1. Generate the ID from `Random.secure()`: 16 bytes → base-36 or URL-safe base-64. Keep the length
   short enough to stay pasteable (~22 chars).
2. Loop-regenerate while `_sessions.containsKey(id)` (a bounded retry, e.g. 5, then fail with 503) so
   a collision can never overwrite.
3. Compare submitted IDs with the existing constant-time helper
   (`AuthHandler._secureCompare` — extract it to `ServerUtils`) if session lookup is ever made
   auth-bearing; at minimum stop leaking existence via differing response shapes.
4. Regression test in `test/drift_debug_session_test.dart`: 10 000 `create()` calls yield 10 000
   distinct IDs and no state is ever overwritten.

---

## Changes Made

<!-- Fill in when a fix is written. -->

---

## Commits

<!-- Add commit hashes as fixes land. -->

---

## Impact

- Who is affected: anyone using the share-session feature, especially with `loopbackOnly: false`
  (LAN-reachable) or behind a dev tunnel, where a third party can reach `/api/session/{id}`.
- What is blocked: nothing.
- Data risk: disclosure of saved viewer state (SQL text and results, annotations) to anyone who can
  reach the port; silent loss of a shared session on collision.
- Frequency: enumeration is deterministic; collision is intermittent but certain under any burst of
  shares (e.g. a script, or the viewer auto-sharing).
