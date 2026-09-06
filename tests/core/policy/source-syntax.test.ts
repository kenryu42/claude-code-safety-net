import { describe, expect, test } from 'bun:test';
import { RULE_SOURCE_LIMIT, RULE_SOURCE_LIMIT_ERROR } from '@/core/policy/resource-limits';
import {
  isRulebookWithinAcceptanceLimits,
  RULEBOOK_LIMIT_ERROR,
  RULEBOOK_LIMITS,
  RULEBOOK_VALIDATION_TRUNCATED,
} from '@/core/policy/rulebook-limits';
import {
  assertBareRulebookName,
  GITHUB_RULEBOOK_PATH_RE,
  getRepositoryRulebookPath,
  getRulebookSourceSyntaxError,
  isGitHubRef,
  isGitHubRepositorySource,
  isGitHubRulebookSource,
  parseGitHubSource,
} from '@/core/policy/source-syntax';
import {
  isInterpreterCommand,
  isReservedTransparentWrapper,
} from '@/core/policy/transparent-wrappers';
import { describeOutcome } from '../../helpers/fixture-tree';
import { corpusWords } from '../differential-inputs';

const SPECS = [
  'team-rules',
  'a',
  '1bad',
  'bad source!',
  '',
  ' ',
  'x'.repeat(64),
  'x'.repeat(65),
  'owner/repo#main/team',
  'owner/repo#release/v1/team',
  'owner/repo#main/1bad',
  'owner/repo#main',
  'owner/repo#/team',
  'owner/repo#bad ref/team',
  'github:owner/repo#main/team',
  'gh:x',
  'owner/repo',
  'https://github.com/o/r',
  'owner/repo#main/team/extra',
];

describe('rulebook source syntax parity', () => {
  test('every spec reads the same on both implementations', () => {
    const read = SPECS.map((spec) => ({
      spec,
      parsed: describeOutcome(() => parseGitHubSource(spec)),
      rulebookSource: isGitHubRulebookSource(spec),
      repositorySource: isGitHubRepositorySource(spec),
      ref: isGitHubRef(spec),
      syntaxError: getRulebookSourceSyntaxError(spec),
      bareName: describeOutcome(() => assertBareRulebookName(spec)),
      repositoryPath: getRepositoryRulebookPath(spec),
    }));
    expect(read).toMatchSnapshot();
  });

  test('the vendored rulebook path pattern is the same pattern', () => {
    const pattern = {
      source: GITHUB_RULEBOOK_PATH_RE.source,
      flags: GITHUB_RULEBOOK_PATH_RE.flags,
    };
    expect(pattern).toMatchSnapshot();
  });
});

const WRAPPER_COMMANDS = [
  'python',
  'python3',
  'python3.11',
  'python2.7',
  '/usr/bin/python',
  'PYTHON.EXE',
  'Python3',
  'node',
  'Node',
  'nodejs',
  'ruby',
  'perl',
  'perl5',
  'gawk',
  'mawk',
  'awk',
  'git',
  'GIT',
  'busybox',
  'rm',
  'find',
  'xargs',
  'parallel',
  'bash',
  'zsh',
  'rtk',
  'docker',
  'python-config',
  '',
];

describe('transparent wrapper vocabulary parity', () => {
  test('reserved names and interpreter names agree with the analyzer', () => {
    const commands = [...new Set([...corpusWords(), ...WRAPPER_COMMANDS])];
    const vocabulary = commands.map((command) => ({
      reserved: isReservedTransparentWrapper(command),
      interpreter: isInterpreterCommand(command),
    }));
    expect(vocabulary).toMatchSnapshot();
  });
});

const tokens = (count: number) => Array.from({ length: count }, () => 'a');
const blockArgRules = (count: number, perRule: number) =>
  Array.from({ length: count }, () => ({ name: 'r', command: 'rm', block_args: tokens(perRule) }));

const ACCEPTANCE_CASES: Array<{
  name: string;
  rulebook: Record<string, unknown>;
  expected: boolean;
}> = [
  { name: 'rules at the cap', rulebook: { rules: blockArgRules(1024, 0) }, expected: true },
  { name: 'rules over the cap', rulebook: { rules: blockArgRules(1025, 0) }, expected: false },
  {
    name: 'allowed commands at the cap',
    rulebook: { allowed_commands: tokens(1024) },
    expected: true,
  },
  {
    name: 'allowed commands over the cap',
    rulebook: { allowed_commands: tokens(1025) },
    expected: false,
  },
  {
    name: 'fixtures at the cap',
    rulebook: { tests: Array.from({ length: 2048 }, () => ({ command: 'rm -rf x' })) },
    expected: true,
  },
  {
    name: 'fixtures over the cap',
    rulebook: { tests: Array.from({ length: 2049 }, () => ({ command: 'rm -rf x' })) },
    expected: false,
  },
  {
    name: 'block args at the per-rule cap',
    rulebook: { rules: blockArgRules(1, 1024) },
    expected: true,
  },
  {
    name: 'block args over the per-rule cap',
    rulebook: { rules: blockArgRules(1, 1025) },
    expected: false,
  },
  {
    name: 'block args at the total cap',
    rulebook: { rules: blockArgRules(16, 1024) },
    expected: true,
  },
  {
    name: 'block args over the total cap',
    rulebook: { rules: [...blockArgRules(16, 1024), ...blockArgRules(1, 1)] },
    expected: false,
  },
  { name: 'string at the cap', rulebook: { name: 'x'.repeat(1_048_576) }, expected: true },
  { name: 'string over the cap', rulebook: { name: 'x'.repeat(1_048_577) }, expected: false },
  {
    name: 'fixture command at the cap',
    rulebook: { tests: [{ command: 'x'.repeat(131_072) }] },
    expected: true,
  },
  {
    name: 'fixture command over the cap',
    rulebook: { tests: [{ command: 'x'.repeat(131_073) }] },
    expected: false,
  },
  {
    name: 'aggregate strings under the budget',
    rulebook: { allowed_commands: Array.from({ length: 41 }, () => 'x'.repeat(100_000)) },
    expected: true,
  },
  {
    name: 'aggregate strings over the budget',
    rulebook: { allowed_commands: Array.from({ length: 42 }, () => 'x'.repeat(100_000)) },
    expected: false,
  },
  {
    name: 'version 2 match lists within the budget',
    rulebook: {
      rules: [
        {
          name: 'r',
          command: 'rm',
          match: {
            command_path: tokens(1024),
            any_args: tokens(1024),
            exclude_args: tokens(1024),
          },
        },
      ],
    },
    expected: true,
  },
  {
    name: 'version 2 match lists over the per-rule cap',
    rulebook: {
      rules: [{ name: 'r', command: 'rm', match: { command_path: tokens(1025) } }],
    },
    expected: false,
  },
  {
    name: 'version 2 match lists over the total cap',
    rulebook: {
      rules: Array.from({ length: 6 }, () => ({
        name: 'r',
        command: 'rm',
        block_args: tokens(1024),
        match: { command_path: tokens(1024), any_args: tokens(1024), exclude_args: tokens(1024) },
      })),
    },
    expected: false,
  },
  {
    name: 'entries that are not objects',
    rulebook: {
      rules: [null, 42, 'rule', { name: 'r' }],
      tests: [null, 'fixture', { command: 'ok' }],
    },
    expected: true,
  },
];

describe('rulebook acceptance limit parity', () => {
  for (const item of ACCEPTANCE_CASES) {
    test(item.name, () => {
      expect(isRulebookWithinAcceptanceLimits(item.rulebook)).toBe(item.expected);
    });
  }

  test('the limit tables and messages are the shipped ones', () => {
    const tables = {
      limits: RULEBOOK_LIMITS,
      limitError: RULEBOOK_LIMIT_ERROR,
      truncated: RULEBOOK_VALIDATION_TRUNCATED,
      sourceLimit: RULE_SOURCE_LIMIT,
      sourceLimitError: RULE_SOURCE_LIMIT_ERROR,
    };
    expect(tables).toMatchSnapshot();
  });
});
