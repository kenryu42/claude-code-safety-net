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
  NAME_PATTERN,
  parseGitHubSource,
} from '@/core/policy/source-syntax';
import {
  isInterpreterCommand,
  isReservedTransparentWrapper,
} from '@/core/policy/transparent-wrappers';
import { describeOutcome } from '../../helpers/fixture-tree';
import { corpusWords } from '../differential-inputs';

/**
 * `rule add` prints the syntax error verbatim and `rule update` vendors to the path the parse
 * returns, so both are contract: each row below states the parse it must produce and the exact
 * message a rejected spec must carry.
 */

const bareNameError = (spec: string) =>
  `Local rulebook sources must be bare names matching /^[a-zA-Z][a-zA-Z0-9_-]{0,63}$/: ${spec}`;

const FORMAT = 'owner/repo#ref/<rulebook-name>';

type Parsed = { owner: string; repo: string; ref: string; name: string; path: string };

const SPECS: readonly {
  readonly behavior: string;
  readonly spec: string;
  /** The message `getRulebookSourceSyntaxError` reports, or null when the spec is usable. */
  readonly syntaxError: string | null;
  readonly isRulebookSource: boolean;
  readonly isRepositorySource: boolean;
  readonly isRef: boolean;
  /** The parse result, or the message `parseGitHubSource` throws. */
  readonly parsed: Parsed | string;
}[] = [
  {
    behavior: 'a bare local name is a usable source',
    spec: 'team-rules',
    syntaxError: null,
    isRulebookSource: false,
    isRepositorySource: false,
    isRef: true,
    parsed: 'Invalid GitHub rulebook source: team-rules',
  },
  {
    behavior: 'a single letter is the shortest usable local name',
    spec: 'a',
    syntaxError: null,
    isRulebookSource: false,
    isRepositorySource: false,
    isRef: true,
    parsed: 'Invalid GitHub rulebook source: a',
  },
  {
    behavior: 'a 64-character local name is at the length cap',
    spec: 'x'.repeat(64),
    syntaxError: null,
    isRulebookSource: false,
    isRepositorySource: false,
    isRef: true,
    parsed: `Invalid GitHub rulebook source: ${'x'.repeat(64)}`,
  },
  {
    behavior: 'a 65-character local name is over the cap',
    spec: 'x'.repeat(65),
    syntaxError: bareNameError('x'.repeat(65)),
    isRulebookSource: false,
    isRepositorySource: false,
    isRef: true,
    parsed: `Invalid GitHub rulebook source: ${'x'.repeat(65)}`,
  },
  {
    behavior: 'a local name may not open with a digit',
    spec: '1bad',
    syntaxError: bareNameError('1bad'),
    isRulebookSource: false,
    isRepositorySource: false,
    isRef: true,
    parsed: 'Invalid GitHub rulebook source: 1bad',
  },
  {
    behavior: 'a local name may not carry a space or punctuation',
    spec: 'bad source!',
    syntaxError: bareNameError('bad source!'),
    isRulebookSource: false,
    isRepositorySource: false,
    isRef: false,
    parsed: 'Invalid GitHub rulebook source: bad source!',
  },
  {
    behavior: 'the empty source is rejected as a local name',
    spec: '',
    syntaxError: bareNameError(''),
    isRulebookSource: false,
    isRepositorySource: false,
    isRef: false,
    parsed: 'Invalid GitHub rulebook source: ',
  },
  {
    behavior: 'a blank source is rejected as a local name',
    spec: ' ',
    syntaxError: bareNameError(' '),
    isRulebookSource: false,
    isRepositorySource: false,
    isRef: false,
    parsed: 'Invalid GitHub rulebook source:  ',
  },
  {
    behavior: 'owner/repo#ref/name is the vendored GitHub form',
    spec: 'owner/repo#main/team',
    syntaxError: null,
    isRulebookSource: true,
    isRepositorySource: false,
    isRef: false,
    parsed: {
      owner: 'owner',
      repo: 'repo',
      ref: 'main',
      name: 'team',
      path: '.cc-safety-net/rules/team/rulebook.json',
    },
  },
  {
    behavior: 'a ref may carry slashes, and the last segment is the rulebook name',
    spec: 'owner/repo#release/v1/team',
    syntaxError: null,
    isRulebookSource: true,
    isRepositorySource: false,
    isRef: false,
    parsed: {
      owner: 'owner',
      repo: 'repo',
      ref: 'release/v1',
      name: 'team',
      path: '.cc-safety-net/rules/team/rulebook.json',
    },
  },
  {
    behavior: 'only the last segment is the name, so extra segments extend the ref',
    spec: 'owner/repo#main/team/extra',
    syntaxError: null,
    isRulebookSource: true,
    isRepositorySource: false,
    isRef: false,
    parsed: {
      owner: 'owner',
      repo: 'repo',
      ref: 'main/team',
      name: 'extra',
      path: '.cc-safety-net/rules/extra/rulebook.json',
    },
  },
  {
    behavior: 'the rulebook name in a GitHub source obeys the local name pattern',
    spec: 'owner/repo#main/1bad',
    syntaxError: `GitHub rulebook sources must be ${FORMAT}: owner/repo#main/1bad`,
    isRulebookSource: true,
    isRepositorySource: false,
    isRef: false,
    parsed: `GitHub rulebook sources must be ${FORMAT}: owner/repo#main/1bad`,
  },
  {
    behavior: 'a GitHub source with a ref but no rulebook name is rejected',
    spec: 'owner/repo#main',
    syntaxError: `GitHub rulebook sources must be ${FORMAT}: owner/repo#main`,
    isRulebookSource: true,
    isRepositorySource: false,
    isRef: false,
    parsed: `GitHub rulebook sources must be ${FORMAT}: owner/repo#main`,
  },
  {
    behavior: 'a GitHub source with an empty ref is rejected',
    spec: 'owner/repo#/team',
    syntaxError: `GitHub rulebook sources must be ${FORMAT}: owner/repo#/team`,
    isRulebookSource: true,
    isRepositorySource: false,
    isRef: false,
    parsed: `GitHub rulebook sources must be ${FORMAT}: owner/repo#/team`,
  },
  {
    behavior: 'a ref that is not a path segment is rejected by its own message',
    spec: 'owner/repo#bad ref/team',
    syntaxError: 'GitHub rulebook refs must use valid path segments: owner/repo#bad ref/team',
    isRulebookSource: true,
    isRepositorySource: false,
    isRef: false,
    parsed: 'GitHub rulebook refs must use valid path segments: owner/repo#bad ref/team',
  },
  {
    behavior: 'a github: scheme prefix is not a supported spelling',
    spec: 'github:owner/repo#main/team',
    syntaxError: bareNameError('github:owner/repo#main/team'),
    isRulebookSource: false,
    isRepositorySource: false,
    isRef: false,
    parsed: 'Invalid rulebook source: github:owner/repo#main/team',
  },
  {
    behavior: 'a gh: shorthand is not a supported spelling',
    spec: 'gh:x',
    syntaxError: bareNameError('gh:x'),
    isRulebookSource: false,
    isRepositorySource: false,
    isRef: false,
    parsed: 'Invalid GitHub rulebook source: gh:x',
  },
  {
    behavior: 'owner/repo alone is a repository, not a rulebook source',
    spec: 'owner/repo',
    syntaxError: bareNameError('owner/repo'),
    isRulebookSource: false,
    isRepositorySource: true,
    isRef: true,
    parsed: 'Invalid GitHub rulebook source: owner/repo',
  },
  {
    behavior: 'a clone URL is neither a repository nor a rulebook source',
    spec: 'https://github.com/o/r',
    syntaxError: bareNameError('https://github.com/o/r'),
    isRulebookSource: false,
    isRepositorySource: false,
    isRef: false,
    parsed: 'Invalid GitHub rulebook source: https://github.com/o/r',
  },
];

describe('rulebook source syntax', () => {
  test.each(SPECS.map((row) => [row.behavior, row] as const))('%s', (_behavior, row) => {
    expect(getRulebookSourceSyntaxError(row.spec)).toBe(row.syntaxError);
    expect(isGitHubRulebookSource(row.spec)).toBe(row.isRulebookSource);
    expect(isGitHubRepositorySource(row.spec)).toBe(row.isRepositorySource);
    expect(isGitHubRef(row.spec)).toBe(row.isRef);
    expect(describeOutcome(() => parseGitHubSource(row.spec))).toEqual(
      typeof row.parsed === 'string'
        ? { ok: false, error: { name: 'Error', message: row.parsed } }
        : { ok: true, value: row.parsed },
    );
  });

  test.each(
    SPECS.map((row) => [row.behavior, row.spec] as const),
  )('assertBareRulebookName rejects exactly the names the local pattern rejects (%s)', (_behavior, spec) => {
    expect(describeOutcome(() => assertBareRulebookName(spec))).toEqual(
      NAME_PATTERN.test(spec)
        ? { ok: true, value: undefined }
        : { ok: false, error: { name: 'Error', message: bareNameError(spec) } },
    );
  });

  test('the vendored path a name resolves to is the path the vendored-path pattern accepts', () => {
    expect(getRepositoryRulebookPath('team-rules')).toBe(
      '.cc-safety-net/rules/team-rules/rulebook.json',
    );
    for (const row of SPECS) {
      expect(GITHUB_RULEBOOK_PATH_RE.test(getRepositoryRulebookPath(row.spec))).toBe(
        NAME_PATTERN.test(row.spec),
      );
    }
  });

  test('the vendored-path pattern captures the rulebook name', () => {
    expect(
      '.cc-safety-net/rules/team-rules/rulebook.json'.match(GITHUB_RULEBOOK_PATH_RE)?.[1],
    ).toBe('team-rules');
    expect(GITHUB_RULEBOOK_PATH_RE.flags).toBe('');
  });
});

/**
 * A wrapper the analyzer already inspects itself may never be re-declared as transparent: the
 * declaration would make the guard look through the very command it is analyzing.
 */
const WRAPPER_COMMANDS: readonly {
  readonly command: string;
  readonly reserved: boolean;
  readonly interpreter: boolean;
}[] = [
  { command: 'python', reserved: true, interpreter: true },
  { command: 'python3', reserved: true, interpreter: true },
  { command: 'python3.11', reserved: true, interpreter: true },
  { command: 'python2.7', reserved: true, interpreter: true },
  { command: '/usr/bin/python', reserved: true, interpreter: true },
  { command: 'PYTHON.EXE', reserved: true, interpreter: true },
  { command: 'Python3', reserved: true, interpreter: true },
  { command: 'node', reserved: true, interpreter: true },
  { command: 'Node', reserved: true, interpreter: true },
  { command: 'ruby', reserved: true, interpreter: true },
  { command: 'perl', reserved: true, interpreter: true },
  // `nodejs`, `perl5` and `python-config` are not the interpreter names the analyzer keys on.
  { command: 'nodejs', reserved: false, interpreter: false },
  { command: 'perl5', reserved: false, interpreter: false },
  { command: 'python-config', reserved: false, interpreter: false },
  // Awk dialects are reserved because the analyzer reads awk programs, not because they take
  // code on a `-c` flag.
  { command: 'awk', reserved: true, interpreter: false },
  { command: 'gawk', reserved: true, interpreter: false },
  { command: 'mawk', reserved: true, interpreter: false },
  { command: 'git', reserved: true, interpreter: false },
  { command: 'GIT', reserved: true, interpreter: false },
  { command: 'busybox', reserved: true, interpreter: false },
  { command: 'rm', reserved: true, interpreter: false },
  { command: 'find', reserved: true, interpreter: false },
  { command: 'xargs', reserved: true, interpreter: false },
  { command: 'parallel', reserved: true, interpreter: false },
  { command: 'bash', reserved: true, interpreter: false },
  { command: 'zsh', reserved: true, interpreter: false },
  { command: 'rtk', reserved: false, interpreter: false },
  { command: 'docker', reserved: false, interpreter: false },
  { command: '', reserved: false, interpreter: false },
];

describe('the transparent wrapper vocabulary', () => {
  test.each(
    WRAPPER_COMMANDS.map((row) => [row.command, row.reserved, row.interpreter] as const),
  )('%p is reserved=%p interpreter=%p', (command, reserved, interpreter) => {
    expect(isReservedTransparentWrapper(command)).toBe(reserved);
    expect(isInterpreterCommand(command)).toBe(interpreter);
  });

  test('an interpreter is always reserved, over the whole analyzer command corpus', () => {
    const words = corpusWords();
    expect(words.length).toBeGreaterThan(100);
    expect(
      words.filter((word) => isInterpreterCommand(word) && !isReservedTransparentWrapper(word)),
    ).toEqual([]);
  });

  test('both classifications ignore case and a directory prefix', () => {
    for (const word of corpusWords()) {
      expect(isReservedTransparentWrapper(word.toUpperCase())).toBe(
        isReservedTransparentWrapper(word),
      );
      expect(isInterpreterCommand(`/usr/local/bin/${word}`)).toBe(isInterpreterCommand(word));
    }
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

describe('rulebook acceptance limits', () => {
  for (const item of ACCEPTANCE_CASES) {
    test(item.name, () => {
      expect(isRulebookWithinAcceptanceLimits(item.rulebook)).toBe(item.expected);
    });
  }

  test('the limit table is the one the acceptance cases are written against', () => {
    expect(RULEBOOK_LIMITS).toEqual({
      maxAllowedCommands: 1_024,
      maxRules: 1_024,
      maxTests: 2_048,
      maxBlockArgsPerRule: 1_024,
      maxTotalBlockArgs: 16_384,
      maxStringCodeUnits: 1_048_576,
      maxAggregateStringCodeUnits: 4_194_304,
      maxFixtureCommandCodeUnits: 131_072,
      maxValidationErrors: 64,
    });
    expect(RULE_SOURCE_LIMIT).toBe(64);
  });

  test('the refusal messages name the limit that was exceeded', () => {
    expect(RULEBOOK_LIMIT_ERROR).toBe("Rulebook exceeds CC Safety Net's safe validation limits.");
    expect(RULE_SOURCE_LIMIT_ERROR).toBe("Rule config exceeds CC Safety Net's safe source limit.");
    expect(RULEBOOK_VALIDATION_TRUNCATED).toBe(
      'Additional rulebook validation errors were omitted.',
    );
  });
});
