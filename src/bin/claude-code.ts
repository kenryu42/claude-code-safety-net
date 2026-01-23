import { analyzeCommand, loadConfig } from '@/core/analyze';
import { redactSecrets, writeAuditLog } from '@/core/audit';
import { envTruthy } from '@/core/env';
import { formatBlockedMessage } from '@/core/format';
import type { HookInput, HookOutput } from '@/types';

function outputDeny(reason: string, command?: string, segment?: string): void {
  const message = formatBlockedMessage({
    reason,
    command,
    segment,
    redact: redactSecrets,
  });

  const output: HookOutput = {
    hookSpecificOutput: {
      hookEventName: 'PreToolUse',
      permissionDecision: 'deny',
      permissionDecisionReason: message,
    },
  };

  console.log(JSON.stringify(output));
}

export async function runClaudeCodeHook(): Promise<void> {
  const chunks: Buffer[] = [];

  for await (const chunk of process.stdin) {
    chunks.push(chunk as Buffer);
  }

  const inputText = Buffer.concat(chunks).toString('utf-8').trim();

  if (!inputText) {
    return;
  }

  let input: HookInput;
  try {
    input = JSON.parse(inputText) as HookInput;
  } catch {
    if (envTruthy('SAFETY_NET_STRICT')) {
      outputDeny('Failed to parse hook input JSON (strict mode)');
    }
    return;
  }

  if (input.tool_name !== 'Bash') {
    return;
  }

  const command = input.tool_input?.command;
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
    const sessionId = input.session_id;
    if (sessionId) {
      writeAuditLog(sessionId, command, result.segment, result.reason, cwd);
    }
    outputDeny(result.reason, command, result.segment);
  }
}
