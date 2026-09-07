/**
 * Config and event types for VmServiceClient. Split out of vm-service-client.ts.
 */

/** An event from the VM Service Extension stream (developer.postEvent). */
export interface VmExtensionEvent {
  /** e.g. 'ext.saropa.drift.ServerStarted' */
  kind: string;
  /** The data map passed to developer.postEvent. */
  data: Record<string, unknown>;
}

export interface VmServiceClientConfig {
  wsUri: string;
  timeoutMs?: number;
  /** Called when the WebSocket closes (e.g. hot restart). Use to clear UI state. */
  onClose?: () => void;
  /** Called when a VM Service Extension stream event arrives. */
  onExtensionEvent?: (event: VmExtensionEvent) => void;
}
