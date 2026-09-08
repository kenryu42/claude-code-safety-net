import { resolve } from 'node:path';
import type { Plugin, PluginInput } from '@opencode-ai/plugin';
import {
  createFailedClosedDenial,
  formatDenial,
  type IntegrationDenial,
  projectGuardDenial,
} from '@/core/denial';
import { createProcessEnvironment } from '@/core/environment';
import { shouldRecordAllowedCommands } from '@/core/policy/env';
import * as toolRouting from '@/core/tool-input';
import { isUsableDirectory } from '@/gate/intake';
import * as invocationDomain from '@/gate/invocation';
import {
  type GuardDependencies,
  type GuardEvaluation,
  GuardEvaluationError,
} from '@/gate/pipeline';
import { writeIntegrationDenialAudit } from '@/hosts/audit';
import { loadBuiltinCommands } from '@/hosts/opencode/builtin-commands/commands';
import * as guardEngine from '@/hosts/runtime';

type CCSafetyNetPluginInput = PluginInput & {
  homeDir?: string;
};

const POWERSHELL_EXECUTABLES = new Set(['powershell', 'pwsh']);
const POSIX_EXECUTABLES = new Set(['bash', 'dash', 'ksh', 'sh', 'zsh']);

export function createCCSafetyNetPlugin(guardDependencies: Partial<GuardDependencies> = {}) {
  return (async ({ directory, homeDir }: CCSafetyNetPluginInput) => {
    const configCwd = resolve(directory);
    let currentConfig: Record<string, unknown> | undefined;

    return {
      config: async (opencodeConfig: Record<string, unknown>) => {
        currentConfig = opencodeConfig;
        const builtinCommands = loadBuiltinCommands();
        const existingCommands = (opencodeConfig.command as Record<string, unknown>) ?? {};

        opencodeConfig.command = {
          ...builtinCommands,
          ...existingCommands,
        };
      },

      'tool.execute.before': async (input, output) => {
        const environment =
          homeDir === undefined
            ? createProcessEnvironment()
            : { ...createProcessEnvironment(), home: homeDir };
        const throwPreflightDenial = (
          denial: IntegrationDenial,
          toolName?: string,
          cwd: string | null = configCwd,
        ): never => {
          writeIntegrationDenialAudit(environment, denial, () => input.sessionID, {
            agent: 'opencode',
            toolName,
            cwd,
          });
          throwBlocked(denial);
        };
        if (typeof input.tool !== 'string' || input.tool.trim() === '') {
          throwPreflightDenial(createFailedClosedDenial());
        }

        const toolInput = output.args;
        let command: string | undefined;
        try {
          command = toolRouting.getCommandFromToolInput(toolInput);
        } catch (error) {
          if (!(error instanceof toolRouting.ToolInputLimitError)) throw error;
          throwPreflightDenial(createFailedClosedDenial({ toolName: input.tool }), input.tool);
        }
        const shellRoute = resolveOpenCodeShellRoute(currentConfig?.shell);
        const route = getOpenCodeToolRoute(input.tool, shellRoute);
        const executionCwd = resolveOpenCodeExecutionCwd(configCwd, toolInput);
        if (!isUsableDirectory(configCwd) || !executionCwd) {
          return throwPreflightDenial(
            createFailedClosedDenial({ command, toolName: input.tool }),
            input.tool,
          );
        }
        const context: invocationDomain.ToolCallContext = { configCwd, executionCwd };
        const invocation = invocationDomain.createToolInvocation(
          input.tool,
          toolInput,
          route,
          context,
          command ?? null,
        );
        try {
          const evaluation = guardEngine.evaluateRuntimeGuard(environment, invocation, {
            guard: {
              auditAllowed: shouldRecordAllowedCommands(environment.env),
              dependencies: guardDependencies,
            },
            audit: {
              agent: 'opencode',
              getSessionId: () => input.sessionID,
            },
          });
          throwGuardDenial(evaluation, true);
        } catch (error) {
          if (!(error instanceof GuardEvaluationError)) throw error;
          if (
            error.stage === 'policy-protection' ||
            error.stage === 'config-load' ||
            error.stage === 'secret-protection'
          ) {
            throw error.cause;
          }
          throwGuardDenial(error.evaluation, true);
          return;
        }
      },
    };
  }) satisfies Plugin;
}

/** @internal */
export function resolveOpenCodeShellRoute(
  configuredShell: unknown,
  platform = process.platform,
  environmentShell = process.env.SHELL,
): invocationDomain.CommandToolKind {
  if (typeof configuredShell !== 'string' && platform === 'win32') return 'powershell';
  const candidate = typeof configuredShell === 'string' ? configuredShell : environmentShell;
  if (typeof candidate !== 'string') return 'auto';
  const executable = candidate
    .trim()
    .split(/[\\/]/)
    .at(-1)
    ?.toLowerCase()
    .replace(/\.exe$/, '');
  if (!executable) return 'auto';
  if (POWERSHELL_EXECUTABLES.has(executable)) return 'powershell';
  if (POSIX_EXECUTABLES.has(executable)) return 'posix';
  return 'auto';
}

function getOpenCodeToolRoute(
  toolName: string,
  shell: invocationDomain.CommandToolKind,
): invocationDomain.ToolRoute {
  if (toolName === 'bash') return { kind: 'command', shell };
  return { kind: toolRouting.getNonCommandToolInputKind(toolName) };
}

function resolveOpenCodeExecutionCwd(configCwd: string, toolInput: unknown): string | null {
  if (!toolInput || typeof toolInput !== 'object' || Array.isArray(toolInput)) return configCwd;
  if (!Object.hasOwn(toolInput, 'workdir')) return configCwd;

  const workdir = (toolInput as Record<string, unknown>).workdir;
  if (typeof workdir !== 'string' || workdir.trim() === '') return null;
  const resolvedWorkdir =
    process.platform === 'win32' ? normalizeOpenCodeWindowsWorkdir(workdir) : workdir;

  const executionCwd = resolve(configCwd, resolvedWorkdir);
  return isUsableDirectory(executionCwd) ? executionCwd : null;
}

/** @internal */
export function normalizeOpenCodeWindowsWorkdir(workdir: string): string {
  const normalized = workdir
    .replace(/^\/([a-zA-Z]):(?:[\\/]|$)/, (_, drive: string) => `${drive.toUpperCase()}:/`)
    .replace(/^\/([a-zA-Z])(?:[\\/]|$)/, (_, drive: string) => `${drive.toUpperCase()}:/`)
    .replace(/^\/cygdrive\/([a-zA-Z])(?:[\\/]|$)/, (_, drive: string) => `${drive.toUpperCase()}:/`)
    .replace(/^\/mnt\/([a-zA-Z])(?:[\\/]|$)/, (_, drive: string) => `${drive.toUpperCase()}:/`);
  // Slash-rooted paths OpenCode does not rewrite (`/tmp`) stay as they are: the host hands them to
  // `cygpath` for POSIX shells, else resolves them against the config root, and runs the command.
  return normalized;
}

function throwGuardDenial(evaluation: GuardEvaluation, includeEvidence: boolean): void {
  const denial = projectGuardDenial(evaluation, { includeEvidence });
  if (denial) throwBlocked(denial);
}

function throwBlocked(denial: IntegrationDenial): never {
  throw new Error(formatDenial(denial));
}
