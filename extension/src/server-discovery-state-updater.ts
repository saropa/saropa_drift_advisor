/**
 * Server list update logic: processes scan results, updates server states,
 * applies state machine transitions, and schedules notifications.
 *
 * Not pure — it mutates the tracked IServerInfo objects (lastSeen/missedPolls),
 * fires "found"/"lost" notifications through the debouncer, and logs state
 * transitions. It deliberately does NOT fire the onDidChangeServers event: the
 * caller must reassign its server map from [nextState.servers] FIRST and only
 * then fire, so a listener that reads back `discovery.servers` sees the updated
 * list rather than a one-generation-stale copy. Returning [changed] (instead of
 * firing here) is what lets the caller order the reassignment before the fire.
 */
import {
  BACKOFF_THRESHOLD,
  MISS_THRESHOLD,
  NOTIFY_THROTTLE_MS,
} from './server-discovery-constants';
import { maybeNotifyServerEvent } from './server-discovery-notify';
import { nextDiscoveryState } from './server-discovery-state-machine';
import type { IServerInfo, IDiscoveryConfig, DiscoveryState, DiscoveryOpenUrlHook } from './server-discovery-ui-state';
import { ServerLostDebouncer } from './server-discovery-lost-debounce';

export interface ServerUpdateState {
  state: DiscoveryState;
  emptyScans: number;
  backoffPolls: number;
  servers: Map<number, IServerInfo>;
}

export interface UpdateResult {
  nextState: ServerUpdateState;
  changed: boolean;
}

/**
 * Pure server update logic: given a scan result (alive ports), updates server
 * tracking state and applies the discovery state machine transition.
 */
export function updateServersFromScan(
  current: ServerUpdateState,
  alivePorts: number[],
  config: IDiscoveryConfig,
  lostDebouncer: ServerLostDebouncer,
  notifiedAt: Map<number, number>,
  onAfterOpenUrl: DiscoveryOpenUrlHook | undefined,
  logLine: (msg: string) => void,
): UpdateResult {
  const now = Date.now();
  const aliveSet = new Set(alivePorts);
  const servers = new Map(current.servers);
  let changed = false;

  // Update or add alive servers.
  for (const port of alivePorts) {
    const existing = servers.get(port);
    if (existing) {
      existing.lastSeen = now;
      existing.missedPolls = 0;
    } else {
      servers.set(port, {
        host: config.host,
        port,
        firstSeen: now,
        lastSeen: now,
        missedPolls: 0,
      });
      // A rediscovery within the grace window means the loss never surfaced a
      // toast — this is a flap, so cancel the pending warning and stay silent
      // (no "detected" toast either) rather than announcing recovery from an
      // unannounced loss.
      const wasPendingLost = lostDebouncer.cancelPending(port);
      if (!wasPendingLost && !lostDebouncer.hasNotified) {
        // Stay silent once we've already warned this session: a reconnect on a
        // flaky link is part of the same flap the user asked not to be nagged
        // about. The initial discovery (before any loss) still announces.
        maybeNotifyServerEvent(
          config.host,
          port,
          'found',
          notifiedAt,
          NOTIFY_THROTTLE_MS,
          onAfterOpenUrl,
        );
      }
      changed = true;
    }
  }

  // Mark missed ports and schedule lost notifications.
  for (const [port, info] of servers) {
    if (!aliveSet.has(port)) {
      info.missedPolls++;
      if (info.missedPolls >= MISS_THRESHOLD) {
        servers.delete(port);
        // Defer the "lost" toast: a flaky link drops and recovers within a
        // scan or two, so only warn if the server is still gone after the
        // grace window. Detection (the delete above, which drives the sidebar
        // disconnect) is unchanged — only the toast is debounced.
        lostDebouncer.scheduleLost(port);
        changed = true;
      }
    }
  }

  // Apply state machine transition.
  const prevState = current.state;
  const next = nextDiscoveryState(
    { state: current.state, emptyScans: current.emptyScans, backoffPolls: current.backoffPolls },
    servers.size,
    alivePorts.length,
  );

  if (prevState !== next.state) {
    logLine(
      `State: ${prevState} → ${next.state} (empty scans: ${next.emptyScans})`,
    );
  }

  return {
    nextState: {
      state: next.state,
      emptyScans: next.emptyScans,
      backoffPolls: next.backoffPolls,
      servers,
    },
    changed: changed || next.state !== prevState,
  };
}
