# FEATURE: Custom lint rule to catch ignored `Disposable`/`Event<T>` returns

**Status: Open**

Created: 2026-09-07
Component: Extension (build tooling)

---

## Summary

`BUG_INFRA_ACTIVATION_EVENT_SUBSCRIPTIONS_DISCARDED` (closed, archived at
`plans/history/2026.09/2026.09.07/`) found three sites in
`extension-activation-event-wiring.ts` where a VS Code `Event<T>` subscription
returned a `Disposable` that was discarded instead of pushed onto
`context.subscriptions`. TypeScript raises nothing for an ignored return
value, so nothing short of manual review catches this shape.

The original bug report suggested a follow-up: a small custom ESLint rule (or
a `no-floating-disposable` convention) that flags a call whose return type is
`vscode.Disposable` / `{ dispose(): void }` when the result is not assigned,
returned, or passed to `.push(...)`. `@typescript-eslint/no-unused-expressions`
does not catch this shape (the call result is simply dropped, not an
expression statement flagged by that rule).

## Why not done now

This repo currently has **no ESLint configuration at all** — no `.eslintrc*`,
no `eslint.config.*`, no ESLint devDependency. Implementing this rule would
require:
- Adding ESLint (+ `@typescript-eslint` tooling) as a new devDependency.
- Writing and wiring a custom rule/plugin.
- Adding a build/pre-commit step (likely husky) to run it.

That's a new-dependency + shared-build-infrastructure change, out of scope
for a three-line disposal-hygiene fix, and risky to start while other build
config work is in flight elsewhere in the repo.

## Fix sketch (unchanged from the original bug report)

A rule that inspects call expressions whose declared return type structurally
matches `{ dispose(): void }` (covers both `vscode.Disposable` and the
project's own `onDidChange(...)` handles like `GenerationWatcher`), and flags
any such call used as a bare expression statement (return value discarded).

## Impact if left undone

No user-facing impact — this is a code-quality/regression-prevention gap.
The next occurrence of this bug shape will only be caught by manual review,
as this one was.
