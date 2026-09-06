import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createBudget } from '@next/core/budget';
import {
  findPolicyApplyInvocationInCommand,
  findPolicyApplyInvocationInSemanticFacts,
  REASON_POLICY_APPLY_PROTECTION,
} from '@next/gate/guards/policy-apply-protection';
import { createSemanticFacts } from '@next/gate/guards/semantic-facts';
import { createToolInvocation, type ToolRoute } from '@next/gate/invocation';
import {
  REASON_POLICY_APPLY_PROTECTION as SHIPPED_REASON,
  findPolicyApplyInvocationInCommand as shippedFindInCommand,
  findPolicyApplyInvocationInSemanticFacts as shippedFindInFacts,
} from '@/guards/policy-apply-protection';
import { createSemanticFacts as shippedCreateSemanticFacts } from '@/guards/semantic-facts';
import { createToolInvocation as shippedCreateToolInvocation } from '@/ir/invocation';
import { pairedEnvironments } from '../../core/differential-inputs';
import { describeOutcome, writeTree } from '../../helpers/fixture-tree';
import { expectRecordedDigest } from '../../helpers/gate-differential';
import {
  corpusCommands,
  FIXED_COMMANDS,
  FUZZ_SAMPLE_COUNT,
  FUZZ_SEED,
  fuzzShellSources,
} from '../../helpers/shell-inputs';

/**
 * Only the user may apply a policy proposal, so this guard must recognize the invocation through
 * every runner spelling, wrapper prelude and `cd` the segment walk can carry — and must keep
 * `policy check` and every other subcommand allowed. Both properties are compared against the
 * shipped recognizer over the same commands.
 */

let root = '';
let workspace = '';

/** The command as both implementations see it: same cwd, same environment, fresh budgets. */
function findPair(command: string) {
  const environments = pairedEnvironments({ HOME: join(root, 'home') }, join(root, 'home'));
  return {
    next: describeOutcome(() =>
      findPolicyApplyInvocationInCommand(command, workspace, environments.next),
    ),
    shipped: describeOutcome(() => shippedFindInCommand(command, workspace)),
  };
}

function factsPair(toolName: string, input: unknown, route: ToolRoute, command: string | null) {
  const environments = pairedEnvironments({ HOME: join(root, 'home') }, join(root, 'home'));
  const context = { executionCwd: workspace, configCwd: workspace };
  return {
    next: describeOutcome(() =>
      findPolicyApplyInvocationInSemanticFacts(
        createSemanticFacts(createToolInvocation(toolName, input, route, context, command)),
        environments.next,
        createBudget(),
      ),
    ),
    shipped: describeOutcome(() =>
      shippedFindInFacts(
        shippedCreateSemanticFacts(
          shippedCreateToolInvocation(toolName, input, route, context, command),
        ),
      ),
    ),
  };
}

const RUNNER_SPELLINGS: readonly string[] = [
  'cc-safety-net policy apply proposal.json',
  'ccsn policy apply proposal.json',
  './node_modules/.bin/cc-safety-net policy apply proposal.json',
  '/usr/local/bin/cc-safety-net policy apply proposal.json',
  'CC-SAFETY-NET policy apply proposal.json',
  'cc-safety-net.exe policy apply proposal.json',
  'npx cc-safety-net policy apply proposal.json',
  'npx -y cc-safety-net policy apply proposal.json',
  'npx --yes cc-safety-net policy apply proposal.json',
  'npx --loglevel=silent cc-safety-net policy apply proposal.json',
  'npx --package cc-safety-net ccsn policy apply proposal.json',
  'bunx cc-safety-net policy apply proposal.json',
  'bunx --bun cc-safety-net policy apply proposal.json',
  'pnpx cc-safety-net policy apply proposal.json',
  'pnpm dlx cc-safety-net policy apply proposal.json',
  'yarn dlx cc-safety-net policy apply proposal.json',
  'npm exec cc-safety-net policy apply proposal.json',
  'npm --silent exec cc-safety-net policy apply proposal.json',
  'pnpm exec cc-safety-net policy apply proposal.json',
  'yarn exec cc-safety-net policy apply proposal.json',
  'bun run src/cli/cc-safety-net.ts policy apply proposal.json',
  'bun src/cli/cc-safety-net.ts policy apply proposal.json',
  'node dist/bin/cc-safety-net.js policy apply proposal.json',
  'sudo cc-safety-net policy apply proposal.json',
  'env CC_SAFETY_NET_HOME=/tmp cc-safety-net policy apply proposal.json',
  'command cc-safety-net policy apply proposal.json',
  'cd /tmp && cc-safety-net policy apply proposal.json',
  'echo hi; cc-safety-net policy apply proposal.json',
  'echo hi | cc-safety-net policy apply proposal.json',
  'cc-safety-net -g policy apply proposal.json',
  'cc-safety-net --global policy apply proposal.json',
  'cc-safety-net policy -g apply proposal.json',
  'cc-safety-net policy apply -g proposal.json',
  'cc-safety-net policy apply',
];

const UNBLOCKED_SPELLINGS: readonly string[] = [
  // `time` is a shell keyword the segment walk does not peel, so the shipped guard has never
  // recognized this form either.
  'time cc-safety-net policy apply proposal.json',
  'cc-safety-net policy check proposal.json',
  'cc-safety-net policy show',
  'cc-safety-net status',
  'cc-safety-net explain "rm -rf /"',
  'cc-safety-net',
  'cc-safety-net policy',
  'cc-safety-net apply policy',
  'cc-safety-net policy applyx proposal.json',
  'policy apply proposal.json',
  'other-tool policy apply proposal.json',
  'npx other-tool policy apply proposal.json',
  'echo cc-safety-net policy apply',
  'yarn policy apply',
  'npm exec -- other policy apply',
  '',
  '   ',
];

beforeAll(() => {
  root = mkdtempSync(join(tmpdir(), 'next-policy-apply-'));
  workspace = join(root, 'work');
  writeTree(root, { 'work/nested': null, home: null });
});

afterAll(() => {
  rmSync(root, { recursive: true, force: true });
});

describe('policy apply protection', () => {
  test('matches the shipped recognizer over every runner spelling', () => {
    const recorded: [string, unknown][] = [];
    for (const command of [...RUNNER_SPELLINGS, ...UNBLOCKED_SPELLINGS]) {
      const pair = findPair(command);
      expect(pair.next, command).toStrictEqual(pair.shipped);
      recorded.push([command, pair.next]);
    }
    expectRecordedDigest('guards-policy-apply/runner-spellings', recorded, root);
  });

  test('blocks the runner spellings and leaves every other invocation alone', () => {
    for (const command of RUNNER_SPELLINGS) {
      expect(findPair(command).next, command).toStrictEqual({
        ok: true,
        value: { target: expect.any(String) },
      });
    }
    for (const command of UNBLOCKED_SPELLINGS) {
      expect(findPair(command).next, command).toStrictEqual({ ok: true, value: null });
    }
  });

  test('the reported target is the segment as written, wrappers peeled', () => {
    const environments = pairedEnvironments({ HOME: join(root, 'home') }, join(root, 'home'));
    const find = (command: string) =>
      findPolicyApplyInvocationInCommand(command, workspace, environments.next);
    expect(find('cc-safety-net policy apply proposal.json')).toStrictEqual({
      target: 'cc-safety-net policy apply proposal.json',
    });
    expect(find('sudo cc-safety-net policy apply proposal.json')).toStrictEqual({
      target: 'cc-safety-net policy apply proposal.json',
    });
    expect(find('echo hi && cc-safety-net policy apply proposal.json')).toStrictEqual({
      target: 'cc-safety-net policy apply proposal.json',
    });
  });

  test('matches the shipped recognizer over the corpus and the seeded fuzz', () => {
    const recorded: [string, unknown][] = [];
    for (const command of [
      ...corpusCommands(),
      ...FIXED_COMMANDS,
      ...fuzzShellSources(FUZZ_SAMPLE_COUNT, FUZZ_SEED),
    ]) {
      const pair = findPair(command);
      expect(pair.next, command).toStrictEqual(pair.shipped);
      recorded.push([command, pair.next]);
    }
    expectRecordedDigest('guards-policy-apply/corpus-fuzz', recorded, root);
  });

  test('matches the shipped recognizer through the semantic facts, per route', () => {
    const routes: readonly ToolRoute[] = [
      ...(['posix', 'powershell', 'auto'] as const).map(
        (shell): ToolRoute => ({ kind: 'command', shell }),
      ),
      ...(['patch', 'path', 'grep', 'glob', 'unknown'] as const).map(
        (kind): ToolRoute => ({ kind }),
      ),
    ];
    const recorded: [string, unknown][] = [];
    for (const route of routes) {
      for (const command of [...RUNNER_SPELLINGS, ...UNBLOCKED_SPELLINGS]) {
        const pair = factsPair('Bash', { command }, route, command);
        expect(pair.next, `${route.kind}: ${command}`).toStrictEqual(pair.shipped);
        recorded.push([`${route.kind}: ${command}`, pair.next]);
      }
      // A path that reads like the invocation must not reach the recognizer.
      const pair = factsPair(
        'Write',
        { file_path: 'cc-safety-net policy apply proposal.json' },
        route,
        null,
      );
      expect(pair.next, `${route.kind}: path input`).toStrictEqual(pair.shipped);
      recorded.push([`${route.kind}: path input`, pair.next]);
      expect(pair.next).toStrictEqual({ ok: true, value: null });
    }
    expectRecordedDigest('guards-policy-apply/semantic-facts', recorded, root);
  });

  test('the denial reason is the shipped wording', () => {
    expect(REASON_POLICY_APPLY_PROTECTION).toBe(SHIPPED_REASON);
    expectRecordedDigest(
      'guards-policy-apply/reason',
      [['REASON_POLICY_APPLY_PROTECTION', REASON_POLICY_APPLY_PROTECTION]],
      root,
    );
  });
});
