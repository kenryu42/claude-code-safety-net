import { describe, expect, test } from 'bun:test';
import { REASON_DERIVED_COMMAND_WORK_LIMIT } from '@/core/budget';
import { getCCSafetyNetEnvModes } from '@/core/policy/env';
import { parseCommand } from '@/core/shell/parse';
import { projectSegmentWords } from '@/core/shell/traversal';
import { evaluateGuard, type GuardEvaluation } from '@/gate/pipeline';
import {
  type CommandTraceContext,
  type CommandTraceTerminal,
  createCommandTraceContext,
  createCommandTraceRecorder,
} from '@/gate/trace';
import { bashCall, SYNTHETIC_ENVIRONMENT as environment } from '../helpers/gate-differential';
import { policySnapshot } from '../helpers/policy';
import { corpusCommands, FIXED_COMMANDS } from '../helpers/shell-inputs';

/**
 * `explain` will run the real pipeline instead of the analyzer wrapper (design §8.4), so the
 * recorder it hands `evaluateGuard` has to receive the analyzer's own steps. A command is evaluated
 * through the pipeline with a sink attached, the step a cap breach ends on is pinned, and attaching
 * a sink never changes what the gate decides.
 */

const snapshot = policySnapshot();

/** The contract corpus plus the parser-shaped table. */
const commands = [...new Set([...corpusCommands(), ...FIXED_COMMANDS])];

// The pipeline derives the modes, so the forced-standard set goes in whole: what a row pins is the
// recording, not mode resolution.
const modes = {
  ...getCCSafetyNetEnvModes(snapshot.policy, environment.env),
  strict: false,
  paranoidRm: false,
  paranoidInterpreters: false,
  worktreeMode: false,
};

const dependencies = {
  loadPolicySnapshot: () => snapshot,
  resolveGitMetadata: () => null,
  getModes: () => modes,
};

const CWD = '/work/project';

function terminalFor(evaluation: GuardEvaluation, command: string): CommandTraceTerminal {
  const decision = evaluation.decision;
  if (decision.kind !== 'deny') return { result: 'allowed' };
  const evidence = decision.evidence.find((item) => item.kind === 'command');
  return {
    result: 'blocked',
    reason: decision.reason,
    segment: evidence?.segment ?? command,
    ...(decision.ruleId ? { ruleId: decision.ruleId } : {}),
  };
}

/** One evaluation through the pipeline with a sink attached, finished the way `explain` will. */
function evaluateWithSink(command: string) {
  const recorder = createCommandTraceRecorder();
  const trace = createCommandTraceContext(recorder);
  // The parse step is `explain`'s own once it runs the pipeline (design §8.4), and the recorder
  // reads the command's assignment values out of it to redact them from every later step, so the
  // harness records it here before the evaluation runs.
  trace.recordGlobal({
    type: 'parse',
    input: command,
    segments: projectSegmentWords(parseCommand(command, 'posix')).map((words) => [...words]),
  });
  const evaluation = evaluateGuard(bashCall(command, CWD), {
    environment,
    trace,
    dependencies,
  });
  return { evaluation, trace: recorder.finish(terminalFor(evaluation, command)) };
}

describe('the analyzer steps reach a sink handed to evaluateGuard', () => {
  test('an analyzer cap breach reaches the sink as the error step the wrapper records', () => {
    const command = `custom-tool ${Array.from({ length: 190 }, () => 'bash').join(' ')}`;
    const sunk = evaluateWithSink(command);
    expect(sunk.evaluation.errorCode).toBe('structural-shell-syntax-limit');
    expect(sunk.trace.events.at(-1)).toStrictEqual({
      kind: 'step',
      scope: 'global',
      step: { type: 'error', message: REASON_DERIVED_COMMAND_WORK_LIMIT },
    });
  });

  test('a sink never changes a decision', () => {
    const decide = (command: string, trace?: CommandTraceContext) => {
      try {
        return evaluateGuard(bashCall(command, CWD), {
          environment,
          trace,
          dependencies,
        });
      } catch (error) {
        return (error as { evaluation?: GuardEvaluation }).evaluation ?? (error as Error).name;
      }
    };
    expect(
      commands.map((command) =>
        decide(command, createCommandTraceContext(createCommandTraceRecorder())),
      ),
    ).toStrictEqual(commands.map((command) => decide(command)));
  });
});
