import { isAbsolute, join, relative } from 'node:path';
import { AnalysisLimit, createBudget } from '@/core/budget';
import { createFailedClosedDenial, type IntegrationDenial } from '@/core/denial';
import type { Environment, PathResolver } from '@/core/environment';
import { resolveExistingPath } from '@/core/paths/canonicalization';
import {
  extractPatchTargetsFromToolInput,
  extractPathLikeToolValues,
  ToolInputLimitError,
} from '@/core/tool-input';
import { firstTrustedRoot, getToolRoute, resolveContainedCwd } from '@/gate/intake';
import type { CommandToolKind, ToolCallContext } from '@/gate/invocation';
import { runConfiguredHookAdapter } from '@/hosts/hook/common';

/** Config file holding the Antigravity CLI PreToolUse hook registrations. */
export function getAntigravityHooksPath(homeDir: string): string {
  return join(homeDir, '.gemini', 'config', 'hooks.json');
}

/** Antigravity CLI PreToolUse hook input format */
interface AntigravityCliHookInput {
  toolCall?: {
    name?: string;
    args?: Record<string, unknown>;
  };
  stepIdx?: number;
  conversationId?: string;
  workspacePaths?: string[];
  transcriptPath?: string;
  artifactDirectoryPath?: string;
}

/** Antigravity CLI PreToolUse hook output format */
interface AntigravityCliHookOutput {
  decision: 'deny';
  reason: string;
}

const ANTIGRAVITY_CLI_COMMAND_TOOLS = new Map<string, CommandToolKind>([['run_command', 'auto']]);
const ANTIGRAVITY_PATH_KEYS = new Set([
  'absolutepath',
  'directorypath',
  'file_path',
  'filepath',
  'path',
  'searchdirectory',
  'searchpath',
  'target_file',
  'targetfile',
]);

function getAntigravityCliToolRoute(toolName: string) {
  return getToolRoute(toolName, ANTIGRAVITY_CLI_COMMAND_TOOLS);
}

type AntigravityDenyOutput = (denial: IntegrationDenial) => void;

export async function runAntigravityCliHook(): Promise<void> {
  await runConfiguredHookAdapter<AntigravityCliHookInput>({
    agent: 'antigravity-cli',
    createDenyOutput: (message): AntigravityCliHookOutput => ({
      decision: 'deny',
      reason: message,
    }),
    isSupported: () => true,
    getToolName: (input) => input.toolCall?.name,
    getToolInput: (input, toolName) => ({
      ok: true,
      input: normalizeAntigravityToolArgs(input.toolCall?.args, toolName),
      route: getAntigravityCliToolRoute(toolName),
    }),
    getContext: resolveAntigravityContext,
    getSessionId: (input) => input.conversationId,
  });
}

function resolveAntigravityContext(
  input: AntigravityCliHookInput,
  toolInput: unknown,
  toolName: string,
  outputDeny: AntigravityDenyOutput,
  environment: Environment,
): ToolCallContext | null {
  const trustedRoots = usableWorkspacePaths(input, environment.paths);
  const configRoots = trustedRoots.flatMap((root) => {
    const canonicalRoot = firstTrustedRoot([root], environment.paths);
    return canonicalRoot ? [canonicalRoot] : [];
  });
  if (!configRoots[0]) {
    outputAntigravityCwdDeny(outputDeny, toolInput, toolName);
    return null;
  }
  if (toolName !== 'run_command') {
    let targetRoot: string | null;
    try {
      targetRoot = resolveAntigravityTargetRoot(
        toolInput,
        toolName,
        configRoots,
        environment.paths,
      );
    } catch (error) {
      if (error instanceof ToolInputLimitError) {
        outputAntigravityCwdDeny(outputDeny, undefined, toolName);
        return null;
      }
      if (!(error instanceof AnalysisLimit)) throw error;
      outputAntigravityCwdDeny(outputDeny, toolInput, toolName);
      return null;
    }
    if (!targetRoot) {
      outputAntigravityCwdDeny(outputDeny, toolInput, toolName);
      return null;
    }
    return { configCwd: targetRoot, executionCwd: targetRoot };
  }

  const args = input.toolCall?.args;
  if (!args || !Object.hasOwn(args, 'Cwd')) {
    return { configCwd: configRoots[0], executionCwd: configRoots[0] };
  }
  const cwd = args.Cwd;
  if (typeof cwd !== 'string' || cwd.trim() === '') {
    outputAntigravityCwdDeny(outputDeny, toolInput, toolName);
    return null;
  }

  const containedCwd = resolveContainedCwd(cwd, configRoots, environment.paths);
  if (containedCwd) {
    const configCwd = mostSpecificContainingRoot(containedCwd, configRoots);
    if (!configCwd) {
      outputAntigravityCwdDeny(outputDeny, toolInput, toolName, cwd);
      return null;
    }
    return { configCwd, executionCwd: containedCwd };
  }

  outputAntigravityCwdDeny(outputDeny, toolInput, toolName, cwd);
  return null;
}

function resolveAntigravityTargetRoot(
  toolInput: unknown,
  toolName: string,
  configRoots: readonly string[],
  paths: PathResolver,
): string | null {
  const route = getAntigravityCliToolRoute(toolName);
  const targets = [
    ...extractPathLikeToolValues(toolInput, ANTIGRAVITY_PATH_KEYS),
    ...(route.kind === 'patch' ? extractPatchTargetsFromToolInput(toolInput) : []),
  ].filter(isAbsolute);
  const budget = createBudget();
  const targetRoots = new Set(
    targets.flatMap((target) => {
      const root = mostSpecificContainingRoot(
        resolveExistingPath(target, paths, budget),
        configRoots,
      );
      return root ? [root] : [];
    }),
  );
  if (targetRoots.size > 1) return null;
  return [...targetRoots][0] ?? configRoots[0] ?? null;
}

function mostSpecificContainingRoot(path: string, roots: readonly string[]): string | null {
  return (
    roots
      .filter((root) => isSameOrInside(path, root))
      .reduce((best, root) => (root.length > best.length ? root : best), '') || null
  );
}

function isSameOrInside(path: string, root: string): boolean {
  const rel = relative(root, path);
  return rel === '' || (!rel.startsWith('..') && !isAbsolute(rel));
}

function outputAntigravityCwdDeny(
  outputDeny: AntigravityDenyOutput,
  toolInput: unknown,
  toolName: string,
  cwd?: string,
): void {
  const command =
    toolInput && typeof toolInput === 'object'
      ? (toolInput as Record<string, unknown>).command
      : undefined;
  outputDeny(
    createFailedClosedDenial({
      command: typeof command === 'string' ? command : undefined,
      segment: cwd,
      toolName,
    }),
  );
}

function usableWorkspacePaths(input: AntigravityCliHookInput, paths: PathResolver): string[] {
  if (input.workspacePaths === undefined) return [process.cwd()];
  const workspacePaths = Array.isArray(input.workspacePaths)
    ? input.workspacePaths.filter((path) => typeof path === 'string' && path.trim() !== '')
    : [];
  return firstTrustedRoot(workspacePaths, paths) ? workspacePaths : [];
}

function normalizeAntigravityToolArgs(
  args: Record<string, unknown> | undefined,
  toolName: string,
): unknown {
  if (!args) return undefined;
  if (toolName !== 'run_command') return args;
  return {
    ...args,
    command:
      typeof args.CommandLine === 'string' && args.CommandLine !== ''
        ? args.CommandLine
        : undefined,
  };
}
