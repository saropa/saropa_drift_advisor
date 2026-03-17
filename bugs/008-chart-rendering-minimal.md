# BUG-008: Chart rendering is minimal and inflexible

## Severity: Significant

## Component: Web UI

## File: `lib/src/server/html_content.dart`

## Description

The charting feature supports only 4 chart types (bar, pie, line/time series,
histogram) with limited customization and several missing standard features:

1. No scatter plot, area chart, or stacked bar chart
2. Axis labels and legends are incomplete or missing depending on data
3. Charts do not resize responsively when the browser window is resized
4. No chart export (PNG, SVG, or clipboard)
5. Chart labels use 10px font — hard to read
6. No chart title or description support

## Impact

- Users with analytical needs must export data to external tools for
  visualization
- Charts may be unreadable on high-DPI or small screens
- No way to save or share chart output

## Steps to Reproduce

1. Run a SQL query that returns numeric data
2. Select "Bar" chart type and appropriate X/Y columns
3. Render the chart
4. Observe: no axis labels, small text, fixed size
5. Resize the browser window — chart does not adapt
6. Try to export the chart — no option available

## Expected Behavior

- Responsive chart sizing that adapts to container width
- Clear axis labels and legend
- Readable font sizes (minimum 12px)
- Export to PNG/SVG via button or right-click
- Consider adding scatter and stacked bar chart types
