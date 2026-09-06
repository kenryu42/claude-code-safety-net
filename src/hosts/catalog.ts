type RuntimeMetadata = {
  order: number;
  displayName?: string;
  flags: readonly [string, string];
  legacyFlags?: readonly string[];
  description: string;
  legacyTopLevelFlags: readonly string[];
};

type InstallMetadata = {
  order: number;
  flag: string;
  artifactKind: 'plugin' | 'extension' | 'hook config' | 'package';
  probeCommand: readonly [string, ...string[]];
};

type IntegrationCatalogEntry = {
  id: string;
  displayName: string;
  doctorOrder: number;
  runtime?: RuntimeMetadata;
  install: InstallMetadata;
};

const catalog = [
  {
    id: 'antigravity-cli',
    displayName: 'Antigravity CLI',
    doctorOrder: 3,
    runtime: {
      order: 1,
      flags: ['-ac', '--agy-cli'],
      description: 'Run as Antigravity CLI PreToolUse hook',
      legacyTopLevelFlags: [],
    },
    install: {
      order: 2,
      flag: '--agy-cli',
      artifactKind: 'hook config',
      probeCommand: ['agy', '--version'],
    },
  },
  {
    id: 'claude-code',
    displayName: 'Claude Code',
    doctorOrder: 1,
    runtime: {
      order: 2,
      displayName: 'Coding CLI',
      flags: ['-cc', '--coding-cli'],
      legacyFlags: ['--claude-code'],
      description: 'Run as Coding CLI PreToolUse hook',
      legacyTopLevelFlags: ['-cc', '--claude-code'],
    },
    install: {
      order: 3,
      flag: '--claude-code',
      artifactKind: 'plugin',
      probeCommand: ['claude', '--version'],
    },
  },
  {
    id: 'codex',
    displayName: 'Codex',
    doctorOrder: 4,
    runtime: {
      order: 3,
      flags: ['-cx', '--codex'],
      description: 'Run as a Codex PreToolUse hook',
      legacyTopLevelFlags: [],
    },
    install: {
      order: 4,
      flag: '--codex',
      artifactKind: 'plugin',
      probeCommand: ['codex', '--version'],
    },
  },
  {
    id: 'copilot-cli',
    displayName: 'GitHub Copilot CLI',
    doctorOrder: 7,
    runtime: {
      order: 6,
      flags: ['-cp', '--copilot-cli'],
      description: 'Run as GitHub Copilot CLI PreToolUse hook',
      legacyTopLevelFlags: ['-cp', '--copilot-cli'],
    },
    install: {
      order: 7,
      flag: '--copilot-cli',
      artifactKind: 'plugin',
      probeCommand: ['copilot', '--binary-version'],
    },
  },
  {
    id: 'gemini-cli',
    displayName: 'Gemini CLI',
    doctorOrder: 6,
    runtime: {
      order: 5,
      flags: ['-gc', '--gemini-cli'],
      description: 'Run as Gemini CLI BeforeTool hook',
      legacyTopLevelFlags: ['-gc', '--gemini-cli'],
    },
    install: {
      order: 6,
      flag: '--gemini-cli',
      artifactKind: 'extension',
      probeCommand: ['gemini', '--version'],
    },
  },
  {
    id: 'grok-build',
    displayName: 'Grok Build',
    doctorOrder: 8,
    runtime: {
      order: 7,
      flags: ['-gb', '--grok-build'],
      description: 'Run as Grok Build PreToolUse hook',
      legacyTopLevelFlags: [],
    },
    install: {
      order: 8,
      flag: '--grok-build',
      artifactKind: 'hook config',
      probeCommand: ['grok', '--version'],
    },
  },
  {
    id: 'hermes-agent',
    displayName: 'Hermes Agent',
    doctorOrder: 9,
    runtime: {
      order: 8,
      flags: ['-ha', '--hermes-agent'],
      description: 'Run as Hermes Agent pre_tool_call hook',
      legacyTopLevelFlags: [],
    },
    install: {
      order: 9,
      flag: '--hermes-agent',
      artifactKind: 'plugin',
      probeCommand: ['hermes', '--version'],
    },
  },
  {
    id: 'kimi-code',
    displayName: 'Kimi Code',
    doctorOrder: 10,
    runtime: {
      order: 9,
      flags: ['-kc', '--kimi-code'],
      description: 'Run as Kimi Code PreToolUse hook',
      legacyTopLevelFlags: [],
    },
    install: {
      order: 10,
      flag: '--kimi-code',
      artifactKind: 'hook config',
      probeCommand: ['kimi', '--version'],
    },
  },
  {
    id: 'openclaw',
    displayName: 'OpenClaw',
    doctorOrder: 11,
    install: {
      order: 11,
      flag: '--openclaw',
      artifactKind: 'plugin',
      probeCommand: ['openclaw', '--version'],
    },
  },
  {
    id: 'opencode',
    displayName: 'OpenCode',
    doctorOrder: 12,
    install: {
      order: 12,
      flag: '--opencode',
      artifactKind: 'plugin',
      probeCommand: ['opencode', '--version'],
    },
  },
  {
    id: 'pi',
    displayName: 'Pi',
    doctorOrder: 13,
    install: {
      order: 13,
      flag: '--pi',
      artifactKind: 'package',
      probeCommand: ['pi', '--version'],
    },
  },
  {
    id: 'cursor',
    displayName: 'Cursor',
    doctorOrder: 5,
    runtime: {
      order: 4,
      flags: ['-cu', '--cursor'],
      description: 'Run as Cursor preToolUse hook',
      legacyTopLevelFlags: [],
    },
    install: {
      order: 5,
      flag: '--cursor',
      artifactKind: 'hook config',
      probeCommand: ['cursor', '--version'],
    },
  },
  {
    id: 'amp',
    displayName: 'Amp Code',
    doctorOrder: 2,
    install: {
      order: 1,
      flag: '--amp',
      artifactKind: 'plugin',
      probeCommand: ['amp', '--version'],
    },
  },
] as const satisfies readonly IntegrationCatalogEntry[];

export type IntegrationId = (typeof catalog)[number]['id'];
type RuntimeEntry = Extract<(typeof catalog)[number], { runtime: RuntimeMetadata }>;
export type RuntimeHookIntegrationId = RuntimeEntry['id'];

export const doctorIntegrationOrder = catalog
  .slice()
  .sort((a, b) => a.doctorOrder - b.doctorOrder)
  .map((integration) => integration.id);

export const runtimeHookIntegrationMetadata = catalog
  .filter((integration): integration is RuntimeEntry => 'runtime' in integration)
  .slice()
  .sort((a, b) => a.runtime.order - b.runtime.order)
  .map((integration) => ({
    id: integration.id,
    displayName:
      'displayName' in integration.runtime
        ? integration.runtime.displayName
        : integration.displayName,
    flags: integration.runtime.flags,
    legacyFlags: 'legacyFlags' in integration.runtime ? integration.runtime.legacyFlags : [],
    description: integration.runtime.description,
    legacyTopLevelFlags: integration.runtime.legacyTopLevelFlags,
  }));

export const installIntegrationMetadata = catalog
  .slice()
  .sort((a, b) => a.install.order - b.install.order)
  .map((integration) => ({ id: integration.id, ...integration.install }))
  .map(({ order: _, ...integration }) => integration);

/** Audit entries stamp an integration id as their `agent`, so this doubles as
 *  the id-to-label map for anything rendering a logged agent. */
export const integrationDisplayNames = Object.fromEntries(
  catalog.map((integration) => [integration.id, integration.displayName]),
) as Record<IntegrationId, string>;

export function getIntegrationDisplayName(id: IntegrationId): string {
  return catalog.find((integration) => integration.id === id)?.displayName ?? id;
}
