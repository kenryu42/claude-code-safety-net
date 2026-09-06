import type { Environment } from '@/core/environment';
import type { ToolRoute } from '@/gate/invocation';
import { getStandardHookContext, runConfiguredHookAdapter } from '@/hosts/hook/common';
import { PRE_TOOL_USE_HOOK_EVENT } from '@/hosts/hook/constants';

export type PreToolUseHookInput = {
  session_id?: string;
  transcript_path?: string | null;
  cwd?: string;
  permission_mode?: string;
  hook_event_name: string;
  tool_name: string;
  tool_input?: {
    command?: string;
    description?: string;
    [key: string]: unknown;
  };
  tool_use_id?: string;
};

export type PreToolUseHookOutput = {
  hookSpecificOutput: {
    hookEventName: typeof PRE_TOOL_USE_HOOK_EVENT;
    permissionDecision: 'allow' | 'deny';
    permissionDecisionReason?: string;
  };
};

export async function runPreToolUseHook(options: {
  agent: string;
  getAgent?: (input: PreToolUseHookInput, environment: Environment) => string;
  getToolRoute: (toolName: string) => ToolRoute;
}): Promise<void> {
  await runConfiguredHookAdapter<PreToolUseHookInput>({
    agent: options.agent,
    ...(options.getAgent ? { getAgent: options.getAgent } : {}),
    createDenyOutput: (message): PreToolUseHookOutput => ({
      hookSpecificOutput: {
        hookEventName: PRE_TOOL_USE_HOOK_EVENT,
        permissionDecision: 'deny',
        permissionDecisionReason: message,
      },
    }),
    isSupported: (input) => input.hook_event_name === PRE_TOOL_USE_HOOK_EVENT,
    getToolName: (input) => input.tool_name,
    getToolInput: (input, toolName) => ({
      ok: true,
      input: input.tool_input,
      route: options.getToolRoute(toolName),
    }),
    getContext: getStandardHookContext,
    getSessionId: (input) => input.session_id,
  });
}
