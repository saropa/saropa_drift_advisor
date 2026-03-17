# BUG-015: No data masking or PII detection

## Severity: Significant

## Component: Web UI / Server

## Files: `lib/src/server/html_content.dart`, `lib/src/server/table_handler.dart`

## Description

There is no mechanism to detect or redact personally identifiable information
(PII) in the web UI or exports. When debugging with production-like data,
sensitive columns (emails, passwords, tokens, phone numbers, addresses) are
displayed in plain text and included in exports.

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

- Auto-detect common PII column patterns (email, password, phone, ssn, token,
  secret, api_key) via column name heuristics
- Provide a masking toggle (e.g., "Mask sensitive data") in the UI header
- When enabled, mask values with partial redaction (e.g., "j***@example.com",
  "***-***-1234")
- Allow server-side configuration of columns to always mask
- Apply masking to exports as well as the UI display
- Consider a `.drift-mask.json` config file for persistent masking rules
