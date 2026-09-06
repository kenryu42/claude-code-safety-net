import { isAbsolute, resolve } from 'node:path';
import { REASON_SAFETY_NET_FAILED_CLOSED } from '@/core/budget';
import type { Decision } from '@/core/decision';
import { createProcessEnvironment } from '@/core/environment';
import { isUsableDirectory } from '@/gate/intake';
import { createToolInvocation } from '@/gate/invocation';
import { evaluateGuard, GuardEvaluationError } from '@/gate/pipeline';

export type CheckCommandInput = Readonly<{
  command: string;
  cwd: string;
}>;

export type CheckCommandResult =
  | Readonly<{ kind: 'allow' }>
  | Readonly<{ kind: 'deny'; reason: string; ruleId?: string }>;

/**
 * Checks one shell command against the current CC Safety Net policy without
 * executing it, writing audit data, or touching the network. Reads local
 * policy and filesystem facts on every call. If this function throws, the
 * caller must not execute the command.
 */
export function checkCommand(input: CheckCommandInput): CheckCommandResult {
  // Plain JavaScript callers and untyped boundaries can pass anything, so the
  // boundary re-checks what TypeScript already promises.
  if (typeof input !== 'object' || input === null) {
    throw new TypeError('checkCommand requires an input object with command and cwd');
  }
  if (typeof input.command !== 'string' || input.command.trim() === '') {
    throw new TypeError('command must be a non-empty string');
  }
  if (typeof input.cwd !== 'string' || input.cwd.trim() === '' || !isAbsolute(input.cwd)) {
    throw new TypeError('cwd must be an absolute directory path');
  }
  // Same normalization and usability check as the OpenCode integration, and
  // deliberately no realpath step, so both surfaces decide alike for one
  // directory. An unusable cwd fails closed instead of checking the wrong
  // project.
  const cwd = resolve(input.cwd);
  if (!isUsableDirectory(cwd)) {
    return { kind: 'deny', reason: REASON_SAFETY_NET_FAILED_CLOSED };
  }
  return projectDecision(
    evaluateCommandGuard(
      createToolInvocation(
        'library-api',
        { command: input.command },
        { kind: 'command', shell: 'auto' },
        { configCwd: cwd, executionCwd: cwd },
        input.command,
      ),
    ),
  );
}

// A known dependency failure carries a fail-closed evaluation; surfacing it as
// a deny keeps that failure class from becoming a fail-open caller mistake.
// Every other throw is a code defect and stays visible to the caller.
function evaluateCommandGuard(invocation: Parameters<typeof evaluateGuard>[0]): Decision {
  try {
    return evaluateGuard(invocation, { environment: createProcessEnvironment() }).decision;
  } catch (error) {
    if (!(error instanceof GuardEvaluationError)) throw error;
    return error.evaluation.decision;
  }
}

function projectDecision(decision: Decision): CheckCommandResult {
  if (decision.kind === 'allow') return { kind: 'allow' };
  return {
    kind: 'deny',
    reason: decision.reason,
    ...(decision.ruleId === undefined ? {} : { ruleId: decision.ruleId }),
  };
}
