import { getToolRoute } from '@/gate/intake';
import type { CommandToolKind } from '@/gate/invocation';
import { detectClaudeShapeAgent } from '@/hosts/hook/agent-detection';
import { type PreToolUseHookOutput, runPreToolUseHook } from '@/hosts/hook/pre-tool-use';

export type HookOutput = PreToolUseHookOutput;

const CLAUDE_CODE_COMMAND_TOOLS = new Map<string, CommandToolKind>([
  ['Bash', 'posix'],
  ['PowerShell', 'powershell'],
]);

function getClaudeCodeToolRoute(toolName: string) {
  return getToolRoute(toolName, CLAUDE_CODE_COMMAND_TOOLS);
}

export async function runClaudeCodeHook(): Promise<void> {
  await runPreToolUseHook({
    agent: 'claude-code',
    getAgent: (input, environment) => detectClaudeShapeAgent(input.transcript_path, environment),
    getToolRoute: getClaudeCodeToolRoute,
  });
}
