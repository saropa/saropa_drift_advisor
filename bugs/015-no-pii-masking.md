# BUG-015: No data masking or PII detection

## Severity: Significant

## Implementation status (partial)

**Done:** User toggle "Mask data" in the UI header; auto-detect PII columns by name (email, password, phone, ssn, token, secret, api_key, address); mask values in table display and in Table CSV export when toggle is on; copy button and cell popup show masked value when on; re-render on toggle. **Not done:** Server-side configuration of columns to always mask; `.drift-mask.json` config file.

## Component: Web UI / Server

## Files: `lib/src/server/html_content.dart`, `lib/src/server/table_handler.dart`

## Description

There is no mechanism to detect or redact personally identifiable information
(PII) in the web UI or exports. When debugging with production-like data,
sensitive columns (emails, passwords, tokens, phone numbers, addresses) are
displayed in plain text and included in exports.

**Requirement:** PII masking must be controlled by a **user toggle** (e.g. in the
UI header). Without a toggle, users cannot choose when to see real data for
debugging vs. when to mask for safety—always-on or always-off masking would be
very confusing.

## Impact

- Teams debugging with production-mirror data risk exposing PII on shared screens
  or in exported files
- No compliance support for GDPR, CCPA, or similar data protection regulations
- Screenshots of the debug UI may inadvertently contain sensitive data
- Exported CSV/SQL dumps include all data unmasked

## Steps to Reproduce

1. Start the debug server with a database containing user PII (email, phone,
   password hashes)
2. Open the web UI and browse the users table
3. Observe: all PII columns displayed in plain text
4. Export as CSV — all PII included unmasked

## Expected Behavior

- **Toggle required:** A clear "Mask sensitive data" (or similar) toggle in the
  UI header so users can turn masking on or off. No auto-only or always-on
  masking—must be user-controllable or the behavior will be confusing.
- Auto-detect common PII column patterns (email, password, phone, ssn, token,
  secret, api_key) via column name heuristics
- When the toggle is *on*, mask values with partial redaction (e.g.,
  "j***@example.com", "***-***-1234")
- Allow server-side configuration of columns to always mask
- Apply masking to exports as well as the UI display
- Consider a `.drift-mask.json` config file for persistent masking rules
