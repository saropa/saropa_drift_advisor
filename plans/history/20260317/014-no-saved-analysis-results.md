# BUG-014: No saved or shareable analysis results

## Severity: Significant

## Component: Web UI

## File: `lib/src/server/html_content.dart`

## Description

Analysis results from index suggestions, anomaly scans, performance reports, and
database size analytics are ephemeral. Once the user navigates away or refreshes
the page, the results are lost. There is no way to:

1. Save an analysis result for later review
2. Share a specific analysis with a teammate
3. Compare analysis results over time (e.g., "did the anomaly count decrease
   after my fix?")
4. Export analysis results in a structured format

## Impact

- Users must re-run analyses every time they return to the page
- Team debugging workflows suffer — findings cannot be shared easily
- No way to track improvement over time (regression testing for data quality)
- Analysis-heavy workflows are tedious due to repeated re-runs

## Steps to Reproduce

1. Open the web UI and run an anomaly scan
2. Review the results
3. Refresh the page — results are gone
4. Try to share the anomaly results with a teammate — no mechanism available

## Expected Behavior

- Add "Save result" button to each analysis section
- Store saved results in localStorage with timestamp
- Provide "Export as JSON" button for structured sharing
- Consider a "History" dropdown showing past analysis runs
- Allow comparison between saved results ("before/after" view)

---

## Implementation (completed)

- **html_content.dart:** Toolbars added to Index suggestions, Database size analytics, Query performance, and Data health with Save result, Export as JSON, History dropdown, and Compare button.
- **app.js:** Shared helpers (`getSavedAnalyses`, `saveAnalysis`, `getSavedAnalysisById`, `downloadJSON`, `populateHistorySelect`, `showAnalysisCompare`); localStorage key `saropa_analysis_{type}`; cap 50 saved per type. Each section keeps last result, wires Save/Export/History/Compare; Compare opens a modal with Before/After selects and side-by-side panels. Save shows toast on success/failure; Escape closes compare modal.
- **CHANGELOG:** Entry under [2.1.0] Added.
