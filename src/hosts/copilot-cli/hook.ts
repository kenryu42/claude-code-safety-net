import { getToolRoute, parseHookJson, resolveStandardHookContext } from '@/gate/intake';
import type { CommandToolKind } from '@/gate/invocation';
import { runConfiguredHookAdapter } from '@/hosts/hook/common';

/** GitHub Copilot CLI preToolUse hook input format */
interface CopilotCliHookInput {
  sessionId: string;
  timestamp: number;
  cwd: string;
  toolName: string;
  toolArgs: string;
}

/** GitHub Copilot CLI preToolUse hook output format */
interface CopilotCliHookOutput {
  permissionDecision: 'allow' | 'deny' | 'ask';
  permissionDecisionReason?: string;
}

const COPILOT_CLI_COMMAND_TOOLS = new Map<string, CommandToolKind>([
  ['bash', 'auto'],
  ['Bash', 'auto'],
  ['powershell', 'powershell'],
  ['PowerShell', 'powershell'],
]);

function getCopilotCliToolRoute(toolName: string) {
  return getToolRoute(toolName, COPILOT_CLI_COMMAND_TOOLS);
}

export async function runCopilotCliHook(): Promise<void> {
  await runConfiguredHookAdapter<CopilotCliHookInput>({
    agent: 'copilot-cli',
    createDenyOutput: (message): CopilotCliHookOutput => ({
      permissionDecision: 'deny',
      permissionDecisionReason: message,
    }),
    isSupported: () => true,
    getToolName: (input) => input.toolName,
    getToolInput: (input, toolName, outputDeny) => {
      if (typeof input.toolArgs !== 'string') {
        outputDeny({ reason: 'Failed to parse toolArgs JSON.' });
        return { ok: false };
      }
      const toolInput = parseHookJson<unknown>(
        input.toolArgs,
        outputDeny,
        'Failed to parse toolArgs JSON.',
      );
      if (toolInput === undefined) return { ok: false };
      return { ok: true, input: toolInput, route: getCopilotCliToolRoute(toolName) };
    },
    getContext: (input, toolInput, toolName, outputDeny, environment) =>
      resolveStandardHookContext(
        input.cwd,
        toolInput,
        toolName,
        outputDeny,
        environment.paths,
        process.cwd(),
      ),
    getSessionId: (input) =>
      typeof input.sessionId === 'string' && input.sessionId.trim() ? input.sessionId : undefined,
  });
}
