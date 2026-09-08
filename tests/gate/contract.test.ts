import { afterAll, describe, expect, test } from 'bun:test';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { dirname, join, sep } from 'node:path';
import type { BlockIntent } from '@/core/decision';
import { createTestEnvironment, processPathResolver } from '@/core/environment';
import { getCCSafetyNetEnvModes } from '@/core/policy/env';
import { getUserPolicyPath } from '@/core/policy/paths';
import { getCommandFromToolInput } from '@/core/tool-input';
import { createToolInvocation, type ToolInvocation, type ToolRoute } from '@/gate/invocation';
import { evaluateGuard, type GuardDependencies, type GuardEvaluation } from '@/gate/pipeline';
import { writeTree } from '../helpers/fixture-tree';
import { policySnapshot } from '../helpers/policy';
import { type BehavioralContractCase, behavioralContractCases } from './behavioral-contract-cases';
import { type PipelineContractCase, pipelineContractCases } from './pipeline-contract-cases';

/**
 * The behavioral contract through the gate, entered the way every host enters it, so the
 * protection stages and secret matching sit in front of command analysis for every row. The
 * process state is injected as an Environment rather than mutated on `process.env`.
 */

const fixtureRoot = mkdtempSync(join(tmpdir(), 'next-gate-contract-'));
const workspace = join(fixtureRoot, 'workspace');
const repository = join(fixtureRoot, 'repo');
writeTree(fixtureRoot, { workspace: null, repo: null });
execFileSync('git', ['init', '--quiet', repository]);

afterAll(() => {
  rmSync(fixtureRoot, { recursive: true, force: true });
});

/**
 * Dropped from the injected env map rather than cleared on the process: the mode variables, and
 * the ambient names that would otherwise steer a row (`GIT_SSH*` turns Git rows into
 * dynamic-executable denials; `PARALLEL` changes what the `parallel` rows see).
 */
const AMBIENT_NAMES = new Set([
  'CC_SAFETY_NET_LEVEL',
  'CC_SAFETY_NET_PARANOID',
  'CC_SAFETY_NET_PARANOID_INTERPRETERS',
  'CC_SAFETY_NET_PARANOID_RM',
  'CC_SAFETY_NET_STRICT',
  'CC_SAFETY_NET_WORKTREE',
  'GIT_SSH',
  'GIT_SSH_COMMAND',
  'GIT_SSH_VARIANT',
  'PARALLEL',
  'SAFETY_NET_PARANOID',
  'SAFETY_NET_PARANOID_INTERPRETERS',
  'SAFETY_NET_PARANOID_RM',
  'SAFETY_NET_STRICT',
  'SAFETY_NET_WORKTREE',
]);

// The real home, tmpdir and filesystem, so every path expectation the corpora carry still holds.
const environment = createTestEnvironment({
  env: new Map(
    Object.entries(process.env).flatMap(([name, value]) =>
      value === undefined || AMBIENT_NAMES.has(name) ? [] : [[name, value] as const],
    ),
  ),
  home: homedir(),
  tmpdir: tmpdir(),
  paths: processPathResolver,
});

function invocationFor(
  toolName: string,
  input: unknown,
  route: ToolRoute,
  cwd: string,
): ToolInvocation {
  return createToolInvocation(
    toolName,
    input,
    route,
    { configCwd: cwd, executionCwd: cwd },
    route.kind === 'command' ? (getCommandFromToolInput(input) ?? null) : null,
  );
}

function evaluate(
  invocation: ToolInvocation,
  snapshot: ReturnType<typeof policySnapshot>,
  overrides: Partial<GuardDependencies> = {},
): GuardEvaluation {
  return evaluateGuard(invocation, {
    environment,
    dependencies: { loadPolicySnapshot: () => snapshot, ...overrides },
  });
}

/** One assertion path for both corpora; a row's stage and segment are checked where it names them. */
function expectContract(
  evaluation: GuardEvaluation,
  expected: BehavioralContractCase['expected'] | PipelineContractCase['expected'],
): void {
  if (expected.kind === 'allow') {
    expect(evaluation.decision).toEqual({ kind: 'allow' });
    return;
  }
  if ('stage' in expected) expect(evaluation.stage).toBe(expected.stage);
  const decision = evaluation.decision;
  expect(decision.kind).toBe('deny');
  if (decision.kind !== 'deny') return;
  expect<{ ruleId: string | undefined; intent: BlockIntent | undefined }>({
    ruleId: decision.ruleId,
    intent: decision.intent,
  }).toStrictEqual({ ruleId: expected.ruleId, intent: expected.intent });
  expect(decision.reason).toContain(expected.reasonIncludes);
  const segment = 'segment' in expected ? expected.segment : undefined;
  if (segment === undefined) return;
  expect(decision.evidence.find((item) => item.kind === 'command')?.segment).toBe(segment);
}

describe('behavioral contract through the ported gate', () => {
  for (const contractCase of behavioralContractCases({ cwd: workspace, home: homedir() })) {
    test(contractCase.name, () => {
      const options = contractCase.options;
      expectContract(
        evaluate(
          invocationFor(
            'Bash',
            { command: contractCase.command },
            { kind: 'command', shell: options.shell ?? 'posix' },
            options.cwd ?? workspace,
          ),
          options.policySnapshot,
          {
            // The analyzer corpus fixes the modes per row and `protectedGitMetadata: null`;
            // inject both so the gate decides the row on exactly the analyzer's inputs.
            getModes: (policy, env) => ({
              ...getCCSafetyNetEnvModes(policy, env),
              strict: options.strict ?? false,
              paranoidRm: options.paranoidRm ?? false,
              paranoidInterpreters: options.paranoidInterpreters ?? false,
              worktreeMode: options.worktreeMode ?? false,
            }),
            resolveGitMetadata: () => null,
          },
        ),
        contractCase.expected,
      );
    });
  }
});

describe('pipeline-only contract through the ported gate', () => {
  // The rows splice these into shell commands, where a `\\` is an escape: spelled with `/`.
  const shellPath = (path: string) => path.split(sep).join('/');
  const userPolicyPath = shellPath(getUserPolicyPath(environment));
  for (const contractCase of pipelineContractCases({
    workspace,
    repo: repository,
    home: homedir(),
    userPolicyPath,
    userPolicyDir: dirname(userPolicyPath),
  })) {
    test(contractCase.name, () => {
      expectContract(
        evaluate(
          invocationFor(
            contractCase.toolName,
            contractCase.input,
            contractCase.route,
            contractCase.cwd === 'repo' ? repository : workspace,
          ),
          policySnapshot(contractCase.level ? { safety: { level: contractCase.level } } : {}),
        ),
        contractCase.expected,
      );
    });
  }
});
