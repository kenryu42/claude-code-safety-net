import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { mkdirSync, mkdtempSync, realpathSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { processPathResolver } from '@/core/environment';
import { GIT_GLOBAL_OPTS_WITH_VALUE } from '@/core/rules/constants';
import { getGitExecutionContext, hasGitContextEnvOverride } from '@/gate/analyzer/git/worktree';
import { expectRecordedDigest } from '../../helpers/gate-differential';
import { normalize } from '../../helpers/temp-home';

/**
 * Worktree relaxation only applies to the directory Git would actually run in, so the ported
 * reader has to land on the same directory for every `-C`, `--git-dir` and `--work-tree` form.
 */

let root = '';
const paths = { repo: '', sub: '', deep: '', outside: '' };

beforeAll(() => {
  root = realpathSync(mkdtempSync(join(tmpdir(), 'next-git-exec-')));
  paths.repo = join(root, 'repo');
  paths.sub = join(paths.repo, 'sub');
  paths.deep = join(paths.sub, 'deep');
  paths.outside = join(root, 'outside');
  mkdirSync(join(paths.repo, '.git'), { recursive: true });
  mkdirSync(paths.deep, { recursive: true });
  mkdirSync(paths.outside, { recursive: true });
  writeFileSync(join(paths.repo, 'file.txt'), 'x');
  symlinkSync(paths.sub, join(paths.repo, 'link'));
});

afterAll(() => {
  rmSync(root, { recursive: true, force: true });
});

const TOKEN_ROWS: readonly (readonly string[])[] = [
  ['git', 'status'],
  ['git'],
  ['git', '-C', 'sub', 'status'],
  ['git', '-C', 'sub', '-C', 'deep', 'status'],
  ['git', '-Csub', 'status'],
  ['git', '-C', 'link', 'status'],
  ['git', '-C', 'missing', 'status'],
  ['git', '-C', 'file.txt', 'status'],
  ['git', '-C', '..', 'status'],
  ['git', '-C', ''],
  ['git', '-C'],
  ['git', '-C', 'sub', '-C', '..', 'status'],
  ['git', '--git-dir', '.git', 'status'],
  ['git', '--git-dir=.git', 'status'],
  ['git', '--work-tree', '.', 'status'],
  ['git', '--work-tree=.', 'status'],
  ['git', '-C', 'sub', '--git-dir', 'x', 'status'],
  ['git', '--git-dir', 'x', '-C', 'sub', 'status'],
  ['git', '-c', 'core.hooksPath=/tmp/hooks', 'status'],
  ['git', '-ccore.hooksPath=/tmp/hooks', 'status'],
  ['git', '--namespace', 'ns', '-C', 'sub', 'status'],
  ['git', '--super-prefix', 'p/', '-C', 'sub', 'status'],
  ['git', '--config-env', 'K=V', '-C', 'sub', 'status'],
  ['git', '--no-pager', '-C', 'sub', 'status'],
  ['git', '--', '-C', 'sub'],
  ['git', 'status', '-C', 'sub'],
  ['git', '-C', 'sub', '--', '-C', 'deep'],
  ['git', '-C', 'sub/deep', 'status'],
  ['git', '-C', 'sub', '-C', 'deep', '-C', '../..', 'status'],
];

function cwdRows(): (string | undefined)[] {
  return [
    undefined,
    '',
    root,
    paths.repo,
    paths.sub,
    paths.outside,
    join(paths.repo, 'link'),
    join(paths.repo, 'file.txt'),
    join(paths.repo, 'missing'),
    '.',
  ];
}

const ENV_ROWS: readonly (readonly [string, string])[][] = [
  [],
  [['PATH', '/usr/bin']],
  [['GIT_DIR', '/tmp/other.git']],
  [['GIT_WORK_TREE', '/tmp/tree']],
  [['GIT_COMMON_DIR', '/tmp/common']],
  [['GIT_INDEX_FILE', '/tmp/index']],
  [['GIT_CONFIG_COUNT', '1']],
  [['git_dir', '/tmp/other.git']],
];

describe('next/gate/analyzer/git/worktree against src/analyzer/git/worktree', () => {
  test('carries the same global-option table', () => {
    expectRecordedDigest(
      'analyzer-git-worktree/global-options',
      [['options', [...GIT_GLOBAL_OPTS_WITH_VALUE].sort()]],
      root,
    );
  });

  test('resolves the same execution directory for every -C and context form', () => {
    const recorded: [string, unknown][] = [];
    for (const cwd of cwdRows()) {
      for (const tokens of TOKEN_ROWS) {
        const resolved = {
          cwd,
          tokens,
          context: getGitExecutionContext(tokens, cwd, processPathResolver),
        };
        // The `undefined`, `''` and `'.'` cwd rows resolve against the checkout, which the
        // digest's own `root` fold does not reach; `-C ..` from one of them lands on its parent.
        // A `-C ..` taken from the fixture root instead lands on the temp directory the host
        // chose, which no fold can hide — folding it would rewrite the literal `/tmp` the tables
        // spell — so that row is compared like every other and left out of the record.
        if (cwd !== root || !tokens.includes('..'))
          recorded.push([
            tokens.join(' '),
            normalize(resolved, [
              [process.cwd(), '<cwd>'],
              [dirname(process.cwd()), '<cwd>/..'],
            ]),
          ]);
      }
    }
    expectRecordedDigest('analyzer-git-worktree/execution-context', recorded, root);
  });

  test('the table reaches a resolved directory and an explicit context', () => {
    const contexts = TOKEN_ROWS.map((tokens) =>
      getGitExecutionContext(tokens, paths.repo, processPathResolver),
    );
    expect(contexts.filter((context) => context.gitCwd === paths.sub).length).toBeGreaterThan(2);
    expect(contexts.filter((context) => context.gitCwd === null).length).toBeGreaterThan(2);
    expect(contexts.filter((context) => context.hasExplicitGitContext).length).toBeGreaterThan(3);
  });

  test('reads the same Git context environment overrides', () => {
    const recorded: [string, unknown][] = [];
    for (const env of ENV_ROWS) {
      for (const assignments of [...ENV_ROWS, undefined]) {
        const envMap = new Map(env);
        const assignmentMap = assignments === undefined ? undefined : new Map(assignments);
        const read = {
          env,
          assignments,
          override: hasGitContextEnvOverride(envMap, assignmentMap),
        };
        recorded.push([`${JSON.stringify(env)} ${JSON.stringify(assignments)}`, read]);
      }
    }
    expectRecordedDigest('analyzer-git-worktree/env-overrides', recorded, root);
  });
});
