# PROPOSAL: Disclose What NL-to-SQL Sends Off the Machine, and Let Users Rotate or Clear the Key

**Status: Open**

Created: 2026-09-02
Type: UX improvement

---

## Summary

**Ask in English** transmits the user's table and column names — up to 80 tables and 32,000
characters — to `https://api.openai.com/v1/chat/completions` by default. The only thing the user is
told is `"Enter API key for NL-to-SQL"`. There is no disclosure of the destination or the payload,
no way to clear or rotate the stored key, and no offline mode in the extension even though the
browser UI ships a pattern-matching engine that needs no network at all.

**Wow: 4/10, Effort: Low**

---

## Motivation

The egress is real and configurable but undisclosed. From `extension/package.json`:

```
driftViewer.nlSql.apiUrl               default "https://api.openai.com/v1/chat/completions"
driftViewer.nlSql.model                default "gpt-4o-mini"
driftViewer.nlSql.maxSchemaTables      default 80
driftViewer.nlSql.maxSchemaContextChars default 32000
```

The consent surface, in full (`extension/src/nl-sql/nl-sql-generation.ts:13-37`):

```ts
const setChoice = await vscode.window.showWarningMessage(
  'No API key configured for NL-to-SQL.',
  'Set API Key',
);
...
const keyInput = await vscode.window.showInputBox({
  prompt: 'Enter API key for NL-to-SQL',
  password: true,
  ignoreFocusOut: true,
});
await context.secrets.store('driftViewer.nlSql.apiKey', keyInput);
```

Storage in `context.secrets` is the right call. What is missing around it:

1. **No statement of destination or payload.** The user is never told that
   `extension/src/nl-sql/schema-context-builder.ts` serialises their schema and
   `extension/src/nl-sql/llm-client.ts:40` posts it with `Authorization: Bearer <key>` to the
   configured `apiUrl`. Table and column names are frequently the most sensitive metadata a
   pre-release app has.

2. **No way to remove the key.** Grep proof:

```bash
grep -rn "secrets.delete" extension/src/
# 0 matches
```

Once stored, the key lives in SecretStorage forever; there is no `driftViewer.nlSql.clearApiKey`
command and no re-prompt path, so a rotated or leaked key can only be replaced by editing VS Code's
secret store outside the extension.

3. **No offline path, though one exists in the sibling client.** README, browser section:
"English questions (count, average, latest, group-by) map via **pattern matching**". The browser
answers a useful class of questions with zero network. The extension's `askNaturalLanguage` has one
mode: call the LLM or fail. The research-frontier note "hybrid NL-to-SQL" records the same gap —
"two disjoint paths shipped, hybrid unbuilt".

---

## Detection / Behavior

### Should flag (problematic)

First invocation of `driftViewer.askNaturalLanguage` on a machine with no stored key: the current
two-step warning + input box, with no mention of the network destination.

### Should pass (correct)

**A. One-time disclosure, before the key prompt.** A modal, not a toast, so it cannot be missed:

```
Ask in English sends your database's table and column names — not row data —
to https://api.openai.com/v1/chat/completions using the model gpt-4o-mini.

Limits: up to 80 tables, 32,000 characters of schema.
Change the endpoint with driftViewer.nlSql.apiUrl (any OpenAI-compatible URL,
including a local model server).

[Continue]  [Use offline patterns instead]  [Cancel]
```

The destination and the two limits must be read from the live settings, not hard-coded, so a user
pointed at a local endpoint sees their own URL. Record consent in workspace state keyed by
`apiUrl`, and re-prompt if `apiUrl` later changes to a different host.

**B. Key management commands**, both hidden from the palette unless a key is stored:

- `driftViewer.nlSql.clearApiKey` — `context.secrets.delete('driftViewer.nlSql.apiKey')`
- `driftViewer.nlSql.setApiKey` — re-prompt and overwrite (rotation)

**C. Offline fallback.** Port the browser's pattern matcher (count / average / latest / group-by)
into `extension/src/nl-sql/` as a `PatternProvider`, tried first. When it produces SQL, no network
call happens at all and the panel labels the result "matched offline". When it does not, offer the
LLM path. This also gives a working **Ask in English** to every user who never configures a key —
which today is a dead command.

**D. State the payload in the settings descriptions.** `config.nlSql.apiUrl.description` should say
what is transmitted, so the disclosure survives even for a user who configures by hand.

---

## Edge Cases

1. **Non-OpenAI / local endpoints** (Ollama, LM Studio, a corporate gateway) — the disclosure must
   print the configured host; showing "OpenAI" for a localhost URL would be a false warning that
   trains users to click through.
2. **`apiUrl` changed after consent** — re-prompt on host change only, not on path or model change,
   or the modal becomes noise.
3. **Key entered as empty string** — currently `if (!keyInput) return false;` handles it; the clear
   command must not leave an empty-string secret behind that reads as "configured".
4. **Offline matcher produces wrong SQL** — it must never auto-run; route through the existing
   `extension/src/nl-sql/sql-validator.ts` and show the SQL for approval, same as the LLM path.
5. **Team settings** — `apiUrl` and `model` are ordinary settings and can be committed to
   `.vscode/settings.json`; the key is not, and the disclosure should say so.
6. **Do not log the key.** The classified-error work (`057_proposal_ux_actionable_error_recovery.md`)
   writes raw errors to the output channel; an LLM 401 body can echo request headers.

---

## Alternatives Considered

- **Rely on the settings description alone.** Users reach the feature through the command, not
  through settings; the description is never read on the path that triggers the egress.
- **Ship only the clear/rotate commands.** Fixes key hygiene, leaves the disclosure gap.
- **Drop the LLM path and use patterns only.** The LLM path answers far more questions; the fix is
  to make the trade explicit and give a working default, not to remove it.

---

## Decision

---

## Implementation Notes

---

## Commits
