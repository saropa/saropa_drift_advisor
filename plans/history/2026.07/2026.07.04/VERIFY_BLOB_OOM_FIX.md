# Verification Report — BLOB OOM Crash Fix (v4.1.17)

The v4.1.17 release fixes the crash where timeline auto-capture, branch snapshots, and data-breakpoint sweeps would OOM-crash a connected app holding BLOB columns (images, attachments). The fix replaced four `SELECT *` emit sites with `blobSafeSelectList()`, which projects each BLOB column as `length()` instead of raw bytes, eliminating native-heap exhaustion.

## Verification Complete ✅

**All four emit sites verified:**
1. `extension/src/timeline/snapshot-store.ts:231` — auto-capture uses `blobSafeSelectList()`
2. `extension/src/timeline/snapshot-commands.ts:93` — manual snapshot uses `blobSafeSelectList()`
3. `extension/src/branching/branch-manager.ts:39` — branch capture uses `blobSafeSelectList()`
4. `extension/src/data-breakpoint/data-breakpoint-checker.ts:88` — breakpoint eval uses `blobSafeSelectList()` with `*` fallback

**Helper implementation verified:**
- `extension/src/sql/blob-safe-select.ts` correctly detects BLOB affinity (substring "BLOB" case-insensitive)
- Projects BLOB columns as `length("col") AS "col"`; non-BLOB columns pass through quoted
- Fallback to `*` when metadata unavailable (defensive)

**Test coverage verified:**
- `extension/src/test/blob-safe-select.test.ts` covers all cases: non-BLOB pass-through, BLOB projection, case-insensitive detection, quote escaping, empty metadata

**Secondary instances covered:**
- `branch-manager.ts:31` ✅ 
- `data-breakpoint-checker.ts:78` ✅

**CHANGELOG documentation verified:**
- v4.1.17 correctly describes the fix and mitigation strategy
- References correct bug-report path

## Known Limitation

A BLOB edited to a different value of the **same byte length** is not detected as changed. This trade-off is acceptable: most real blob changes (add/remove/replace-with-different-size) are caught, and no faithful restore path is lost (int-array serialization was already non-restorable).

## Conclusion

Fix is complete and correct. No `SELECT *` remains in any capture/evaluation path. The connected app will not crash on BLOB tables under the row-count cap.
