# BUG-010: Small interactive targets (10px buttons and labels)

## Severity: Significant

## Component: Web UI

## File: `lib/src/server/html_content.dart`

## Description

Several interactive elements in the web UI use very small font sizes and touch
targets:

1. Cell copy buttons use 10px font
2. Chart labels use 10px font
3. Various small clickable elements throughout the UI

These are difficult to use on high-DPI screens and nearly impossible on touch
devices (e.g., debugging on a tablet).

## Impact

- Users with low vision struggle to see and click small targets
- Touch device users (tablet debugging) cannot reliably tap copy buttons
- Does not meet WCAG 2.1 Level AA minimum target size (44x44 CSS pixels for
  touch, 24x24 for pointer per WCAG 2.5.8)

## Steps to Reproduce

1. Open the web UI on a tablet or high-DPI display
2. Navigate to a data table with cell values
3. Try to tap the copy button on a cell — target is very small
4. Render a chart — labels are barely readable at 10px

## Expected Behavior

- Minimum 12px font for all readable text
- Minimum 24x24px interactive target size for pointer devices
- Minimum 44x44px touch target size for touch devices
- Consider increasing copy button size and adding a hover expansion effect
