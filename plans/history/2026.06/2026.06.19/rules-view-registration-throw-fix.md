# Rules view registration throw on activation

The "Drift Advisor Rules" sidebar (shipped in 4.1.2) registered with
`vscode.window.createTreeView('driftViewer.rules', …)`, which throws "No view is
registered with id: driftViewer.rules" synchronously whenever the editor's
loaded manifest does not yet contain the view contribution. That exception
propagated out of `setupDiagnostics`, interrupting the remaining provider and
command registrations.

## Root cause

`createTreeView` eagerly resolves the named view and throws if the id is not
present in the currently-loaded `package.json` contributions. The Rules view is
a new contribution, so during the window where the extension's compiled JS has
reloaded (now calling `createTreeView('driftViewer.rules')`) but the editor has
not re-read the manifest, the id is absent and the call throws. Because the call
sat inside the argument list of a `context.subscriptions.push(...)`, the throw
aborted that whole registration batch and surfaced as an activation error toast.

## Fix

`extension/src/extension-diagnostics.ts` now uses
`vscode.window.registerTreeDataProvider('driftViewer.rules', rulesProvider)`.
That API does not validate the view id at call time — it stores the provider and
wires it up if/when the view exists — so it never throws on a stale manifest. The
`TreeView` handle returned by `createTreeView` was not used anywhere (no reveal,
selection, or title manipulation beyond the static `view/title` menu button), so
nothing was lost.

Note this is a robustness fix only. The Rules view still requires the editor to
re-read the manifest (a window reload) before it becomes visible, because the
view itself is a new manifest contribution; the fix ensures the absence of that
reload can no longer throw or break diagnostics setup.

## Tests

The `vscode` test mock (`extension/src/test/vscode-mock.ts`) had `createTreeView`
but not `registerTreeDataProvider`; the swap made activation call a missing mock
function, which cascaded into four failures (an activation-resilience error
toast, two manifest-validation failures from the aborted command registrations,
and the disposable-count assertion dropping to 229). Adding
`registerTreeDataProvider` to the mock restored all registrations. Full extension
suite 2883 passing; TypeScript + NLS verify + coverage clean.
