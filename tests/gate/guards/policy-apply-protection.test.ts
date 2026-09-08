import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createBudget } from '@/core/budget';
import {
  findPolicyApplyInvocationInCommand,
  findPolicyApplyInvocationInSemanticFacts,
  REASON_POLICY_APPLY_PROTECTION,
} from '@/gate/guards/policy-apply-protection';
import { createSemanticFacts } from '@/gate/guards/semantic-facts';
import { createToolInvocation, type ToolRoute } from '@/gate/invocation';
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
 * `policy check` and every other subcommand allowed. Both properties are recorded as digests over
 * the commands below.
 */

let root = '';
let workspace = '';

/** The command as the recognizer sees it: the row's cwd, its environment, a fresh budget. */
function findPair(command: string) {
  const environments = pairedEnvironments({ HOME: join(root, 'home') }, join(root, 'home'));
  return describeOutcome(() =>
    findPolicyApplyInvocationInCommand(command, workspace, environments),
  );
}

function factsPair(toolName: string, input: unknown, route: ToolRoute, command: string | null) {
  const environments = pairedEnvironments({ HOME: join(root, 'home') }, join(root, 'home'));
  const context = { executionCwd: workspace, configCwd: workspace };
  return describeOutcome(() =>
    findPolicyApplyInvocationInSemanticFacts(
      createSemanticFacts(createToolInvocation(toolName, input, route, context, command)),
      environments,
      createBudget(),
    ),
  );
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
  // `time` is a shell keyword the segment walk does not peel, so the guard has never recognized
  // this form.
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
      recorded.push([command, findPair(command)]);
    }
    expectRecordedDigest('guards-policy-apply/runner-spellings', recorded, root);
  });

  test('blocks the runner spellings and leaves every other invocation alone', () => {
    for (const command of RUNNER_SPELLINGS) {
      expect(findPair(command), command).toStrictEqual({
        ok: true,
        value: { target: expect.any(String) },
      });
    }
    for (const command of UNBLOCKED_SPELLINGS) {
      expect(findPair(command), command).toStrictEqual({ ok: true, value: null });
    }
  });

  test('the reported target is the segment as written, wrappers peeled', () => {
    const environments = pairedEnvironments({ HOME: join(root, 'home') }, join(root, 'home'));
    const find = (command: string) =>
      findPolicyApplyInvocationInCommand(command, workspace, environments);
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
      recorded.push([command, findPair(command)]);
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
        recorded.push([
          `${route.kind}: ${command}`,
          factsPair('Bash', { command }, route, command),
        ]);
      }
      // A path that reads like the invocation must not reach the recognizer.
      const pair = factsPair(
        'Write',
        { file_path: 'cc-safety-net policy apply proposal.json' },
        route,
        null,
      );
      recorded.push([`${route.kind}: path input`, pair]);
      expect(pair).toStrictEqual({ ok: true, value: null });
    }
    expectRecordedDigest('guards-policy-apply/semantic-facts', recorded, root);
  });

  test('the denial reason is the shipped wording', () => {
    expectRecordedDigest(
      'guards-policy-apply/reason',
      [['REASON_POLICY_APPLY_PROTECTION', REASON_POLICY_APPLY_PROTECTION]],
      root,
    );
  });
});
