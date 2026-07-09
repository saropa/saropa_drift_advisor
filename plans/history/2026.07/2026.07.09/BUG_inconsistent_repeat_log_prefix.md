**Status:** Fixed

## Summary

Performance log messages from the Drift debug interceptor were not prefixed with `[Perf]` to identify them as performance issues. The logging system uses `[Perf]` prefix to categorize and filter performance-related logs. Missing prefix prevented proper identification and analysis of N+1 query bursts and slow queries in captured sessions.

## Resolution

- Changed `_lightLog()` in `drift_debug_interceptor.dart` to prefix all performance messages (`REPEAT`, `SLOW`, errors) with `[Perf]`.
- Added clarifying comment on why both `[Perf]` (human-readable) and `Database` debugType tag (machine-readable routing) appear.
- Added missing `sql-formatter` dependency to drift_advisor extension.

ref: 

---

[
  {
    "line": 1676,
    "timestamp": "2026-07-08T23:06:33.671Z",
    "level": "database",
    "category": "console",
    "tag": "log",
    "source": "debug",
    "text": "[log] [database] Drift REPEAT x8 in ≤500ms SELECT: SELECT * FROM \"contact_avatars\" WHERE \"contact_saropa_u_u_i_d\" = ? LIMIT 1; [N+1 origin: DatabaseContactAvatarDriftIO.dbContactAvatarLoad ./lib/database/drift_middleware/user_data/contact_avatar_drift_io.dart:303:11 ← DatabaseContactAvatarDriftIO.dbContactAvatarLoadImage ./lib/database/drift_middleware/user_data/contact_avatar_drift_io.dart:965:42 ← NativeContactAvatarExtensions._nativeGetAvatarImage ./lib/utils/contact/contact_avatar_utils.dart:525:33]  » DriftDebugInterceptor._lightLog (./lib/database/drift/drift_debug_interceptor.dart:282:5)"
  },
  {
    "line": 1677,
    "timestamp": "2026-07-08T23:06:33.840Z",
    "level": "info",
    "category": "stdout",
    "tag": "frame-stall",
    "source": "debug",
    "text": "I/flutter (18406): [frame-stall] total=416ms build=329ms raster=48ms vsyncOverhead=37ms (UI thread was held for the preceding ~329ms of build time)"
  },
  {
    "line": 1678,
    "timestamp": "2026-07-08T23:06:33.840Z",
    "level": "info",
    "category": "stdout",
    "tag": "frame-stall",
    "source": "debug",
    "text": "I/flutter (18406): [frame-stall] total=117ms build=73ms raster=35ms vsyncOverhead=7ms (UI thread was held for the preceding ~73ms of build time)"
  },
  {
    "line": 1679,
    "timestamp": "2026-07-08T23:06:34.458Z",
    "level": "database",
    "category": "console",
    "tag": "log",
    "source": "debug",
    "text": "[log] Repeated log #1 (Drift REPEAT x8 in ≤500ms SELECT: SELECT * FROM \"contact_avatars\" WHERE \"contact_sa …)"
  },
  {
    "line": 1680,
    "timestamp": "2026-07-08T23:06:34.667Z",
    "level": "info",
    "category": "stdout",
    "tag": "frame-stall",
    "source": "debug",
    "text": "I/flutter (18406): [frame-stall] total=366ms build=319ms raster=41ms vsyncOverhead=5ms (UI thread was held for the preceding ~319ms of build time)"
  },
  {
    "line": 1681,
    "timestamp": "2026-07-08T23:06:34.808Z",
    "level": "info",
    "category": "stdout",
    "tag": "frame-stall",
    "source": "debug",
    "text": "I/flutter (18406): [frame-stall] total=201ms build=189ms raster=10ms vsyncOverhead=0ms (UI thread was held for the preceding ~189ms of build time)"
  },
  {
    "line": 1682,
    "timestamp": "2026-07-08T23:06:37.181Z",
    "level": "info",
    "category": "console",
    "tag": "log",
    "source": "debug",
    "text": "[log] Tab Navigation: Media "
  },
  {
    "line": 8,
    "timestamp": "2026-07-08T23:06:37.182Z",
    "level": "info",
    "category": "console",
    "tag": "log",
    "source": "debug",
    "text": "ActivityModelExtensions.dbActivityAdd ./lib/database/drift_middleware/user_data/activity_drift_extensions_io.dart 267:9"
  },
  {
    "line": 9,
    "timestamp": "2026-07-08T23:06:37.182Z",
    "level": "info",
    "category": "console",
    "tag": "log",
    "source": "debug",
    "text": "_MainAppLayoutState._setCurrentTab ./lib/views/main_material_app.dart 1233:9"
  },
  {
    "line": 10,
    "timestamp": "2026-07-08T23:06:37.182Z",
    "level": "info",
    "category": "console",
    "tag": "log",
    "source": "debug",
    "text": "_MainAppLayoutState.build.<fn> ./lib/views/main_material_app.dart 1096:59"
  },
  {
    "line": 1686,
    "timestamp": "2026-07-08T23:06:37.518Z",
    "level": "info",
    "category": "stdout",
    "tag": "frame-stall",
    "source": "debug",
    "text": "I/flutter (18406): [frame-stall] total=242ms build=225ms raster=8ms vsyncOverhead=8ms (UI thread was held for the preceding ~225ms of build time)"
  },
  {
    "line": 1687,
    "timestamp": "2026-07-08T23:06:38.155Z",
    "level": "debug",
    "category": "stdout",
    "tag": "bufferpoolaccessor2.0",
    "source": "debug",
    "text": "D/BufferPoolAccessor2.0(18406): evictor expired: 1, evicted: 0"
  },
  {
    "line": 1688,
    "timestamp": "2026-07-08T23:06:39.084Z",
    "level": "info",
    "category": "stdout",
    "tag": "frame-stall",
    "source": "debug",
    "text": "I/flutter (18406): [frame-stall] total=884ms build=859ms raster=6ms vsyncOverhead=18ms (UI thread was held for the preceding ~859ms of build time)"
  },
  {
    "line": 1689,
    "timestamp": "2026-07-08T23:06:39.383Z",
    "level": "info",
    "category": "stdout",
    "tag": "frame-stall",
    "source": "debug",
    "text": "I/flutter (18406): [frame-stall] total=164ms build=121ms raster=32ms vsyncOverhead=11ms (UI thread was held for the preceding ~121ms of build time)"
  },
  {
    "line": 1690,
    "timestamp": "2026-07-08T23:06:39.660Z",
    "level": "info",
    "category": "console",
    "tag": "log",
    "source": "debug",
    "text": "[log] Record not found for [youTubeUrl]: https://www.youtube.com/@988Lifeline "
  },
  {
    "line": 16,
    "timestamp": "2026-07-08T23:06:39.661Z",
    "level": "info",
    "category": "console",
    "tag": "log",
    "source": "debug",
    "text": "DatabaseYouTubeApiCacheDriftIO.dbYouTubeApiCacheUpdateApiUrl ./lib/database/drift_middleware/user_data/youtube_api_cache_drift_io.dart 415:9"
  },
  {
    "line": 17,
    "timestamp": "2026-07-08T23:06:39.661Z",
    "level": "info",
    "category": "console",
    "tag": "log",
    "source": "debug",
    "text": "YouTubeImportApiUtils.httpFetchYouTubeVideos ./lib/service/youtube_api/youtube_import_api.dart 314:9"
  },
  {
    "line": 18,
    "timestamp": "2026-07-08T23:06:39.661Z",
    "level": "info",
    "category": "console",
    "tag": "log",
    "source": "debug",
    "text": "YouTubeImportEmergencyService._apiHttpFetchEmergencyServiceVideoItem ./lib/service/youtube_api/youtube_import_api_emergency_service.dart 97:11"
  },
  {
    "line": 19,
    "timestamp": "2026-07-08T23:06:39.661Z",
    "level": "info",
    "category": "console",
    "tag": "log",
    "source": "debug",
    "text": "YouTubeImportEmergencyService.apiFetchEmergencyServiceVideos ./lib/service/youtube_api/youtube_import_api_emergency_service.dart 53:50"
  },
  {
    "line": 20,
    "timestamp": "2026-07-08T23:06:39.662Z",
    "level": "info",
    "category": "console",
    "tag": "log",
    "source": "debug",
    "text": "YouTubeImportEmergencyService.apiFetchAllEmergencyServiceVideos ./lib/service/youtube_api/youtube_import_api_emergency_service.dart 163:13"
  },
  {
    "line": 21,
    "timestamp": "2026-07-08T23:06:39.662Z",
    "level": "info",
    "category": "console",
    "tag": "log",
    "source": "debug",
    "text": "YouTubeImportApiUtils.apiFetchAllVideos ./lib/service/youtube_api/youtube_import_api.dart 153:13"
  },
  {
    "line": 22,
    "timestamp": "2026-07-08T23:06:39.663Z",
    "level": "info",
    "category": "console",
    "tag": "log",
    "source": "debug",
    "text": "_SocialWallTabState._backgroundImportVideos ./lib/views/home/social_wall_tab.dart 316:5"
  },
  {
    "line": 23,
    "timestamp": "2026-07-08T23:06:39.663Z",
    "level": "info",
    "category": "console",
    "tag": "log",
    "source": "debug",
    "text": "_SocialWallTabState._initialFetchVideos ./lib/views/home/social_wall_tab.dart 278:9"
  },
  {
    "line": 24,
    "timestamp": "2026-07-08T23:06:39.663Z",
    "level": "info",
    "category": "console",
    "tag": "log",
    "source": "debug",
    "text": "_SocialWallTabState._checkAgeGateAndFetch ./lib/views/home/social_wall_tab.dart 157:7"
  },
  {
    "line": 1700,
    "timestamp": "2026-07-08T23:06:39.669Z",
    "level": "info",
    "category": "console",
    "tag": "log",
    "source": "debug",
    "text": "[log] Missing [videoItems] from [url]: `https://www.youtube.com/@988Lifeline`, [service]: `crisis  - `988 Suicide & Crisis Lifeline` (OTHER [supabaseId: 2723])` "
  },
  {
    "line": 26,
    "timestamp": "2026-07-08T23:06:39.670Z",
    "level": "info",
    "category": "console",
    "tag": "log",
    "source": "debug",
    "text": "YouTubeImportEmergencyService._apiHttpFetchEmergencyServiceVideoItem ./lib/service/youtube_api/youtube_import_api_emergency_service.dart 104:9"
  },
  {
    "line": 27,
    "timestamp": "2026-07-08T23:06:39.670Z",
    "level": "info",
    "category": "console",
    "tag": "log",
    "source": "debug",
    "text": "YouTubeImportEmergencyService.apiFetchEmergencyServiceVideos ./lib/service/youtube_api/youtube_import_api_emergency_service.dart 53:50"
  },
  {
    "line": 28,
    "timestamp": "2026-07-08T23:06:39.670Z",
    "level": "info",
    "category": "console",
    "tag": "log",
    "source": "debug",
    "text": "YouTubeImportEmergencyService.apiFetchAllEmergencyServiceVideos ./lib/service/youtube_api/youtube_import_api_emergency_service.dart 163:13"
  },
  {
    "line": 29,
    "timestamp": "2026-07-08T23:06:39.671Z",
    "level": "info",
    "category": "console",
    "tag": "log",
    "source": "debug",
    "text": "YouTubeImportApiUtils.apiFetchAllVideos ./lib/service/youtube_api/youtube_import_api.dart 153:13"
  },
  {
    "line": 30,
    "timestamp": "2026-07-08T23:06:39.671Z",
    "level": "info",
    "category": "console",
    "tag": "log",
    "source": "debug",
    "text": "_SocialWallTabState._backgroundImportVideos ./lib/views/home/social_wall_tab.dart 316:5"
  },
  {
    "line": 31,
    "timestamp": "2026-07-08T23:06:39.671Z",
    "level": "info",
    "category": "console",
    "tag": "log",
    "source": "debug",
    "text": "_SocialWallTabState._initialFetchVideos ./lib/views/home/social_wall_tab.dart 278:9"
  },
  {
    "line": 32,
    "timestamp": "2026-07-08T23:06:39.672Z",
    "level": "info",
    "category": "console",
    "tag": "log",
    "source": "debug",
    "text": "_SocialWallTabState._checkAgeGateAndFetch ./lib/views/home/social_wall_tab.dart 157:7"
  },
  {
    "line": 1708,
    "timestamp": "2026-07-08T23:06:39.673Z",
    "level": "info",
    "category": "stdout",
    "tag": "frame-stall",
    "source": "debug",
    "text": "I/flutter (18406): [frame-stall] total=178ms build=124ms raster=28ms vsyncOverhead=25ms (UI thread was held for the preceding ~124ms of build time)"
  },
  {
    "line": 1709,
    "timestamp": "2026-07-08T23:06:39.673Z",
    "level": "info",
    "category": "stdout",
    "tag": "frame-stall",
    "source": "debug",
    "text": "I/flutter (18406): [frame-stall] total=127ms build=93ms raster=27ms vsyncOverhead=6ms (UI thread was held for the preceding ~93ms of build time)"
  },
  {
    "line": 1710,
    "timestamp": "2026-07-08T23:06:39.746Z",
    "level": "info",
    "category": "stdout",
    "tag": "frame-stall",
    "source": "debug",
    "text": "I/flutter (18406): [frame-stall] total=149ms build=133ms raster=13ms vsyncOverhead=2ms (UI thread was held for the preceding ~133ms of build time)"
  },
  {
    "line": 1711,
    "timestamp": "2026-07-08T23:06:40.173Z",
    "level": "database",
    "category": "console",
    "tag": "log",
    "source": "debug",
    "text": "[log] [database] Drift REPEAT x8 in ≤500ms SELECT: SELECT * FROM \"image_blur_metas\" WHERE \"url\" = ? LIMIT 1; [N+1 origin: ImageBlurMetaDriftIO.dbLoadByUrl ./lib/database/drift_middleware/user_data/image_blur_meta_drift_io.dart:45:11 ← _NetworkImagePlaceholderState._loadHash ./lib/components/primitive/image/common_network_image.dart:504:40]  » DriftDebugInterceptor._lightLog (./lib/database/drift/drift_debug_interceptor.dart:282:5)"
  }
]