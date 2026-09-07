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
import { recordPorted, rootFolds } from '../../helpers/temp-home';

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
  test('matches the shipped resolver for repositories, worktrees, submodules and symlinks', () => {
    const environment = createProcessEnvironment();
    const cwds = [
      join(root, 'main'),
      join(root, 'main', 'nested'),
      join(root, 'main', 'vendor', 'sub'),
      join(root, 'main', 'missing', 'deeper'),
      join(root, 'linked'),
      join(root, 'linked', 'inner'),
      join(root, 'plain'),
      join(root, 'via-symlink'),
      join(root, 'via-symlink', 'nested'),
      join(root, 'external'),
      join(root, 'external-gitdir'),
      join(root, 'main', '.git'),
      root,
      '',
    ];
    for (const cwd of cwds) {
      recordPorted(resolveProtectedGitMetadata(cwd, environment), rootFolds(root));
    }
    expect(resolveProtectedGitMetadata(join(root, 'plain'), environment)).toBeNull();
    const submodule = resolveProtectedGitMetadata(join(root, 'main', 'vendor', 'sub'), environment);
    expect(submodule?.markerFiles).toHaveLength(1);
    // The resolver answers with the paths it compares: canonical, and on Windows lower-cased and
    // spelled with `/`, so the fixture is spelled through `realpath` and folded the same way.
    const compared = (...parts: string[]) => {
      const path = join(realpathSync(root), ...parts);
      return process.platform === 'win32' ? path.replaceAll('\\', '/').toLowerCase() : path;
    };
    expect(submodule?.directories).toContain(compared('main', '.git', 'modules', 'vendor', 'sub'));
    const external = resolveProtectedGitMetadata(join(root, 'external'), environment);
    expect(external?.hooksDirectories).toContain(compared('hooks-outside'));
  });
});
