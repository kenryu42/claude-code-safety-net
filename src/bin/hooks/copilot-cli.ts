import { analyzeCommand, loadConfig } from '@/core/analyze';
import { redactSecrets, writeAuditLog } from '@/core/audit';
import { envTruthy } from '@/core/env';
import { formatBlockedMessage } from '@/core/format';
import type { CopilotCliHookInput, CopilotCliHookOutput } from '@/types';

function outputCopilotDeny(reason: string, command?: string, segment?: string): void {
  const message = formatBlockedMessage({
    reason,
    command,
    segment,
    redact: redactSecrets,
  });

  const output: CopilotCliHookOutput = {
    permissionDecision: 'deny',
    permissionDecisionReason: message,
  };

  console.log(JSON.stringify(output));
}

export async function runCopilotCliHook(): Promise<void> {
  const chunks: Buffer[] = [];

  for await (const chunk of process.stdin) {
    chunks.push(chunk as Buffer);
  }

  const inputText = Buffer.concat(chunks).toString('utf-8').trim();

  if (!inputText) {
    return;
  }

  let input: CopilotCliHookInput;
  try {
    input = JSON.parse(inputText) as CopilotCliHookInput;
  } catch {
    if (envTruthy('SAFETY_NET_STRICT')) {
      outputCopilotDeny('Failed to parse hook input JSON (strict mode)');
    }
    return;
  }

  // Only handle bash tool calls
  if (input.toolName !== 'bash') {
    return;
  }

  // Parse toolArgs which is a JSON string containing {command: string}
  let toolArgs: { command?: string };
  try {
    toolArgs = JSON.parse(input.toolArgs) as { command?: string };
  } catch {
    if (envTruthy('SAFETY_NET_STRICT')) {
      outputCopilotDeny('Failed to parse toolArgs JSON (strict mode)');
    }
    return;
  }

  const command = toolArgs.command;
  if (!command) {
    return;
  }

  const cwd = input.cwd ?? process.cwd();
  const strict = envTruthy('SAFETY_NET_STRICT');
  const paranoidAll = envTruthy('SAFETY_NET_PARANOID');
  const paranoidRm = paranoidAll || envTruthy('SAFETY_NET_PARANOID_RM');
  const paranoidInterpreters = paranoidAll || envTruthy('SAFETY_NET_PARANOID_INTERPRETERS');

  const config = loadConfig(cwd);

  const result = analyzeCommand(command, {
    cwd,
    config,
    strict,
    paranoidRm,
    paranoidInterpreters,
  });

  if (result) {
    // Generate a session ID from timestamp for audit logging
    const sessionId = `copilot-${input.timestamp ?? Date.now()}`;
    writeAuditLog(sessionId, command, result.segment, result.reason, cwd);
    outputCopilotDeny(result.reason, command, result.segment);
  }
}
