import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { mkdtempSync, realpathSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  createProcessEnvironment,
  createTestEnvironment,
  type FakeEntry,
  processPathResolver,
} from '@next/core/environment';
import { hasRecursiveSubmoduleConfig } from '@/analyzer/git/config';
import { resolveProtectedGitMetadata } from '@/guards/git-metadata-protection';
import {
  createProcessEnvironment as createShippedEnvironment,
  processPathResolver as shippedPathResolver,
} from '@/ir/environment';
import { createLinkedWorktreeFixture } from '../../helpers';
import { runGit } from '../../helpers/git-worktree';
import { recordPorted, rootFolds } from '../helpers/temp-home';
import { expectSameOutcome, writeSymlinkLoopTree } from './differential-inputs';

let root = '';

beforeAll(() => {
  root = mkdtempSync(join(tmpdir(), 'next-environment-'));
  writeSymlinkLoopTree(root, {
    dir: null,
    link: { symlink: join(root, 'dir') },
    'repo/nested': null,
  });
  runGit(join(root, 'repo'), ['init', '-q']);
});

afterAll(() => {
  rmSync(root, { recursive: true, force: true });
});

describe('process environment', () => {
  test('snapshots the same variables, home and tmpdir as the shipped snapshot', () => {
    const next = createProcessEnvironment();
    const shipped = createShippedEnvironment();
    expect(next.env).toEqual(shipped.env);
    expect(next.home).toBe(shipped.home);
    expect(next.tmpdir).toBe(shipped.tmpdir);
  });

  test('resolves entries like the shipped resolver', () => {
    for (const name of ['dir', 'file', 'link', 'broken', 'loop-a', 'missing', 'file/under', '']) {
      const path = join(root, name);
      expectSameOutcome(
        () => processPathResolver.realpath(path),
        () => shippedPathResolver.realpath(path),
        rootFolds(root),
      );
      expectSameOutcome(
        () => processPathResolver.entryKind(path),
        () => shippedPathResolver.entryKind(path),
        rootFolds(root),
      );
    }
  });
});

describe('test environment', () => {
  test('holds only the listed entries and follows symlinks to their target', () => {
    const environment = createTestEnvironment({
      entries: new Map<string, FakeEntry>([
        ['/repo', 'present'],
        ['/link', { symlink: '/repo' }],
        ['/tree', 'directory'],
        ['/tree-link', { symlink: '/tree' }],
        ['/broken', { symlink: '/nowhere' }],
        ['/loop-a', { symlink: '/loop-b' }],
        ['/loop-b', { symlink: '/loop-a' }],
      ]),
    });
    expect(environment.paths.entryKind('/repo')).toBe('present');
    expect(environment.paths.entryKind('/link')).toBe('symlink');
    expect(environment.paths.entryKind('/broken')).toBe('symlink');
    expect(environment.paths.entryKind('/repo/child')).toBe('missing');
    expect(environment.paths.realpath('/repo')).toBe('/repo');
    expect(environment.paths.realpath('/link')).toBe('/repo');
    expect(environment.paths.realpath('/broken')).toBeNull();
    expect(environment.paths.realpath('/loop-a')).toBeNull();
    expect(environment.paths.realpath('/missing')).toBeNull();
    expect(environment.paths.isDirectory('/tree')).toBe(true);
    expect(environment.paths.isDirectory('/tree-link')).toBe(true);
    expect(environment.paths.isDirectory('/repo')).toBe(false);
    expect(environment.env.size).toBe(0);
    expect(environment.home).toBe('/home/user');
    expect(environment.tmpdir).toBe('/tmp');
    expect(environment.gitMetadata('/repo')).toBeNull();
    expect(environment.worktreeFacts('/repo')).toBeNull();
  });

  test('takes overrides for every field', () => {
    const gitMetadata = () => null;
    const environment = createTestEnvironment({
      env: new Map([['TMPDIR', '/scratch']]),
      home: '/srv/home',
      tmpdir: '/scratch',
      paths: processPathResolver,
      gitMetadata,
    });
    expect(environment.env.get('TMPDIR')).toBe('/scratch');
    expect(environment.home).toBe('/srv/home');
    expect(environment.tmpdir).toBe('/scratch');
    expect(environment.paths).toBe(processPathResolver);
    expect(environment.gitMetadata).toBe(gitMetadata);
  });
});

describe('git facts through the seam', () => {
  test('gitMetadata agrees with the shipped resolver and is memoized per cwd', () => {
    const environment = createProcessEnvironment();
    for (const cwd of [join(root, 'repo'), join(root, 'repo', 'nested'), join(root, 'dir'), root]) {
      const metadata = environment.gitMetadata(cwd);
      expect(metadata).toEqual(resolveProtectedGitMetadata([cwd]));
      recordPorted(metadata, rootFolds(root));
    }
    expect(environment.gitMetadata(join(root, 'repo'))).not.toBeNull();
    expect(environment.gitMetadata(join(root, 'repo'))).toBe(
      environment.gitMetadata(join(root, 'repo')),
    );
    expect(environment.gitMetadata('')).toBeNull();
    expect(resolveProtectedGitMetadata([''])).toBeNull();
  });

  test('worktreeFacts is null outside a linked worktree and memoized inside one', () => {
    const fixture = createLinkedWorktreeFixture();
    try {
      const environment = createProcessEnvironment();
      expect(environment.worktreeFacts(fixture.mainWorktree)).toBeNull();
      expect(environment.worktreeFacts(join(root, 'dir'))).toBeNull();
      const facts = environment.worktreeFacts(fixture.linkedWorktree);
      expect(facts?.recursiveSubmodules).toBe(
        hasRecursiveSubmoduleConfig(
          ['git', 'checkout', '--', '.'],
          new Map(),
          undefined,
          realpathSync(fixture.linkedWorktree),
        ),
      );
      expect(facts?.recursiveSubmodules).toMatchSnapshot();
      expect(environment.worktreeFacts(fixture.linkedWorktree)).toBe(facts);
    } finally {
      fixture.cleanup();
    }
  });
});
