import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { realpathSync } from 'node:fs';
import { join } from 'node:path';
import { createBudget } from '@/core/budget';
import { type ProtectedGitMetadata, resolveProtectedGitMetadata } from '@/core/git/metadata';
import {
  findGitMetadataMutationTargetInSemanticFacts,
  isProtectedGitDeleteTarget,
  isProtectedGitHookNameSelection,
  REASON_GIT_METADATA_PROTECTION,
} from '@/gate/guards/git-metadata-protection';
import { createSemanticFacts } from '@/gate/guards/semantic-facts';
import { createToolInvocation, type ToolRoute } from '@/gate/invocation';
import { pairedEnvironments } from '../../core/differential-inputs';
import {
  createLinkedWorktreeFixture,
  createSubmoduleLikeGitFileFixture,
  type FakeGitFileFixture,
  type LinkedWorktreeFixture,
} from '../../helpers';
import { describeOutcome } from '../../helpers/fixture-tree';
import { expectRecordedDigest } from '../../helpers/gate-differential';
import {
  corpusCommands,
  FIXED_COMMANDS,
  FUZZ_SAMPLE_COUNT,
  FUZZ_SEED,
  fuzzShellSources,
} from '../../helpers/shell-inputs';
import { normalize, rootFolds } from '../../helpers/temp-home';

/**
 * The Git control plane is protected by three different shapes of test — an exact or ancestor
 * delete, a write-like target, and a hook-name selection — over metadata that differs between a
 * plain repository, a linked worktree and a submodule. Each shape is recorded as a digest over the
 * resolved metadata, so a change cannot hide behind a different anchor.
 */

let worktrees: LinkedWorktreeFixture;
let submodule: FakeGitFileFixture;

type Repository = { label: string; cwd: string; metadata: ProtectedGitMetadata | null };

let repositories: readonly Repository[] = [];

function environments() {
  return pairedEnvironments({ HOME: worktrees.rootDir }, worktrees.rootDir);
}

beforeAll(() => {
  worktrees = createLinkedWorktreeFixture();
  submodule = createSubmoduleLikeGitFileFixture();
  repositories = [
    { label: 'main worktree', cwd: worktrees.mainWorktree },
    { label: 'linked worktree', cwd: worktrees.linkedWorktree },
    { label: 'submodule', cwd: submodule.cwd },
    { label: 'outside any repository', cwd: submodule.rootDir },
  ].map((repository) => ({
    ...repository,
    metadata: resolveProtectedGitMetadata(repository.cwd, environments()),
  }));
});

afterAll(() => {
  worktrees.cleanup();
  submodule.cleanup();
});

/** One digest row, with both fixture roots folded out of the label and out of the value. */
function digestRow(label: string, value: unknown): [string, unknown] {
  const folds = [
    ...rootFolds(worktrees.rootDir),
    [realpathSync(submodule.rootDir), '<submodule-root>'] as const,
    [submodule.rootDir, '<submodule-root>'] as const,
  ];
  return [normalize(label, folds), normalize(value, folds)];
}

function deleteTargets(cwd: string): readonly string[] {
  return [
    '.git',
    '.git/',
    './.git',
    '.git/config',
    '.git/hooks',
    '.git/hooks/pre-commit',
    '.git/hooks/../refs',
    '.git/worktrees',
    '.git/worktrees/*',
    '.git/*',
    '.git/.*',
    '.git/**',
    '*',
    './*',
    '.*',
    './.*',
    '..',
    '../*',
    'file.txt',
    'nested/.git',
    '~',
    '$HOME',
    '',
    '   ',
    cwd,
    `${cwd}/*`,
    join(cwd, '.git'),
    join(cwd, '.git', 'hooks'),
    join(cwd, '.git', 'hooks', 'pre-commit'),
    join(cwd, '..'),
    join(worktrees.rootDir, '*'),
    worktrees.rootDir,
  ];
}

describe('protected git delete targets', () => {
  test('matches the shipped delete test for every repository shape and glob form', () => {
    const recorded: [string, unknown][] = [];
    // The one target no fold reaches: `join(cwd, '..')` taken from the fixture root is the temp
    // directory the host chose, and folding that would rewrite the literal `/tmp` targets the
    // corpora spell. The row runs like every other and is left out of the record.
    const temporaryDirectory = join(submodule.rootDir, '..');
    for (const repository of repositories) {
      const paired = environments();
      const budget = createBudget();
      for (const target of deleteTargets(repository.cwd)) {
        for (const recursive of [true, false]) {
          for (const dotEntryGlobs of [true, false]) {
            const protectedTarget = isProtectedGitDeleteTarget(
              target,
              repository.cwd,
              repository.metadata,
              recursive,
              paired,
              budget,
              dotEntryGlobs,
            );
            if (target !== temporaryDirectory)
              recorded.push(
                digestRow(
                  `${repository.label}: ${target} recursive=${recursive} dot=${dotEntryGlobs}`,
                  protectedTarget,
                ),
              );
          }
        }
      }
    }
    expectRecordedDigest('guards-git-metadata/delete-targets', recorded);
  });

  test('the table separates protected targets from the rest', () => {
    const repository = repositories[0];
    if (!repository) throw new Error('missing fixture');
    const paired = environments();
    const budget = createBudget();
    const protect = (target: string, recursive: boolean, dotEntryGlobs = false) =>
      isProtectedGitDeleteTarget(
        target,
        repository.cwd,
        repository.metadata,
        recursive,
        paired,
        budget,
        dotEntryGlobs,
      );
    expect(protect('.git', false)).toBeTrue();
    expect(protect('.git/hooks/pre-commit', false)).toBeTrue();
    expect(protect('file.txt', true)).toBeFalse();
    // `*` skips dot entries, so only a dot-glob or a PowerShell wildcard reaches `.git`.
    expect(protect('*', true)).toBeFalse();
    expect(protect('.*', true)).toBeTrue();
    expect(protect('*', true, true)).toBeTrue();
    // An ancestor only counts for a recursive delete.
    expect(protect('..', true)).toBeTrue();
    expect(protect('..', false)).toBeFalse();
    expect(
      isProtectedGitDeleteTarget('.git', repository.cwd, null, true, paired, budget),
    ).toBeFalse();
  });
});

describe('protected git hook name selection', () => {
  test('matches the shipped selection test for every starting-point list', () => {
    const startingPointLists: readonly (readonly string[])[] = [
      [],
      ['.'],
      ['.git'],
      ['.git/hooks'],
      ['.git/hooks/pre-commit'],
      ['..'],
      ['nested', '.'],
      ['file.txt'],
      ['~'],
      ['$HOME'],
      ['', '.'],
    ];
    const recorded: [string, unknown][] = [];
    for (const repository of repositories) {
      const paired = environments();
      const budget = createBudget();
      for (const startingPoints of startingPointLists) {
        const selected = isProtectedGitHookNameSelection(
          startingPoints,
          repository.cwd,
          repository.metadata,
          paired,
          budget,
        );
        recorded.push(
          digestRow(`${repository.label}: ${JSON.stringify(startingPoints)}`, selected),
        );
      }
    }
    expectRecordedDigest('guards-git-metadata/hook-selection', recorded);
  });

  test('a selection rooted at or above the hooks directory is protected', () => {
    const repository = repositories[0];
    if (!repository) throw new Error('missing fixture');
    const paired = environments();
    const budget = createBudget();
    const select = (startingPoints: readonly string[]) =>
      isProtectedGitHookNameSelection(
        startingPoints,
        repository.cwd,
        repository.metadata,
        paired,
        budget,
      );
    expect(select(['.'])).toBeTrue();
    expect(select(['.git/hooks'])).toBeTrue();
    expect(select(['.git/hooks/pre-commit'])).toBeFalse();
    expect(select(['file.txt'])).toBeFalse();
    expect(select([])).toBeFalse();
  });
});

const MUTATION_COMMANDS: readonly string[] = [
  'rm -rf .git',
  'rm -rf .git/hooks',
  'mv .git /tmp/stash',
  'mv .git/hooks /tmp/stash',
  'mv /tmp/payload .git/hooks/pre-commit',
  'mv /tmp/payload .git/config',
  'mv -t .git/hooks /tmp/pre-commit',
  'mv --target-directory=.git/hooks /tmp/pre-commit',
  'mv -- .git /tmp/stash',
  'G=.git; mv $G /tmp/stash',
  'G=.git && mv ${G}/hooks /tmp/stash',
  'cd .git && mv hooks /tmp/stash',
  'cd .. && mv repo/.git /tmp/stash',
  'echo payload > .git/config',
  'echo payload > .git',
  'echo payload >> .git/hooks/pre-commit',
  'cat /tmp/payload > .git/hooks/post-commit',
  'echo payload > file.txt',
  'sudo mv .git /tmp/stash',
  'env -i mv .git /tmp/stash',
  'mv file.txt other.txt',
  'git mv file.txt other.txt',
  'mv .git',
  'mv',
];

const NON_COMMAND_ROUTES: readonly ToolRoute[] = [
  { kind: 'patch' },
  { kind: 'path' },
  { kind: 'unknown' },
  { kind: 'grep' },
  { kind: 'glob' },
];

const TOOL_INPUTS: readonly { toolName: string; input: Record<string, string> }[] = [
  { toolName: 'Write', input: { file_path: '.git/config' } },
  { toolName: 'Write', input: { file_path: '.git/hooks/pre-commit' } },
  { toolName: 'Write', input: { file_path: 'file.txt' } },
  { toolName: 'Read', input: { file_path: '.git/config' } },
  { toolName: 'Edit', input: { file_path: '.git' } },
  { toolName: 'NotebookEdit', input: { notebook_path: '.git/config' } },
  { toolName: 'Grep', input: { path: '.git' } },
];

function nextMutation(
  toolName: string,
  input: unknown,
  route: ToolRoute,
  command: string | null,
  repository: Repository,
) {
  const paired = environments();
  return findGitMetadataMutationTargetInSemanticFacts(
    createSemanticFacts(
      createToolInvocation(
        toolName,
        input,
        route,
        { executionCwd: repository.cwd, configCwd: repository.cwd },
        command,
      ),
    ),
    repository.metadata,
    paired,
    createBudget(),
  );
}

describe('git metadata mutation targets in semantic facts', () => {
  test('matches the shipped guard over the command table', () => {
    const recorded: [string, unknown][] = [];
    for (const repository of repositories) {
      for (const command of MUTATION_COMMANDS) {
        for (const shell of ['posix', 'powershell'] as const) {
          const route: ToolRoute = { kind: 'command', shell };
          recorded.push(
            digestRow(
              `${repository.label}: ${command} (${shell})`,
              nextMutation('Bash', { command }, route, command, repository),
            ),
          );
        }
      }
    }
    expectRecordedDigest('guards-git-metadata/command-table', recorded);
  });

  test('matches the shipped guard over the non-command routes and tool inputs', () => {
    const recorded: [string, unknown][] = [];
    for (const repository of repositories) {
      for (const route of NON_COMMAND_ROUTES) {
        for (const row of TOOL_INPUTS) {
          const input = { ...row.input, file_path: row.input.file_path ?? '' };
          const label = `${repository.label}: ${row.toolName} ${route.kind} ${JSON.stringify(input)}`;
          recorded.push(
            digestRow(label, nextMutation(row.toolName, input, route, null, repository)),
          );
        }
      }
    }
    expectRecordedDigest('guards-git-metadata/tool-inputs', recorded);
  });

  test('matches the shipped guard over the corpus and the seeded fuzz', () => {
    const repository = repositories[0];
    if (!repository) throw new Error('missing fixture');
    const route: ToolRoute = { kind: 'command', shell: 'posix' };
    const recorded: [string, unknown][] = [];
    for (const command of [
      ...corpusCommands(),
      ...FIXED_COMMANDS,
      ...fuzzShellSources(FUZZ_SAMPLE_COUNT, FUZZ_SEED),
    ]) {
      recorded.push(
        digestRow(
          command,
          describeOutcome(() => nextMutation('Bash', { command }, route, command, repository)),
        ),
      );
    }
    expectRecordedDigest('guards-git-metadata/corpus-fuzz', recorded);
  });

  test('the command table denies the control plane and allows ordinary files', () => {
    const repository = repositories[0];
    if (!repository) throw new Error('missing fixture');
    const route: ToolRoute = { kind: 'command', shell: 'posix' };
    const find = (command: string) => nextMutation('Bash', { command }, route, command, repository);
    expect(find('mv .git /tmp/stash')).toStrictEqual({ target: '.git' });
    expect(find('echo payload > .git/hooks/post-commit')).toStrictEqual({
      target: '.git/hooks/post-commit',
    });
    expect(find('mv file.txt other.txt')).toBeNull();
    // A read-only tool never mutates, and no metadata means nothing to protect.
    expect(
      nextMutation('Read', { file_path: '.git/config' }, { kind: 'path' }, null, repository),
    ).toBeNull();
    // The write-like test covers the `.git` entry itself and anything under a hooks directory;
    // an ordinary file inside the Git directory is left to the delete and move tests.
    expect(
      nextMutation('Write', { file_path: '.git/config' }, { kind: 'path' }, null, repository),
    ).toBeNull();
    expect(
      nextMutation('Write', { file_path: '.git' }, { kind: 'path' }, null, repository),
    ).toStrictEqual({ target: '.git' });
    expect(
      nextMutation(
        'Write',
        { file_path: '.git/hooks/pre-commit' },
        { kind: 'path' },
        null,
        repository,
      ),
    ).toStrictEqual({ target: '.git/hooks/pre-commit' });
    expect(
      nextMutation('Write', { file_path: '.git' }, { kind: 'path' }, null, {
        ...repository,
        metadata: null,
      }),
    ).toBeNull();
  });

  test('the denial reason is the shipped wording', () => {
    expectRecordedDigest('guards-git-metadata/reason', [
      ['REASON_GIT_METADATA_PROTECTION', REASON_GIT_METADATA_PROTECTION],
    ]);
  });
});
