import * as assert from 'assert';
import { resetMocks, mockCommands } from './vscode-mock';
import { HealthTerminalLinkProvider } from '../tasks/health-link-provider';
import { HEALTH_PANEL_LINK } from '../tasks/health-check-runner';

describe('HealthTerminalLinkProvider', () => {
  let provider: HealthTerminalLinkProvider;

  beforeEach(() => {
    resetMocks();
    provider = new HealthTerminalLinkProvider();
  });

  describe('provideTerminalLinks', () => {
    it('should detect Health Panel link in terminal line', () => {
      const context = {
        line: `→ ${HEALTH_PANEL_LINK} for detailed breakdown and fix actions`,
        terminal: {} as any,
      };
      const links = provider.provideTerminalLinks(context);
      assert.strictEqual(links.length, 1);
      assert.strictEqual(links[0].length, HEALTH_PANEL_LINK.length);
      assert.ok(links[0].tooltip?.includes('Health Score'));
    });

    it('should return empty array for lines without the link', () => {
      const context = {
        line: 'Some other terminal output',
        terminal: {} as any,
      };
      const links = provider.provideTerminalLinks(context);
      assert.strictEqual(links.length, 0);
    });

    it('should find correct start index', () => {
      const prefix = '→ ';
      const context = {
        line: `${prefix}${HEALTH_PANEL_LINK} for details`,
        terminal: {} as any,
      };
      const links = provider.provideTerminalLinks(context);
      assert.strictEqual(links[0].startIndex, prefix.length);
    });
  });

  describe('handleTerminalLink', () => {
    it('should execute healthScore command', () => {
      const link = {
        startIndex: 0,
        length: HEALTH_PANEL_LINK.length,
      };
      provider.handleTerminalLink(link);
      assert.ok(
        mockCommands.executed.some((cmd) => cmd === 'driftViewer.healthScore'),
        'should execute driftViewer.healthScore',
      );
    });
  });

  describe('HEALTH_PANEL_LINK constant', () => {
    it('should be a non-empty string', () => {
      assert.ok(HEALTH_PANEL_LINK.length > 0);
    });

    it('should contain meaningful text', () => {
      assert.ok(HEALTH_PANEL_LINK.includes('Health'));
    });
  });
});
