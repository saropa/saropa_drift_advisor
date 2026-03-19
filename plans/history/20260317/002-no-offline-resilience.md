# BUG-002: No offline resilience or reconnection logic

## Status: RESOLVED

## Summary

Full connection health system implemented in `lib/src/server/html_content.dart`:

1. **Connection banner** — fixed-position "Connection lost — reconnecting..." banner with dismiss button and `role="alert"` for screen readers
2. **State machine** — three states: connected / disconnected / reconnecting, with clean transitions
3. **Heartbeat** — after consecutive poll failures, switches to lightweight `/api/health` pings with exponential backoff (1s → 30s max)
4. **Keep-alive** — periodic health check when polling is OFF to detect disconnection
5. **Controls disabled** — server-dependent buttons get `offline-disabled` class (opacity + pointer-events:none)
6. **Live indicator** — shows "Disconnected" or "Reconnecting..." in red when connection is lost; pulse animation during reconnection
7. **Auto-recovery** — heartbeat detects server return, resumes normal polling
8. **Server restart detection** — generation going backwards triggers console log and full data refresh
9. **Slide-down transition** — banner and body padding animate smoothly via CSS transitions

## Files Changed

- `lib/src/server/html_content.dart` — CSS for banner/offline-disabled, HTML banner element, connection state machine, heartbeat/keep-alive timers, control disabling

## Original Report

If the network connection dropped during a debug session, the entire UI broke
silently with no notification, no reconnection logic, and no request queuing.
