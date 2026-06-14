# Extension publish: idempotent handling of "already exists" store rejection

The extension publish pipeline aborted at the Marketplace step when `vsce`
rejected a re-publish of an already-live version with "saropa.drift-viewer
v4.0.1 already exists." VS Code Marketplace and Open VSX listings lag publish
acceptance by minutes (store CDN propagation). The version-skip guard in
`publish_all` queries `vsce show` before publishing, but on a `--resume` retry
that query can read the stale older version, miss the skip, and re-attempt a
publish the store then rejects — turning the desired end state (target version
already published) into a hard pipeline failure.

## Finish Report (2026-06-14)

### Scope

(C) Python publish tooling plus its unit test. No `lib/` runtime code, no
extension TypeScript, no localized strings.

### Changes

- `scripts/modules/ext_publish.py` — added `_already_published(result)`, which
  scans the failed command's combined stdout/stderr (case-insensitively) for
  "already exists" (vsce phrasing) or "already published" (ovsx phrasing).
  `publish_marketplace` and `publish_openvsx` now return success on that
  rejection instead of calling `fail()`, making retries idempotent against
  propagation lag. Genuine failures (auth, network) still abort.
- `scripts/tests/test_ext_publish.py` — new unit test covering both registry
  phrasings, case insensitivity, genuine-failure passthrough, empty output,
  and a result object missing stdout/stderr attributes.
- `CHANGELOG.md` — documented under the 4.0.1 Maintenance block.

### Verification

- `python -m unittest tests.test_ext_publish` — 7 tests pass.
- `python -c "import ast; ast.parse(...)"` — module parses clean.

### Context

At the time of the fix, version 4.0.1 was already live on pub.dev, VS Code
Marketplace, and Open VSX, so no store action remained. The companion change in
the same session excluded `docs/` from `.pubignore` to clear the separate
`dart pub publish --dry-run` exit-65 failure in the GitHub Actions workflow.

### Outstanding

The `.pubignore` and `ext_publish.py` fixes live on branch
`security/audit-phases-1-2`. The GitHub Actions publish workflow runs against
the commit a `v*` tag points to, so the `.pubignore` fix takes effect for CI
only once this branch is merged to `main` ahead of the next version tag.
