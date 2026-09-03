# Archive Seven Fixed Bugs

Seven bug files marked Fixed in commit `97c27b40` were never archived per the
project convention in `bugs/ISSUE_REPORT_GUIDE.md` §Moving to History. This
task moves them to `plans/history/` and repoints cross-references.

## Finish Report (2026-09-03)

### What changed

Seven bug files `git mv`'d from `bugs/` to `plans/history/2026.09/20260903/`:

| Bug | File |
|-----|------|
| 012 | `012_infra_schema_handler_raw_identifier_interpolation.md` |
| 013 | `013_infra_row_endpoints_bypass_encode_safe_json_response.md` |
| 036 | `036_web_viewer_row_filter_double_render_per_keystroke.md` |
| 037 | `037_infra_session_id_predictable_and_collides.md` |
| 063 | `063_infra_readme_documents_nonexistent_app_js_route.md` |
| 075 | `075_infra_web_title_hardcoded_and_misspelled_adviser.md` |
| 076 | `076_infra_extension_manifest_duplicate_log_verbosity_key.md` |

### Cross-reference repoints

Two other bug files referenced the moved paths:

- `bugs/065_proposal_infra_example_and_readme_cover_onclassifiederror.md` line 167:
  `bugs/063_...` → `plans/history/2026.09/20260903/063_...`
- `bugs/073_proposal_ux_data_grid_virtualization_and_render_cost.md` line 195:
  `bugs/036_...` → `plans/history/2026.09/20260903/036_...`

### Verification

- `grep -r "bugs/(012_|013_|036_|037_|063_|075_|076_)"` across the repo
  returns zero hits outside `plans/history/` — no dangling references remain.
- No test files reference any of the moved bug filenames.

### Risk

None. Pure file-move operation. No production code, no test code, no build
artifacts touched.
