import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { mkdtempSync, realpathSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createBudget } from '@/core/budget';
import {
  findPolicyConfigMutationTargetInSemanticFacts,
  findPolicyConfigMutationTargetInToolInput,
} from '@/gate/guards/policy-protection';
import { createSemanticFacts } from '@/gate/guards/semantic-facts';
import type { ToolRoute } from '@/gate/invocation';
import { createToolInvocation } from '@/gate/invocation';
import { pairedEnvironments } from '../../core/differential-inputs';
import { describeOutcome, writeTree } from '../../helpers/fixture-tree';
import { expectRecordedDigest } from '../../helpers/gate-differential';
import { corpusToolInputs, FUZZ_SEED, fuzzShellSources } from '../../helpers/shell-inputs';

/**
 * The policy files are protected in both scopes and through every write channel the gate sees:
 * shell operands, tracked assignments, redirections, `rm -r` of an ancestor, `mv`, `find -delete`
 * and the write-shaped tool inputs. The fixture sets `CC_SAFETY_NET_HOME` on the process as well as
 * on the environment it hands the guard, so `~` and the user scope line up with it.
 */

let root = '';
let home = '';
let workspace = '';
let safetyHome = '';
let userPolicy = '';
let projectPolicy = '';
const previousSafetyHome = process.env.CC_SAFETY_NET_HOME;
const previousHome = process.env.HOME;

beforeAll(() => {
  root = realpathSync(mkdtempSync(join(tmpdir(), 'next-policy-guard-')));
  home = join(root, 'home');
  workspace = join(root, 'work');
  safetyHome = join(home, '.cc-safety-net');
  userPolicy = join(safetyHome, 'policy.json');
  projectPolicy = join(workspace, '.cc-safety-net', 'policy.json');
  writeTree(root, {
    'home/.cc-safety-net/rules': null,
    'home/.cc-safety-net/policy.json': '{}',
    'work/.cc-safety-net/policy.json': '{}',
    'work/src': null,
    'work/alias': { symlink: join(home, '.cc-safety-net') },
    other: null,
  });
  // A path that reads `~` resolves against the process home, so the process carries the same home
  // the guard's environment does.
  process.env.CC_SAFETY_NET_HOME = safetyHome;
  process.env.HOME = home;
});

afterAll(() => {
  if (previousSafetyHome === undefined) delete process.env.CC_SAFETY_NET_HOME;
  if (previousSafetyHome !== undefined) process.env.CC_SAFETY_NET_HOME = previousSafetyHome;
  if (previousHome === undefined) delete process.env.HOME;
  if (previousHome !== undefined) process.env.HOME = previousHome;
  rmSync(root, { recursive: true, force: true });
});

function guardEnvironments() {
  return pairedEnvironments({ HOME: home, CC_SAFETY_NET_HOME: safetyHome }, home);
}

function toolContext() {
  return { executionCwd: workspace, configCwd: workspace };
}

/** One tool call through the guard, from the raw input the host would deliver. */
function guardPair(toolName: string, input: unknown, route: ToolRoute) {
  const paired = guardEnvironments();
  return describeOutcome(() =>
    findPolicyConfigMutationTargetInToolInput(toolName, input, route, toolContext(), paired),
  );
}

function shellCases(): readonly string[] {
  return [
    `cat ${userPolicy}`,
    `less ${userPolicy}`,
    `sed s/a/b/ ${userPolicy}`,
    `sed -i s/a/b/ ${userPolicy}`,
    `sed --in-place s/a/b/ ${userPolicy}`,
    `jq . ${userPolicy}`,
    `echo {} > ${userPolicy}`,
    `echo {} >> ${userPolicy}`,
    `echo {} > ${projectPolicy}`,
    `tee ${userPolicy}`,
    `cp /dev/null ${userPolicy}`,
    `install -m 600 /dev/null ${userPolicy}`,
    `rm ${userPolicy}`,
    `rm -f ${projectPolicy}`,
    `rm -rf ${safetyHome}`,
    `rm -r ${home}`,
    `rm --recursive ${safetyHome}`,
    `rm -rf ${join(workspace, '.cc-safety-net')}`,
    `rm -rf ${workspace}`,
    `rm -rf -- ${safetyHome}`,
    `rm -rf ${join(root, 'other')}`,
    `mv ${userPolicy} ${join(root, 'other')}`,
    `mv ${safetyHome} ${join(root, 'other')}`,
    `mv -S .bak ${userPolicy} ${join(root, 'other')}`,
    `mv ${join(root, 'other')} ${userPolicy}`,
    `find ${safetyHome} -delete`,
    `find ${workspace} -name policy.json -delete`,
    `find ${safetyHome} -exec rm -rf {} \\;`,
    `find ${join(root, 'other')} -delete`,
    'rm -rf ~/.cc-safety-net',
    'cat ~/.cc-safety-net/policy.json',
    'truncate -s 0 ~/.cc-safety-net/policy.json',
    `truncate -s 0 ${join(workspace, 'alias', 'policy.json')}`,
    `P=${userPolicy}; cp /dev/null "$P"`,
    `P=${userPolicy} && cp /dev/null $P`,
    `P=${safetyHome}; rm -rf "$P"`,
    `cd ${home} && rm -rf .cc-safety-net`,
    `cd ${home} && cp /dev/null .cc-safety-net/policy.json`,
    `cd /nowhere-at-all && cp /dev/null .cc-safety-net/policy.json`,
    `env -S "cp /dev/null ${userPolicy}"`,
    `env EDITOR=vi cp /dev/null ${userPolicy}`,
    `sudo cp /dev/null ${userPolicy}`,
    `cat "unclosed ${userPolicy}`,
    `echo CONFIG=${userPolicy}`,
    `printf x > ${join(workspace, 'src', 'policy.json')}`,
    'echo hello',
    '',
  ];
}

describe('policy config protection through the shell', () => {
  test('every command reports the same target as the shipped guard', () => {
    const recorded: [string, unknown][] = [];
    for (const command of shellCases()) {
      recorded.push([command, guardPair('Bash', { command }, { kind: 'command', shell: 'posix' })]);
    }
    expectRecordedDigest('guards-policy-protection/shell-commands', recorded, root);
  });

  test('the table separates reads from writes and covers both scopes', () => {
    const blocked = (command: string) => {
      const outcome = guardPair('Bash', { command }, { kind: 'command', shell: 'posix' });
      return outcome.ok && outcome.value !== null;
    };
    expect(blocked(`cat ${userPolicy}`)).toBeFalse();
    expect(blocked(`sed -i s/a/b/ ${userPolicy}`)).toBeTrue();
    expect(blocked(`echo {} > ${projectPolicy}`)).toBeTrue();
    expect(blocked(`rm -rf ${safetyHome}`)).toBeTrue();
    expect(blocked(`mv ${userPolicy} ${join(root, 'other')}`)).toBeTrue();
    expect(blocked(`find ${safetyHome} -delete`)).toBeTrue();
    expect(blocked(`P=${userPolicy}; cp /dev/null "$P"`)).toBeTrue();
    expect(blocked(`truncate -s 0 ${join(workspace, 'alias', 'policy.json')}`)).toBeTrue();
    expect(blocked(`rm -rf ${join(root, 'other')}`)).toBeFalse();
    expect(blocked('echo hello')).toBeFalse();
  });

  test('the corpus tool inputs and the seeded fuzz agree with the shipped guard', () => {
    const recorded: [string, unknown][] = [];
    for (const row of corpusToolInputs()) {
      recorded.push([
        `${row.toolName}: ${JSON.stringify(row.input)}`,
        guardPair(row.toolName, row.input, { kind: 'unknown' }),
      ]);
    }
    for (const command of fuzzShellSources(250, FUZZ_SEED)) {
      recorded.push([
        `fuzz: ${command}`,
        guardPair('Bash', { command }, { kind: 'command', shell: 'posix' }),
      ]);
    }
    expectRecordedDigest('guards-policy-protection/corpus-fuzz', recorded, root);
  });
});

describe('policy config protection through tool inputs', () => {
  test('every route and payload reports the same target as the shipped guard', () => {
    const payloads: readonly { toolName: string; input: unknown; route: ToolRoute }[] = [
      { toolName: 'Write', input: { file_path: userPolicy }, route: { kind: 'path' } },
      { toolName: 'Write', input: { file_path: projectPolicy }, route: { kind: 'path' } },
      {
        toolName: 'Write',
        input: { file_path: join(workspace, 'src', 'a.ts') },
        route: { kind: 'path' },
      },
      {
        toolName: 'Edit',
        input: { file_path: '~/.cc-safety-net/policy.json' },
        route: { kind: 'path' },
      },
      {
        toolName: 'Edit',
        input: { path: join(workspace, 'alias', 'policy.json') },
        route: { kind: 'path' },
      },
      { toolName: 'Read', input: { file_path: userPolicy }, route: { kind: 'path' } },
      { toolName: 'Grep', input: { path: safetyHome, pattern: 'x' }, route: { kind: 'grep' } },
      { toolName: 'Glob', input: { path: safetyHome, pattern: '*' }, route: { kind: 'glob' } },
      {
        toolName: 'ApplyPatch',
        input: { patch: `*** Update File: ${userPolicy}\n` },
        route: { kind: 'patch' },
      },
      {
        toolName: 'ApplyPatch',
        input: { input: `*** Update File: ${projectPolicy}\n` },
        route: { kind: 'patch' },
      },
      {
        toolName: 'mystery',
        input: { command: `cp /dev/null ${userPolicy}` },
        route: { kind: 'unknown' },
      },
      { toolName: 'mystery', input: { file_path: userPolicy }, route: { kind: 'unknown' } },
      { toolName: 'Write', input: null, route: { kind: 'path' } },
      { toolName: 'Write', input: { file_path: 42 }, route: { kind: 'path' } },
    ];
    const recorded: [string, unknown][] = [];
    for (const [index, payload] of payloads.entries()) {
      recorded.push([
        `${index} ${payload.toolName} ${payload.route.kind}`,
        guardPair(payload.toolName, payload.input, payload.route),
      ]);
    }
    expectRecordedDigest('guards-policy-protection/tool-inputs', recorded, root);
  });

  test('a write to either policy file is blocked while a read of it is not', () => {
    const target = (toolName: string, input: unknown, route: ToolRoute) => {
      const outcome = guardPair(toolName, input, route);
      return outcome.ok ? (outcome.value?.target ?? null) : 'threw';
    };
    expect(target('Write', { file_path: userPolicy }, { kind: 'path' })).toBe(userPolicy);
    expect(target('Write', { file_path: projectPolicy }, { kind: 'path' })).toBe(projectPolicy);
    expect(target('Read', { file_path: userPolicy }, { kind: 'path' })).toBeNull();
    expect(target('Glob', { path: safetyHome, pattern: '*' }, { kind: 'glob' })).toBeNull();
    expect(
      target('Write', { file_path: join(workspace, 'src', 'a.ts') }, { kind: 'path' }),
    ).toBeNull();
  });
});

describe('policy config protection over prepared facts', () => {
  test('a declared command reaches the same verdict through the facts entry point', () => {
    const paired = guardEnvironments();
    const recorded: [string, unknown][] = [];
    for (const command of [
      `cp /dev/null ${userPolicy}`,
      `cat ${userPolicy}`,
      `rm -rf ${safetyHome}`,
    ]) {
      const invocation = { toolName: 'Bash', input: { command }, context: toolContext() };
      const route = { kind: 'command', shell: 'posix' } as const;
      const target = findPolicyConfigMutationTargetInSemanticFacts(
        createSemanticFacts(
          createToolInvocation(
            invocation.toolName,
            invocation.input,
            route,
            invocation.context,
            command,
          ),
        ),
        paired,
        createBudget(),
      );
      recorded.push([command, target]);
    }
    expectRecordedDigest('guards-policy-protection/declared-facts', recorded, root);
  });
});
