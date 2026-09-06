import type { IntegrationDenial } from '@/core/denial';
import type { Environment } from '@/core/environment';
import {
  firstTrustedRoot,
  getToolRoute,
  outputFailedClosed,
  resolveContainedCwd,
} from '@/gate/intake';
import type { CommandToolKind, ToolCallContext } from '@/gate/invocation';
import { runConfiguredHookAdapter } from '@/hosts/hook/common';

/** Grok Build PreToolUse hook input format */
interface GrokBuildHookInput {
  hookEventName?: string;
  sessionId?: string;
  cwd?: string;
  workspaceRoot?: string;
  toolName?: string;
  toolUseId?: string;
  toolInput?: {
    command?: string;
    [key: string]: unknown;
  };
  toolInputTruncated?: boolean;
}

/** Grok Build PreToolUse hook output format: the classic decision form, the only one it reads. */
type GrokBuildHookOutput = { decision: 'allow' } | { decision: 'deny'; reason: string };

const GROK_BUILD_COMMAND_TOOLS = new Map<string, CommandToolKind>([
  ['run_terminal_command', 'auto'],
]);

function getGrokBuildToolRoute(toolName: string) {
  return getToolRoute(toolName, GROK_BUILD_COMMAND_TOOLS);
}

type GrokBuildDenyOutput = (denial: IntegrationDenial) => void;

export async function runGrokBuildHook(): Promise<void> {
  await runConfiguredHookAdapter<GrokBuildHookInput>({
    agent: 'grok-build',
    createDenyOutput: (message): GrokBuildHookOutput => ({ decision: 'deny', reason: message }),
    createAllowOutput: (): GrokBuildHookOutput => ({ decision: 'allow' }),
    isSupported: () => true,
    getToolName: (input) => input.toolName,
    getToolInput: (input, toolName, outputDeny) => {
      // Grok Build truncates tool input at 128 KB; the cut command cannot be analyzed.
      if (input.toolInputTruncated === true) {
        outputFailedClosed(outputDeny, input.toolInput, toolName);
        return { ok: false };
      }
      return {
        ok: true,
        input: input.toolInput,
        route: getGrokBuildToolRoute(toolName),
      };
    },
    getContext: resolveGrokBuildContext,
    getSessionId: (input) => input.sessionId,
  });
}

function resolveGrokBuildContext(
  input: GrokBuildHookInput,
  toolInput: unknown,
  toolName: string,
  outputDeny: GrokBuildDenyOutput,
  environment: Environment,
): ToolCallContext | null {
  const root = firstTrustedRoot(requestedGrokBuildRoots(input), environment.paths);
  if (!root) {
    outputFailedClosed(outputDeny, toolInput, toolName);
    return null;
  }

  const base = resolveContainedCwd(grokBuildBaseCwd(input.cwd), [root], environment.paths);
  if (!base) {
    outputFailedClosed(
      outputDeny,
      toolInput,
      toolName,
      typeof input.cwd === 'string' ? input.cwd : undefined,
    );
    return null;
  }

  return { configCwd: base, executionCwd: base };
}

function requestedGrokBuildRoots(input: GrokBuildHookInput): string[] {
  const root = input.workspaceRoot === undefined ? input.cwd : input.workspaceRoot;
  return typeof root === 'string' && root.trim() !== '' ? [root] : [];
}

function grokBuildBaseCwd(cwd: unknown): string {
  return typeof cwd === 'string' && cwd.trim() !== '' ? cwd : '.';
}
