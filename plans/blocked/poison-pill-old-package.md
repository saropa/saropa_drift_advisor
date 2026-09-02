# Deferred — Poison-Pill the Old `saropa_drift_viewer` Package

## Status

**DEFERRED — blocked on pub.dev admin access.** Split out of
[67 — Fix pub.dev Publisher Identity](../history/2026.06/2026.06.14/fix-pub-dev-publisher.md), whose
Phases 1–3 (code rename, repo rename, first publish under the correct
publisher) are complete. The two phases below are the only remaining work and
cannot proceed until pub.dev grants admin access or discontinues the old
package.

## Background

The old `saropa_drift_viewer` package on pub.dev is owned by a CI OIDC service
identity. No human can reach its Admin tab to transfer, discontinue, or retract
it. The replacement package `saropa_drift_advisor` is already published under
the `saropa.com` verified publisher. The remaining goal is to mark the old
package deprecated so existing users are pointed at the replacement.

### What was already tried (on the old package)

| Action | Result |
|--------|--------|
| `dart pub uploader add` via CI (`add-uploader.yml`) | Command deprecated, exit code 1 |
| Filed [dart-lang/pub-dev#9261](https://github.com/dart-lang/pub-dev/issues/9261) | Closed, told to use `support@pub.dev` |
| OIDC API calls via `fix-publisher.yml` (run #1, 2026-03-10) | All 5 endpoints returned 401 — admin APIs reject GitHub OIDC tokens |
| Poison pill via CI (push `v0.2.5` tag, 2026-03-10) | `publish.yml` failed: "publishing from github is not enabled" — OIDC was never configured on pub.dev for this package |

## BLOCKED: Phase 4 — Poison Pill

The `poison-pill` branch and `v0.2.5` tag exist on the remote, ready to
publish a deprecated version of `saropa_drift_viewer`. CI publishing failed
because OIDC was never properly configured on pub.dev for this package
(v0.2.3 and v0.2.4 CI publishes also failed — only v0.2.2 was ever published).

**To unblock**, one of:

1. Email `support@pub.dev` to request admin access or discontinuation
2. Get OIDC publishing enabled via pub.dev admin (requires access)
3. If admin access is granted, publish the poison pill locally

### Poison pill contents (on `poison-pill` branch)

- `pubspec.yaml`: name `saropa_drift_viewer`, version `0.2.5`, deprecation description
- `lib/saropa_drift_viewer.dart`: empty (no exports)
- `README.md`: deprecation notice pointing to `saropa_drift_advisor`
- All `lib/src/` deleted

### Why 0.2.5 (not 1.0.0)

Existing users have `^0.2.x` constraints. A 0.2.5 patch will auto-resolve
on their next `pub get`, showing them the deprecation. A 1.0.0 would not
be pulled by `^0.2.x` constraints and would be ignored.

## Phase 5 — Cleanup (after Phase 4)

- Delete `poison-pill` branch from remote
- Confirm old package shows deprecation on pub.dev

## Prevention (for all future packages)

1. **Always publish the first version locally** with `dart pub publish`
2. **Transfer to `saropa.com`** via the Admin tab on pub.dev
3. **Then** enable the GitHub Actions OIDC workflow for subsequent versions

## References

- [dart-lang/pub-dev#9261](https://github.com/dart-lang/pub-dev/issues/9261)
- [Automated publishing docs](https://dart.dev/tools/pub/automated-publishing)
- [Verified publishers docs](https://dart.dev/tools/pub/verified-publishers)
