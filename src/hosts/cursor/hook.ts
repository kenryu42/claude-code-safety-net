import type { IntegrationDenial } from '@/core/denial';
import type { Environment, PathResolver } from '@/core/environment';
import {
  firstTrustedRoot,
  getToolRoute,
  outputFailedClosed,
  resolveContainedCwd,
} from '@/gate/intake';
import type { CommandToolKind, ToolCallContext } from '@/gate/invocation';
import { runConfiguredHookAdapter } from '@/hosts/hook/common';

/** Cursor preToolUse hook input format */
interface CursorHookInput {
  conversation_id?: string;
  hook_event_name?: string;
  tool_name?: string;
  tool_input?: {
    command?: string;
    working_directory?: string;
    [key: string]: unknown;
  };
  cwd?: string;
  workspace_roots?: string[];
}

/** Cursor preToolUse hook output format */
type CursorHookOutput =
  | { permission: 'allow' }
  | { permission: 'deny'; user_message: string; agent_message: string };

const CURSOR_COMMAND_TOOLS = new Map<string, CommandToolKind>([['Shell', 'auto']]);

function getCursorToolRoute(toolName: string) {
  return getToolRoute(toolName, CURSOR_COMMAND_TOOLS);
}

type CursorDenyOutput = (denial: IntegrationDenial) => void;

export async function runCursorHook(): Promise<void> {
  await runConfiguredHookAdapter<CursorHookInput>({
    agent: 'cursor',
    createDenyOutput: (message): CursorHookOutput => ({
      permission: 'deny',
      user_message: message,
      agent_message: message,
    }),
    createAllowOutput: (): CursorHookOutput => ({ permission: 'allow' }),
    isSupported: () => true,
    getToolName: (input) => input.tool_name,
    getToolInput: (input, toolName) => ({
      ok: true,
      input: input.tool_input,
      route: getCursorToolRoute(toolName),
    }),
    getContext: resolveCursorContext,
    getSessionId: (input) => input.conversation_id,
  });
}

function resolveCursorContext(
  input: CursorHookInput,
  toolInput: unknown,
  toolName: string,
  outputDeny: CursorDenyOutput,
  environment: Environment,
): ToolCallContext | null {
  const roots = usableCursorRoots(input, environment.paths);
  if (!roots[0]) {
    outputFailedClosed(outputDeny, toolInput, toolName);
    return null;
  }

  const base = resolveContainedCwd(cursorBaseCwd(input.cwd), roots, environment.paths);
  if (!base) {
    outputFailedClosed(
      outputDeny,
      toolInput,
      toolName,
      typeof input.cwd === 'string' ? input.cwd : undefined,
    );
    return null;
  }

  if (toolInput === null || typeof toolInput !== 'object' || Array.isArray(toolInput)) {
    return { configCwd: base, executionCwd: base };
  }
  if (!Object.hasOwn(toolInput, 'working_directory')) {
    return { configCwd: base, executionCwd: base };
  }

  const workingDirectory = (toolInput as Record<string, unknown>).working_directory;
  if (typeof workingDirectory !== 'string' || workingDirectory.trim() === '') {
    outputFailedClosed(outputDeny, toolInput, toolName);
    return null;
  }
  const executionCwd = resolveContainedCwd(workingDirectory, roots, environment.paths);
  if (!executionCwd) {
    outputFailedClosed(outputDeny, toolInput, toolName, workingDirectory);
    return null;
  }
  return { configCwd: base, executionCwd };
}

function usableCursorRoots(input: CursorHookInput, paths: PathResolver): string[] {
  return requestedCursorRoots(input).flatMap((root) => {
    const canonicalRoot = firstTrustedRoot([root], paths);
    return canonicalRoot ? [canonicalRoot] : [];
  });
}

function requestedCursorRoots(input: CursorHookInput): string[] {
  if (input.workspace_roots === undefined) {
    return typeof input.cwd === 'string' && input.cwd.trim() !== '' ? [input.cwd] : [];
  }
  if (!Array.isArray(input.workspace_roots)) return [];
  return input.workspace_roots.filter((root) => typeof root === 'string' && root.trim() !== '');
}

function cursorBaseCwd(cwd: unknown): string {
  return typeof cwd === 'string' && cwd.trim() !== '' ? cwd : '.';
}
