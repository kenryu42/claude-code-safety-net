import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import {
  chmodSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  findDotGitInAncestors,
  isLinkedWorktree,
  normalizePathForComparison,
  resolveDotGitFileTargets,
  resolveWorktreeFacts,
} from '@next/core/git/worktree';
import { hasRecursiveSubmoduleConfig } from '@/analyzer/git/config';
import {
  findDotGitInAncestors as shippedFindDotGitInAncestors,
  isLinkedWorktree as shippedIsLinkedWorktree,
  normalizePathForComparison as shippedNormalizePathForComparison,
  resolveDotGitFileTargets as shippedResolveDotGitFileTargets,
} from '@/analyzer/git/worktree';
import { createLinkedWorktreeFixture } from '../../../helpers';
import { recordPorted, rootFolds } from '../../helpers/temp-home';

const fixture = createLinkedWorktreeFixture();
let scratch = '';

/** A link to the linked worktree whose name needs every escape the config parser decodes. */
const ODD_LINK_NAME = 'odd "\\\t\n\bname';

const GIT_CONFIG_ESCAPED: Readonly<Record<string, string>> = {
  '\\': '\\\\',
  '"': '\\"',
  '\t': '\\t',
  '\n': '\\n',
  '\b': '\\b',
};

function quoteForGitConfig(path: string): string {
  return `"${path.replace(/[\\"\t\n\b]/g, (char) => GIT_CONFIG_ESCAPED[char] ?? char)}"`;
}

function linkedGitDir(): string {
  return resolveDotGitFileTargets(join(fixture.linkedWorktree, '.git'))?.gitDir ?? '';
}

function fakeGit(script: string): string {
  const path = join(scratch, `git-${Buffer.from(script).toString('hex').slice(0, 16)}`);
  writeFileSync(path, `#!/bin/sh\n${script}\n`);
  chmodSync(path, 0o755);
  return path;
}

function shippedRecursiveSubmodules(cwd: string): boolean {
  return hasRecursiveSubmoduleConfig(['git', 'checkout', '--', '.'], new Map(), undefined, cwd);
}

/** Both temp roots a recorded path can carry; `scratch` only exists once the suite starts. */
const pathFolds = () => [...rootFolds(fixture.rootDir), ...rootFolds(scratch)];

beforeAll(() => {
  scratch = mkdtempSync(join(tmpdir(), 'next-worktree-'));
  mkdirSync(join(fixture.linkedWorktree, 'nested'));
  writeFileSync(join(scratch, 'file'), 'x');
  symlinkSync(fixture.linkedWorktree, join(scratch, ODD_LINK_NAME));
});

afterAll(() => {
  fixture.cleanup();
  rmSync(scratch, { recursive: true, force: true });
});

describe('linked worktree facts', () => {
  test('detects linked worktrees and reads gitdir files like the shipped helpers', () => {
    const cwds = [
      fixture.mainWorktree,
      fixture.linkedWorktree,
      join(fixture.linkedWorktree, 'nested'),
      join(fixture.linkedWorktree, 'missing'),
      fixture.rootDir,
      scratch,
      join(scratch, 'file'),
    ];
    for (const cwd of cwds) {
      const linked = isLinkedWorktree(cwd);
      expect(linked).toBe(shippedIsLinkedWorktree(cwd));
      expect(linked).toMatchSnapshot();
      const ancestor = findDotGitInAncestors(cwd);
      expect(ancestor).toBe(shippedFindDotGitInAncestors(cwd));
      recordPorted(ancestor, pathFolds());
    }
    for (const dotGit of [
      join(fixture.mainWorktree, '.git'),
      join(fixture.linkedWorktree, '.git'),
      join(scratch, 'file'),
      join(scratch, 'missing'),
    ]) {
      const targets = resolveDotGitFileTargets(dotGit);
      expect(targets).toEqual(shippedResolveDotGitFileTargets(dotGit));
      recordPorted(targets, pathFolds());
    }
    expect(isLinkedWorktree(fixture.linkedWorktree)).toBe(true);
  });

  test('reads quoted and escaped core.worktree values like the shipped parser', () => {
    const configPath = join(linkedGitDir(), 'config.worktree');
    const quoted = quoteForGitConfig(realpathSync(fixture.linkedWorktree));
    const escaped = quoted.slice(1, -1);
    const values = [
      quoted,
      `"${escaped}\\n"`,
      `"${escaped}\\t"`,
      `"${escaped}\\"`,
      `'${escaped}'`,
      escaped,
      '"',
      `"${escaped}\\q"`,
      fixture.mainWorktree,
      quoteForGitConfig(join(scratch, ODD_LINK_NAME)),
    ];
    try {
      for (const value of values) {
        writeFileSync(configPath, `[core]\n\tworktree = ${value}\n`);
        const linked = isLinkedWorktree(fixture.linkedWorktree);
        expect(linked).toBe(shippedIsLinkedWorktree(fixture.linkedWorktree));
        expect(linked).toMatchSnapshot();
      }
      // The odd link was written last: only a full decode of its name lands on the worktree's
      // inode, so a wrong escape table reads as "not a linked worktree" here.
      expect(isLinkedWorktree(fixture.linkedWorktree)).toBe(true);
    } finally {
      rmSync(configPath, { force: true });
    }
  });

  test('normalizes comparison paths like the shipped helper', () => {
    for (const path of [
      '\\\\?\\C:\\x\\',
      '\\\\?\\UNC\\srv\\share\\',
      'C:\\x\\y\\',
      '/a/b/',
      '/',
      'x/',
      '',
      fixture.linkedWorktree,
    ]) {
      const normalized = normalizePathForComparison(path);
      expect(normalized).toBe(shippedNormalizePathForComparison(path));
      recordPorted(normalized, pathFolds());
    }
  });

  test('reports the effective submodule.recurse setting like the shipped config walk', () => {
    const linked = realpathSync(fixture.linkedWorktree);
    const commonConfig = join(fixture.mainWorktree, '.git', 'config');
    const worktreeConfig = join(linkedGitDir(), 'config.worktree');
    const original = readFileSync(commonConfig, 'utf-8');
    const variants: [common: string, worktree: string | null][] = [
      ['', null],
      ['[submodule]\n\trecurse = true\n', null],
      ['[submodule]\n\trecurse = no\n', null],
      ['[submodule]\n\trecurse = no\n', '[submodule]\n\trecurse = yes\n'],
      ['', '[submodule]\n\trecurse\n'],
      ['[include]\n\tpath = /nonexistent/include\n', null],
      ['', '[includeIf "gitdir:/x/"]\n\tpath = /nonexistent/include\n'],
    ];
    try {
      for (const [common, worktree] of variants) {
        writeFileSync(commonConfig, `${original}${common}`);
        if (worktree === null) rmSync(worktreeConfig, { force: true });
        if (worktree !== null) writeFileSync(worktreeConfig, worktree);
        const facts = resolveWorktreeFacts(fixture.linkedWorktree);
        expect(facts).not.toBeNull();
        expect(facts?.recursiveSubmodules).toBe(shippedRecursiveSubmodules(linked));
        expect(facts?.recursiveSubmodules).toMatchSnapshot();
      }
    } finally {
      writeFileSync(commonConfig, original);
      rmSync(worktreeConfig, { force: true });
    }
  });

  test('yields no facts outside a verified linked worktree', () => {
    expect(resolveWorktreeFacts(fixture.mainWorktree)).toBeNull();
    expect(resolveWorktreeFacts(scratch)).toBeNull();
    expect(resolveWorktreeFacts(join(scratch, 'file'))).toBeNull();
    expect(resolveWorktreeFacts(join(scratch, 'missing'))).toBeNull();
    expect(resolveWorktreeFacts(join(fixture.linkedWorktree, 'nested'))).toEqual(
      resolveWorktreeFacts(fixture.linkedWorktree),
    );
  });

  test('takes the answer from the git binary it is pointed at', () => {
    expect(resolveWorktreeFacts(fixture.linkedWorktree, fakeGit('echo true; exit 0'))).toEqual({
      recursiveSubmodules: true,
    });
    expect(resolveWorktreeFacts(fixture.linkedWorktree, fakeGit('echo off; exit 0'))).toEqual({
      recursiveSubmodules: false,
    });
    expect(resolveWorktreeFacts(fixture.linkedWorktree, fakeGit('exit 1'))).toEqual({
      recursiveSubmodules: false,
    });
    expect(resolveWorktreeFacts(fixture.linkedWorktree, fakeGit('exit 128'))).toBeNull();
    expect(resolveWorktreeFacts(fixture.linkedWorktree, null)).toEqual({
      recursiveSubmodules: true,
    });
  });

  test('gives up without relaxation when git hangs past the timeout', () => {
    const started = performance.now();
    expect(resolveWorktreeFacts(fixture.linkedWorktree, fakeGit('sleep 8'))).toBeNull();
    expect(performance.now() - started).toBeLessThan(6000);
  }, 10_000);
});
