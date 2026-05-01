import { describe, expect, test } from 'bun:test';
import { execFileSync } from 'node:child_process';
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
  _parseGitConfigValue,
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
    const fileTarget = join(fixture.rootDir, 'not-a-directory');
    writeFileSync(fileTarget, '');
    try {
      expect(getGitExecutionContext(['git', '-C'], fixture.rootDir).gitCwd).toBeNull();
      expect(
        getGitExecutionContext(['git', `-C${join(fixture.rootDir, 'missing')}`], fixture.rootDir)
          .gitCwd,
      ).toBeNull();
      expect(getGitExecutionContext(['git', '-C', fileTarget, 'status'], fixture.rootDir)).toEqual({
        gitCwd: null,
        hasExplicitGitContext: false,
      });
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
  test('parses double-quoted git config escapes', () => {
    expect(_parseGitConfigValue('"/tmp/with \\"quotes\\""')).toBe('/tmp/with "quotes"');
    expect(_parseGitConfigValue('"/tmp/backslash\\\\path"')).toBe('/tmp/backslash\\path');
    expect(_parseGitConfigValue('"line\\nfeed\\ttab\\bbackspace"')).toBe(
      'line\nfeed\ttab\bbackspace',
    );
    expect(_parseGitConfigValue('"unknown\\xpath"')).toBe('unknown\\xpath');
    expect(_parseGitConfigValue("'/tmp/single'")).toBe("'/tmp/single'");
  });

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

  test('rejects worktree gitdirs with missing or empty backlinks', () => {
    const fixture = createLinkedWorktreeFixture();
    const missingBacklinkRoot = join(fixture.rootDir, 'missing-backlink-root');
    const emptyBacklinkRoot = join(fixture.rootDir, 'empty-backlink-root');
    const missingBacklinkGitDir = join(fixture.rootDir, 'missing-backlink-gitdir');
    const emptyBacklinkGitDir = join(fixture.rootDir, 'empty-backlink-gitdir');
    mkdirSync(missingBacklinkRoot);
    mkdirSync(emptyBacklinkRoot);
    mkdirSync(missingBacklinkGitDir);
    mkdirSync(emptyBacklinkGitDir);
    writeFileSync(join(missingBacklinkRoot, '.git'), `gitdir: ${missingBacklinkGitDir}\n`);
    writeFileSync(join(emptyBacklinkRoot, '.git'), `gitdir: ${emptyBacklinkGitDir}\n`);
    writeFileSync(join(missingBacklinkGitDir, 'commondir'), '../main/.git\n');
    writeFileSync(join(emptyBacklinkGitDir, 'commondir'), '../main/.git\n');
    writeFileSync(join(emptyBacklinkGitDir, 'gitdir'), '\n');
    try {
      expect(isLinkedWorktree(missingBacklinkRoot)).toBe(false);
      expect(isLinkedWorktree(emptyBacklinkRoot)).toBe(false);
    } finally {
      fixture.cleanup();
    }
  });

  test('accepts unparsable core.worktree config as conservative fallback', () => {
    const fixture = createLinkedWorktreeFixture();
    const gitDir = getLinkedGitDir(fixture.linkedWorktree);
    writeFileSync(join(gitDir, 'config.worktree'), '[core\n\tworktree =');
    try {
      expect(isLinkedWorktree(fixture.linkedWorktree)).toBe(true);
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

  test.skipIf(process.platform === 'win32')(
    'accepts double-quoted escaped core.worktree values',
    () => {
      const fixture = createLinkedWorktreeFixture();
      const quotedWorktree = join(fixture.rootDir, 'linked"quoted');
      execFileSync(
        'git',
        ['worktree', 'add', '-b', 'feature/quoted-worktree-test', quotedWorktree],
        {
          cwd: fixture.mainWorktree,
          stdio: 'ignore',
        },
      );
      const gitDir = getLinkedGitDir(quotedWorktree);
      const escapedWorktree = quotedWorktree.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
      writeFileSync(join(gitDir, 'config.worktree'), `[core]\n\tworktree = "${escapedWorktree}"\n`);
      try {
        expect(isLinkedWorktree(quotedWorktree)).toBe(true);
      } finally {
        fixture.cleanup();
      }
    },
  );

  test('treats single-quoted core.worktree values as literal paths', () => {
    const fixture = createLinkedWorktreeFixture();
    const gitDir = getLinkedGitDir(fixture.linkedWorktree);
    writeFileSync(
      join(gitDir, 'config.worktree'),
      `[core]\n\tworktree = '${fixture.linkedWorktree}'\n`,
    );
    try {
      expect(isLinkedWorktree(fixture.linkedWorktree)).toBe(false);
    } finally {
      fixture.cleanup();
    }
  });
});
