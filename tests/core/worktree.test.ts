import { describe, expect, test } from 'bun:test';
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, isAbsolute, join, resolve } from 'node:path';
import {
  getGitExecutionContext,
  hasGitContextEnvOverride,
  isLinkedWorktree,
  normalizePathForComparison,
} from '@/core/worktree';
import {
  createLinkedWorktreeFixture,
  createSubmoduleLikeGitFileFixture,
  withEnv,
} from '../helpers.ts';

function getLinkedGitDir(worktree: string): string {
  const dotGitPath = join(worktree, '.git');
  const firstLine = readFileSync(dotGitPath, 'utf-8').split(/\r?\n/, 1)[0] ?? '';
  const rawGitDir = firstLine.slice('gitdir:'.length).trim();
  return isAbsolute(rawGitDir) ? rawGitDir : resolve(dirname(dotGitPath), rawGitDir);
}

describe('worktree git execution context', () => {
  test('handles missing and invalid cwd', () => {
    expect(getGitExecutionContext(['git', 'status'], undefined)).toEqual({
      gitCwd: null,
      hasExplicitGitContext: false,
    });
    expect(getGitExecutionContext(['git', 'status'], '/path/that/does/not/exist')).toEqual({
      gitCwd: null,
      hasExplicitGitContext: false,
    });
  });

  test('resolves separate and attached git -C options in order', () => {
    const fixture = createLinkedWorktreeFixture();
    try {
      expect(
        getGitExecutionContext(
          ['git', '-C', fixture.mainWorktree, '-C', '../linked', 'status'],
          fixture.rootDir,
        ),
      ).toEqual({
        gitCwd: realpathSync(fixture.linkedWorktree),
        hasExplicitGitContext: false,
      });

      expect(
        getGitExecutionContext(
          ['git', `-C${fixture.mainWorktree}`, '-C../linked', 'status'],
          fixture.rootDir,
        ),
      ).toEqual({
        gitCwd: realpathSync(fixture.linkedWorktree),
        hasExplicitGitContext: false,
      });
    } finally {
      fixture.cleanup();
    }
  });

  test.skipIf(process.platform !== 'win32')(
    'resolves git -C targets with Windows separators',
    () => {
      const fixture = createLinkedWorktreeFixture();
      try {
        expect(
          getGitExecutionContext(
            ['git', '-C', fixture.mainWorktree, '-C', '..\\linked', 'status'],
            fixture.rootDir,
          ),
        ).toEqual({
          gitCwd: realpathSync(fixture.linkedWorktree),
          hasExplicitGitContext: false,
        });
      } finally {
        fixture.cleanup();
      }
    },
  );

  test('resolves git -C targets with physical chdir semantics', () => {
    const fixture = createLinkedWorktreeFixture();
    const mainSubdir = join(fixture.mainWorktree, 'subdir');
    const symlinkedMainSubdir = join(fixture.linkedWorktree, 'link');
    mkdirSync(mainSubdir);
    symlinkSync(mainSubdir, symlinkedMainSubdir, 'dir');
    try {
      expect(
        getGitExecutionContext(['git', '-C', 'link/..', 'status'], fixture.linkedWorktree),
      ).toEqual({
        gitCwd: realpathSync(fixture.mainWorktree),
        hasExplicitGitContext: false,
      });
    } finally {
      fixture.cleanup();
    }
  });

  test('resolves git -C targets from a physical starting cwd', () => {
    const fixture = createLinkedWorktreeFixture();
    const mainSubdir = join(fixture.mainWorktree, 'subdir');
    const symlinkedMainSubdir = join(fixture.linkedWorktree, 'main-subdir-link');
    mkdirSync(mainSubdir);
    symlinkSync(mainSubdir, symlinkedMainSubdir, 'dir');
    try {
      expect(getGitExecutionContext(['git', '-C', '..', 'status'], symlinkedMainSubdir)).toEqual({
        gitCwd: realpathSync(fixture.mainWorktree),
        hasExplicitGitContext: false,
      });
    } finally {
      fixture.cleanup();
    }
  });

  test('fails closed for missing or unresolved git -C targets', () => {
    const fixture = createLinkedWorktreeFixture();
    try {
      expect(getGitExecutionContext(['git', '-C'], fixture.rootDir).gitCwd).toBeNull();
      expect(
        getGitExecutionContext(['git', `-C${join(fixture.rootDir, 'missing')}`], fixture.rootDir)
          .gitCwd,
      ).toBeNull();
    } finally {
      fixture.cleanup();
    }
  });

  test('detects explicit git context overrides in arguments', () => {
    const fixture = createLinkedWorktreeFixture();
    try {
      expect(
        getGitExecutionContext(['git', '--git-dir', '.git', 'status'], fixture.linkedWorktree)
          .hasExplicitGitContext,
      ).toBe(true);
      expect(
        getGitExecutionContext(['git', '--work-tree=.', 'status'], fixture.linkedWorktree)
          .hasExplicitGitContext,
      ).toBe(true);
    } finally {
      fixture.cleanup();
    }
  });

  test('skips other git global options before the subcommand', () => {
    const fixture = createLinkedWorktreeFixture();
    try {
      expect(
        getGitExecutionContext(
          ['git', '-c', 'foo=bar', '--namespace', 'ns', '-cfoo=baz', '--no-pager', 'status'],
          fixture.linkedWorktree,
        ),
      ).toEqual({
        gitCwd: realpathSync(fixture.linkedWorktree),
        hasExplicitGitContext: false,
      });
    } finally {
      fixture.cleanup();
    }
  });
});

describe('worktree env context overrides', () => {
  test('detects command scoped and process scoped git env overrides', () => {
    expect(hasGitContextEnvOverride(new Map([['GIT_DIR', '.git']]))).toBe(true);
    expect(hasGitContextEnvOverride(new Map([['OTHER', '1']]))).toBe(false);

    withEnv({ GIT_WORK_TREE: '.' }, () => {
      expect(hasGitContextEnvOverride()).toBe(true);
    });
  });
});

describe('linked worktree detection', () => {
  test('normalizes Windows native realpath prefixes for comparison', () => {
    expect(normalizePathForComparison('\\\\?\\C:\\Temp\\Linked\\.git\\')).toBe(
      process.platform === 'win32' ? 'c:/temp/linked/.git' : 'C:/Temp/Linked/.git',
    );
    expect(normalizePathForComparison('\\\\?\\UNC\\server\\share\\linked\\.git')).toBe(
      '//server/share/linked/.git',
    );
  });

  test('detects linked worktrees and symlinked directories inside them', () => {
    const fixture = createLinkedWorktreeFixture();
    const nested = join(fixture.linkedWorktree, 'nested');
    const symlinkedCwd = join(fixture.rootDir, 'nested-link');
    mkdirSync(nested);
    symlinkSync(nested, symlinkedCwd, 'dir');
    try {
      expect(isLinkedWorktree(fixture.linkedWorktree)).toBe(true);
      expect(isLinkedWorktree(symlinkedCwd)).toBe(true);
    } finally {
      fixture.cleanup();
    }
  });

  test('rejects main worktrees, non-repos, and submodule-like git files', () => {
    const fixture = createLinkedWorktreeFixture();
    const fakeSubmodule = createSubmoduleLikeGitFileFixture();
    const tempDir = mkdtempSync(join(tmpdir(), 'safety-net-worktree-unit-'));
    try {
      expect(isLinkedWorktree(fixture.mainWorktree)).toBe(false);
      expect(isLinkedWorktree(tempDir)).toBe(false);
      expect(isLinkedWorktree(fakeSubmodule.cwd)).toBe(false);
      expect(isLinkedWorktree(join(tempDir, 'missing'))).toBe(false);
    } finally {
      fixture.cleanup();
      fakeSubmodule.cleanup();
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  test('rejects malformed git files', () => {
    const tempDir = mkdtempSync(join(tmpdir(), 'safety-net-worktree-malformed-'));
    const badGitdir = join(tempDir, 'bad-gitdir');
    const emptyGitdir = join(tempDir, 'empty-gitdir');
    mkdirSync(badGitdir);
    mkdirSync(emptyGitdir);
    writeFileSync(join(badGitdir, '.git'), 'not a gitdir file\n');
    writeFileSync(join(emptyGitdir, '.git'), 'gitdir:\n');
    try {
      expect(isLinkedWorktree(badGitdir)).toBe(false);
      expect(isLinkedWorktree(emptyGitdir)).toBe(false);
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  test('rejects copied gitdir files whose backlink points at another worktree', () => {
    const fixture = createLinkedWorktreeFixture();
    const copiedRoot = join(fixture.rootDir, 'copied-root');
    mkdirSync(copiedRoot);
    writeFileSync(join(copiedRoot, '.git'), readFileSync(join(fixture.linkedWorktree, '.git')));
    try {
      expect(isLinkedWorktree(copiedRoot)).toBe(false);
    } finally {
      fixture.cleanup();
    }
  });

  test('rejects symlinked gitdir files', () => {
    const fixture = createLinkedWorktreeFixture();
    const symlinkedRoot = join(fixture.rootDir, 'symlinked-root');
    mkdirSync(symlinkedRoot);
    symlinkSync(join(fixture.linkedWorktree, '.git'), join(symlinkedRoot, '.git'));
    try {
      expect(isLinkedWorktree(symlinkedRoot)).toBe(false);
    } finally {
      fixture.cleanup();
    }
  });

  test('uses the last core.worktree value from worktree config', () => {
    const fixture = createLinkedWorktreeFixture();
    const gitDir = getLinkedGitDir(fixture.linkedWorktree);
    writeFileSync(
      join(gitDir, 'config.worktree'),
      `[core]\n\tworktree = ${fixture.linkedWorktree}\n\tworktree = ${fixture.mainWorktree}\n`,
    );
    try {
      expect(isLinkedWorktree(fixture.linkedWorktree)).toBe(false);
    } finally {
      fixture.cleanup();
    }
  });
});
