import { afterAll, describe, expect, test } from 'bun:test';
import { resolveGitCommandLineAliases } from '@next/gate/analyzer/git/parse';
import {
  analyzeGitRule,
  GIT_RULE_SUBCOMMANDS,
  matchesGitLongOption,
} from '@next/gate/analyzer/git/rules';
import { getGitWorktreeRelaxationForMatch } from '@next/gate/analyzer/git/worktree-relaxation';
import { resolveGitCommandLineAliases as shippedResolveAliases } from '@/analyzer/git/parse';
import {
  analyzeGitRule as shippedAnalyzeGitRule,
  matchesGitLongOption as shippedMatchesLongOption,
  GIT_RULE_SUBCOMMANDS as shippedSubcommands,
} from '@/analyzer/git/rules';
import { getGitWorktreeRelaxationForMatch as shippedRelaxationForMatch } from '@/analyzer/git/worktree-relaxation';
import { createLinkedWorktreeFixture } from '../../../helpers';
import { pairedEnvironments } from '../../core/differential-inputs';
import { expectRecordedDigest } from '../../helpers/gate-differential';
import { corpusCommands } from '../../helpers/shell-inputs';

/**
 * Every Git command the two corpora carry plus a table of the global-option, alias and
 * short-option forms the rule dispatch has to walk before it sees a subcommand.
 */

const GIT_COMMAND_LINES: readonly string[] = [
  'git',
  'git --',
  'git -- checkout',
  'git -- -x',
  'git status',
  'not-git checkout -- .',
  '/usr/bin/git checkout -- .',
  'git.exe reset --hard',
  'git -C /tmp clean -ffd',
  'git -C/tmp clean -fd',
  'git -C',
  'git --git-dir /tmp/x checkout -- .',
  'git --git-dir=/tmp/x checkout -- .',
  'git --work-tree . restore .',
  'git --namespace ns reset --hard',
  'git --super-prefix p/ checkout -f',
  'git -c core.hooksPath=/tmp/hooks status',
  'git -c alias.co=checkout co -- .',
  'git -calias.co=checkout -f co',
  'git -c alias.co=!sh -c "rm -rf /" co',
  'git -c alias.co= co',
  'git -c alias.=checkout co',
  'git -c alias.a=b -c alias.b=a a',
  'git -c alias.co=checkout -c alias.sw=switch co --force',
  'git --config-env alias.co=CO co',
  'git --config-env=alias.co=CO co',
  'git --config-env=alias.co CO co',
  'git checkout -- .',
  'git checkout HEAD -- src/file.ts',
  'git checkout --force main',
  'git checkout -f main',
  'git checkout -bf feature',
  'git checkout -b feature',
  'git checkout -B feature',
  'git checkout --orphan fresh',
  'git checkout --pathspec-from-file=list',
  'git checkout --pathspec-from-file list',
  'git checkout --ours one two',
  'git checkout --unknown-option one two',
  'git checkout --conflict=merge one two',
  'git checkout --recurse-submodules on-demand one two',
  'git checkout --recurse-submodules one two',
  'git checkout --track direct one two',
  'git checkout -t inherit one two',
  // One positional each, so the optional mode word decides whether the count reaches two.
  'git checkout --recurse-submodules on-demand one',
  'git checkout --recurse-submodules bogus one',
  'git checkout --track direct one',
  'git checkout -t inherit one',
  'git checkout -U 3 one two',
  'git checkout main',
  'git checkout main other',
  'git switch --discard-changes main',
  'git switch --force main',
  'git switch -f main',
  'git switch -C main',
  'git switch --force-create main',
  'git switch --force-c main',
  'git restore .',
  'git restore --staged .',
  'git restore --worktree .',
  'git restore --source HEAD --staged --worktree .',
  'git restore -SW .',
  'git restore -p',
  'git restore --patch --staged',
  'git restore -h',
  'git restore --pathspec-from-file=list',
  'git restore -s HEAD .',
  'git reset --hard',
  'git reset --hard HEAD~1',
  'git reset --merge',
  'git reset --har',
  'git reset --hard -- .',
  'git clean -fd',
  'git clean -n -fd',
  'git clean --dry-run --force',
  'git clean -ffd',
  'git clean --force --force',
  'git rm --force file',
  'git rm -f file',
  'git rm --cached --force file',
  'git rm --force --dry-run file',
  'git rm --no-force -f file',
  'git push --force origin main',
  'git push -f origin main',
  'git push --mirror origin',
  'git push --delete origin main',
  'git push -d origin main',
  'git push origin +main',
  'git push origin :main',
  'git push origin -- :main',
  'git push origin main:+refs/heads/main',
  'git branch -D feature',
  'git branch -d feature',
  'git branch --delete --force feature',
  'git stash drop',
  'git stash clear',
  'git stash list',
  'git worktree remove --force wt',
  'git worktree remove wt',
  'git worktree list',
  'git rebase --abort',
  'git rebase --continue',
  'git merge --abort',
  'git tag -d v1',
  'git tag --delete v1',
  'git reflog delete HEAD@{0}',
  'git reflog show',
  'git submodule update --init',
];

const GIT_ENV_CASES: readonly {
  readonly label: string;
  readonly env: ReadonlyMap<string, string>;
  readonly assignments?: ReadonlyMap<string, string>;
}[] = [
  { label: 'empty', env: new Map() },
  {
    label: 'config count alias',
    env: new Map([
      ['GIT_CONFIG_COUNT', '1'],
      ['GIT_CONFIG_KEY_0', 'alias.co'],
      ['GIT_CONFIG_VALUE_0', 'checkout --force'],
    ]),
  },
  {
    label: 'config count over the cap',
    env: new Map([['GIT_CONFIG_COUNT', '1025']]),
  },
  {
    label: 'config count with a missing value',
    env: new Map([
      ['GIT_CONFIG_COUNT', '2'],
      ['GIT_CONFIG_KEY_0', 'alias.co'],
      ['GIT_CONFIG_VALUE_0', 'checkout'],
      ['GIT_CONFIG_KEY_1', 'alias.sw'],
    ]),
  },
  { label: 'config parameters', env: new Map([['GIT_CONFIG_PARAMETERS', "'alias.co=checkout'"]]) },
  { label: 'unparseable parameters', env: new Map([['GIT_CONFIG_PARAMETERS', "'unterminated"]]) },
  {
    label: 'assignment shadows the inherited value',
    env: new Map([['CO', 'status']]),
    assignments: new Map([['CO', 'checkout --force']]),
  },
];

function argvOf(line: string): string[] {
  return line.split(/\s+/).filter((word) => word.length > 0);
}

function gitArgvs(): readonly string[][] {
  const fromCorpus = corpusCommands()
    .map(argvOf)
    .filter((argv) => argv.some((token) => token.includes('git')));
  return [[], ...GIT_COMMAND_LINES.map(argvOf), ...fromCorpus];
}

describe('git rule dispatch', () => {
  test('the dispatch table is the shipped table', () => {
    expect(GIT_RULE_SUBCOMMANDS).toStrictEqual(shippedSubcommands);
    expectRecordedDigest('analyzer-git-rules/subcommands', [['subcommands', GIT_RULE_SUBCOMMANDS]]);
  });

  test('analyzeGitRule answers with the shipped rules', () => {
    const recorded: [string, unknown][] = [];
    for (const argv of gitArgvs()) {
      const rule = analyzeGitRule(argv);
      expect(rule).toStrictEqual(shippedAnalyzeGitRule(argv));
      recorded.push([argv.join(' '), rule]);
    }
    expectRecordedDigest('analyzer-git-rules/rules', recorded);
  });

  test('matchesGitLongOption answers with the shipped abbreviation test', () => {
    const recorded: [string, unknown][] = [];
    const options = ['--force', '--delete', '--hard', '--abort', '--discard-changes'];
    for (const argv of gitArgvs()) {
      for (const token of argv) {
        for (const option of options) {
          const matches = matchesGitLongOption(token, option);
          expect(matches).toBe(shippedMatchesLongOption(token, option));
          recorded.push([`${token} ${option}`, matches]);
        }
      }
    }
    expectRecordedDigest('analyzer-git-rules/long-options', recorded);
  });
});

describe('git alias resolution', () => {
  test('resolveGitCommandLineAliases agrees for every command and environment', () => {
    const recorded: [string, unknown][] = [];
    for (const argv of gitArgvs()) {
      for (const environment of GIT_ENV_CASES) {
        const resolved = resolveGitCommandLineAliases(
          argv,
          environment.env,
          environment.assignments,
        );
        expect(resolved).toStrictEqual(
          shippedResolveAliases(argv, environment.env, environment.assignments),
        );
        recorded.push([argv.join(' '), resolved]);
      }
    }
    expectRecordedDigest('analyzer-git-rules/alias-resolution', recorded);
  });

  test('an expanded alias reaches the rules through the shipped tokens', () => {
    const aliased = argvOf('git -c alias.co=checkout co --force main');
    const resolution = resolveGitCommandLineAliases(aliased, new Map());
    expect(resolution.expanded).toBeTrue();
    const rule = analyzeGitRule(resolution.tokens);
    expect(rule).toStrictEqual(
      shippedAnalyzeGitRule(shippedResolveAliases(aliased, new Map()).tokens),
    );
    expectRecordedDigest('analyzer-git-rules/expanded-alias', [[aliased.join(' '), rule]]);
  });
});

describe('worktree relaxation', () => {
  const fixture = createLinkedWorktreeFixture();

  afterAll(() => {
    fixture.cleanup();
  });

  const RELAXATION_COMMANDS: readonly string[] = [
    'git checkout -- .',
    'git checkout -- src/file.ts',
    'git checkout -f main',
    'git checkout -f -B main origin/main',
    'git restore .',
    'git restore --worktree .',
    'git clean -fd',
    'git clean -ffd',
    'git clean --force --force -d',
    'git switch --force main',
    'git switch -f -C main',
    'git reset --hard',
    'git reset --hard HEAD~1',
    'git push --force origin main',
    'git checkout -- "$FILE"',
    'git checkout -- *.ts',
    'git checkout --recurse-submodules -- .',
    'git -c submodule.recurse=true checkout -- .',
    'git -c submodule.recurse=false checkout -- .',
    'git -c include.path=/tmp/evil checkout -- .',
    'git --config-env submodule.recurse=RECURSE checkout -- .',
    'git --git-dir=.git checkout -- .',
    'git -C . checkout -- .',
    'git -C .. checkout -- .',
    'git -C missing checkout -- .',
  ];

  const RELAXATION_ENVIRONMENTS: readonly {
    readonly variables: Record<string, string>;
    readonly assignments?: ReadonlyMap<string, string>;
  }[] = [
    { variables: {} },
    { variables: { RECURSE: 'true' } },
    { variables: { RECURSE: 'false' } },
    { variables: { GIT_DIR: '/tmp/elsewhere' } },
    { variables: { GIT_CONFIG_PARAMETERS: "'submodule.recurse=true'" } },
    { variables: { GIT_CONFIG_COUNT: '1025' } },
    {
      variables: {
        GIT_CONFIG_COUNT: '1',
        GIT_CONFIG_KEY_0: 'submodule.recurse',
        GIT_CONFIG_VALUE_0: 'true',
      },
    },
    { variables: {}, assignments: new Map([['GIT_WORK_TREE', '/tmp/elsewhere']]) },
    { variables: {}, assignments: new Map([['HOME', '/tmp/elsewhere']]) },
  ];

  test('the relaxation decision matches the shipped one through the environment seam', () => {
    const recorded: [string, unknown][] = [];
    for (const line of RELAXATION_COMMANDS) {
      const argv = argvOf(line);
      const match = analyzeGitRule(argv);
      const shippedMatch = shippedAnalyzeGitRule(argv);
      expect(match).toStrictEqual(shippedMatch);
      recorded.push([line, match]);
      if (!match || !shippedMatch) continue;
      for (const environment of RELAXATION_ENVIRONMENTS) {
        const environments = pairedEnvironments(environment.variables, fixture.rootDir);
        for (const cwd of [fixture.linkedWorktree, fixture.mainWorktree, fixture.rootDir]) {
          for (const worktreeMode of [true, false]) {
            for (const dynamicArguments of [undefined, true]) {
              const relaxation = getGitWorktreeRelaxationForMatch(argv, match, {
                environment: environments.next,
                cwd,
                envAssignments: environment.assignments,
                worktreeMode,
                dynamicArguments,
              });
              expect(relaxation).toStrictEqual(
                shippedRelaxationForMatch(argv, shippedMatch, {
                  env: environments.shipped.env,
                  cwd,
                  envAssignments: environment.assignments,
                  worktreeMode,
                  dynamicArguments,
                }),
              );
              recorded.push([
                `${line} ${JSON.stringify(environment.variables)} ${worktreeMode} ${dynamicArguments}`,
                relaxation,
              ]);
            }
          }
        }
      }
    }
    expectRecordedDigest('analyzer-git-rules/worktree-relaxation', recorded, fixture.rootDir);
  });

  test('a plain local discard in the linked worktree is relaxed on both sides', () => {
    const argv = argvOf('git checkout -- .');
    const match = analyzeGitRule(argv);
    if (!match) throw new Error('expected a git.checkout-double-dash match');
    const environments = pairedEnvironments({}, fixture.rootDir);
    const relaxation = getGitWorktreeRelaxationForMatch(argv, match, {
      environment: environments.next,
      cwd: fixture.linkedWorktree,
      worktreeMode: true,
    });
    expect(relaxation?.originalReason).toBe(match.reason);
    expect(relaxation?.gitCwd).toBeString();
  });
});
