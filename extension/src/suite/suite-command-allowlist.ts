/**
 * Command-id prefixes a suite fix-action is allowed to invoke. A `fix.command`
 * arrives from a sibling's on-disk file or the debug server, so it is untrusted
 * input: the panels execute it ONLY when it is both in this allowlist and
 * actually registered. This mirrors the Log Capture hardening that removed an
 * over-broad "run any command" webview message.
 */
export const SUITE_COMMAND_PREFIXES: readonly string[] = [
  'driftViewer.',
  'saropaLints.',
  // Renamed from saropaCapture. in v9.8.0 (old IDs are aliased by the extension,
  // but only the new prefix is canonical).
  'saropaCapture.',
];

/** True when [command] is a non-empty string under an allowed suite prefix. */
export function isAllowedSuiteCommand(command: unknown): command is string {
  return (
    typeof command === 'string'
    && SUITE_COMMAND_PREFIXES.some((p) => command.startsWith(p))
  );
}
