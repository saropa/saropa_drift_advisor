/**
 * Unit tests for the host-side discovery manifest writer/remover.
 *
 * All IO is injected (no real disk/network), so these run anywhere and assert
 * the ownership guard that keeps the extension from clobbering an in-app
 * (desktop/emulator-on-host) manifest.
 */
import * as assert from 'assert';
import {
  buildHostManifest,
  hostManifestPath,
  writeHostManifest,
  removeHostManifest,
  MANIFEST_SOURCE_EXTENSION,
  DISCOVERY_FILE_NAME,
  type ManifestDeps,
} from '../host-discovery-manifest';

const HOME = '/fake/home';
const ISO = '2026-06-24T00:00:00.000Z';

/** Builds a deps object backed by an in-memory file map. */
function memDeps(
  files: Map<string, string>,
  health?: Record<string, unknown>,
): ManifestDeps & { writes: string[]; unlinks: string[] } {
  const writes: string[] = [];
  const unlinks: string[] = [];
  return {
    home: HOME,
    writes,
    unlinks,
    readFile: async (p) => {
      const v = files.get(p);
      if (v === undefined) throw new Error('ENOENT');
      return v;
    },
    writeFile: async (p, d) => {
      files.set(p, d);
      writes.push(p);
    },
    mkdir: async () => {},
    unlink: async (p) => {
      files.delete(p);
      unlinks.push(p);
    },
    fetchHealth: async () => health,
  };
}

describe('host-discovery-manifest', () => {
  describe('buildHostManifest', () => {
    it('stamps source + transport and copies known health fields', () => {
      const m = buildHostManifest({
        host: '127.0.0.1',
        port: 8642,
        transport: 'adb-forward',
        writtenAtIso: ISO,
        health: {
          version: '4.1.11',
          schemaVersion: 1,
          writeEnabled: false,
          loopbackOnly: true,
          capabilities: ['issues'],
          endpoints: ['/api/health'],
          ignored: 'dropped',
        },
      });
      assert.strictEqual(m.source, MANIFEST_SOURCE_EXTENSION);
      assert.strictEqual(m.transport, 'adb-forward');
      assert.strictEqual(m.host, '127.0.0.1');
      assert.strictEqual(m.port, 8642);
      assert.strictEqual(m.version, '4.1.11');
      assert.strictEqual(m.writeEnabled, false);
      assert.deepStrictEqual(m.capabilities, ['issues']);
      assert.strictEqual(m.startedAt, ISO);
      // Only the known passthrough keys are copied; extras are dropped.
      assert.strictEqual(m.ignored, undefined);
    });

    it('produces a valid manifest even with no health payload', () => {
      const m = buildHostManifest({
        host: '127.0.0.1',
        port: 8642,
        transport: 'loopback',
        writtenAtIso: ISO,
      });
      assert.strictEqual(m.port, 8642);
      assert.strictEqual(m.transport, 'loopback');
      assert.strictEqual(m.version, undefined);
    });
  });

  describe('hostManifestPath', () => {
    it('resolves under the home override', () => {
      const p = hostManifestPath(HOME);
      assert.ok(p.endsWith(DISCOVERY_FILE_NAME));
      assert.ok(p.includes('.saropa_drift_advisor'));
    });
  });

  describe('writeHostManifest', () => {
    it('writes a fresh manifest when none exists', async () => {
      const files = new Map<string, string>();
      const deps = memDeps(files, { version: '4.1.11' });
      const result = await writeHostManifest('127.0.0.1', 8642, 'adb-forward', ISO, deps);
      assert.strictEqual(result, 'written');
      const written = JSON.parse(files.get(hostManifestPath(HOME))!);
      assert.strictEqual(written.source, MANIFEST_SOURCE_EXTENSION);
      assert.strictEqual(written.port, 8642);
      assert.strictEqual(written.version, '4.1.11');
    });

    it('overwrites a manifest it previously wrote (same source stamp)', async () => {
      const files = new Map<string, string>();
      files.set(
        hostManifestPath(HOME),
        JSON.stringify({ source: MANIFEST_SOURCE_EXTENSION, port: 1111 }),
      );
      const deps = memDeps(files);
      const result = await writeHostManifest('127.0.0.1', 8642, 'loopback', ISO, deps);
      assert.strictEqual(result, 'written');
      assert.strictEqual(JSON.parse(files.get(hostManifestPath(HOME))!).port, 8642);
    });

    it('refuses to overwrite an app-owned manifest (no extension source)', async () => {
      const files = new Map<string, string>();
      // An in-app server's manifest carries a pid and no `source` field.
      files.set(
        hostManifestPath(HOME),
        JSON.stringify({ host: '127.0.0.1', port: 8642, pid: 4242 }),
      );
      const deps = memDeps(files);
      const result = await writeHostManifest('127.0.0.1', 8642, 'loopback', ISO, deps);
      assert.strictEqual(result, 'skipped-app-owned');
      // Untouched: the app's original file remains.
      assert.strictEqual(deps.writes.length, 0);
      assert.strictEqual(JSON.parse(files.get(hostManifestPath(HOME))!).pid, 4242);
    });

    it('still writes (host,port,transport) when health is unreachable', async () => {
      const files = new Map<string, string>();
      const deps = memDeps(files, undefined);
      const result = await writeHostManifest('127.0.0.1', 8642, 'adb-forward', ISO, deps);
      assert.strictEqual(result, 'written');
      const written = JSON.parse(files.get(hostManifestPath(HOME))!);
      assert.strictEqual(written.port, 8642);
      assert.strictEqual(written.version, undefined);
    });

    it('returns "failed" and swallows a write error', async () => {
      const files = new Map<string, string>();
      const deps = memDeps(files);
      deps.writeFile = async () => {
        throw new Error('EACCES');
      };
      const result = await writeHostManifest('127.0.0.1', 8642, 'loopback', ISO, deps);
      assert.strictEqual(result, 'failed');
    });
  });

  describe('removeHostManifest', () => {
    it('removes an extension-owned manifest', async () => {
      const files = new Map<string, string>();
      files.set(
        hostManifestPath(HOME),
        JSON.stringify({ source: MANIFEST_SOURCE_EXTENSION, port: 8642 }),
      );
      const deps = memDeps(files);
      await removeHostManifest(deps);
      assert.strictEqual(files.has(hostManifestPath(HOME)), false);
      assert.strictEqual(deps.unlinks.length, 1);
    });

    it('leaves an app-owned manifest in place', async () => {
      const files = new Map<string, string>();
      files.set(hostManifestPath(HOME), JSON.stringify({ port: 8642, pid: 4242 }));
      const deps = memDeps(files);
      await removeHostManifest(deps);
      assert.strictEqual(files.has(hostManifestPath(HOME)), true);
      assert.strictEqual(deps.unlinks.length, 0);
    });

    it('is a no-op when no manifest exists', async () => {
      const files = new Map<string, string>();
      const deps = memDeps(files);
      await removeHostManifest(deps);
      assert.strictEqual(deps.unlinks.length, 0);
    });
  });
});
