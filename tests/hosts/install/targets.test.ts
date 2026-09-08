import { describe, expect, test } from 'bun:test';
import {
  INSTALL_TARGETS,
  type InstallTarget,
  orderInstallTargets,
  runInstallTargetsInOrder,
} from '@/hosts/install/targets';

const SELECTION: readonly InstallTarget[] = ['pi', 'cursor', 'amp', 'cursor'];

describe('install targets', () => {
  test('the table is the catalog row for row', () => {
    // The flag names the target on the command line and the probe is what `install` runs to see
    // whether the host is on PATH, so both are contract; the rows are in label order.
    expect(INSTALL_TARGETS).toEqual([
      { target: 'amp', label: 'Amp Code', flag: '--amp', probeCommand: ['amp', '--version'] },
      {
        target: 'antigravity-cli',
        label: 'Antigravity CLI',
        flag: '--agy-cli',
        probeCommand: ['agy', '--version'],
      },
      {
        target: 'claude-code',
        label: 'Claude Code',
        flag: '--claude-code',
        probeCommand: ['claude', '--version'],
      },
      { target: 'codex', label: 'Codex', flag: '--codex', probeCommand: ['codex', '--version'] },
      {
        target: 'cursor',
        label: 'Cursor',
        flag: '--cursor',
        probeCommand: ['cursor', '--version'],
      },
      {
        target: 'gemini-cli',
        label: 'Gemini CLI',
        flag: '--gemini-cli',
        probeCommand: ['gemini', '--version'],
      },
      {
        target: 'copilot-cli',
        label: 'GitHub Copilot CLI',
        flag: '--copilot-cli',
        // Copilot answers `--version` with the extension's version, not the binary's.
        probeCommand: ['copilot', '--binary-version'],
      },
      {
        target: 'grok-build',
        label: 'Grok Build',
        flag: '--grok-build',
        probeCommand: ['grok', '--version'],
      },
      {
        target: 'hermes-agent',
        label: 'Hermes Agent',
        flag: '--hermes-agent',
        probeCommand: ['hermes', '--version'],
      },
      {
        target: 'kimi-code',
        label: 'Kimi Code',
        flag: '--kimi-code',
        probeCommand: ['kimi', '--version'],
      },
      {
        target: 'openclaw',
        label: 'OpenClaw',
        flag: '--openclaw',
        probeCommand: ['openclaw', '--version'],
      },
      {
        target: 'opencode',
        label: 'OpenCode',
        flag: '--opencode',
        probeCommand: ['opencode', '--version'],
      },
      { target: 'pi', label: 'Pi', flag: '--pi', probeCommand: ['pi', '--version'] },
    ]);
  });

  test('a selection is deduplicated and put back into catalog order', () => {
    expect(orderInstallTargets(SELECTION)).toEqual(['amp', 'cursor', 'pi']);
  });

  test('the ordered run visits each target once, in the order it was handed', async () => {
    const record = async (run: typeof runInstallTargetsInOrder) => {
      const visited: InstallTarget[] = [];
      await run(orderInstallTargets(SELECTION), async (target) => {
        visited.push(target);
      });
      return visited;
    };
    expect(await record(runInstallTargetsInOrder)).toEqual(['amp', 'cursor', 'pi']);
  });
});
