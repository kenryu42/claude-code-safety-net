import { resolve } from 'node:path';
import type { IntegrationDenial } from '@/core/denial';
import type { Environment } from '@/core/environment';
import {
  firstTrustedRoot,
  getToolRoute,
  outputFailedClosed,
  resolveStandardHookContext,
} from '@/gate/intake';
import type { CommandToolKind, ToolCallContext } from '@/gate/invocation';
import { runConfiguredHookAdapter } from '@/hosts/hook/common';
import { HERMES_AGENT_HOOK_EVENT } from '@/hosts/hook/constants';

/**
 * Hermes Agent `pre_tool_call` payload (`agent/shell_hooks.py` `_serialize_payload`).
 * `tool_input` is the tool's `args` object, or null when Hermes had no dict to send.
 */
interface HermesAgentHookInput {
  hook_event_name: string;
  tool_name?: unknown;
  tool_input?: unknown;
  session_id?: string;
  cwd?: string;
}

/** `terminal` is the only Hermes tool that carries a shell command. */
const HERMES_AGENT_COMMAND_TOOLS = new Map<string, CommandToolKind>([['terminal', 'posix']]);

export async function runHermesAgentHook(): Promise<void> {
  await runConfiguredHookAdapter<HermesAgentHookInput>({
    agent: 'hermes-agent',
    // Hermes reads `{"action":"block","message":...}` as the tool result the model sees, and
    // treats empty stdout as "no directive", so an allowed call prints nothing.
    createDenyOutput: (message) => ({ action: 'block', message }),
    isSupported: (input) => input.hook_event_name === HERMES_AGENT_HOOK_EVENT,
    getToolName: (input) => input.tool_name,
    getToolInput: (input, toolName) => ({
      ok: true,
      input: input.tool_input,
      route: getToolRoute(toolName, HERMES_AGENT_COMMAND_TOOLS),
    }),
    getContext: resolveHermesAgentContext,
    getSessionId: (input) => input.session_id,
  });
}

/**
 * `terminal` runs the command in its own `workdir` when the model supplies one, so relative paths
 * must be resolved there rather than in the session cwd. The session cwd stays the config cwd; an
 * unusable `workdir` fails closed because the analyzed directory would not be the executed one.
 */
function resolveHermesAgentContext(
  input: HermesAgentHookInput,
  toolInput: unknown,
  toolName: string,
  outputDeny: (denial: IntegrationDenial) => void,
  environment: Environment,
): ToolCallContext | null {
  const context = resolveStandardHookContext(
    input.cwd,
    toolInput,
    toolName,
    outputDeny,
    environment.paths,
    process.cwd(),
  );
  if (!context) return null;
  if (!toolInput || typeof toolInput !== 'object' || Array.isArray(toolInput)) return context;
  if (!Object.hasOwn(toolInput, 'workdir')) return context;

  const workdir = (toolInput as Record<string, unknown>).workdir;
  if (typeof workdir !== 'string' || workdir.trim() === '') {
    outputFailedClosed(outputDeny, toolInput, toolName);
    return null;
  }

  const executionCwd = firstTrustedRoot([resolve(context.configCwd, workdir)], environment.paths);
  if (!executionCwd) {
    outputFailedClosed(outputDeny, toolInput, toolName, workdir);
    return null;
  }
  return { ...context, executionCwd };
}
