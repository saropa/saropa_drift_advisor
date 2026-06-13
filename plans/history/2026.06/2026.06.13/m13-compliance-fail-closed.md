# Naming-compliance config fails closed (audit M13)

The naming-convention matcher returned `true` for an unknown convention, so a typo in `.drift-rules.json` (for example `"snakecase"` instead of `"snake_case"`) silently marked every name compliant — disabling the rule with no signal. The compliance config parser also accepted any non-null object, but `typeof [] === 'object'`, so a JSON array passed as a valid config.

## Finish Report (2026-06-13)

This work will be reviewed by another AI. — (chat-time note; not part of the durable record.)

### Scope

(B) VS Code extension (TypeScript). No Dart, no Flutter, no docs beyond the changelog.

### What changed

- **`extension/src/compliance/naming-matcher.ts`** — `matchesConvention` now returns `false` (fail closed) for an unknown convention instead of `true`. Added `isKnownConvention`, a type guard so callers can validate a configured convention rather than silently disabling the check.
- **`extension/src/compliance/compliance-config.ts`** — `_parseConfig` rejects arrays (`Array.isArray`) in addition to non-objects/null, so a JSON array is no longer cast to a config.

### Verification

- `tsc --noEmit -p ./` — clean.
- Added: `matchesConvention` returns false for an unknown convention; `isKnownConvention` distinguishes a valid convention from a typo. Existing compliance/naming suites pass unchanged. Full extension suite passes (2749).

### Outstanding

None for this item.
