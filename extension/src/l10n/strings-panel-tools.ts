/**
 * Host-panel English source strings — developer tool panels: Global Search
 * ([../global-search/global-search-html.ts](../global-search/global-search-html.ts)),
 * Isar→Drift Generator ([../isar-gen/isar-gen-html.ts](../isar-gen/isar-gen-html.ts)),
 * Data Story Narrator ([../narrator/narrator-html.ts](../narrator/narrator-html.ts)),
 * Troubleshooting ([../troubleshooting/troubleshooting-html.ts](../troubleshooting/troubleshooting-html.ts)),
 * and the Add Data Breakpoint form ([../data-breakpoint/breakpoint-form-html.ts](../data-breakpoint/breakpoint-form-html.ts)).
 * Plan 75 §3.1.
 *
 * One registry slice per panel family (see `HOST_STRING_REGISTRIES` in
 * [../l10n.ts](../l10n.ts)). Each entry maps a SYMBOLIC KEY → its ENGLISH text;
 * the panel's HTML builder resolves the key via `t()` so the string reaches the
 * translation pipeline instead of shipping English in every locale.
 *
 * Runtime values (counts, ports, table names) are passed as `{0}`/`{1}` tokens,
 * never concatenated English — `vscode.l10n.t()` substitutes them so a translator
 * can reorder the sentence. Code identifiers (`pubspec.yaml`, `adb forward`,
 * `DriftDebugServer.start()`, `driftViewer.port`) stay literal inside the values
 * since they are not translatable.
 */

/** Symbolic key → English source text for the developer tool panels. */
export const stringsPanelTools: Record<string, string> = {
  // --- Global search ---
  // {0} = match count, {1} = "es" plural suffix (kept as a token so the count
  // and its pluralized noun stay one reorderable unit), {2} = table count,
  // {3} = "s" plural suffix, {4} = duration ms, {5} = tables searched.
  'panel.tools.search.summary':
    'Found {0} match{1} across {2} table{3} ({4}ms, {5} tables searched)',
  'panel.tools.search.empty': 'No matches found.',
  'panel.tools.search.searching': 'Searching…',
  'panel.tools.search.copy': 'Copy',
  'panel.tools.search.title': 'Global Search',
  'panel.tools.search.placeholder': 'Search value…',
  'panel.tools.search.btn.search': 'Search',
  'panel.tools.search.mode.label': 'Mode:',
  'panel.tools.search.mode.exact': 'Exact',
  'panel.tools.search.mode.contains': 'Contains',
  'panel.tools.search.mode.regex': 'Regex',
  'panel.tools.search.scope.label': 'Scope:',
  'panel.tools.search.scope.all': 'All columns',
  'panel.tools.search.scope.textOnly': 'Text columns only',

  // --- Isar→Drift generator ---
  // {0} = embedded-object count.
  'panel.tools.isar.embedded': 'Embedded Objects: {0}',
  // {0} = collection count.
  'panel.tools.isar.sourceHeading': 'Source: {0} collection(s)',
  'panel.tools.isar.options': 'Options',
  'panel.tools.isar.embeddedStrategy': 'Embedded strategy:',
  'panel.tools.isar.embedded.json': 'JSON serialize',
  'panel.tools.isar.embedded.flatten': 'Flatten columns',
  'panel.tools.isar.enumStrategy': 'Enum strategy:',
  'panel.tools.isar.enum.auto': 'Auto-detect',
  'panel.tools.isar.enum.integer': 'Force integer',
  'panel.tools.isar.enum.text': 'Force text',
  'panel.tools.isar.includeIndexes': 'Include indexes',
  'panel.tools.isar.includeComments': 'Include comments',
  // Table header columns in the mapping-preview table.
  'panel.tools.isar.col.column': 'Column',
  'panel.tools.isar.col.type': 'Type',
  'panel.tools.isar.col.notes': 'Notes',
  // {0} = the junction-table label prefix word, {1} = the table name.
  'panel.tools.isar.junctionLabel': '{0}: {1}',
  // Prefix word for junction tables (passed as {0} into junctionLabel).
  'panel.tools.isar.junctionPrefix': 'Junction',
  'panel.tools.isar.preview': 'Mapping Preview',
  'panel.tools.isar.warnings': 'Warnings',
  // {0} = comma-joined list of skipped backlink names.
  'panel.tools.isar.skipped': 'Skipped backlinks: {0}',
  'panel.tools.isar.title': 'Isar to Drift Schema Generator',
  'panel.tools.isar.btn.generate': 'Generate Dart',
  'panel.tools.isar.btn.copy': 'Copy to Clipboard',
  'panel.tools.isar.btn.save': 'Save to File',

  // --- Data story narrator ---
  // {0} = "table #pk" identifier, kept as a token so the fixed "DATA STORY —"
  // prefix stays one reorderable unit with the record reference.
  'panel.tools.narrator.title': 'DATA STORY — {0}',
  'panel.tools.narrator.titleBare': 'DATA STORY',
  'panel.tools.narrator.btn.copyText': 'Copy Text',
  'panel.tools.narrator.btn.copyMarkdown': 'Copy Markdown',
  'panel.tools.narrator.btn.regenerate': 'Regenerate',
  'panel.tools.narrator.loading': 'Generating story...',
  // {0} = error message text.
  'panel.tools.narrator.error': 'Error: {0}',
  'panel.tools.narrator.btn.tryAgain': 'Try Again',

  // --- Data story narrator: client-script strings (resolved in-browser via the
  //     __VT bridge, since copyText()/copyMarkdown() showToast() run client-side).
  //     No tokens — plain confirmation toasts. ---
  'panel.tools.narrator.toast.textCopied': 'Text copied to clipboard',
  'panel.tools.narrator.toast.markdownCopied': 'Markdown copied to clipboard',

  // --- Troubleshooting ---
  'panel.tools.trouble.title': 'Troubleshooting',
  'panel.tools.trouble.subtitle':
    'Saropa Drift Advisor — connection and setup help',
  'panel.tools.trouble.checklist.title': 'Quick Checklist',
  // `pubspec.yaml` and `dependencies` are code identifiers, kept literal in markup
  // at the call site; the surrounding sentence is the translatable value.
  'panel.tools.trouble.checklist.pubspec':
    'is in your pubspec.yaml dependencies',
  'panel.tools.trouble.checklist.startup':
    'Your app calls DriftDebugServer.start() at startup',
  'panel.tools.trouble.checklist.debug': 'Your app is running in debug mode',
  // {0} = configured server port.
  'panel.tools.trouble.checklist.port':
    'Server port (default: {0}) matches your configuration',
  'panel.tools.trouble.checklist.firewall':
    'No firewall is blocking localhost connections',
  'panel.tools.trouble.connects.title': 'How the Extension Connects',
  'panel.tools.trouble.connects.intro':
    'The extension uses two connection methods:',
  // <strong>VM Service (preferred)</strong> emphasis is static markup kept inline.
  'panel.tools.trouble.connects.vm':
    '<strong>VM Service (preferred)</strong> — When you start a Flutter/Dart debug session, the extension connects automatically via VM Service. No port forwarding needed.',
  // {0} = base port, {1} = base port + 7. <strong>HTTP discovery</strong> static.
  'panel.tools.trouble.connects.http':
    '<strong>HTTP discovery</strong> — Falls back to scanning ports {0}&ndash;{1} on localhost for a running Drift debug server.',
  'panel.tools.trouble.flutter.title': 'Flutter / Dart Debugging',
  // `flutter run` and `DriftDebugServer.start()` are code identifiers kept inline
  // in markup; the sentence prose is the translatable value.
  'panel.tools.trouble.flutter.intro':
    'Start your app in debug mode (F5 or flutter run). The extension auto-discovers the Drift debug server through the VM Service connection.',
  // <strong>TIP:</strong>, Output, and Saropa Drift Advisor emphasis are static markup.
  'panel.tools.trouble.flutter.tip':
    '<strong>TIP:</strong> Check <strong>Output</strong> &rarr; <strong>Saropa Drift Advisor</strong> for detailed connection logs and error messages.',
  'panel.tools.trouble.flutter.stillDisconnected':
    'If you are still disconnected:',
  'panel.tools.trouble.flutter.li.start':
    'Ensure your app calls DriftDebugServer.start() before the connection attempt',
  'panel.tools.trouble.flutter.li.verify':
    "Verify the server starts successfully in your app's console output",
  'panel.tools.trouble.flutter.li.output':
    'Check the Output panel for specific error messages',
  'panel.tools.trouble.android.title': 'Android Emulator (HTTP)',
  'panel.tools.trouble.android.intro':
    'The emulator runs in a separate network namespace. The extension automatically tries adb forward when a debug session starts, but you can also do it manually:',
  // <strong>NOTE:</strong> and <strong>Retry Connection</strong> emphasis static;
  // `adb forward` code identifier kept inline.
  'panel.tools.trouble.android.note':
    '<strong>NOTE:</strong> After running adb forward, click <strong>Retry Connection</strong> below to re-scan for the server.',
  'panel.tools.trouble.android.customSummary': 'Using a non-default port?',
  // {0} = configured server port. `driftViewer.port` is a setting id kept inline.
  'panel.tools.trouble.android.customBody':
    'If your server uses a custom port, replace {0} with your port number and update the driftViewer.port setting in VS Code.',
  'panel.tools.trouble.issues.title': 'Common Issues',
  'panel.tools.trouble.issues.noConnect.summary':
    'Server starts but extension does not connect',
  // {0} = configured server port. `driftViewer.port` setting id kept inline.
  'panel.tools.trouble.issues.noConnect.li.match':
    'Check that the port in your app matches driftViewer.port (default: {0})',
  'panel.tools.trouble.issues.noConnect.li.adb':
    'On Android emulators, you need adb forward (see above)',
  // {0} = port (in `lsof`/`netstat` command snippets kept as code at call site).
  'panel.tools.trouble.issues.noConnect.li.inUse':
    'Verify no other process is using port {0}:',
  'panel.tools.trouble.issues.notFound.summary':
    'Extension shows "No Drift debug servers found"',
  'panel.tools.trouble.issues.notFound.li.start':
    'Your app must call DriftDebugServer.start() — check that line executes',
  // <strong>Retry Connection</strong> emphasis static markup.
  'panel.tools.trouble.issues.notFound.li.notReady':
    'The server may not be ready yet; try <strong>Retry Connection</strong> after a few seconds',
  // `flutter run` code identifier kept inline.
  'panel.tools.trouble.issues.notFound.li.vm':
    'If using VM Service, ensure you launched via VS Code debugger (F5), not flutter run in terminal',
  'panel.tools.trouble.issues.drops.summary':
    'Connection drops intermittently',
  'panel.tools.trouble.issues.drops.li.isolate':
    'Hot restart creates a new isolate — the extension should reconnect automatically',
  // `adb forward` code identifier kept inline.
  'panel.tools.trouble.issues.drops.li.adb':
    'If using HTTP mode, check that adb forward is still active',
  'panel.tools.trouble.issues.drops.li.output':
    'Check the Output panel for reconnection logs',
  'panel.tools.trouble.issues.firewall.summary':
    'Firewall or antivirus blocking connections',
  // {0} = "127.0.0.1:port" address, kept as a code token at the call site.
  'panel.tools.trouble.issues.firewall.li.allow': 'Allow connections to {0}',
  'panel.tools.trouble.issues.firewall.li.vpn':
    'Some corporate VPNs block localhost traffic — try disconnecting',
  // `dart` / `flutter` process names kept inline as code.
  'panel.tools.trouble.issues.firewall.li.defender':
    'Windows Defender Firewall: allow the dart / flutter process',
  'panel.tools.trouble.btn.retry': 'Retry Connection',
  'panel.tools.trouble.btn.forward': 'Forward Port (Android Emulator)',
  'panel.tools.trouble.btn.select': 'Select Server',
  'panel.tools.trouble.btn.output': 'Open Output Log',
  'panel.tools.trouble.btn.settings': 'Open Settings',

  // --- Add data breakpoint form ---
  'panel.tools.breakpoint.title': 'Add Data Breakpoint',
  'panel.tools.breakpoint.field.table': 'Table',
  'panel.tools.breakpoint.field.type': 'Breakpoint Type',
  'panel.tools.breakpoint.type.conditionMet.name': 'Condition Met',
  'panel.tools.breakpoint.type.conditionMet.desc': 'SQL returns non-zero count',
  'panel.tools.breakpoint.type.rowInserted.name': 'Row Inserted',
  'panel.tools.breakpoint.type.rowInserted.desc': 'Row count increases',
  'panel.tools.breakpoint.type.rowDeleted.name': 'Row Deleted',
  'panel.tools.breakpoint.type.rowDeleted.desc': 'Row count decreases',
  'panel.tools.breakpoint.type.rowChanged.name': 'Row Changed',
  'panel.tools.breakpoint.type.rowChanged.desc': 'Any data changes',
  'panel.tools.breakpoint.field.condition': 'SQL Condition',
  'panel.tools.breakpoint.btn.add': 'Add Breakpoint',
  'panel.tools.breakpoint.btn.cancel': 'Cancel',
};
