import { join } from 'node:path';
import type { Environment } from '@/core/environment';
import type { PolicySnapshot } from '@/core/policy/types';
import { createToolInvocation } from '@/gate/invocation';
import { evaluateRuntimeGuard } from './runtime';

interface SelfTestCase {
  command: string;
  description: string;
  expectBlocked: boolean;
}

interface SelfTestResult {
  command: string;
  description: string;
  expected: 'blocked' | 'allowed';
  actual: 'blocked' | 'allowed';
  passed: boolean;
  reason?: string;
  ruleId?: string;
}

export interface SelfTestSummary {
  passed: number;
  failed: number;
  total: number;
  results: SelfTestResult[];
}

const CASES: readonly SelfTestCase[] = Object.freeze([
  { command: 'git reset --hard', description: 'git reset --hard', expectBlocked: true },
  { command: 'rm -rf /', description: 'rm -rf /', expectBlocked: true },
  { command: 'rm -rf ./node_modules', description: 'rm in cwd (safe)', expectBlocked: false },
]);

const SNAPSHOT: PolicySnapshot = Object.freeze({
  state: 'ready',
  diagnostics: Object.freeze([]),
  ruleMetadata: Object.freeze({}),
  policy: Object.freeze({
    rules: Object.freeze([]),
    transparentWrappers: Object.freeze([]),
    safety: Object.freeze({}),
    worktreeMode: false,
    destructiveCommandProtectionEnabled: true,
    destructiveCommandRuleOverrides: Object.freeze({}),
    destructiveCommandAllowPaths: Object.freeze([]),
    secretProtection: Object.freeze({
      enabled: true,
      disabledRules: Object.freeze([]),
      denyPaths: Object.freeze([]),
      allowPaths: Object.freeze([]),
    }),
  }),
});

const STANDARD_MODES = {
  strict: false,
  paranoidRm: false,
  paranoidInterpreters: false,
  worktreeMode: false,
  effectiveLevel: 'standard' as const,
  capabilities: {
    fail_closed: { enabled: false, source: 'preset' as const, sources: [] as string[] },
    paranoid_rm: { enabled: false, source: 'preset' as const, sources: [] as string[] },
    paranoid_interpreters: {
      enabled: false,
      source: 'preset' as const,
      sources: [] as string[],
    },
  },
};

export function runIntegrationSelfTest(environment: Environment): SelfTestSummary {
  const cwd = join(environment.tmpdir, 'cc-safety-net-self-test');
  const results = CASES.map((testCase): SelfTestResult => {
    const evaluation = evaluateRuntimeGuard(
      environment,
      createToolInvocation(
        'self-test',
        { command: testCase.command },
        { kind: 'command', shell: 'auto' },
        { configCwd: cwd, executionCwd: cwd },
        testCase.command,
      ),
      {
        guard: {
          dependencies: {
            loadPolicySnapshot: () => SNAPSHOT,
            getModes: () => STANDARD_MODES,
            // Policy config lives under the real home directory, so its ancestor chain always
            // includes "/". Left enabled, it would intercept the rm root/home case before the
            // destructive-command guard this suite exists to exercise ever runs.
            findPolicyMutation: () => null,
          },
        },
        audit: { agent: 'self-test', getSessionId: () => undefined },
      },
    );
    const expected = testCase.expectBlocked ? 'blocked' : 'allowed';
    const actual = evaluation.decision.kind === 'deny' ? 'blocked' : 'allowed';
    return {
      command: testCase.command,
      description: testCase.description,
      expected,
      actual,
      passed: expected === actual,
      reason: evaluation.decision.kind === 'deny' ? evaluation.decision.reason : undefined,
      ruleId: evaluation.decision.kind === 'deny' ? evaluation.decision.ruleId : undefined,
    };
  });
  return {
    passed: results.filter((result) => result.passed).length,
    failed: results.filter((result) => !result.passed).length,
    total: results.length,
    results,
  };
}
