import { afterAll, describe, expect, test } from 'bun:test';
import { createTestEnvironment, processPathResolver } from '@/core/environment';
import type { DestructiveCommandRulePolicy } from '@/core/policy/effective-rules';
import { resolveEffectiveDestructiveCommandRules } from '@/core/policy/effective-rules';
import type { EffectiveSafetyCapabilities } from '@/core/policy/types';
import { textCommandWords } from '@/gate/analyzer/command-words';
import { analyzeGitDetailed, analyzeGitMatch, getGitWorktreeRelaxation } from '@/gate/analyzer/git';
import { createLinkedWorktreeFixture, withLinkedWorktreeFixture } from '../../helpers';
import { expectRecordedDigest } from '../../helpers/gate-differential';
import { runGit } from '../../helpers/git-worktree';
import { corpusCommands } from '../../helpers/shell-inputs';

/**
 * The Git entry point is the only analyzer module whose answer depends on the filesystem: a
 * local discard is relaxed inside a linked worktree and blocked everywhere else. The tests run
 * against one real `git worktree add` fixture, so the `worktreeFacts` seam resolves a real
 * repository.
 */

const fixture = createLinkedWorktreeFixture();

afterAll(() => {
  fixture.cleanup();
});

const GIT_ARGVS: readonly (readonly string[])[] = [
  ['git', 'status'],
  ['git', 'checkout', '--', '.'],
  ['git', 'checkout', '.'],
  ['git', 'checkout', '-f', 'main'],
  ['git', 'checkout', '-B', 'main', '--force'],
  ['git', 'checkout', '--force', '-B', 'main'],
  ['git', 'restore', '.'],
  ['git', 'restore', '--staged', '.'],
  ['git', 'restore', '--source=HEAD', '.'],
  ['git', 'reset', '--hard'],
  ['git', 'reset', '--hard', 'HEAD~1'],
  ['git', 'reset', '--merge'],
  ['git', 'reset', '--soft', 'HEAD~1'],
  ['git', 'clean', '-fd'],
  ['git', 'clean', '-f', '-f'],
  ['git', 'clean', '-ff'],
  ['git', 'clean', '--force', '--force'],
  ['git', 'clean', '-n'],
  ['git', 'switch', '-C', 'main', '--force'],
  ['git', 'switch', '--discard-changes', '-C', 'main'],
  ['git', 'switch', 'main'],
  ['git', 'stash', 'drop'],
  ['git', 'stash', 'clear'],
  ['git', 'branch', '-D', 'feature'],
  ['git', 'tag', '-d', 'v1'],
  ['git', 'push', '--force', 'origin', 'main'],
  ['git', 'push', 'origin', 'main'],
  ['git', 'pull', '--rebase'],
  ['git', 'fetch', 'origin'],
  ['git', 'clone', 'https://example.test/r.git'],
  ['git', 'ls-remote', 'origin'],
  ['git', 'submodule', 'update'],
  ['git', 'archive', '--remote=origin', 'HEAD'],
  ['git', 'archive', 'HEAD'],
  ['git', 'remote', 'update'],
  ['git', 'remote', '-v', 'update'],
  ['git', 'remote', 'show'],
  ['git', 'checkout', '--', '$FILE'],
  ['git', 'checkout', '--', '*.txt'],
  ['git', 'checkout', '--recurse-submodules', '--', '.'],
  ['git', '-c', 'submodule.recurse=true', 'checkout', '--', '.'],
  ['git', '-c', 'submodule.recurse=false', 'checkout', '--', '.'],
  ['git', '-c', 'alias.wipe=!rm -rf /', 'wipe'],
  ['git', '-c', 'alias.co=checkout', 'co', '--', '.'],
  ['git', '-c', 'core.sshCommand=touch pwned', 'fetch'],
  ['git', '-c', 'core.sshCommand=touch pwned', 'status'],
  ['git', '-C', 'sub', 'checkout', '--', '.'],
  // A resolvable -C, so the command-line config scan still runs after the global option.
  ['git', '-C', '.', '-c', 'submodule.recurse=true', 'checkout', '--', '.'],
  ['git', '-C', '.', '-c', 'submodule.recurse=false', 'checkout', '--', '.'],
  ['git', '--git-dir=.git', 'checkout', '--', '.'],
  ['git', '--', 'checkout'],
  ['git'],
  ['not-git', 'checkout', '--', '.'],
];

const ENVIRONMENTS: readonly Readonly<Record<string, string>>[] = [
  {},
  { GIT_SSH_COMMAND: 'ssh -o StrictHostKeyChecking=no' },
  { GIT_DIR: '/elsewhere/.git' },
  {
    GIT_CONFIG_COUNT: '1',
    GIT_CONFIG_KEY_0: 'alias.co',
    GIT_CONFIG_VALUE_0: 'checkout',
  },
];

const ENV_ASSIGNMENTS: readonly (ReadonlyMap<string, string> | undefined)[] = [
  undefined,
  new Map([['GIT_SSH_COMMAND', 'ssh -v']]),
  new Map([['GIT_WORK_TREE', '/elsewhere']]),
];

function capabilities(failClosed: boolean): EffectiveSafetyCapabilities {
  const state = (enabled: boolean) => ({ enabled, source: 'preset' as const, sources: ['preset'] });
  return {
    fail_closed: state(failClosed),
    paranoid_rm: state(false),
    paranoid_interpreters: state(false),
  };
}

function policyPair(
  protectionEnabled: boolean,
  overrides: Readonly<Record<string, 'on' | 'off'>>,
  failClosed: boolean,
) {
  const base = {
    destructiveCommandProtectionEnabled: protectionEnabled,
    destructiveCommandRuleOverrides: overrides,
  };
  return {
    destructiveCommandProtectionEnabled: protectionEnabled,
    effectiveDestructiveCommandRules: resolveEffectiveDestructiveCommandRules(
      base,
      capabilities(failClosed),
    ),
  } satisfies DestructiveCommandRulePolicy;
}

/** Standard, strict, master-off, and one rule turned off by name. */
const POLICIES = [
  undefined,
  policyPair(true, {}, false),
  policyPair(true, {}, true),
  policyPair(false, {}, false),
  policyPair(true, { 'git.alias-config': 'off' }, true),
] as const;

function gitCorpusArgvs(): readonly (readonly string[])[] {
  return corpusCommands()
    .filter((command) => /(^|[\s|;&(])git\s/.test(command))
    .map((command) => command.split(/\s+/).filter(Boolean));
}

describe('next/gate/analyzer/git versus src/analyzer/git', () => {
  // Spawns git once per environment row, so the default per-test timeout is too short.
  test('every Git command decides the same in and out of a linked worktree', () => {
    const recorded: [string, unknown][] = [];
    const rows = [...GIT_ARGVS, ...gitCorpusArgvs()];
    let matches = 0;
    let relaxations = 0;

    for (const variables of ENVIRONMENTS) {
      const env = new Map(Object.entries(variables));
      const environment = createTestEnvironment({
        env,
        home: fixture.rootDir,
        paths: processPathResolver,
      });

      for (const cwd of [fixture.linkedWorktree, fixture.mainWorktree, fixture.rootDir]) {
        for (const worktreeMode of [true, false]) {
          for (const envAssignments of ENV_ASSIGNMENTS) {
            for (const policy of POLICIES) {
              for (const tokens of rows) {
                const shared = { cwd, envAssignments, worktreeMode, dynamicArguments: false };
                const match = analyzeGitMatch(textCommandWords(tokens), {
                  ...shared,
                  environment,
                  policy,
                });

                const detailed = analyzeGitDetailed(textCommandWords(tokens), {
                  ...shared,
                  environment,
                  policy,
                });
                expect(detailed.match).toStrictEqual(match);

                const relaxation = getGitWorktreeRelaxation(tokens, {
                  ...shared,
                  environment,
                  policy,
                });
                recorded.push([tokens.join(' '), { match, detailed, relaxation }]);

                if (match) matches++;
                if (detailed.relaxation) relaxations++;
              }
            }
          }
        }
      }
    }

    expect(matches).toBeGreaterThan(100);
    expect(relaxations).toBeGreaterThan(10);
    expectRecordedDigest('analyzer-git-index/every-git-command', recorded, fixture.rootDir);
  }, 60_000);

  test('dynamic arguments withhold the relaxation on both sides', () => {
    const env = new Map<string, string>();
    const environment = createTestEnvironment({
      env,
      home: fixture.rootDir,
      paths: processPathResolver,
    });
    const recorded: [string, unknown][] = [];
    const shared = { cwd: fixture.linkedWorktree, worktreeMode: true };
    let relaxed = 0;

    for (const tokens of GIT_ARGVS) {
      for (const dynamicArguments of [true, false]) {
        const detailed = analyzeGitDetailed(textCommandWords(tokens), {
          ...shared,
          dynamicArguments,
          environment,
        });
        recorded.push([`${tokens.join(' ')} ${dynamicArguments}`, detailed]);
        if (detailed.relaxation) {
          relaxed++;
          expect(dynamicArguments).toBeFalse();
        }
      }
    }

    expect(relaxed).toBeGreaterThan(3);
    expectRecordedDigest('analyzer-git-index/dynamic-arguments', recorded, fixture.rootDir);
  });

  // The `-c` rows above stop at the command-line scan; only a repository that sets
  // `submodule.recurse` itself reaches the fact the environment seam reads.
  test('submodule.recurse in the worktree config withholds the relaxation on both sides', async () => {
    await withLinkedWorktreeFixture((configured) => {
      runGit(configured.linkedWorktree, ['config', 'submodule.recurse', 'true']);
      const env = new Map<string, string>();
      const shared = {
        cwd: configured.linkedWorktree,
        worktreeMode: true,
        dynamicArguments: false,
      };
      const tokens = ['git', 'checkout', '--', '.'];
      const detailed = analyzeGitDetailed(textCommandWords(tokens), {
        ...shared,
        environment: createTestEnvironment({
          env,
          home: configured.rootDir,
          paths: processPathResolver,
        }),
      });
      expectRecordedDigest(
        'analyzer-git-index/configured-submodule-recurse',
        [[tokens.join(' '), detailed]],
        configured.rootDir,
      );
      expect(detailed.relaxation).toBeNull();
      expect(detailed.match?.id).toBe('git.checkout-double-dash');
    });
  });
});
