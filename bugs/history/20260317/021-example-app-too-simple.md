# BUG-021: Example app is too simple to demonstrate key features

## Severity: Minor

## Component: Documentation / Example

## Status: **Implemented**

Example app now provides a full feature demo: multi-table schema (users, posts, comments, tags, post_tags) with FKs; `writeQuery` for Import; opt-in auth token (`_kExampleAuthToken`); startup via `startDriftViewer()` with callback-style alternative in comments; seed data with dates, nulls (draft posts), and varied types. See CHANGELOG, example/README.md, and example/lib/main.dart.

## Files changed

- `example/lib/main.dart` — startDriftViewer, writeQuery, auth, seed helpers
- `example/lib/database/app_database.dart` — Users, Posts, Comments, Tags, PostTags; migration 1→2
- `example/lib/database/app_database.g.dart` — regenerated
- `example/lib/ui/viewer_status.dart` — ready-view copy updated
- `example/README.md` — multi-table, writeQuery, auth, extension pattern
- `CHANGELOG.md`, `README.md` — doc updates

## Original description (abridged)

The example had a single `items` table; no FKs, no multi-table, no writeQuery, no auth demo, callback-only, minimal seed. Expected: 3–4 related tables with FKs, writeQuery, opt-in auth, both extension and callback styles, realistic seed data.
