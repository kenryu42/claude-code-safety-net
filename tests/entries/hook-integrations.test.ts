import { describe, expect, test } from 'bun:test';
import {
  type HookIntegration,
  findHookIntegrationByFlag as portedFindByFlag,
  findLegacyTopLevelHookIntegration as portedFindLegacy,
  hookIntegrations as portedIntegrations,
} from '@/entries/hook-integrations';
import {
  type IntegrationId,
  getIntegrationDisplayName as portedDisplayName,
  integrationDisplayNames as portedDisplayNames,
  doctorIntegrationOrder as portedDoctorOrder,
  installIntegrationMetadata as portedInstallMetadata,
  runtimeHookIntegrationMetadata as portedRuntimeMetadata,
} from '@/hosts/catalog';

/**
 * The hook table is what the bin resolves a flag through: an installed host config names one of
 * these flags, so a flag that stops resolving takes the gate out of that host silently. The rows
 * below name what each argument list resolves to, and the tables state the flags, the names and
 * the order the CLI reads out of the catalog.
 */

const HOOK_ARGS: readonly (readonly [readonly string[], string | undefined])[] = [
  [[], undefined],
  [['--kimi-code'], 'kimi-code'],
  [['-kc'], 'kimi-code'],
  [['--coding-cli'], 'claude-code'],
  [['--claude-code'], 'claude-code'],
  [['-cc'], 'claude-code'],
  [['--agy-cli'], 'antigravity-cli'],
  [['-ac'], 'antigravity-cli'],
  [['--codex'], 'codex'],
  [['-cx'], 'codex'],
  [['--cursor'], 'cursor'],
  [['--gemini-cli'], 'gemini-cli'],
  [['--copilot-cli'], 'copilot-cli'],
  [['--grok-build'], 'grok-build'],
  [['--hermes-agent'], 'hermes-agent'],
  // The flag is the whole argument list: a second flag, a trailing word or an unknown option all
  // leave the call unresolved rather than guessing which host meant to run it.
  [['--cursor', '--kimi-code'], undefined],
  [['--kimi-code', 'extra'], undefined],
  [['--kimi-code', '--unknown'], undefined],
  [['--help'], undefined],
];

/** The top-level spellings that shipped before `hook` took the flag, still answered for. */
const LEGACY_FLAGS: readonly (readonly [string | undefined, string | undefined])[] = [
  ['-cc', 'claude-code'],
  ['--claude-code', 'claude-code'],
  ['-cp', 'copilot-cli'],
  ['--copilot-cli', 'copilot-cli'],
  ['-gc', 'gemini-cli'],
  ['--gemini-cli', 'gemini-cli'],
  // Never a top-level spelling, so it stays a subcommand flag.
  ['--cursor', undefined],
  ['--statusline', undefined],
  [undefined, undefined],
];

const HOOK_TABLE = [
  {
    id: 'antigravity-cli',
    displayName: 'Antigravity CLI',
    description: 'Run as Antigravity CLI PreToolUse hook',
    flags: ['-ac', '--agy-cli'],
    legacyFlags: [],
    legacyTopLevelFlags: [],
  },
  {
    id: 'claude-code',
    displayName: 'Coding CLI',
    description: 'Run as Coding CLI PreToolUse hook',
    flags: ['-cc', '--coding-cli'],
    legacyFlags: ['--claude-code'],
    legacyTopLevelFlags: ['-cc', '--claude-code'],
  },
  {
    id: 'codex',
    displayName: 'Codex',
    description: 'Run as a Codex PreToolUse hook',
    flags: ['-cx', '--codex'],
    legacyFlags: [],
    legacyTopLevelFlags: [],
  },
  {
    id: 'cursor',
    displayName: 'Cursor',
    description: 'Run as Cursor preToolUse hook',
    flags: ['-cu', '--cursor'],
    legacyFlags: [],
    legacyTopLevelFlags: [],
  },
  {
    id: 'gemini-cli',
    displayName: 'Gemini CLI',
    description: 'Run as Gemini CLI BeforeTool hook',
    flags: ['-gc', '--gemini-cli'],
    legacyFlags: [],
    legacyTopLevelFlags: ['-gc', '--gemini-cli'],
  },
  {
    id: 'copilot-cli',
    displayName: 'GitHub Copilot CLI',
    description: 'Run as GitHub Copilot CLI PreToolUse hook',
    flags: ['-cp', '--copilot-cli'],
    legacyFlags: [],
    legacyTopLevelFlags: ['-cp', '--copilot-cli'],
  },
  {
    id: 'grok-build',
    displayName: 'Grok Build',
    description: 'Run as Grok Build PreToolUse hook',
    flags: ['-gb', '--grok-build'],
    legacyFlags: [],
    legacyTopLevelFlags: [],
  },
  {
    id: 'hermes-agent',
    displayName: 'Hermes Agent',
    description: 'Run as Hermes Agent pre_tool_call hook',
    flags: ['-ha', '--hermes-agent'],
    legacyFlags: [],
    legacyTopLevelFlags: [],
  },
  {
    id: 'kimi-code',
    displayName: 'Kimi Code',
    description: 'Run as Kimi Code PreToolUse hook',
    flags: ['-kc', '--kimi-code'],
    legacyFlags: [],
    legacyTopLevelFlags: [],
  },
];

/** A `run` is a closure; everything else on an integration is data the catalog owns. */
const withoutRun = (integrations: readonly HookIntegration[]) =>
  integrations.map(({ run: _run, ...integration }) => integration);

describe('the hook table', () => {
  test('resolves one integration per hook argument list', () => {
    expect(HOOK_ARGS.map(([args]) => portedFindByFlag(args)?.id)).toEqual(
      HOOK_ARGS.map(([, id]) => id),
    );
  });

  test('resolves the legacy top-level flags it still answers for', () => {
    expect(LEGACY_FLAGS.map(([flag]) => portedFindLegacy(flag)?.id)).toEqual(
      LEGACY_FLAGS.map(([, id]) => id),
    );
  });

  test('carries the flags and the help text the bin lists, in order', () => {
    expect(withoutRun(portedIntegrations)).toEqual(HOOK_TABLE);
    // The table the CLI reads for `--help` is the same table the bin dispatches through.
    expect(portedRuntimeMetadata).toEqual(HOOK_TABLE);
  });
});

describe('the host catalog', () => {
  test('names an install flag, an artifact kind and a probe for every host', () => {
    expect(portedInstallMetadata).toEqual([
      { id: 'amp', flag: '--amp', artifactKind: 'plugin', probeCommand: ['amp', '--version'] },
      {
        id: 'antigravity-cli',
        flag: '--agy-cli',
        artifactKind: 'hook config',
        probeCommand: ['agy', '--version'],
      },
      {
        id: 'claude-code',
        flag: '--claude-code',
        artifactKind: 'plugin',
        probeCommand: ['claude', '--version'],
      },
      {
        id: 'codex',
        flag: '--codex',
        artifactKind: 'plugin',
        probeCommand: ['codex', '--version'],
      },
      {
        id: 'cursor',
        flag: '--cursor',
        artifactKind: 'hook config',
        probeCommand: ['cursor', '--version'],
      },
      {
        id: 'gemini-cli',
        flag: '--gemini-cli',
        artifactKind: 'extension',
        probeCommand: ['gemini', '--version'],
      },
      {
        id: 'copilot-cli',
        flag: '--copilot-cli',
        artifactKind: 'plugin',
        probeCommand: ['copilot', '--binary-version'],
      },
      {
        id: 'grok-build',
        flag: '--grok-build',
        artifactKind: 'hook config',
        probeCommand: ['grok', '--version'],
      },
      {
        id: 'hermes-agent',
        flag: '--hermes-agent',
        artifactKind: 'plugin',
        probeCommand: ['hermes', '--version'],
      },
      {
        id: 'kimi-code',
        flag: '--kimi-code',
        artifactKind: 'hook config',
        probeCommand: ['kimi', '--version'],
      },
      {
        id: 'openclaw',
        flag: '--openclaw',
        artifactKind: 'plugin',
        probeCommand: ['openclaw', '--version'],
      },
      {
        id: 'opencode',
        flag: '--opencode',
        artifactKind: 'plugin',
        probeCommand: ['opencode', '--version'],
      },
      { id: 'pi', flag: '--pi', artifactKind: 'package', probeCommand: ['pi', '--version'] },
    ]);
  });

  test('reports on every installable host, the one the tool is named for first', () => {
    expect(portedDoctorOrder).toEqual([
      'claude-code',
      'amp',
      'antigravity-cli',
      'codex',
      'cursor',
      'gemini-cli',
      'copilot-cli',
      'grok-build',
      'hermes-agent',
      'kimi-code',
      'openclaw',
      'opencode',
      'pi',
    ]);
    expect([...portedDoctorOrder].sort()).toEqual(
      portedInstallMetadata.map((host) => host.id).sort(),
    );
  });

  test('names every integration the way the CLI prints it', () => {
    expect(portedDisplayNames).toEqual({
      amp: 'Amp Code',
      'antigravity-cli': 'Antigravity CLI',
      'claude-code': 'Claude Code',
      codex: 'Codex',
      'copilot-cli': 'GitHub Copilot CLI',
      cursor: 'Cursor',
      'gemini-cli': 'Gemini CLI',
      'grok-build': 'Grok Build',
      'hermes-agent': 'Hermes Agent',
      'kimi-code': 'Kimi Code',
      openclaw: 'OpenClaw',
      opencode: 'OpenCode',
      pi: 'Pi',
    });
    for (const id of Object.keys(portedDisplayNames) as IntegrationId[]) {
      expect(portedDisplayName(id), id).toBe(portedDisplayNames[id]);
    }
  });
});
