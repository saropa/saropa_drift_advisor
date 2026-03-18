# Extension performance options: fast & reliable UX

The extension can feel slow or "do nothing" when: Schema Search runs a full-schema + cross-ref load on open; the Database tree waits on server discovery and schema fetch; and Drift Tools can show "no data provider" if the view is queried before providers are ready. Below are options to make the extension feel **very fast** and always responsive.

## Implemented (this pass)

- **Schema Search**: No initial search on panel open. Empty query shows an idle message ("Type to search…") and does not call the server. Backend short-circuits empty queries so any accidental empty search returns instantly. This removes the permanent loading bar and avoids hundreds of FK API calls on open.

## App config options

- **Lazy vs eager**
  - **Lazy**: Don’t call the server until the user focuses the Database view or runs a command. Discovery can still run, but tree/schema fetch only on first demand.
  - **Eager (current)**: On connect, refresh tree, linter, badges, etc. Config toggles (e.g. `driftViewer.database.loadOnConnect`) could turn off tree refresh on connect and do it on first view focus instead.

- **Timeouts and limits**
  - Schema search already has a 15s timeout and cross-ref cap (80 matches). Config could expose `schemaSearch.timeoutMs` and `schemaSearch.crossRefMatchCap` for large/slow back ends.

- **Feature toggles**
  - Disable heavy features until needed: e.g. `fileBadges.enabled`, `timeline.autoCapture`, or a single "lightweight mode" that skips badges, timeline, and auto-refresh on generation change.

## Pre-scan / cache

- **Schema cache**
  - Single in-memory cache for `schemaMetadata()` with TTL (e.g. 5–30s) or invalidation on generation change. Tree, Schema Search, ER diagram, and other commands could share it so the first consumer pays the cost and the rest are instant.

- **Pre-warm on discovery**
  - When discovery finds a server, optionally start a single `schemaMetadata()` request in the background so that when the user opens the Database view the result is already there (or nearly). If the user never opens the view, the cost is one request.

- **Last-known schema**
  - Persist last successful schema (e.g. in workspace state) and show it immediately on next activation while re-fetching in the background; then replace with fresh data or show a "stale" indicator. "Guess" with quick correction.

## Guessing and then corrections

- **Optimistic tree**
  - Show the last-known table list immediately (or a "Connecting…" placeholder with no spinner that blocks the view). When the real `schemaMetadata()` returns, replace or merge. If the server is unreachable, show an error state and retry.

- **Schema Search**
  - Optional "Browse all" that returns only table list (one `schemaMetadata()` call, no cross-refs) so the panel fills quickly; cross-refs could be loaded on demand when the user expands or clicks a column.

- **Stale-while-revalidate**
  - Any panel that shows schema (ER diagram, Schema Search, tree) shows cached data first, then refreshes in the background and updates the view when the new payload arrives.

## Reliability ("often does nothing")

- **Tree data provider**
  - Ensure Drift Tools and Database tree providers are registered synchronously at activation and never throw from `getChildren`. Return empty array or placeholder nodes when not connected so the view never shows "no data provider registered that can provide view data."

- **Connection state**
  - Set `driftViewer.serverConnected` as soon as discovery finds a server and again after a short delay (existing 1.5s sync) so the UI and viewsWelcome don’t stay in a disconnected state when a server is actually available.

- **Schema Search**
  - Panel always reaches a resolved state: idle message when empty, results or error when a search runs (no infinite loading). Already achieved by removing initial search and short-circuiting empty query.

## Suggested next steps

1. Add a **schema cache** (TTL or generation-based) and use it from tree, Schema Search, and other schema consumers.
2. Add **lazy Database tree** config: load tree on first view focus instead of on connect.
3. **Pre-warm** schema in the background when discovery finds a server.
4. **Persist last schema** and show it optimistically on activation while re-fetching.
5. Expose **config knobs** for timeout, cross-ref cap, and lightweight mode for slow or large setups.
