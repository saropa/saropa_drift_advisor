# BUG-008: Chart rendering is minimal and inflexible — IMPLEMENTED

## Status

Fully implemented. Charts are responsive, have axis labels and optional title, support three new types, and offer PNG/SVG/copy export.

## Summary

- **New chart types:** Stacked bar (group by X, stack segment heights), Area (filled region under line), Scatter (numeric X/Y with two numeric axes).
- **Responsive:** Chart size from `#chart-wrapper` (width + min-height 320px); SVG uses viewBox and preserveAspectRatio. ResizeObserver re-renders on resize (throttled 150ms).
- **Axis labels:** All chart types show X and Y axis titles (default to column names); Y-axis tick labels and optional X labels where applicable.
- **Title:** Optional "Chart title" input in chart controls; rendered above the chart.
- **Export:** PNG (SVG → canvas → download), SVG (serialize and download), Copy image (canvas PNG to clipboard). Buttons disable during async export; Copy shows "Copied!" for 1.5s.
- **UX:** Export toolbar hidden when chart shows only a message (e.g. scatter with no numeric data). applyChartUI guards against missing container. Chart text uses --text-min-readable (12px).

## Files changed

- `lib/src/server/html_content.dart` — Chart type options (stacked-bar, area, scatter), chart title input, chart-wrapper structure (title, description, chart-svg-wrap, chart-export-toolbar).
- `assets/web/app.js` — getChartSize(), applyChartUI(), renderBarChart/StackedBar/Pie/Line/Area/Scatter/Histogram with opts (title, description, xLabel, yLabel); axis titles in SVG; lastChartState and ResizeObserver (throttled); exportChartPng/Svg/Copy with button disable and Copy feedback.
- `assets/web/style.scss` / `assets/web/style.css` — .chart-container, .chart-wrapper, .chart-svg-wrap, .chart-svg, .chart-title, .chart-description, .chart-export-toolbar, .chart-axis-title, .chart-area, .chart-scatter-dot.

## Original description (abbreviated)

Only 4 chart types; no scatter/area/stacked bar; axis labels and legends incomplete; charts fixed size; no export; 10px labels; no title. All addressed: responsive sizing, axis labels, 12px text, PNG/SVG/copy export, optional title, scatter/area/stacked bar.
