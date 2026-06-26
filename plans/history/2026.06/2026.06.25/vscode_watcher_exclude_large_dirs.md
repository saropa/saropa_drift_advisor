# VS Code watcher load — exclude the large `example` tree from the file watcher

## Status: Fixed (watcher exclusion applied to `.vscode/settings.json`)

## Origin

Cross-project hygiene item dispatched from the `saropa-log-capture` repo's
Bug 003 (workspace-wide VS Code blowout detection across `D:\src`).

## Problem

When VS Code opens a folder it watches and indexes the **entire** tree minus a
short default-exclude list (`node_modules`, `.git`). Large directories are
crawled in full on every open. Past a few GB this adds watcher/index load; at the
extreme (16 GB / 180k files in another project) it pins a CPU core and hangs the
window on open. Gitignore stops commits, not the watcher.

## This repo's large dir (scan 2026-06-25)

| Size | Path | Kind |
|---|---|---|
| 1.23 GB | `example` | example app tree |

Secondary severity (the project opens today).

## Fix — add to `.vscode/settings.json`

**Caution:** the `example/` tree contains editable source (the example app) as
well as its generated build output. Watcher-exclude only the **generated**
portion — the example app's own `build/` — not the whole `example/`, or edits to
the example source will stop triggering reload. The bulk of the 1.23 GB is the
build output.

Confirm the excluded path is gitignored first, then add (merge into any existing
`files.watcherExclude`):

```json
"files.watcherExclude": {
  "**/example/build/**": true
}
```

If `.vscode/settings.json` already has settings, merge by hand (it may contain
`//` comments, so an automated JSON merge is unsafe). If it does not exist,
create it with the block above wrapped in `{ … }`.

## Reference

`saropa-log-capture` → `plans/history/2026.06/2026.06.25/bug_003_workspace-large-dir-blowout-detection-and-prevention.md`.

## Finish Report (2026-06-25)

- Verified `example/build` is 1.1 GB and gitignored (`git check-ignore` → IGNORED).
- Merged `"files.watcherExclude": { "**/example/build/**": true }` into the
  existing `.vscode/settings.json` by hand (file has `//` comments, so no
  automated JSON merge). Excludes only the generated build output, not
  `example/` source, so example edits still trigger reload.
- Takes effect on next window reload.
