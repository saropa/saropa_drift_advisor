Status: Fixed

## SOURCE

1. Main Thread Exhaustion

Your Flutter app's main thread (which handles the UI) is being heavily blocked. The Android Choreographer repeatedly warns that it is skipping massive amounts of frames—up to 378 frames at one point, and 370 frames at another. Later, it skips another 58 frames. This indicates that synchronous, heavy computations or massive data parsing operations are blocking the UI from rendering, causing the "locked up" frozen screen experience.  
2. Severe Database Bottlenecks

Your DriftDebugInterceptor is flagging multiple severe database issues right up until the freeze:

    The N+1 Query Problem: Right before the freeze, the app executes the exact same query (SELECT * FROM "contact_groups" WHERE "contact_group_saropa_u_u_i_d" = ? LIMIT 1) 8 times in under 500ms. This usually happens when a ListView or similar UI component builds its children and fires off an individual database query for every single item on the screen.  

    Heavy Aggregation on the Main Thread: The very last log from your app is a massive SUM query on the public_figure_events table that takes 398ms to execute.  

    Massive 'IN' Clauses: Earlier in the log, there is a SELECT query on the activities table with an enormous IN (?, ?, ...) clause containing hundreds of parameters. Passing this many parameters is highly inefficient and forces SQLite to work overtime.  

3. System Memory Pressure (OOM)

Because the app is rapidly requesting and holding onto so much data, the Android OS triggers its lowmemorykiller due to "PSI critical events". The system starts aggressively freezing background apps to free up RAM (reason = oom_cached). If your app pulls thousands of rows into memory at once without paginating them, the garbage collector runs continuously, further freezing the app.  
Recommended Next Steps

To unfreeze the app, you will need to optimize how data is fetched and parsed:

    Move DB Operations to a Background Isolate: Ensure your Drift database operations (especially the parsing of large result sets) are utilizing Flutter's compute function or running in a separate Isolate so they do not block the UI thread.

    Fix the N+1 Queries: Instead of querying contact_groups one by one for each contact in your UI, fetch them all at once in a single query using a JOIN or by fetching a batch ahead of time.

    Implement Pagination: Do not load the entire activities or contacts table into memory at once. Use LIMIT and OFFSET to load data only as the user scrolls.

---

 app locks up here:d:\src\contacts\reports\20260616\20260616_224142_contacts.log

[log] Notifications not allowed, skipping scheduling.

./lib/service/notification/notification_service_init.dart 209:9 NotificationService.scheduleNotificationsDeferred

dart:async Future.timeout.<fn>

./lib/utils/system/profiled_execution_extensions.dart 69:7 StartupTaskRunner.run

./lib/views/main_startup_utils.dart 399:9 MainStartupProcessDeferredUtils.initializeDeferredServices

./lib/views/main_startup_utils.dart 214:7 MainStartupProcessDeferredUtils.runPostOnboardingTasks

./lib/main.dart 612:5 _runBackgroundStartupTasks

[log] [database] Drift SLOW 501ms SELECT: SELECT * FROM "contacts" WHERE ((1 AND "hidden_at" IS NULL) AND "biometric_lock_at" IS NULL) AND "primary_contact_u_u_i_d" IS NULL; » DriftDebugInterceptor._lightLog (./lib/database/drift/drift_debug_interceptor.dart:204:5)

[log] [database] Drift SLOW 134ms SELECT: SELECT * FROM "contact_points" ORDER BY rowid LIMIT 1000 » DriftDebugInterceptor._lightLog (./lib/database/drift/drift_debug_interceptor.dart:204:5)

[log] [database] Drift SLOW 102ms SELECT: SELECT * FROM "country_states" ORDER BY rowid LIMIT 1000 » DriftDebugInterceptor._lightLog (./lib/database/drift/drift_debug_interceptor.dart:204:5)

[log] [database] Drift REPEAT x8 in ≤500ms SELECT: SELECT * FROM "contact_groups" WHERE "contact_group_saropa_u_u_i_d" = ? LIMIT 1; » DriftDebugInterceptor._lightLog (./lib/database/drift/drift_debug_interceptor.dart:204:5)

[log] [database] Drift SLOW 398ms SELECT: SELECT SUM(CASE WHEN "id" IS NULL THEN 1 ELSE 0 END) AS "id_nulls", SUM(CASE WHEN "version" IS NULL THEN 1 ELSE 0 END) AS "version_nulls", SUM(CASE WHEN "date_json" IS NULL THEN 1 ELSE 0 END) AS "date_json_nulls", SUM(CASE WHEN "event_description" IS NULL THEN 1 ELSE 0 END) AS "event_description_nulls", SUM(CASE WHEN "event_type_name" IS NULL THEN 1 ELSE 0 END) AS "event_type_name_nulls", SUM(CASE WHEN "name" IS NULL THEN 1 ELSE 0 END) AS "name_nulls", SUM(CASE WHEN "wikidata_id" IS NULL THEN 1 ELSE 0 END) AS "wikidata_id_nulls", SUM(CASE WHEN "industry_names" IS NULL THEN 1 ELSE 0 END) AS "industry_names_nulls" FROM "public_figure_events" » DriftDebugInterceptor._lightLog (./lib/database/drift/drift_debug_interceptor.dart:204:5)

## INITIAL ANLYSIS

I'll investigate the freeze. The standout signal in your log isn't the contacts queries — it's that 398ms SUM(CASE WHEN ... IS NULL ...) null-count audit query on public_figure_events. That's a data-quality diagnostic, not something UI rendering needs. Let me trace what fires it and the N+1 contact_groups loop.

Grep "id_nulls|_nulls|SUM\(CASE WHEN"
2 lines of output
Grep "public_figure_events|PublicFigureEvent"
106 lines of output
The null-count query is built dynamically (no literal match in lib/). Let me find the audit code that generates it and trace the startup diagnostics.

Grep "nulls|nullCount|null_count|columnAudit|dataQuality|data_quality|integrityCheck|auditNull" (glob: lib/**/*.dart)
16 lines of output
Grep "SUM\(|countWhere|isNull THEN|customSelect|customStatement" (glob: lib/database/**/*.dart)
5 lines of output
isar_drift_row_count_audit.dart is the prime suspect. Let me read it and find where it's invoked at startup.

Read d:\src\contacts\lib\database\debug\isar_drift_row_count_audit.dart
Grep "nulls|IS NULL THEN 1|columnNullAudit|NullAudit|nullScan"
35 lines of output
The row-count audit uses COUNT(*), not the SUM null query. The SUM-null query audits specific columns. Let me find its generator — and critically, what runs it at startup.

Grep "_nulls|IS NULL THEN 1 ELSE 0|nullAudit|NullColumn|verifyStaticData|staticDataAudit|columnNull" (glob: lib/**/*.dart)
1 line of output
Grep "SUM\(CASE|_nulls|nullColumnReport|nullColumnAudit|columnHealth|driftStaticAudit"
2 lines of output
Not in lib/. There's a saropa_drift_advisor in your working dirs and memory mentions "drift-advisor diagnostics." Let me check the interceptor and DB config for where this null-audit hooks in.

Read d:\src\contacts\lib\database\drift\drift_database_config.dart
Grep "advisor|Advisor|nulls|audit|Audit|analyze|Analyze|health|Health" (glob: lib/database/drift/**/*.dart)
41 lines of output
The interceptor comment at line 281 names "database_stats_screen, advisor" as the source of these aggregate queries. Let me read the actual log sequence and that interceptor section to see whether this is genuinely startup or a stats screen.

Read d:\src\contacts\lib\database\drift\drift_debug_interceptor.dart (lines 251-330)
Grep "_nulls|public_figure_events|SUM\(CASE|database_stats|DatabaseStats|advisor|Advisor" (in d:\src\contacts\reports\20260616\20260616_224142_contacts.log)
2 lines of output
Bash Show log size and tail
IN
wc -l "d:/src/contacts/reports/20260616/20260616_224142_contacts.log"; echo "---TAIL 60---"; tail -60 "d:/src/contacts/reports/20260616/20260616_224142_contacts.log"

OUT
965 d:/src/contacts/reports/20260616/20260616_224142_contacts.log
---TAIL 60---
[22:44:52.668] [console] [log] [database] Drift SLOW 134ms SELECT: SELECT * FROM "contact_points" ORDER BY rowid LIMIT 1000  » DriftDebugInterceptor._lightLog (./lib/database/drift/drift_debug_interceptor.dart:204:5)
[22:44:53.235] [console] [log] [database] Drift SLOW 102ms SELECT: SELECT * FROM "country_states" ORDER BY rowid LIMIT 1000  » DriftDebugInterceptor._lightLog (./lib/database/drift/drift_debug_interceptor.dart:204:5)
[22:44:54.954] [logcat] 06-16 22:44:55.165  1925 14688 D ActivityManager: unfreezing ProcessRecord{a5fd3d4 25991:com.google.android.apps.messaging/u0a188}, reason = shouldNotFreeze_provider: ProcessRecord{74f7a63 16886:com.google.android.apps.messaging:rcs/u0a188}, adj = 200, adjType = provider, adjSource = ProcessRecord{74f7a63 16886:com.google.android.apps.messaging:rcs/u0a188}
[22:44:54.964] [logcat] 06-16 22:44:55.173  1925 14688 D ActivityManager: sync unfroze 25991 com.google.android.apps.messaging for 7
[22:44:57.835] [logcat] 06-16 22:44:58.050  1925  2242 D ActivityManager: freezing 5467 com.google.android.gm, reason = oom_cached
[22:44:59.050] [logcat] 06-16 22:44:59.266  1925  2242 D ActivityManager: freezing 8413 com.android.rkpdapp, reason = oom_cached
[22:45:03.471] [logcat] 06-16 22:45:03.686  1925  2242 D ActivityManager: freezing 6351 com.android.keychain, reason = oom_cached
[22:45:04.738] [logcat] 06-16 22:45:04.950  1925  2242 D ActivityManager: freezing 6081 com.google.android.gms.unstable, reason = oom_cached
[22:45:05.967] [logcat] 06-16 22:45:06.178  1925  2242 D ActivityManager: freezing 25552 com.android.vending, reason = oom_cached
[22:45:05.969] [logcat] 06-16 22:45:06.182  1925  2242 D ActivityManager: freezing 25718 com.android.vending:background, reason = oom_cached
[22:45:06.111] [console] [log] [database] Drift REPEAT x8 in ≤500ms SELECT: SELECT * FROM "contact_groups" WHERE "contact_group_saropa_u_u_i_d" = ? LIMIT 1;  » DriftDebugInterceptor._lightLog (./lib/database/drift/drift_debug_interceptor.dart:204:5)
[22:45:06.401] [logcat] 06-16 22:45:06.613  1925  2242 D ActivityManager: freezing 6471 com.facebook.katana, reason = oom_cached
[22:45:06.544] [console] [log] [database] Drift SLOW 398ms SELECT: SELECT SUM(CASE WHEN "id" IS NULL THEN 1 ELSE 0 END) AS "id_nulls", SUM(CASE WHEN "version" IS NULL THEN 1 ELSE 0 END) AS "version_nulls", SUM(CASE WHEN "date_json" IS NULL THEN 1 ELSE 0 END) AS "date_json_nulls", SUM(CASE WHEN "event_description" IS NULL THEN 1 ELSE 0 END) AS "event_description_nulls", SUM(CASE WHEN "event_type_name" IS NULL THEN 1 ELSE 0 END) AS "event_type_name_nulls", SUM(CASE WHEN "name" IS NULL THEN 1 ELSE 0 END) AS "name_nulls", SUM(CASE WHEN "wikidata_id" IS NULL THEN 1 ELSE 0 END) AS "wikidata_id_nulls", SUM(CASE WHEN "industry_names" IS NULL THEN 1 ELSE 0 END) AS "industry_names_nulls" FROM "public_figure_events"  » DriftDebugInterceptor._lightLog (./lib/database/drift/drift_debug_interceptor.dart:204:5)
[22:45:07.876] [logcat] 06-16 22:45:08.086  1925  2242 D ActivityManager: freezing 4774 com.google.android.gms, reason = oom_cached
[22:45:11.434] [logcat] 06-16 22:45:11.643  1925 14641 D ActivityManager: unfreezing ProcessRecord{85dec94 4774:com.google.android.gms/u0a236}, reason = shouldNotFreeze_service_1: ProcessRecord{9b6cde 24288:com.google.android.gms.persistent/u0a236}, adj = 100, adjType = service, adjSource = ProcessRecord{9b6cde 24288:com.google.android.gms.persistent/u0a236}
[22:45:11.439] [logcat] 06-16 22:45:11.648  1925 14641 D ActivityManager: sync unfroze 4774 com.google.android.gms for 4
[22:45:36.519] [logcat] 06-16 22:45:36.730  1925  2242 D ActivityManager: freezing 4774 com.google.android.gms, reason = oom_cached
[22:46:20.143] [logcat] 06-16 22:46:20.348  1925 14740 D ActivityManager: unfreezing ProcessRecord{e8bc379 5660:com.motorola.screenshoteditor/u0a288}, reason = oom_uncached, adj = 0, adjType = exec-service, adjSource = null
[22:46:20.143] [logcat] 06-16 22:46:20.349  1925 14740 D ActivityManager: sync unfroze 5660 com.motorola.screenshoteditor for 5
[22:46:30.200] [logcat] 06-16 22:46:30.410  1925  2242 D ActivityManager: freezing 5660 com.motorola.screenshoteditor, reason = oom_cached
[22:46:56.168] [logcat] 06-16 22:46:56.370  1925  1997 D ActivityManager: unfreezing ProcessRecord{a912e90 6471:com.facebook.katana/u0a402}, reason = unfreezeTemporarily, adj = 915, adjType = cch-empty, adjSource = null
[22:46:56.169] [logcat] 06-16 22:46:56.372  1925  1997 D ActivityManager: sync unfroze 6471 com.facebook.katana for 3
[22:47:06.216] [logcat] 06-16 22:47:06.420  1925  2242 D ActivityManager: freezing 6471 com.facebook.katana, reason = unfreezeTemporarily
[22:48:12.742] [logcat] 06-16 22:48:12.946  1145  1145 D Zygote  : Forked child process 8546
[22:48:12.742] [logcat] 06-16 22:48:12.947  1925  1998 I ActivityManager: Start proc 8546:com.google.android.calendar/u0a312 for service {com.google.android.calendar/androidx.work.impl.background.systemjob.SystemJobService}
[22:48:12.904] [logcat] 06-16 22:48:13.108  1145  1145 D Zygote  : Forked child process 8566
[22:48:12.904] [logcat] 06-16 22:48:13.108  1925  1998 I ActivityManager: Start proc 8566:com.android.providers.calendar/u0a145 for content provider {com.android.providers.calendar/com.android.providers.calendar.CalendarProvider2}
[22:48:12.965] [logcat] 06-16 22:48:13.169  1925 14688 D ActivityManager: unfreezing ProcessRecord{85dec94 4774:com.google.android.gms/u0a236}, reason = shouldNotFreeze_service_1: ProcessRecord{e60b92 8546:com.google.android.calendar/u0a312}, adj = 100, adjType = service, adjSource = ProcessRecord{e60b92 8546:com.google.android.calendar/u0a312}
[22:48:12.967] [logcat] 06-16 22:48:13.171  1925 14688 D ActivityManager: sync unfroze 4774 com.google.android.gms for 4
[22:48:12.991] [logcat] 06-16 22:48:13.194  1925  2718 I ActivityManager: Flag disabled. Ignoring finishAttachApplication from uid: 10145. pid: 8566
[22:48:12.999] [logcat] 06-16 22:48:13.200  1925 14688 I ActivityManager: Flag disabled. Ignoring finishAttachApplication from uid: 10312. pid: 8546
[22:48:23.118] [logcat] 06-16 22:48:23.322  1925  2242 D ActivityManager: freezing 8546 com.google.android.calendar, reason = oom_cached
[22:48:23.121] [logcat] 06-16 22:48:23.324  1925  2242 D ActivityManager: freezing 8566 com.android.providers.calendar, reason = oom_cached
[22:49:08.716] [logcat] 06-16 22:49:08.906  1925  1997 D ActivityManager: unfreezing ProcessRecord{dd1bc98 30210:com.google.android.apps.turbo/u0a281}, reason = unfreezeTemporarily, adj = 925, adjType = cch-empty, adjSource = null
[22:49:08.716] [logcat] 06-16 22:49:08.907  1925  1997 D ActivityManager: sync unfroze 30210 com.google.android.apps.turbo for 3
[22:49:08.723] [logcat] 06-16 22:49:08.915  1925  1925 W ActivityManager: Unable to start service Intent { act=com.motorola.batterycare.services.ACTION_NOTIFY_EVENT pkg=com.motorola.batterycare (has extras) } U=0: not found
[22:49:18.744] [logcat] 06-16 22:49:18.935  1925  2242 D ActivityManager: freezing 30210 com.google.android.apps.turbo, reason = oom_cached
[22:53:41.451] [logcat] 06-16 22:53:41.641  1925  1997 D ActivityManager: unfreezing ProcessRecord{dd1bc98 30210:com.google.android.apps.turbo/u0a281}, reason = unfreezeTemporarily, adj = 925, adjType = cch-empty, adjSource = null
[22:53:41.455] [logcat] 06-16 22:53:41.643  1925  1997 D ActivityManager: sync unfroze 30210 com.google.android.apps.turbo for 3
[22:53:41.455] [logcat] 06-16 22:53:41.645  1925  1925 W ActivityManager: Unable to start service Intent { act=com.motorola.batterycare.services.ACTION_NOTIFY_EVENT pkg=com.motorola.batterycare (has extras) } U=0: not found
[22:53:51.500] [logcat] 06-16 22:53:51.696  1925  2242 D ActivityManager: freezing 30210 com.google.android.apps.turbo, reason = oom_cached
[22:54:06.861] [logcat] 06-16 22:54:07.053  1925  2242 D ActivityManager: freezing 4774 com.google.android.gms, reason = oom_cached
[22:54:09.263] [logcat] 06-16 22:54:09.444  1925 14641 I WindowManager: WIN DEATH: Window{226ddc u0 GoogleDiscoverWindow}
[22:54:09.263] [logcat] 06-16 22:54:09.446  1925 14740 I ActivityManager: appDiedLocked: app=ProcessRecord{bd1b071 14045:com.google.android.googlequicksearchbox:googleapp/u0a230} thread=android.os.BinderProxy@b5dd59 fromBinderDied=true isKilledByAm=false reason=null
[22:54:09.263] [logcat] 06-16 22:54:09.446  1925 14740 I ActivityManager: Process com.google.android.googlequicksearchbox:googleapp (pid 14045) has died: cch CACC
[22:54:09.263] [logcat] 06-16 22:54:09.447  1925 14740 W ActivityManager: Scheduling restart of crashed service com.google.android.googlequicksearchbox/com.google.android.apps.gsa.nowoverlayservice.DrawerOverlayService in 1000ms for connection
[22:54:09.263] [logcat] 06-16 22:54:09.448  1145  1145 I Zygote  : Process 14045 exited due to signal 9 (Killed)
[22:55:11.511] [logcat] 06-16 22:55:11.703  1925  1968 D ActivityManager: unfreezing ProcessRecord{85dec94 4774:com.google.android.gms/u0a236}, reason = shouldNotFreeze_service_1: ProcessRecord{9b6cde 24288:com.google.android.gms.persistent/u0a236}, adj = 100, adjType = service, adjSource = ProcessRecord{9b6cde 24288:com.google.android.gms.persistent/u0a236}
[22:55:11.518] [logcat] 06-16 22:55:11.708  1925  1968 D ActivityManager: sync unfroze 4774 com.google.android.gms for 4
[22:55:15.076] [logcat] 06-16 22:55:15.259  1925  1997 D ActivityManager: unfreezing ProcessRecord{47d2918 23843:com.facebook.services/u0a208}, reason = unfreezeTemporarily, adj = 945, adjType = cch-started-services, adjSource = null
[22:55:15.076] [logcat] 06-16 22:55:15.265  1925  1997 D ActivityManager: sync unfroze 23843 com.facebook.services for 3
[22:55:25.146] [logcat] 06-16 22:55:25.309  1925  2242 D ActivityManager: freezing 23843 com.facebook.services, reason = oom_cached
[22:55:36.607] [logcat] 06-16 22:55:36.799  1925  2242 D ActivityManager: freezing 4774 com.google.android.gms, reason = oom_cached
[22:56:41.330] [logcat] 06-16 22:56:41.518  1925  1968 D ActivityManager: unfreezing ProcessRecord{85dec94 4774:com.google.android.gms/u0a236}, reason = unfreezeTemporarily, adj = 920, adjType = service, adjSource = ProcessRecord{e60b92 8546:com.google.android.calendar/u0a312}
[22:56:41.331] [logcat] 06-16 22:56:41.519  1925  1968 D ActivityManager: sync unfroze 4774 com.google.android.gms for 27
[22:57:06.463] [logcat] 06-16 22:57:06.650  1925  2242 D ActivityManager: freezing 4774 com.google.android.gms, reason = oom_cached
[22:58:11.155] [logcat] 06-16 22:58:11.341  1925  1997 D ActivityManager: unfreezing ProcessRecord{dd1bc98 30210:com.google.android.apps.turbo/u0a281}, reason = unfreezeTemporarily, adj = 925, adjType = cch-empty, adjSource = null
[22:58:11.155] [logcat] 06-16 22:58:11.342  1925  1997 D ActivityManager: sync unfroze 30210 com.google.android.apps.turbo for 3
[22:58:11.164] [logcat] 06-16 22:58:11.346  1925  1925 W ActivityManager: Unable to start service Intent { act=com.motorola.batterycare.services.ACTION_NOTIFY_EVENT pkg=com.motorola.batterycare (has extras) } U=0: not found
[22:58:21.211] [logcat] 06-16 22:58:21.396  1925  2242 D ActivityManager: freezing 30210 com.google.android.apps.turbo, reason = oom_cached
The app's final emitted line is the 398ms SUM-null query at 22:45:06 — everything after is just Android freezing other apps. So the freeze coincides with drift-advisor "fingerprinting" (the interceptor comment names it). This is a column-null full-table scan on a large static table. Let me find what invokes the advisor at startup.

Grep "drift_advisor|DriftAdvisor|fingerprint|Fingerprint|advisor" (glob: lib/**/*.dart)
51 lines of output
Bash Find advisor in pubspec and startup
IN
grep -rn "drift_advisor\|saropa_drift_advisor\|DriftAdvisor\|fingerprint" "d:/src/contacts/pubspec.yaml" 2>/dev/null; echo "---"; grep -n "advisor\|Advisor" "d:/src/contacts/lib/main.dart" "d:/src/contacts/lib/views/main_startup_utils.dart" 2>/dev/null

OUT
430:  # On supported devices, this includes authentication with biometrics such as fingerprint
526:  # https://pub.dev/packages/saropa_drift_advisor
527:  saropa_drift_advisor: ^4.0.2
---
d:/src/contacts/lib/main.dart:131:import 'package:saropa_drift_advisor/saropa_drift_advisor.dart';
d:/src/contacts/lib/main.dart:494:    // Gated additionally on `EnvType.DriftAdvisorEnabled` (default: off) so a
d:/src/contacts/lib/main.dart:495:    // fresh debug session is quiet — the advisor's column-profiling sweep
d:/src/contacts/lib/main.dart:502:        EnvType.DriftAdvisorEnabled.boolValue) {
d:/src/contacts/lib/main.dart:514:      // The advisor is the source of the "listening on localhost:8642" port
d:/src/contacts/lib/main.dart:518:      // in release the advisor is never expected to run.
d:/src/contacts/lib/main.dart:521:        if (!EnvType.DriftAdvisorEnabled.boolValue) 'DriftAdvisorEnabled override is OFF',
d:/src/contacts/lib/main.dart:524:        'Drift Advisor skipped: ${failed.join('; ')} '
d:/src/contacts/lib/main.dart:526:        'advisorEnabled=${EnvType.DriftAdvisorEnabled.boolValue}). '
d:/src/contacts/lib/main.dart:527:        'Enable via the User Env Override list → "Drift Advisor Enabled".',
Confirmed: the freeze source is the saropa_drift_advisor package (pubspec line 527), whose column-profiling sweep runs the SUM-null full-table scans. It's gated on debug + an env override. Let me read the startup invocation.

Read d:\src\contacts\lib\main.dart (lines 481-540)
All the slow queries (SELECT * FROM <table> ORDER BY rowid LIMIT 1000 plus the SUM-null) are the advisor's profiling sweep — sampling 1000 rows + null-fingerprinting every table on the main DB connection. Let me confirm the app itself doesn't issue those LIMIT-1000 scans, and check the log head for the frame-skip timing.

Grep "ORDER BY rowid|LIMIT 1000|country_states.*LIMIT|SELECT \* FROM" (glob: lib/**/*.dart)
1 line of output
Bash Scan log for advisor and frame-skip markers
IN
grep -n "Skipped\|frames\|Choreographer\|StartDriftViewer\|startDriftViewer\|localhost:8642\|Drift Advisor\|advisor\|profil\|Drift SLOW\|Drift REPEAT" "d:/src/contacts/reports/20260616/20260616_224142_contacts.log" | head -60

OUT
46:Saropa Drift Advisor: http://127.0.0.1:8642
574:[22:44:28.735] [logcat] 06-16 22:44:28.948  8108  8108 I Choreographer: Skipped 378 frames!  The application may be doing too much work on its main thread.
592:[22:44:29.137] [console] I/Choreographer( 8108): Skipped 378 frames!  The application may be doing too much work on its main thread.
657:[22:44:34.617] [stdout] D/ProfileInstaller( 8108): Installing profile for com.saropamobile.app
708:[22:44:38.794] [console] [log] [database] Drift SLOW 812ms SELECT: SELECT * FROM "user_preferences" WHERE "user_preference_type_name" IN (?);  » DriftDebugInterceptor._lightLog (./lib/database/drift/drift_debug_interceptor.dart:204:5)
709:[22:44:38.795] [console] [log] [database] Drift SLOW 822ms SELECT: SELECT * FROM "user_preferences" WHERE "user_preference_type_name" IN (?, ?);  » DriftDebugInterceptor._lightLog (./lib/database/drift/drift_debug_interceptor.dart:204:5)
710:[22:44:38.946] [logcat] 06-16 22:44:39.162  8108  8108 I Choreographer: Skipped 370 frames!  The application may be doing too much work on its main thread.
711:[22:44:38.953] [stdout] I/Choreographer( 8108): Skipped 370 frames!  The application may be doing too much work on its main thread.
714:[22:44:39.451] [console] [log] [database] Drift SLOW 905ms SELECT: SELECT * FROM "contacts" WHERE ((1 AND "hidden_at" IS NULL) AND "biometric_lock_at" IS NULL) AND "primary_contact_u_u_i_d" IS NULL;  » DriftDebugInterceptor._lightLog (./lib/database/drift/drift_debug_interceptor.dart:204:5)
715:[22:44:39.452] [console] [log] [database] Drift SLOW 1003ms SELECT: SELECT * FROM "user_preferences" WHERE "user_preference_type_name" IN (?);  » DriftDebugInterceptor._lightLog (./lib/database/drift/drift_debug_interceptor.dart:204:5)
716:[22:44:40.283] [console] [log] [database] Drift SLOW 1068ms SELECT: SELECT "contacts"."id" AS "contacts.id" FROM "contacts" LIMIT 1;  » DriftDebugInterceptor._lightLog (./lib/database/drift/drift_debug_interceptor.dart:204:5)
717:[22:44:40.285] [console] [log] [database] Drift SLOW 1116ms SELECT: SELECT * FROM "contacts" WHERE ((1 AND "hidden_at" IS NULL) AND "biometric_lock_at" IS NULL) AND "primary_contact_u_u_i_d" IS NULL;  » DriftDebugInterceptor._lightLog (./lib/database/drift/drift_debug_interceptor.dart:204:5)
718:[22:44:40.286] [console] [log] [database] Drift SLOW 1172ms SELECT: SELECT * FROM "user_preferences" WHERE "user_preference_type_name" IN (?);  » DriftDebugInterceptor._lightLog (./lib/database/drift/drift_debug_interceptor.dart:204:5)
719:[22:44:40.286] [console] [log] [database] Drift SLOW 1174ms SELECT: SELECT * FROM "news_posts" ORDER BY "post_created_at" DESC LIMIT 3 OFFSET 0;  » DriftDebugInterceptor._lightLog (./lib/database/drift/drift_debug_interceptor.dart:204:5)
720:[22:44:40.286] [console] [log] [database] Drift SLOW 1512ms SELECT: SELECT * FROM "user_preferences" WHERE "user_preference_type_name" IN (?);  » DriftDebugInterceptor._lightLog (./lib/database/drift/drift_debug_interceptor.dart:204:5)
721:[22:44:40.286] [console] [log] [database] Drift SLOW 1519ms SELECT: SELECT * FROM "user_preferences" WHERE "user_preference_type_name" IN (?);  » DriftDebugInterceptor._lightLog (./lib/database/drift/drift_debug_interceptor.dart:204:5)
722:[22:44:40.287] [console] [log] [database] Drift SLOW 1522ms SELECT: SELECT * FROM "user_preferences" WHERE "user_preference_type_name" IN (?);  » DriftDebugInterceptor._lightLog (./lib/database/drift/drift_debug_interceptor.dart:204:5)
723:[22:44:40.288] [console] [log] [database] Drift SLOW 1528ms SELECT: SELECT * FROM "user_preferences" WHERE "user_preference_type_name" IN (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);  » DriftDebugInterceptor._lightLog (./lib/database/drift/drift_debug_interceptor.dart:204:5)
724:[22:44:40.288] [console] [log] [database] Drift SLOW 1520ms SELECT: SELECT * FROM "contacts" WHERE ((1 AND "hidden_at" IS NULL) AND "biometric_lock_at" IS NULL) AND "primary_contact_u_u_i_d" IS NULL;  » DriftDebugInterceptor._lightLog (./lib/database/drift/drift_debug_interceptor.dart:204:5)
725:[22:44:40.288] [console] [log] [database] Drift SLOW 1581ms SELECT: SELECT * FROM "user_preferences" WHERE "user_preference_type_name" IN (?, ?);  » DriftDebugInterceptor._lightLog (./lib/database/drift/drift_debug_interceptor.dart:204:5)
726:[22:44:40.288] [console] [log] [database] Drift SLOW 1583ms SELECT: SELECT * FROM "user_permissions" WHERE "user_permission_type_name" = ? LIMIT 1;  » DriftDebugInterceptor._lightLog (./lib/database/drift/drift_debug_interceptor.dart:204:5)
728:[22:44:41.267] [console] [log] [database] Drift SLOW 1661ms SELECT: SELECT * FROM "user_permissions" WHERE "user_permission_type_name" = ? LIMIT 1;  » DriftDebugInterceptor._lightLog (./lib/database/drift/drift_debug_interceptor.dart:204:5)
731:[22:44:41.386] [console] [log] [database] Drift SLOW 143ms SELECT: SELECT * FROM "activities" WHERE (((1 AND "activity_date_time" > ?) AND "contact_saropa_u_u_i_d" IS NOT NULL) AND "contact_saropa_u_u_i_d" NOT IN (?)) AND "activity_type_name" NOT IN (?, ?, ?, ?) ORDER BY "activity_date_time" DESC;  » DriftDebugInterceptor._lightLog (./lib/database/drift/drift_debug_interceptor.dart:204:5)
732:[22:44:41.846] [console] [log] [database] Drift SLOW 413ms SELECT: SELECT * FROM "contacts" WHERE ((1 AND "hidden_at" IS NULL) AND "biometric_lock_at" IS NULL) AND "primary_contact_u_u_i_d" IS NULL;  » DriftDebugInterceptor._lightLog (./lib/database/drift/drift_debug_interceptor.dart:204:5)
738:[22:44:43.279] [console] [log] [database] Drift SLOW 276ms INSERT: INSERT INTO "activities" ("activity_type_name", "activity_date_time", "metadata", "contact_saropa_u_u_i_d", "lat_long") VALUES (?, ?, ?, ?, ?)  » DriftDebugInterceptor._lightLog (./lib/database/drift/drift_debug_interceptor.dart:204:5)
740:[22:44:43.574] [console] [log] [database] Drift SLOW 212ms SELECT: SELECT * FROM "emergency_tips" LIMIT 1;  » DriftDebugInterceptor._lightLog (./lib/database/drift/drift_debug_interceptor.dart:204:5)
748:[22:44:43.625] [logcat] 06-16 22:44:43.841  8108  8108 I Choreographer: Skipped 58 frames!  The application may be doing too much work on its main thread.
749:[22:44:43.626] [stdout] I/Choreographer( 8108): Skipped 58 frames!  The application may be doing too much work on its main thread.
754:[22:44:43.730] [console]       ./lib/utils/system/profiled_execution_extensions.dart 69:7  StartupTaskRunner.run
756:[22:44:43.730] [console]       ./lib/utils/system/profiled_execution_extensions.dart 126:34  StartupTaskRunner.runBatch
759:[22:44:43.912] [console] [log] [database] Drift SLOW 134ms SELECT: SELECT * FROM "activities" WHERE ((((1 AND "activity_date_time" > ?) AND "activity_date_time" < ?) AND "contact_saropa_u_u_i_d" IS NOT NULL) AND "contact_saropa_u_u_i_d" IN (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?…(+267)  » DriftDebugInterceptor._lightLog (./lib/database/drift/drift_debug_interceptor.dart:204:5)
761:[22:44:44.219] [console] [log] [database] Drift SLOW 291ms SELECT: SELECT * FROM "contacts" WHERE ((1 AND "hidden_at" IS NULL) AND "biometric_lock_at" IS NULL) AND "primary_contact_u_u_i_d" IS NULL;  » DriftDebugInterceptor._lightLog (./lib/database/drift/drift_debug_interceptor.dart:204:5)
763:[22:44:44.656] [console] [log] [database] Drift SLOW 373ms SELECT: SELECT * FROM "contact_avatars" WHERE "contact_saropa_u_u_i_d" = ? LIMIT 1;  » DriftDebugInterceptor._lightLog (./lib/database/drift/drift_debug_interceptor.dart:204:5)
764:[22:44:44.888] [console] [log] [database] Drift SLOW 132ms SELECT: SELECT * FROM "contact_groups" WHERE (1 AND "hidden_at" IS NULL) AND "industry_type_name" IN (?);  » DriftDebugInterceptor._lightLog (./lib/database/drift/drift_debug_interceptor.dart:204:5)
765:[22:44:44.892] [console] [log] [database] Drift SLOW 141ms SELECT: SELECT * FROM "family_groups" WHERE 1 AND "hidden_at" IS NULL;  » DriftDebugInterceptor._lightLog (./lib/database/drift/drift_debug_interceptor.dart:204:5)
769:[22:44:45.697] [console] [log] [database] Drift SLOW 668ms SELECT: SELECT * FROM "contact_avatars";  » DriftDebugInterceptor._lightLog (./lib/database/drift/drift_debug_interceptor.dart:204:5)
770:[22:44:45.704] [console] [log] [database] Drift SLOW 673ms SELECT: SELECT * FROM "connections";  » DriftDebugInterceptor._lightLog (./lib/database/drift/drift_debug_interceptor.dart:204:5)
772:[22:44:45.734] [console] [log] [database] Drift SLOW 679ms SELECT: SELECT * FROM "checklist_instances" ORDER BY rowid LIMIT 1000  » DriftDebugInterceptor._lightLog (./lib/database/drift/drift_debug_interceptor.dart:204:5)
773:[22:44:45.911] [console] [log] [database] Drift SLOW 190ms SELECT: SELECT * FROM "contacts" WHERE ((1 AND "hidden_at" IS NULL) AND "biometric_lock_at" IS NULL) AND "primary_contact_u_u_i_d" IS NULL;  » DriftDebugInterceptor._lightLog (./lib/database/drift/drift_debug_interceptor.dart:204:5)
774:[22:44:45.947] [console] [log] [database] Drift SLOW 211ms SELECT: SELECT * FROM "quick_launch_orders" WHERE "contact_status_name" = ? ORDER BY "sort_order" ASC;  » DriftDebugInterceptor._lightLog (./lib/database/drift/drift_debug_interceptor.dart:204:5)
775:[22:44:45.949] [console] [log] [database] Drift SLOW 215ms SELECT: SELECT * FROM "quick_launch_orders" WHERE "contact_status_name" = ? ORDER BY "sort_order" ASC;  » DriftDebugInterceptor._lightLog (./lib/database/drift/drift_debug_interceptor.dart:204:5)
776:[22:44:45.958] [console] [log] [database] Drift SLOW 209ms SELECT: SELECT * FROM "user_permissions" WHERE "user_permission_type_name" = ? LIMIT 1;  » DriftDebugInterceptor._lightLog (./lib/database/drift/drift_debug_interceptor.dart:204:5)
777:[22:44:45.959] [console] [log] [database] Drift SLOW 196ms SELECT: SELECT * FROM "checklist_item_progresses" ORDER BY rowid LIMIT 1000  » DriftDebugInterceptor._lightLog (./lib/database/drift/drift_debug_interceptor.dart:204:5)
790:[22:44:46.803] [console]       ./lib/utils/system/profiled_execution_extensions.dart 69:17  StartupTaskRunner.run
791:[22:44:46.803] [console]       ./lib/utils/system/profiled_execution_extensions.dart 128:30  StartupTaskRunner.runBatch.<fn>
793:[22:44:46.804] [console]       ./lib/utils/system/profiled_execution_extensions.dart 126:47  StartupTaskRunner.runBatch
795:[22:44:46.804] [console] [log] [database] Drift REPEAT x8 in ≤500ms SELECT: SELECT * FROM "user_preferences" WHERE "user_preference_type_name" IN (?);  » DriftDebugInterceptor._lightLog (./lib/database/drift/drift_debug_interceptor.dart:204:5)
818:[22:44:47.963] [console]       ./lib/utils/system/profiled_execution_extensions.dart 69:7  StartupTaskRunner.run
823:[22:44:48.012] [console]       ./lib/utils/system/profiled_execution_extensions.dart 69:17  StartupTaskRunner.run
824:[22:44:48.012] [console]       ./lib/utils/system/profiled_execution_extensions.dart 128:30  StartupTaskRunner.runBatch.<fn>
826:[22:44:48.013] [console]       ./lib/utils/system/profiled_execution_extensions.dart 126:47  StartupTaskRunner.runBatch
832:[22:44:48.035] [console]       ./lib/utils/system/profiled_execution_extensions.dart 69:17  StartupTaskRunner.run
833:[22:44:48.035] [console]       ./lib/utils/system/profiled_execution_extensions.dart 128:30  StartupTaskRunner.runBatch.<fn>
835:[22:44:48.036] [console]       ./lib/utils/system/profiled_execution_extensions.dart 126:47  StartupTaskRunner.runBatch
842:[22:44:48.056] [console]       ./lib/utils/system/profiled_execution_extensions.dart 69:7  StartupTaskRunner.run
844:[22:44:48.056] [console]       ./lib/utils/system/profiled_execution_extensions.dart 126:34  StartupTaskRunner.runBatch
851:[22:44:48.081] [console]       ./lib/utils/system/profiled_execution_extensions.dart 69:7  StartupTaskRunner.run
853:[22:44:48.081] [console]       ./lib/utils/system/profiled_execution_extensions.dart 126:34  StartupTaskRunner.runBatch
859:[22:44:48.088] [console]       ./lib/utils/system/profiled_execution_extensions.dart 69:7  StartupTaskRunner.run
861:[22:44:48.089] [console]       ./lib/utils/system/profiled_execution_extensions.dart 126:34  StartupTaskRunner.runBatch
Line 46 of the log is the smoking gun: Saropa Drift Advisor: http://127.0.0.1:8642. The advisor was running in this session. Let me confirm the env default so I state the fix precisely.

Grep "DriftAdvisorEnabled" (glob: lib/**/env*.dart)
11 lines of output
Grep "DriftAdvisorEnabled"
8 lines of output
Found the real defect. The env default is defaultValue: true — but main.dart's comment claims "(default: off) so a fresh debug session is quiet." Those contradict. The advisor runs in every debug session, and its profiling sweep is what freezes startup. Let me read the full declaration.

Read d:\src\contacts\lib\env\env_type_enum.dart (lines 121-145)
Diagnosis complete. Here's what's actually happening.

Root cause: the Drift Advisor, not your app's queries
Log line 46: Saropa Drift Advisor: http://127.0.0.1:8642 — the advisor was running this session. Every "slow query" that precedes the freeze is the advisor's column-profiling sweep, not your app:

SELECT * FROM "<table>" ORDER BY rowid LIMIT 1000 (checklist_instances, contact_points, country_states, …) — the advisor sampling 1000 rows per table.
The 398ms SUM(CASE WHEN "col" IS NULL …) on public_figure_events — the advisor's per-column null fingerprint.
None of those query shapes exist anywhere in lib/ — I grepped. They come from the saropa_drift_advisor package (pubspec line 527).

The advisor profiles on your app's single shared Drift connection. So it serializes with real startup queries and inflates them: your user_preferences IN (?) lookups jump to 812ms → 1.0s → 1.5s purely from contention, and that's what produces the 378/370/58 frame skips. The app went silent after the last advisor query at 22:45:06 — everything after is just Android freezing other apps for memory.

The external analysis you pasted (N+1 contacts, main-thread parsing, add pagination) is a misdiagnosis. Your queries aren't the blocker — they're victims of advisor contention. The contact_groups x8 "N+1" is 8 indexed LIMIT 1 lookups; trivial. None of this runs in release — the whole thing is gated on MainSettings.isDebugMode.

The one real defect in this repo
env_type_enum.dart:135 sets defaultValue: true, and its doc comment claims the expensive profiling "fires only when a developer actually opens an advisor page in the browser, not at startup." Your log disproves that — the profiling sweep ran at startup with no browser. So either the advisor (v4.0.2) changed to auto-profile, or something opened a page. That behavior lives in the saropa_drift_advisor package (a separate project), so I can't confirm which without reading it.

Immediate unfreeze, no code change: User Env Override list → "Drift Advisor Enabled" → off. Debug startup goes quiet.

This setting has already been flipped default-off (2026-05-03) then back default-on (2026-06-05) over exactly this port-banner-vs-noise tension, so I'm not going to flip it a third time on my own.

Which do you want?

Make debug startup quiet in this repo — flip the advisor default off (and fix the stale "default: off" comment in main.dart), accepting the banner only shows when opted in.
Investigate the advisor package (d:\src\saropa_drift_advisor) — find why profiling runs at startup against the live connection instead of browser-only/off-isolate. Needs your OK to edit that project.
Both.

## FUTHER REFERENCE

THE LOG d:\src\contacts\reports\20260616\20260616_204048_contacts.log

the drift advisor source: D:\src\saropa_dart_utils\CHANGELOG.md

## Finish Report (2026-06-17)

### Defect

Enabling the Drift Advisor against a launching Flutter app froze the app's
startup. The freeze was not caused by the app's own queries (the pasted
external analysis blaming N+1 contact lookups, main-thread parsing, and missing
pagination was a misdiagnosis). It was caused by the VS Code extension running
heavy whole-database scans the instant it connected to the app's debug server,
all routed over the app's single shared Drift connection during the app's own
startup query burst.

### Root cause (this repository — the extension)

On app connect, `ServerManager.onDidChangeActive` (in
`extension/src/extension-activation-event-wiring.ts`) called
`watcher.reset()` + `watcher.start()`; the generation watcher's first poll then
fired `onDidChange`, which ran the full heavy sweep — and the connect handler
ALSO ran the sweep directly. The sweep comprised:

- `DataQualityProvider._queryNullCounts` — a full-table
  `SUM(CASE WHEN "col" IS NULL THEN 1 ELSE 0 END)` aggregate over every column
  of every user table with at least 10 rows
  (`extension/src/diagnostics/providers/data-quality-provider.ts`). This is the
  398ms `public_figure_events` query observed in the log.
- Timeline auto-capture (`timeline.autoCapture`, default on) — a
  `SELECT * FROM "<table>" ORDER BY rowid LIMIT 1000` per physical table
  (`extension/src/timeline/snapshot-store.ts`). These are the `LIMIT 1000`
  scans on `checklist_instances`, `contact_points`, `country_states`, etc.
- Per-table row-count refresh (`codeLensProvider.refreshRowCounts`).

Serialized on the one live connection, the app's own startup lookups inflated
from tens of ms into the 800ms-1.5s range, stalling the main isolate long
enough to skip 378/370/58 frames and lock the screen. The Dart package itself
does not generate these scans; it only executes SQL the extension sends.

The stale assertion in the contacts repo that profiling "fires only when a
developer opens an advisor page" was incorrect: the sweeps fire automatically
on connect, with no panel open.

### Fix

1. `extension-activation-event-wiring.ts` — introduced a post-connect startup
   grace window (`STARTUP_SWEEP_GRACE_MS`, 6000ms). The heavy sweep (row counts,
   null-rate diagnostics, timeline auto-capture) is bundled into `runHeavySweep`
   and deferred via `scheduleHeavySweep` so it runs after the app's launch burst
   has drained. A single shared timer dedupes the two connect-time requesters
   (the connect handler and the watcher's initial post-connect poll). A genuine
   later schema regeneration (watcher fire after the grace window) runs the
   sweep promptly, as before. Cheap schema/UI refreshes (tree, badges, caches,
   schema prewarm) still run immediately on connect. A disposable cancels any
   pending timer on deactivate.
2. `data-quality-provider.ts` — added `MAX_ROWS_FOR_NULL_SCAN` (100,000); the
   null-rate scan now skips tables above that bound, since the full-table scan
   cost on a live connection outweighs the passive diagnostic. Per-column null
   stats remain available on demand via the "Profile Column" code action.

### Verification

- `tsc --noEmit -p ./` clean.
- Extension test suite: 2853 passing (was 2852). Added a `DataQualityProvider`
  test asserting the full-table null scan is never issued for a table above the
  cap (spies on `client.sql` for an `IS NULL` query) even when the data would
  otherwise trip the high-null-rate warning. Updated the activation
  disposable-count assertion (228 -> 229) for the new timer-cleanup disposable.
- CHANGELOG updated under `[Unreleased]`.

### Out of repository (separate, optional follow-up)

The immediate operator-side unfreeze lives in the consuming app (the contacts
repo), not here: setting the "Drift Advisor Enabled" user env override to off,
and correcting the stale "default: off" comment in that repo's `main.dart`.
That repo was deliberately not modified — it is out of scope for the advisor
package, and the env-default has already been toggled twice over the
banner-vs-noise tension. This repository's fix removes the freeze regardless of
that consumer-side setting.