# BUG-024: Session sharing expires silently with no warning

## Status: RESOLVED

## Summary

All 6 requirements implemented:

1. **Countdown timer** in session info bar shows remaining time (30s updates, 10s under 10 min)
2. **Expiry warning** — yellow banner when under 10 minutes, faster countdown cadence
3. **Expired URL banner** — red "Session Expired" banner replaces silent console.warn
4. **Extend button** — resets expiry via POST `/api/session/{id}/extend`
5. **Share dialog** — prompt now mentions "Session will expire in 1 hour" (follow-up: prompt and copy alert newlines fixed to render in modal, not as literal `\n`)
6. **Configurable duration** — `sessionDuration` parameter on `DriftDebugServer.start()`

## Files Changed

- `lib/src/drift_debug_session.dart` — Constructor with optional `sessionExpiry`, `extend()` method
- `lib/src/server/server_constants.dart` — `pathSuffixExtend` route constant
- `lib/src/server/session_handler.dart` — `handleSessionExtend()` endpoint
- `lib/src/server/router.dart` — POST `/api/session/{id}/extend` route
- `lib/src/drift_debug_server_io.dart` — `sessionDuration` parameter
- `lib/src/drift_debug_server_stub.dart` — Matching stub parameter
- `lib/src/server/html_content.dart` — Countdown, warning, expired banner, extend button JS
- `test/drift_debug_session_test.dart` — 7 new tests (extend, configurable duration)

## Original Report

Collaborative debug sessions expire after 1 hour with no warning to the user.
When a session expires:

1. No notification is shown to the session creator
2. No notification is shown to users accessing the shared URL
3. The shared URL simply returns null/404 with no helpful message
4. The session URL format is not prominently displayed in the Share UI
5. No option to extend session duration
