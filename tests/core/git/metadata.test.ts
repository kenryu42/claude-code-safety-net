import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import {
  mkdirSync,
  mkdtempSync,
  realpathSync,
  renameSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createProcessEnvironment } from '@/core/environment';
import { resolveProtectedGitMetadata } from '@/core/git/metadata';
import { runGit } from '../../helpers/git-worktree';

const IDENTITY = ['-c', 'user.name=Next Test', '-c', 'user.email=next@example.test'];

let root = '';

function commitAll(repository: string, message: string): void {
  runGit(repository, ['add', '-A']);
  runGit(repository, [...IDENTITY, '-c', 'commit.gpgsign=false', 'commit', '-q', '-m', message]);
}

beforeAll(() => {
  root = mkdtempSync(join(tmpdir(), 'next-git-metadata-'));

  const submodule = join(root, 'sub');
  mkdirSync(submodule);
  runGit(submodule, ['init', '-q']);
  writeFileSync(join(submodule, 'lib.txt'), 'lib\n');
  commitAll(submodule, 'lib');

  const main = join(root, 'main');
  mkdirSync(main);
  runGit(main, ['init', '-q']);
  writeFileSync(join(main, 'file.txt'), 'main\n');
  commitAll(main, 'main');
  runGit(main, [
    '-c',
    'protocol.file.allow=always',
    'submodule',
    'add',
    '-q',
    '../sub',
    'vendor/sub',
  ]);
  commitAll(main, 'add submodule');
  mkdirSync(join(main, 'nested'));
  runGit(main, ['worktree', 'add', '-q', '-b', 'feature/linked', join(root, 'linked')]);
  mkdirSync(join(root, 'linked', 'inner'));

  mkdirSync(join(root, 'plain'));
  symlinkSync(main, join(root, 'via-symlink'));

  const external = join(root, 'external');
  mkdirSync(external);
  runGit(external, ['init', '-q']);
  renameSync(join(external, '.git'), join(root, 'external-gitdir'));
  symlinkSync(join(root, 'external-gitdir'), join(external, '.git'));
  mkdirSync(join(root, 'hooks-outside'));
  rmSync(join(root, 'external-gitdir', 'hooks'), { recursive: true, force: true });
  symlinkSync(join(root, 'hooks-outside'), join(root, 'external-gitdir', 'hooks'));
});

afterAll(() => {
  rmSync(root, { recursive: true, force: true });
});

describe('protected git metadata', () => {
  /**
   * The resolver answers with the paths it compares: canonical, and on Windows lower-cased and
   * spelled with `/`, so every expected path is spelled through `realpath` and folded the same way.
   */
  const compared = (...parts: string[]) => {
    const path = join(realpathSync(root), ...parts);
    return process.platform === 'win32' ? path.replaceAll('\\', '/').toLowerCase() : path;
  };

  /** The repository at `main`, whichever directory inside it the call was made from. */
  const mainRepository = () => ({
    directories: [compared('main', '.git')],
    entries: [compared('main', '.git')],
    hooksDirectories: [compared('main', '.git', 'hooks')],
    markerFiles: [],
  });

  /** A linked worktree protects its own git directory and the common one behind it. */
  const linkedWorktree = () => ({
    directories: [compared('main', '.git', 'worktrees', 'linked'), compared('main', '.git')],
    entries: [compared('linked', '.git')],
    hooksDirectories: [
      compared('main', '.git', 'worktrees', 'linked', 'hooks'),
      compared('main', '.git', 'hooks'),
    ],
    // The `.git` of a linked worktree is a file naming those directories, so it is protected too.
    markerFiles: [compared('linked', '.git')],
  });

  const ROWS = [
    {
      name: 'the working tree of a repository',
      cwd: () => join(root, 'main'),
      expected: mainRepository,
    },
    {
      name: 'a directory under the working tree',
      cwd: () => join(root, 'main', 'nested'),
      expected: mainRepository,
    },
    {
      name: 'a submodule checkout',
      cwd: () => join(root, 'main', 'vendor', 'sub'),
      // A submodule keeps its git directory in the superproject and its `.git` is a file naming it.
      expected: () => ({
        directories: [compared('main', '.git', 'modules', 'vendor', 'sub')],
        entries: [compared('main', 'vendor', 'sub', '.git')],
        hooksDirectories: [compared('main', '.git', 'modules', 'vendor', 'sub', 'hooks')],
        markerFiles: [compared('main', 'vendor', 'sub', '.git')],
      }),
    },
    {
      name: 'a path under the working tree that does not exist',
      cwd: () => join(root, 'main', 'missing', 'deeper'),
      expected: mainRepository,
    },
    { name: 'a linked worktree', cwd: () => join(root, 'linked'), expected: linkedWorktree },
    {
      name: 'a directory under a linked worktree',
      cwd: () => join(root, 'linked', 'inner'),
      expected: linkedWorktree,
    },
    {
      name: 'a directory in no repository',
      cwd: () => join(root, 'plain'),
      expected: () => null,
    },
    {
      name: 'a working tree reached through a symlink',
      cwd: () => join(root, 'via-symlink'),
      expected: mainRepository,
    },
    {
      name: 'a directory under a symlinked working tree',
      cwd: () => join(root, 'via-symlink', 'nested'),
      expected: mainRepository,
    },
    {
      name: 'a working tree whose git directory is a symlink out of it',
      cwd: () => join(root, 'external'),
      // Both spellings of the git directory are protected, and so is the directory its `hooks`
      // link points at — otherwise a write through the link would install a hook unnoticed.
      expected: () => ({
        directories: [compared('external', '.git'), compared('external-gitdir')],
        entries: [compared('external-gitdir')],
        hooksDirectories: [
          compared('external', '.git', 'hooks'),
          compared('hooks-outside'),
          compared('external-gitdir', 'hooks'),
        ],
        markerFiles: [],
      }),
    },
    {
      // A git directory with no working tree beside it is not a repository to enter.
      name: 'a git directory standing on its own',
      cwd: () => join(root, 'external-gitdir'),
      expected: () => null,
    },
    {
      name: 'the git directory inside a working tree',
      cwd: () => join(root, 'main', '.git'),
      expected: mainRepository,
    },
    { name: 'the directory the fixtures sit in', cwd: () => root, expected: () => null },
    { name: 'no working directory at all', cwd: () => '', expected: () => null },
  ];

  test.each(ROWS)('$name', (row) => {
    expect(resolveProtectedGitMetadata(row.cwd(), createProcessEnvironment())).toEqual(
      row.expected(),
    );
  });
});
