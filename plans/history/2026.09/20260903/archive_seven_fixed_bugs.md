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

### Dangling-reference gate (Gate 8)

New `scripts/check_bug_ref_dangling.py` added to pre-commit as Gate 8. Scans
staged text files for `bugs/<file>.md` paths where the target no longer exists.
Features:

- `--all` flag scans every tracked file (repo-wide sweeps, not just staged)
- Suggests the archived path when found in `plans/history/`
- `ref-exempt:` line marker exempts template examples and deleted-file refs
- Excludes `CHANGELOG*.md`, `plans/history/`, `docs/handover/` (historical)
- Broad text-extension coverage (`.md`, `.py`, `.dart`, `.ts`, `.html`, etc.)

### Repo-wide dangling-reference cleanup

Initial `--all` scan found 31 dangling refs. Resolved all:

- 11 code-comment paths repointed to their archived locations in
  `anomaly_detector.dart`, `blob_safe_select.dart`, `mutation_tracker.dart`,
  `snapshot_handler.dart`, `esc.test.mjs`, `anomaly_detector_test.dart`
- 6 template examples in `ISSUE_REPORT_GUIDE.md` marked `ref-exempt:`
- 5 deleted-file refs (no archive target) marked `ref-exempt: deleted`
- 1 test fixture string marked `ref-exempt: test fixture`
- Remaining excluded by CHANGELOG/history prefix filters

Final scan: 1307 tracked files, 0 dangling references.

### Risk

Low. Comment-only changes to production code (path updates). No behavioral
changes. `anomaly_detector_test.dart` passes 815/815.
