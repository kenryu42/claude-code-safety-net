import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  createProcessEnvironment,
  createTestEnvironment,
  type FakeEntry,
  processPathResolver,
} from '@/core/environment';
import { createLinkedWorktreeFixture } from '../helpers';
import { describeOutcome } from '../helpers/fixture-tree';
import { runGit } from '../helpers/git-worktree';
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
  test('resolves entries like the shipped resolver', () => {
    for (const name of ['dir', 'file', 'link', 'broken', 'loop-a', 'missing', '']) {
      const path = join(root, name);
      expectSameOutcome(() => processPathResolver.realpath(path), rootFolds(root));
      expectSameOutcome(() => processPathResolver.entryKind(path), rootFolds(root));
    }
  });

  test('a path under a regular file is missing or refused, never an entry', () => {
    // Linux and macOS refuse the stat with ENOTDIR; Windows answers that nothing is there.
    const under = join(root, 'file', 'under');
    expect(processPathResolver.realpath(under)).toBeNull();
    expect(describeOutcome(() => processPathResolver.entryKind(under))).toSatisfy(
      (outcome) =>
        (outcome.ok && outcome.value === 'missing') ||
        (!outcome.ok && outcome.error.message.includes('ENOTDIR')),
    );
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
      recordPorted(environment.gitMetadata(cwd), rootFolds(root));
    }
    expect(environment.gitMetadata(join(root, 'repo'))).not.toBeNull();
    expect(environment.gitMetadata(join(root, 'repo'))).toBe(
      environment.gitMetadata(join(root, 'repo')),
    );
    expect(environment.gitMetadata('')).toBeNull();
  });

  test('worktreeFacts is null outside a linked worktree and memoized inside one', () => {
    const fixture = createLinkedWorktreeFixture();
    try {
      const environment = createProcessEnvironment();
      expect(environment.worktreeFacts(fixture.mainWorktree)).toBeNull();
      expect(environment.worktreeFacts(join(root, 'dir'))).toBeNull();
      const facts = environment.worktreeFacts(fixture.linkedWorktree);
      expect(facts?.recursiveSubmodules).toMatchSnapshot();
      expect(environment.worktreeFacts(fixture.linkedWorktree)).toBe(facts);
    } finally {
      fixture.cleanup();
    }
  });
});
