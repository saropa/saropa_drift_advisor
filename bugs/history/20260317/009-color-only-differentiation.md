# BUG-009: Color-only differentiation for severity levels

## Severity: Significant

## Component: Web UI

## File: `lib/src/server/html_content.dart`

## Description

Index suggestion priorities (high/medium/low) rely solely on color
(red/orange/green) to convey severity. Users with color vision deficiency
(affects ~8% of males) cannot distinguish between priority levels.

The anomaly detection section is slightly better — it uses icons (`[!!]`, `[!]`,
`[i]`) alongside colors — but the approach is inconsistent across the UI.

## Impact

- ~8% of male users (and ~0.5% of female users) cannot distinguish priority
  levels in index suggestions
- Inconsistent accessibility treatment across features
- Does not meet WCAG 2.1 Level AA (1.4.1 Use of Color)

## Steps to Reproduce

1. Open a database with tables that trigger index suggestions
2. Click "Analyze" in the Index Suggestions section
3. Observe: priorities are distinguished only by color (red/orange/green)
4. Simulate color blindness (browser DevTools → Rendering → Emulate vision
   deficiencies) — priorities become indistinguishable

## Expected Behavior

- Add text labels ("High", "Medium", "Low") or icons alongside colors
- Use the same icon+color approach used by anomaly detection consistently
- Consider adding pattern fills or shapes as secondary indicators
- Ensure all severity/priority indicators pass WCAG 2.1 Level AA

## Resolution

**Status: FIXED**

Added `[icon]` prefixes alongside color for all severity/priority indicators:

- **Index suggestions**: `[!!] HIGH`, `[!] MEDIUM`, `[✓] LOW` with `priorityIcons` map
- **Slow queries table**: `[!!]` prefix on duration cells
- **Recent queries table**: `[!!]` (>100ms) and `[!]` (>50ms) prefixes with bold weight

All icon values are passed through `esc()` for XSS defense in depth. Anomaly detection and query explain sections already had icons and were left unchanged. All color-coded UI elements now have a non-color differentiator (icon, text label, or symbol prefix), meeting WCAG 2.1 Level AA 1.4.1.
