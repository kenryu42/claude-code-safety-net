import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseCommandArgs } from '@/cli/args';
import { checkForUpdates } from '@/cli/doctor/updates';
import { printInstallBanner } from '@/cli/install/banner';
import {
  canPromptInstallTargets,
  type KimiInstallMethod,
  promptInstallTargets,
  promptKimiInstallMethod,
} from '@/cli/install/prompt';
import { awaitWithSpinner, resolveAfterOptionalBanner } from '@/cli/startup/banner';
import { colors } from '@/cli/utils/colors';
import { createProcessEnvironment, type Environment } from '@/core/environment';
import { atomicWriteFile } from '@/core/io/atomic-write';
import { stripJsonComments } from '@/core/io/jsonc';
import { installAmp, uninstallAmp } from '@/hosts/amp/install';
import { installAntigravityCli, uninstallAntigravityCli } from '@/hosts/antigravity-cli/install';
import { getIntegrationDisplayName } from '@/hosts/catalog';
import { detectClaudeCode, hasClaudeInstalledPlugin } from '@/hosts/claude-code/detect';
import { _getCopilotConfigHome } from '@/hosts/copilot-cli/detect';
import {
  COPILOT_LEGACY_PLUGIN_DIR,
  COPILOT_PLUGIN_DIR,
  COPILOT_PLUGIN_ID,
  COPILOT_PRE_RENAME_PLUGIN_DIR,
  COPILOT_PRE_RENAME_PLUGIN_ID,
  hasCopilotLegacyPlugin,
  hasCopilotMarketplace,
  hasCopilotPreRenamePlugin,
  hasCopilotSafetyNetPlugin,
} from '@/hosts/copilot-cli/plugin-id';
import { installCursor, uninstallCursor } from '@/hosts/cursor/install';
import { detectAllHooks } from '@/hosts/detect/index';
import type { UpdateInfo } from '@/hosts/doctor-types';
import { detectGeminiCLI } from '@/hosts/gemini-cli/detect';
import { installGrokBuild, uninstallGrokBuild } from '@/hosts/grok-build/install';
import { HERMES_AGENT_PLUGIN_NAME } from '@/hosts/hermes-agent/artifact';
import { isHermesAgentPluginEnabled } from '@/hosts/hermes-agent/detect';
import {
  installHermesAgent,
  readOwnedHermesAgentFiles,
  uninstallHermesAgent,
} from '@/hosts/hermes-agent/install';
import { clearBunxSafetyNetCache } from '@/hosts/install/bunx-cache';
import {
  applyInstallTargetState,
  buildInstallTargetChoicesAsync,
  type InstallTargetChoice,
  type InstallTargetProbe,
  probeInstallTarget,
} from '@/hosts/install/choices';
import {
  type NativeCommand,
  runNativeCleanupCommands,
  runNativeCommand,
  runNativeCommands,
} from '@/hosts/install/native';
import { clearNpxSafetyNetCache } from '@/hosts/install/npx-cache';
import {
  INSTALL_TARGETS,
  type InstallAction,
  type InstallTarget,
  orderInstallTargets,
  runInstallTargetsInOrder,
} from '@/hosts/install/targets';
import type { InstallResult } from '@/hosts/install/types';
import { detect as detectKimiCodeHook } from '@/hosts/kimi-code/detect';
import { installKimiCode, uninstallKimiCode } from '@/hosts/kimi-code/install';
import { OPENCLAW_PLUGIN_ID } from '@/hosts/openclaw/artifact';
import {
  assertOpenClawPluginDirIsOurs,
  getOpenClawInstallCommands,
  verifyOpenClawPluginRuntime,
} from '@/hosts/openclaw/install';
import {
  clearOpenCodeCache,
  uninstallOpenCode,
  verifyOpenCodePluginRuntime,
} from '@/hosts/opencode/install';
import { getPiSettingsPath, isPiSafetyNetPackageSource } from '@/hosts/pi/detect';
import { defaultVersionFetcher, type VersionFetcher } from '@/hosts/system-info';

type ConfigInstallTarget = Extract<
  InstallTarget,
  'antigravity-cli' | 'grok-build' | 'kimi-code' | 'cursor'
>;
// Integrations whose install writes a managed artifact directly instead of driving a host CLI.
type ManagedArtifactTarget = Extract<InstallTarget, 'amp' | 'hermes-agent'>;
type NativeInstallTarget = Exclude<InstallTarget, ConfigInstallTarget | ManagedArtifactTarget>;
type NativeInstallPlan = {
  commands: readonly NativeCommand[];
  /** Best-effort commands run after `commands`; a failure warns instead of failing the target. */
  cleanupCommands?: readonly NativeCommand[];
  update?: boolean;
};
type InstallTargetSelection = readonly InstallTarget[] | null | 'update';

export type RunInstallCommandOptions = {
  input?: NodeJS.ReadStream;
  output?: NodeJS.WriteStream;
  probeTargets?: InstallTargetProbe;
  detectConfiguredTargets?: () => Promise<readonly InstallTarget[]>;
  fetchVersion?: VersionFetcher;
  selectTargets?: (
    action: InstallAction,
    choices: readonly InstallTargetChoice[],
  ) => Promise<InstallTargetSelection>;
  selectKimiInstallMethod?: () => Promise<KimiInstallMethod | null>;
  runUpdate?: () => Promise<number>;
};

type UpdateCommandOptions = {
  fetchVersion?: VersionFetcher;
  input?: NodeJS.ReadStream;
  output?: NodeJS.WriteStream;
  showBanner?: boolean;
  checkLatestVersion?: () => Promise<UpdateInfo>;
  scriptPath?: string;
};

type NativeInstallDefinition = {
  installCommands:
    | readonly NativeCommand[]
    | ((
        environment: Environment,
        codexPluginListOutput?: string | null,
      ) => NativeInstallPlan | Promise<NativeInstallPlan>);
  uninstallCommands?: readonly NativeCommand[];
  beforeInstall?: (environment: Environment) => void;
  postInstallMessage?: string;
};
type InstallTargetResolution = {
  ready?: Promise<unknown>;
  finish: () => Promise<InstallTargetSelection>;
};
// Removed on install when Claude Code still records the pre-rename plugin id.
const CLAUDE_LEGACY_PLUGIN_ID = 'safety-net@cc-marketplace';
// Targets whose install drives a host CLI, so `update` skips them when that CLI is gone.
const NATIVE_UPDATE_TARGETS = new Set<InstallTarget>([
  'claude-code',
  'codex',
  'copilot-cli',
  'gemini-cli',
  'hermes-agent',
  'openclaw',
  'opencode',
  'pi',
]);
// Targets whose install runs `npx cc-safety-net`, so a stale npx cache would keep the previous
// version running after an update.
const NPX_CACHE_TARGETS = new Set<InstallTarget>([
  'antigravity-cli',
  'cursor',
  'grok-build',
  'hermes-agent',
  'kimi-code',
]);

// Codex matchers are line-anchored because the legacy row's source URL also contains
// "cc-safety-net", and status-checked because `codex plugin list` includes marketplace rows
// marked "not installed". "installed," matches any installed row (enabled or not) and can
// never match a "not installed" status.
function hasCodexLegacyPlugin(output: string | null): boolean {
  return /^\s*safety-net@cc-marketplace[^a-z0-9-][^\n]*installed,/m.test(output ?? '');
}

function hasCodexReplacementPlugin(output: string | null): boolean {
  return /^\s*cc-safety-net[^a-z0-9-][^\n]*installed,/m.test(output ?? '');
}

// `codex plugin list` prints one "Marketplace `<name>`" heading per registered marketplace.
function hasCodexMarketplace(output: string | null): boolean {
  return /^Marketplace `cc-marketplace`\s*$/m.test(output ?? '');
}

const NATIVE_INSTALLS: Record<NativeInstallTarget, NativeInstallDefinition> = {
  'claude-code': {
    installCommands: (environment) => {
      const update = hasClaudeInstalledPlugin(environment, 'cc-safety-net@cc-marketplace');
      return {
        commands: [
          ...(update
            ? ([
                ['claude', 'plugin', 'marketplace', 'update', 'cc-marketplace'],
                ['claude', 'plugin', 'update', 'cc-safety-net@cc-marketplace'],
              ] as const)
            : ([
                ['claude', 'plugin', 'marketplace', 'add', 'kenryu42/cc-marketplace'],
                // `add` is a no-op on an already-registered marketplace, so its stale catalog
                // (e.g. from before the plugin rename) would fail the install without a refresh.
                ['claude', 'plugin', 'marketplace', 'update', 'cc-marketplace'],
                ['claude', 'plugin', 'install', 'cc-safety-net@cc-marketplace'],
              ] as const)),
          ...(detectClaudeCode(environment).status === 'disabled'
            ? ([['claude', 'plugin', 'enable', 'cc-safety-net@cc-marketplace']] as const)
            : []),
        ],
        // Best-effort: the marketplace refresh can migrate the rename itself, leaving a plugin
        // record the CLI no longer accepts an uninstall for.
        cleanupCommands: hasClaudeInstalledPlugin(environment, CLAUDE_LEGACY_PLUGIN_ID)
          ? ([['claude', 'plugin', 'uninstall', CLAUDE_LEGACY_PLUGIN_ID]] as const)
          : [],
        update,
      };
    },
    uninstallCommands: [
      ['claude', 'plugin', 'uninstall', 'cc-safety-net@cc-marketplace'],
      ['claude', 'plugin', 'marketplace', 'remove', 'cc-marketplace'],
    ],
  },
  codex: {
    // `update` already paid for a `codex plugin list` during detection, so it hands the output
    // over instead of refreshing the marketplace checkouts a second time.
    installCommands: async (_environment, codexPluginListOutput) => {
      const pluginList =
        codexPluginListOutput ?? (await runNativeCommand(['codex', 'plugin', 'list']));
      const update = hasCodexReplacementPlugin(pluginList);
      return {
        commands: [
          // A registered marketplace holds a catalog checkout that `add` does not refresh, so a
          // stale one (e.g. from before the plugin rename) would fail the plugin add.
          update || hasCodexMarketplace(pluginList)
            ? (['codex', 'plugin', 'marketplace', 'upgrade', 'cc-marketplace'] as const)
            : (['codex', 'plugin', 'marketplace', 'add', 'kenryu42/cc-marketplace'] as const),
          ['codex', 'plugin', 'add', 'cc-safety-net@cc-marketplace'],
        ],
        cleanupCommands: hasCodexLegacyPlugin(pluginList)
          ? ([['codex', 'plugin', 'remove', 'safety-net@cc-marketplace']] as const)
          : [],
        update,
      };
    },
    uninstallCommands: [
      ['codex', 'plugin', 'remove', 'cc-safety-net@cc-marketplace'],
      ['codex', 'plugin', 'marketplace', 'remove', 'cc-marketplace'],
    ],
    postInstallMessage:
      'Start Codex, open `/hooks`, select the cc-safety-net PreToolUse hook, and press `t` to trust it.',
  },
  'copilot-cli': {
    installCommands: async () => {
      const pluginList = await runNativeCommand(['copilot', 'plugin', 'list']);
      const cleanupCommands = [
        ...(hasCopilotLegacyPlugin(pluginList)
          ? ([['copilot', 'plugin', 'uninstall', 'copilot-safety-net']] as const)
          : []),
        ...(hasCopilotPreRenamePlugin(pluginList)
          ? ([['copilot', 'plugin', 'uninstall', COPILOT_PRE_RENAME_PLUGIN_ID]] as const)
          : []),
      ];
      if (hasCopilotSafetyNetPlugin(pluginList))
        return {
          commands: [
            ['copilot', 'plugin', 'marketplace', 'update', 'cc-marketplace'],
            ['copilot', 'plugin', 'update', COPILOT_PLUGIN_ID],
          ],
          cleanupCommands,
          update: true,
        };

      return {
        commands: [
          // A registered marketplace holds a catalog checkout that goes stale (e.g. from before
          // the plugin rename) and would fail the install without a refresh.
          hasCopilotMarketplace(
            await runNativeCommand(['copilot', 'plugin', 'marketplace', 'list']),
          )
            ? (['copilot', 'plugin', 'marketplace', 'update', 'cc-marketplace'] as const)
            : (['copilot', 'plugin', 'marketplace', 'add', 'kenryu42/cc-marketplace'] as const),
          ['copilot', 'plugin', 'install', COPILOT_PLUGIN_ID],
        ],
        cleanupCommands,
      };
    },
    uninstallCommands: [
      ['copilot', 'plugin', 'uninstall', 'cc-safety-net@cc-marketplace'],
      ['copilot', 'plugin', 'marketplace', 'remove', 'cc-marketplace'],
    ],
  },
  'gemini-cli': {
    installCommands: (environment) => {
      const detection = detectGeminiCLI(environment);
      if (detection.status === 'configured')
        return {
          commands: [['gemini', 'extensions', 'update', 'gemini-safety-net']],
          update: true,
        };
      if (detection.status === 'disabled')
        return {
          commands: [
            ['gemini', 'extensions', 'update', 'gemini-safety-net'],
            ['gemini', 'extensions', 'enable', 'gemini-safety-net'],
          ],
          update: true,
        };
      return {
        commands: [
          [
            'gemini',
            'extensions',
            'install',
            'https://github.com/kenryu42/gemini-safety-net',
            '--consent',
          ],
        ],
      };
    },
    uninstallCommands: [['gemini', 'extensions', 'uninstall', 'gemini-safety-net']],
  },
  openclaw: {
    beforeInstall: assertOpenClawPluginDirIsOurs,
    installCommands: () => ({ commands: getOpenClawInstallCommands() }),
    uninstallCommands: [['openclaw', 'plugins', 'uninstall', OPENCLAW_PLUGIN_ID, '--force']],
    postInstallMessage: [
      'Restart the OpenClaw Gateway to apply the change.',
      'If plugins.allow is set in openclaw.json, it must also list cc-safety-net.',
    ].join('\n'),
  },
  opencode: {
    beforeInstall: clearOpenCodeCache,
    installCommands: [['opencode', 'plugin', '-g', '-f', 'cc-safety-net@latest']],
  },
  pi: {
    installCommands: [['pi', 'install', 'npm:cc-safety-net']],
    uninstallCommands: [['pi', 'uninstall', 'npm:cc-safety-net']],
  },
};

function parseJsonSettings(
  configPath: string,
  preprocess = (raw: string) => raw,
): Record<string, unknown> {
  try {
    const config = JSON.parse(preprocess(readFileSync(configPath, 'utf-8')));
    if (!config || typeof config !== 'object' || Array.isArray(config)) {
      throw new Error(`Settings file ${configPath} must be a JSON object`);
    }
    return config as Record<string, unknown>;
  } catch (error) {
    if (error instanceof SyntaxError) {
      throw new Error(`Failed to parse ${configPath}: ${error.message}`);
    }
    throw error;
  }
}

function enableCopilotPlugin(environment: Environment): string | undefined {
  const settingsPath = join(_getCopilotConfigHome(environment), 'settings.json');
  if (!existsSync(settingsPath)) return;

  const settings = parseJsonSettings(settingsPath, stripJsonComments);
  const enabledPlugins = settings.enabledPlugins;
  if (!enabledPlugins || typeof enabledPlugins !== 'object' || Array.isArray(enabledPlugins))
    return;
  if ((enabledPlugins as Record<string, unknown>)[COPILOT_PLUGIN_ID] !== false) return;

  // Flip the flag in the raw text so hand-written JSONC comments and formatting survive;
  // fall back to a stringify rewrite when the text form is unmatchable (e.g. a comment
  // between key and value).
  const raw = readFileSync(settingsPath, 'utf-8');
  const flipped = raw.replace(new RegExp(`("${COPILOT_PLUGIN_ID}"\\s*:\\s*)false`), '$1true');
  (enabledPlugins as Record<string, unknown>)[COPILOT_PLUGIN_ID] = true;
  atomicWriteFile(
    settingsPath,
    flipped !== raw ? flipped : `${JSON.stringify(settings, null, 2)}\n`,
  );
  return `Enabled ${COPILOT_PLUGIN_ID} plugin in ${settingsPath}`;
}

function removePiExtensionsFilter(environment: Environment): string | undefined {
  const settingsPath = getPiSettingsPath(environment);
  if (!existsSync(settingsPath)) return;

  const settings = parseJsonSettings(settingsPath);
  if (!Array.isArray(settings.packages)) return;

  const entry = settings.packages.find(
    (candidate): candidate is Record<string, unknown> =>
      !!candidate &&
      typeof candidate === 'object' &&
      !Array.isArray(candidate) &&
      isPiSafetyNetPackageSource((candidate as Record<string, unknown>).source) &&
      'extensions' in candidate,
  );
  if (!entry) return;

  delete entry.extensions;
  atomicWriteFile(settingsPath, `${JSON.stringify(settings, null, 2)}\n`);
  return `Enabled npm:cc-safety-net extensions in ${settingsPath}`;
}

function parseInstallTarget(args: readonly string[], action: InstallAction): InstallTarget {
  const parsed = parseCommandArgs(
    {
      label: action,
      booleans: Object.fromEntries(INSTALL_TARGETS.map((target) => [target.target, [target.flag]])),
    },
    args,
  );
  const error = parsed.errors[0];
  if (error) throw new Error(error);

  const targets = INSTALL_TARGETS.filter((target) => parsed.flags[target.target]).map(
    (target) => target.target,
  );
  if (targets.length !== 1)
    throw new Error(
      `Choose exactly one ${action} target: ${INSTALL_TARGETS.map((target) => target.flag).join(', ')}`,
    );
  return targets[0] as InstallTarget;
}

// Only probes that leave the inspected runtime untouched run here: `claude plugin list`,
// `gemini extensions list`, `copilot plugin list` and the Pi extension probe all write into the
// user's real config directories, and this runs on every bare install/uninstall in a TTY.
async function detectInstallHookState(
  environment: Environment,
  fetchVersion = defaultVersionFetcher,
) {
  const [ampPluginListOutput, codexPluginListOutput, copilotCliVersion] = await Promise.all([
    // Amp's managed plugin lives in the account's hosted personal repository, so only this
    // command can see it; like Codex's it can outlast the default 5s version timeout.
    fetchVersion(['amp', 'plugins', 'list'], 30_000),
    // A cold `codex plugin list` refreshes marketplace checkouts over the network and can
    // outlast the default 5s version timeout, which would silently drop Codex from detection.
    fetchVersion(['codex', 'plugin', 'list'], 30_000),
    fetchVersion(['copilot', '--binary-version']),
  ]);

  return {
    codexPluginListOutput,
    hooks: detectAllHooks(environment, process.cwd(), {
      ampPluginListOutput,
      codexPluginListOutput,
      copilotCliVersion,
    }),
  };
}

async function detectConfiguredInstallTargets(
  environment: Environment,
  action: InstallAction,
  fetchVersion = defaultVersionFetcher,
): Promise<InstallTarget[]> {
  const state = await detectInstallHookState(environment, fetchVersion);
  return (
    state.hooks
      // Uninstall also keeps a runtime whose state could not be read: hiding it would make the
      // interactive path unable to remove it at all.
      .filter((hook) =>
        action === 'install'
          ? hook.configured
          : hook.detected || hook.inspectionStatus === 'not-inspected',
      )
      .filter(
        (hook) =>
          hook.platform !== 'codex' ||
          !hasCodexLegacyPlugin(state.codexPluginListOutput) ||
          hasCodexReplacementPlugin(state.codexPluginListOutput),
      )
      .map((hook) => hook.platform as InstallTarget)
  );
}

function startResolveInstallTargets(
  environment: Environment,
  action: InstallAction,
  args: readonly string[],
  options: RunInstallCommandOptions,
): InstallTargetResolution {
  if (args.length > 0)
    return {
      finish: async () => [parseInstallTarget(args, action)],
    };
  if (!options.selectTargets && !canPromptInstallTargets(options.input, options.output)) {
    return {
      finish: async () => [parseInstallTarget(args, action)],
    };
  }

  const detectConfiguredTargets =
    options.detectConfiguredTargets ??
    (() => detectConfiguredInstallTargets(environment, action, options.fetchVersion));
  const ready = Promise.all([
    buildInstallTargetChoicesAsync(options.probeTargets),
    detectConfiguredTargets(),
  ]);

  return {
    ready,
    finish: async () => {
      const [choices, configuredTargets] = await ready;
      const targetChoices = applyInstallTargetState(choices, {
        action,
        configuredTargets,
      });
      const selected = options.selectTargets
        ? await options.selectTargets(action, allowKimiMethodChoice(action, targetChoices))
        : await promptInstallTargets(action, allowKimiMethodChoice(action, targetChoices), {
            input: options.input,
            output: options.output,
          });
      if (selected === 'update') return selected;
      if (!selected || selected.length === 0) return null;

      return orderInstallTargets(selected);
    },
  };
}

async function installNativeTarget(
  target: NativeInstallTarget,
  environment: Environment,
  updating = false,
  codexPluginListOutput?: string | null,
): Promise<string> {
  const definition = NATIVE_INSTALLS[target];
  definition.beforeInstall?.(environment);
  const plan =
    typeof definition.installCommands === 'function'
      ? await definition.installCommands(environment, codexPluginListOutput)
      : { commands: definition.installCommands };
  await runNativeCommands(plan.commands);
  await runNativeCleanupCommands(plan.cleanupCommands ?? []);
  return [
    `${plan.update || updating ? 'Updated' : 'Installed'} ${getIntegrationDisplayName(target)} integration`,
    definition.postInstallMessage,
  ]
    .filter(Boolean)
    .join('\n');
}

async function uninstallNativeTarget(
  target: Exclude<NativeInstallTarget, 'opencode'>,
): Promise<string> {
  const definition = NATIVE_INSTALLS[target];
  if (!definition.uninstallCommands)
    throw new Error(`${getIntegrationDisplayName(target)} uninstall is not supported`);

  await runNativeCommands(definition.uninstallCommands);
  return `Uninstalled ${getIntegrationDisplayName(target)} integration`;
}

function uninstallOpenCodeTarget(environment: Environment): string {
  const result = uninstallOpenCode(environment);
  return result.alreadyInstalled
    ? `Uninstalled OpenCode plugin from ${result.path}`
    : `OpenCode plugin not installed in ${result.path}`;
}

const CONFIG_INSTALLS = {
  'antigravity-cli': { install: installAntigravityCli, uninstall: uninstallAntigravityCli },
  cursor: { install: installCursor, uninstall: uninstallCursor },
  'grok-build': { install: installGrokBuild, uninstall: uninstallGrokBuild },
  'kimi-code': { install: installKimiCode, uninstall: uninstallKimiCode },
} satisfies Record<
  ConfigInstallTarget,
  Record<InstallAction, (environment: Environment) => InstallResult>
>;

function runConfigInstallTarget(
  action: InstallAction,
  target: ConfigInstallTarget,
  environment: Environment,
  updating = false,
): string {
  // Updating clears the cache once up front instead, so its parallel targets cannot race.
  if (action === 'install' && !updating) clearNpxSafetyNetCache(environment);
  const result = CONFIG_INSTALLS[target][action](environment);
  const name = getIntegrationDisplayName(target);
  const pastTense = action !== 'install' ? 'Uninstalled' : updating ? 'Updated' : 'Installed';

  return action === 'install' && result.alreadyInstalled
    ? updating
      ? `${name} hook up to date in ${result.path}`
      : `${name} hook already installed in ${result.path}`
    : action === 'uninstall' && !result.alreadyInstalled
      ? `${name} hook not installed in ${result.path}`
      : `${pastTense} ${name} hook ${action === 'install' ? 'in' : 'from'} ${result.path}`;
}

const MANAGED_ARTIFACT_INSTALLS: Record<
  ManagedArtifactTarget,
  {
    install: (environment: Environment) => InstallResult | Promise<InstallResult>;
    uninstall: (environment: Environment) => InstallResult | Promise<InstallResult>;
    /** Returns whether it changed host state, which an unchanged artifact alone cannot tell. */
    afterInstall?: (environment: Environment) => Promise<boolean>;
    beforeUninstall?: (environment: Environment) => Promise<void>;
    restartNote: string;
  }
> = {
  amp: {
    install: installAmp,
    uninstall: uninstallAmp,
    restartNote:
      'Amp personal plugins apply to every Amp session, including Orb threads. Restart Amp or run "plugins: reload" to apply the change.',
  },
  'hermes-agent': {
    install: installHermesAgent,
    uninstall: uninstallHermesAgent,
    // Hermes loads a user plugin only when config.yaml lists it, so the artifact alone is inert —
    // and enabling a plugin the user had switched off is a change even when nothing was written.
    afterInstall: async (environment) => {
      const wasEnabled = isHermesAgentPluginEnabled(environment);
      await runNativeCommand([
        'hermes',
        'plugins',
        'enable',
        HERMES_AGENT_PLUGIN_NAME,
        '--no-allow-tool-override',
      ]);
      return !wasEnabled;
    },
    // Left enabled, the config entry would auto-load any future plugin of the same name. Hermes
    // only resolves a plugin that is still on disk, so this runs before the files are removed —
    // and its failure is reported rather than thrown, so it can never keep them.
    beforeUninstall: async (environment) => {
      // `plugins disable` edits the user's config, so an uninstall that is going to refuse the
      // files must refuse before it runs, not after.
      readOwnedHermesAgentFiles(environment);
      try {
        await runNativeCommand(['hermes', 'plugins', 'disable', HERMES_AGENT_PLUGIN_NAME]);
      } catch (error) {
        console.warn(
          `${error instanceof Error ? error.message : String(error)}\nRemoving the plugin files anyway; ${HERMES_AGENT_PLUGIN_NAME} may still be listed in the Hermes config.`,
        );
      }
    },
    restartNote: 'Restart Hermes to apply the change.',
  },
};

async function runManagedArtifactInstallTarget(
  action: InstallAction,
  target: ManagedArtifactTarget,
  environment: Environment,
  updating = false,
): Promise<string> {
  const definition = MANAGED_ARTIFACT_INSTALLS[target];
  if (action === 'uninstall') await definition.beforeUninstall?.(environment);
  const result =
    action === 'install'
      ? await definition.install(environment)
      : await definition.uninstall(environment);
  const changedHostState = action === 'install' && (await definition.afterInstall?.(environment));
  const name = getIntegrationDisplayName(target);
  const noChange =
    !changedHostState &&
    ((action === 'install' && result.alreadyInstalled) ||
      (action === 'uninstall' && !result.alreadyInstalled));
  const pastTense = action !== 'install' ? 'Uninstalled' : updating ? 'Updated' : 'Installed';
  const message = noChange
    ? action === 'install'
      ? `${name} plugin ${updating ? 'up to date' : 'already installed'} at ${result.path}`
      : `${name} plugin not installed at ${result.path}`
    : `${pastTense} ${name} plugin ${action === 'install' ? 'at' : 'from'} ${result.path}`;

  return [message, noChange ? undefined : definition.restartNote].filter(Boolean).join('\n');
}

const INSTALL_OPERATIONS = {
  amp: {
    install: (environment: Environment, updating?: boolean) =>
      runManagedArtifactInstallTarget('install', 'amp', environment, updating),
    uninstall: (environment: Environment) =>
      runManagedArtifactInstallTarget('uninstall', 'amp', environment),
  },
  'antigravity-cli': {
    install: (environment: Environment, updating?: boolean) =>
      runConfigInstallTarget('install', 'antigravity-cli', environment, updating),
    uninstall: (environment: Environment) =>
      runConfigInstallTarget('uninstall', 'antigravity-cli', environment),
  },
  'claude-code': {
    install: (environment: Environment, updating?: boolean) =>
      installNativeTarget('claude-code', environment, updating),
    uninstall: () => uninstallNativeTarget('claude-code'),
  },
  codex: {
    install: (
      environment: Environment,
      updating?: boolean,
      codexPluginListOutput?: string | null,
    ) => installNativeTarget('codex', environment, updating, codexPluginListOutput),
    uninstall: () => uninstallNativeTarget('codex'),
  },
  'copilot-cli': {
    install: async (environment: Environment, updating?: boolean) =>
      [
        await installNativeTarget('copilot-cli', environment, updating),
        enableCopilotPlugin(environment),
      ]
        .filter(Boolean)
        .join('\n'),
    uninstall: () => uninstallNativeTarget('copilot-cli'),
  },
  cursor: {
    install: (environment: Environment, updating?: boolean) =>
      runConfigInstallTarget('install', 'cursor', environment, updating),
    uninstall: (environment: Environment) =>
      runConfigInstallTarget('uninstall', 'cursor', environment),
  },
  'gemini-cli': {
    install: (environment: Environment, updating?: boolean) =>
      installNativeTarget('gemini-cli', environment, updating),
    uninstall: () => uninstallNativeTarget('gemini-cli'),
  },
  'grok-build': {
    install: (environment: Environment, updating?: boolean) =>
      runConfigInstallTarget('install', 'grok-build', environment, updating),
    uninstall: (environment: Environment) =>
      runConfigInstallTarget('uninstall', 'grok-build', environment),
  },
  'hermes-agent': {
    install: (environment: Environment, updating?: boolean) => {
      // The managed plugin shells out to `npx cc-safety-net`, so a stale npx cache would
      // keep running the previous version. Updating clears it once up front instead, so its
      // parallel targets cannot race.
      if (!updating) clearNpxSafetyNetCache(environment);
      return runManagedArtifactInstallTarget('install', 'hermes-agent', environment, updating);
    },
    uninstall: (environment: Environment) =>
      runManagedArtifactInstallTarget('uninstall', 'hermes-agent', environment),
  },
  'kimi-code': {
    install: (environment: Environment, updating?: boolean) =>
      runConfigInstallTarget('install', 'kimi-code', environment, updating),
    uninstall: (environment: Environment) =>
      runConfigInstallTarget('uninstall', 'kimi-code', environment),
  },
  openclaw: {
    install: async (environment: Environment, updating?: boolean) => {
      const message = await installNativeTarget('openclaw', environment, updating);
      await verifyOpenClawPluginRuntime();
      return message;
    },
    uninstall: (environment: Environment) => {
      // `plugins uninstall --force` deletes the extension directory outright.
      assertOpenClawPluginDirIsOurs(environment);
      return uninstallNativeTarget('openclaw');
    },
  },
  opencode: {
    install: async (environment: Environment, updating?: boolean) => {
      const message = await installNativeTarget('opencode', environment, updating);
      await verifyOpenCodePluginRuntime(environment);
      return message;
    },
    uninstall: (environment: Environment) => uninstallOpenCodeTarget(environment),
  },
  pi: {
    install: async (environment: Environment, updating?: boolean) =>
      [
        await installNativeTarget('pi', environment, updating),
        removePiExtensionsFilter(environment),
      ]
        .filter(Boolean)
        .join('\n'),
    uninstall: () => uninstallNativeTarget('pi'),
  },
} satisfies Record<
  InstallTarget,
  Record<
    InstallAction,
    (
      environment: Environment,
      updating?: boolean,
      codexPluginListOutput?: string | null,
    ) => string | Promise<string>
  >
>;

const KIMI_PLUGIN_INSTRUCTIONS = [
  'Install CC Safety Net as a native Kimi Code plugin:',
  '',
  '  1. Start Kimi Code and run: /plugins install https://github.com/kenryu42/cc-safety-net',
  '     Confirm the trust prompt; it defaults to cancel.',
  '  2. Run /reload, or start a new session.',
  '',
  'Note: Kimi Code hooks are fail-open. When the hook process cannot start, crashes, or times',
  'out, Kimi Code allows the tool call.',
].join('\n');

function formatKimiPluginInstructions(environment: Environment): string {
  if (detectKimiCodeHook({ environment, cwd: process.cwd() }).status !== 'configured') {
    return KIMI_PLUGIN_INSTRUCTIONS;
  }
  // Uninstall comes after the plugin works, never before: a gap with neither hook active is
  // unsafe, while a brief overlap only duplicates the denial message.
  return [
    KIMI_PLUGIN_INSTRUCTIONS,
    '',
    colors.red(
      [
        'CAUTION: the global Kimi Code hook is installed and will run alongside the plugin.',
        'After the plugin is active, remove it with: cc-safety-net uninstall --kimi-code',
      ].join('\n'),
    ),
  ].join('\n');
}

// A configured Kimi Code row stays selectable on install: unlike every other target, selecting
// it opens the method prompt, which is the only path to the native-plugin instructions.
function allowKimiMethodChoice(
  action: InstallAction,
  choices: readonly InstallTargetChoice[],
): InstallTargetChoice[] {
  return choices.map((choice) =>
    action === 'install' &&
    choice.target === 'kimi-code' &&
    choice.unavailableReason === 'already installed'
      ? {
          ...choice,
          available: true,
          unavailableReason: undefined,
          label: `${choice.label} (global hook installed)`,
        }
      : choice,
  );
}

function resolveKimiInstallMethod(
  options: RunInstallCommandOptions,
  environment: Environment,
): Promise<KimiInstallMethod | null> {
  if (options.selectKimiInstallMethod) return options.selectKimiInstallMethod();
  // A non-interactive session cannot answer a prompt, so the flag keeps installing the
  // global hook there instead of hanging a script or CI pipeline.
  if (!canPromptInstallTargets(options.input, options.output)) {
    return Promise.resolve('global-hook');
  }
  return promptKimiInstallMethod({
    input: options.input,
    output: options.output,
    globalHookInstalled:
      detectKimiCodeHook({ environment, cwd: process.cwd() }).status === 'configured',
  });
}

/** Runs one target's action and returns its report, printed by the caller once any spinner stops. */
async function runSingleInstallTarget(
  action: InstallAction,
  target: InstallTarget,
  environment: Environment,
  updating = false,
  codexPluginListOutput?: string | null,
): Promise<string> {
  return INSTALL_OPERATIONS[target][action](environment, updating, codexPluginListOutput);
}

function parseUpdateArgs(args: readonly string[]): void {
  const error = parseCommandArgs({ label: 'update' }, args).errors[0];
  if (error) throw new Error(error);
}

async function detectUpdateTargets(environment: Environment, fetchVersion = defaultVersionFetcher) {
  const state = await detectInstallHookState(environment, fetchVersion);
  const copilotPluginsDir = join(_getCopilotConfigHome(environment), 'installed-plugins');
  const targets = orderInstallTargets([
    // `detected` (not `configured`) so installed-but-disabled integrations update too.
    // Copilot is decided by its plugin checkouts on disk instead: its 'disabled' status
    // also fires on a bare disableAllHooks kill-switch with nothing installed, and
    // update must never install something new.
    ...state.hooks
      .filter((hook) => hook.platform !== 'copilot-cli' && hook.detected)
      .map((hook) => hook.platform as InstallTarget),
    ...(
      [COPILOT_PLUGIN_DIR, COPILOT_PRE_RENAME_PLUGIN_DIR, COPILOT_LEGACY_PLUGIN_DIR] as const
    ).flatMap((dir) =>
      existsSync(join(copilotPluginsDir, ...dir)) ? (['copilot-cli'] as const) : [],
    ),
    ...(hasClaudeInstalledPlugin(environment, CLAUDE_LEGACY_PLUGIN_ID)
      ? (['claude-code'] as const)
      : []),
    ...(hasCodexLegacyPlugin(state.codexPluginListOutput) ? (['codex'] as const) : []),
  ]);
  return { targets, codexPluginListOutput: state.codexPluginListOutput };
}

async function updateInstalledIntegrations(options: UpdateCommandOptions): Promise<number> {
  const environment = createProcessEnvironment();
  const output = options.output ?? process.stdout;
  // Best-effort nudge for persistent installs (`npm i -g`). An npx or bunx cache path means an
  // ephemeral run the cache clears below already refresh, so the registry round-trip is skipped
  // entirely; otherwise it starts ahead of detection so it overlaps the update work — and the
  // zero-target early return — instead of delaying either.
  const scriptSegments = (options.scriptPath ?? process.argv[1] ?? '').split(/[\\/]/);
  // The numeric-id form is bun's real cache naming; a persistent install path may hold other
  // bunx-* directories (say /opt/bunx-tools) and must still get the nudge.
  const runningBunxEntry = scriptSegments.find((segment) => /^bunx-\d+-/.test(segment));
  const latestCheck =
    runningBunxEntry !== undefined || scriptSegments.includes('_npx')
      ? null
      : (options.checkLatestVersion ?? checkForUpdates)();
  // checkForUpdates resolves with an error field instead of rejecting, and reports no update for
  // a dev build, so a failed or offline check simply prints nothing and never changes the exit code.
  const printUpdateNudge = async () => {
    const updateInfo = latestCheck && (await latestCheck);
    if (updateInfo?.updateAvailable)
      output.write(
        `\nUpdate available: cc-safety-net ${updateInfo.currentVersion} → ${updateInfo.latestVersion}. Update this CLI with your package manager, e.g. \`npm i -g cc-safety-net@latest\` for a global install.\n`,
      );
  };
  // Detection queries every host CLI, so it starts before the banner animation and the
  // spinner covers whatever latency is left once the animation ends.
  const prepared = detectUpdateTargets(
    environment,
    options.fetchVersion ?? defaultVersionFetcher,
  ).then(async (detection) => {
    const targetSet = new Set(detection.targets);
    return {
      targets: detection.targets,
      codexPluginListOutput: detection.codexPluginListOutput,
      available: new Map(
        await Promise.all(
          INSTALL_TARGETS.filter(
            (target) => targetSet.has(target.target) && NATIVE_UPDATE_TARGETS.has(target.target),
          ).map(
            async (target) =>
              [target.target, await probeInstallTarget(target.probeCommand)] as const,
          ),
        ),
      ),
    };
  });
  const detected = await resolveAfterOptionalBanner(
    options.showBanner ?? true,
    () => ({ ready: prepared, finish: () => prepared }),
    () => printInstallBanner({ input: options.input ?? process.stdin, output }),
    { loadingMessage: 'Checking installed integrations…', output },
  );

  // bunx keeps per-package install dirs under the OS temp dir; clearing ours makes the next
  // `bunx cc-safety-net` run resolve the fresh release, matching the npx clear below. It runs
  // unconditionally — before the zero-target return too — because the bunx channel is
  // user-invoked, not tied to any target.
  const bunxCacheFailure = await Promise.resolve()
    .then(() => {
      clearBunxSafetyNetCache(environment.tmpdir, process.platform, runningBunxEntry);
      return null;
    })
    .catch((error: unknown) => formatInstallError(error));

  if (detected.targets.length === 0) {
    output.write('No installed integrations found. Run `cc-safety-net install` to set one up.\n');
    if (bunxCacheFailure !== null) console.error(bunxCacheFailure);
    await printUpdateNudge();
    return bunxCacheFailure === null ? 0 : 1;
  }

  // Clearing the cache scans and removes entries under one directory, so the parallel targets
  // below would race each other's removals; updating clears it once here instead. A clear
  // failure fails only the cache-dependent targets, leaving the rest to update.
  const npxCacheFailure = detected.targets.some((target) => NPX_CACHE_TARGETS.has(target))
    ? await Promise.resolve()
        .then(() => {
          clearNpxSafetyNetCache(environment);
          return null;
        })
        .catch((error: unknown) => formatInstallError(error))
    : null;

  // The targets drive different host CLIs and are independent, so they run together and one
  // failure cannot keep the rest from updating. Every promise settles into a report, so
  // Promise.all never rejects; the spinner owns the terminal line, so nothing prints until
  // all of them are done.
  const reports = await awaitWithSpinner(
    Promise.all(
      detected.targets.map((target) => {
        if (NATIVE_UPDATE_TARGETS.has(target) && !detected.available.get(target))
          return Promise.resolve({
            message: `${getIntegrationDisplayName(target)} not found; skipped`,
            failed: false,
          });
        if (npxCacheFailure !== null && NPX_CACHE_TARGETS.has(target))
          return Promise.resolve({ message: npxCacheFailure, failed: true });
        return runSingleInstallTarget(
          'install',
          target,
          environment,
          true,
          detected.codexPluginListOutput,
        ).then(
          (message) => ({ message, failed: false }),
          (error: unknown) => ({ message: formatInstallError(error), failed: true }),
        );
      }),
    ),
    {
      loadingMessage: `Updating ${detected.targets.length} integration${detected.targets.length === 1 ? '' : 's'}…`,
      output,
    },
  );
  const allReports =
    bunxCacheFailure === null ? reports : [...reports, { message: bunxCacheFailure, failed: true }];
  allReports.forEach((report) => {
    report.failed ? console.error(report.message) : output.write(`${report.message}\n`);
  });
  await printUpdateNudge();
  return allReports.some((report) => report.failed) ? 1 : 0;
}

export function runUpdateCommand(
  args: readonly string[],
  options: UpdateCommandOptions = {},
): Promise<number> {
  return Promise.resolve()
    .then(() => parseUpdateArgs(args))
    .then(() => updateInstalledIntegrations(options))
    .catch((error: unknown) => {
      console.error(formatInstallError(error));
      return 1;
    });
}

export async function runInstallCommand(
  action: InstallAction,
  args: readonly string[],
  options: RunInstallCommandOptions = {},
): Promise<number> {
  try {
    const environment = createProcessEnvironment();
    const targets = await resolveAfterOptionalBanner(
      true,
      () => startResolveInstallTargets(environment, action, args, options),
      () =>
        printInstallBanner({
          input: options.input ?? process.stdin,
          output: options.output ?? process.stdout,
        }),
      {
        loadingMessage:
          action === 'install'
            ? 'Checking available integrations…'
            : 'Checking installed integrations…',
        output: options.output ?? process.stdout,
      },
    );
    // Quitting the selector is a decision, not a failure, so the exit code stays 0 — but say
    // that nothing was written, or silence reads as a completed install. Ctrl-C is different:
    // the selector raises SIGINT and the process never reaches here.
    if (!targets) {
      (options.output ?? process.stdout).write(`Cancelled: nothing was ${action}ed.\n`);
      return 0;
    }
    if (targets === 'update') {
      // The banner already played for the selector, so the update must not print a second one.
      return (
        options.runUpdate ??
        (() =>
          runUpdateCommand([], {
            fetchVersion: options.fetchVersion,
            input: options.input,
            output: options.output,
            showBanner: false,
          }))
      )();
    }

    const output = options.output ?? process.stdout;
    // Host CLIs can install slowly (network fetches, marketplace refreshes), so each target
    // runs behind the same spinner the interactive selector uses, then prints its report.
    await runInstallTargetsInOrder(targets, async (target) => {
      if (target === 'kimi-code' && action === 'install') {
        const method = await resolveKimiInstallMethod(options, environment);
        if (method === null) {
          output.write('Cancelled: Kimi Code integration was not installed.\n');
          return;
        }
        if (method === 'plugin') {
          output.write(`${formatKimiPluginInstructions(environment)}\n`);
          return;
        }
      }
      const message = await awaitWithSpinner(runSingleInstallTarget(action, target, environment), {
        loadingMessage: `${action === 'install' ? 'Installing' : 'Uninstalling'} ${getIntegrationDisplayName(target)} integration…`,
        output,
      });
      output.write(`${message}\n`);
    });

    return 0;
  } catch (e) {
    console.error(formatInstallError(e));
    return 1;
  }
}

function formatInstallError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  const code = typeof error === 'object' && error !== null && 'code' in error ? error.code : null;

  if (code === 'EACCES' || code === 'EPERM') {
    return `${message}\nCheck file permissions for the target config file and parent directory.`;
  }
  if (code === 'ENOENT') {
    return `${message}\nCheck that the target config path and parent directory exist.`;
  }
  if (code === 'ENOTDIR') {
    return `${message}\nCheck that every parent path component is a directory.`;
  }
  return message;
}
