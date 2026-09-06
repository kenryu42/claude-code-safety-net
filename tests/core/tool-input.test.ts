import { describe, expect, test } from 'bun:test';
import * as next from '@/core/tool-input';
import { expectRecordedDigest } from '../helpers/gate-differential';
import { corpusToolInputs, createSeededRandom, FUZZ_SEED } from '../helpers/shell-inputs';

const TOOL_NAMES = [
  'Bash',
  'PowerShell',
  'Read',
  'read_file',
  'Read-File',
  ' Read File ',
  'READ_URL_CONTENT',
  'Write',
  'write_to_file',
  'Edit',
  'MultiEdit',
  'multi_replace_file_content',
  'NotebookEdit',
  'notebook-edit',
  'str_replace_editor',
  'Create',
  'view',
  'view_file',
  'list_dir',
  'list_permissions',
  'ls',
  'search_web',
  'Grep',
  'grep_search',
  'rg',
  'Glob',
  'find',
  'find_by_name',
  'apply_patch',
  'applyPatch',
  'patch',
  'execute_command',
  'mcp__shell__run',
  'mcp__filesystem__read_file',
  'WebFetch',
  '',
  'ReadFile ',
];

const PATH_LIKE_KEYS = new Set([
  'absolutepath',
  'directory_path',
  'file',
  'file_path',
  'filepath',
  'notebook_path',
  'path',
  'target_file',
]);

const APPLY_PATCH_TEXT = [
  '*** Begin Patch',
  '*** Add File: src/new.ts',
  '+export const x = 1;',
  '*** Update File: "src/quoted name.ts"',
  '@@ -1,2 +1,2 @@',
  ' context',
  '-old',
  '+new',
  '*** Delete File: docs/old.md\tnote',
  '*** Update File: src/move.ts',
  '*** Move to: src/moved.ts',
  '*** End Patch',
].join('\n');

const GIT_DIFF_TEXT = [
  'diff --git a/src/a.ts b/src/a.ts',
  'index 111..222 100644',
  '--- a/src/a.ts',
  '+++ b/src/a.ts',
  '@@ -1,3 +1,4 @@',
  ' keep',
  '-drop',
  '+add',
  '+add more',
  ' keep',
  'diff --git "a/sp ace.txt" "b/sp ace.txt"',
  '--- "a/sp ace.txt"\t2024-01-01',
  '+++ "b/sp ace.txt"',
  '@@ -0,0 +1 @@',
  '+hello',
  'diff --git a/renamed.ts b/renamed-new.ts',
  'rename from renamed.ts',
  'rename to renamed-new.ts',
  'diff --git a/deleted.ts b/deleted.ts',
  '--- a/deleted.ts',
  '+++ /dev/null',
  '@@ -1 +0,0 @@',
  '-gone',
  'diff --git x/one two/one two',
  'diff --git old/x new/x',
  'diff --git a/\\303\\251.txt b/\\303\\251.txt',
  "diff --git 'a/q.txt' 'b/q.txt'",
  'diff --git a/unbalanced "b/open',
  'copy from copied.ts',
  'copy to "copied copy.ts"',
  '--- solo',
  '+++ solo',
  '--- /dev/null',
  '+++ b/created.ts',
  '@@ malformed hunk',
  ' trailing',
].join('\r\n');

function cycle(): object {
  const parent: Record<string, unknown> = { file_path: 'a' };
  parent.child = { back: parent };
  return parent;
}

function nested(depth: number, leaf: unknown): unknown {
  return Array.from({ length: depth }).reduce<unknown>((inner) => ({ inner }), leaf);
}

describe('next/core/tool-input against src/parser/tool-input', () => {
  const depthUnderCap = next.TOOL_INPUT_LIMITS.maxDepth - 2;
  const inputs: readonly unknown[] = [
    ...corpusToolInputs().map((row) => row.input),
    undefined,
    null,
    0,
    'rm -rf /',
    ['git', 'status'],
    { command: 123 },
    { command: '' },
    { command: 'git status', file_path: 'x' },
    { Command: 'git status' },
    { nested: { command: 'hidden' } },
    { 'file-path': 'hyphen.txt', FILE_PATH: 'upper.txt', file_path: ['array', { path: 'deep' }] },
    { paths: [{ notebook_path: 'n.ipynb' }, ['skip', { absolutePath: '/abs' }]] },
    { edits: [{ target_file: 'a.ts' }, { target_file: 'b.ts' }], path: 7, file: null },
    { [Symbol('secret')]: 'sym', path: 'visible' },
    Object.defineProperty({ path: 'shown' }, 'file_path', { value: 'hidden', enumerable: false }),
    Object.assign(Object.create(null), { command: 'proto-less', path: 'p' }),
    { input: APPLY_PATCH_TEXT },
    { patch: GIT_DIFF_TEXT },
    { patchText: APPLY_PATCH_TEXT, diff: GIT_DIFF_TEXT },
    { command: ['apply_patch', APPLY_PATCH_TEXT] },
    { command: [{ diff: GIT_DIFF_TEXT }, GIT_DIFF_TEXT] },
    { other: APPLY_PATCH_TEXT },
    { patch: { nested: APPLY_PATCH_TEXT, diff: GIT_DIFF_TEXT } },
    APPLY_PATCH_TEXT,
    [APPLY_PATCH_TEXT, { input: GIT_DIFF_TEXT }],
    nested(depthUnderCap, { file_path: 'deep.txt', patch: GIT_DIFF_TEXT }),
    (() => {
      const shared = { file_path: 'shared.txt' };
      return { first: shared, second: shared, third: [shared] };
    })(),
  ];

  test('ships the same traversal limits and error identity', () => {
    expect(next.TOOL_INPUT_LIMITS).toMatchSnapshot();
    const error = new next.ToolInputLimitError();
    expect({ name: error.name, message: error.message }).toMatchSnapshot();
  });

  test('normalizes, classifies, and marks read-only tools identically', () => {
    for (const toolName of TOOL_NAMES) {
      const classified = {
        toolName,
        normalized: next.normalizeToolName(toolName),
        kind: next.getNonCommandToolInputKind(toolName),
        readOnly: next.isReadOnlyTool(toolName),
      };
      expect(classified).toMatchSnapshot();
    }
  });

  test('reads commands, path-like values, and patch targets identically from safe inputs', () => {
    for (const input of inputs) {
      const read = {
        input,
        command: next.getCommandFromToolInput(input),
        paths: next.extractPathLikeToolValues(input, PATH_LIKE_KEYS),
        targets: next.extractPatchTargetsFromToolInput(input),
      };
      expect(read).toMatchSnapshot();
    }
  });

  test('extracts the same patch targets from fuzzed diff headers', () => {
    const random = createSeededRandom(FUZZ_SEED ^ 0x7001);
    const pieces = ['a/', 'b/', 'x y', '"', "'", '\\303', '\\n', '\\', '/', ' ', '\t', 'f.ts', ''];
    const recorded: (readonly [string, unknown])[] = [];
    for (let sample = 0; sample < 1_000; sample++) {
      const header = Array.from(
        { length: 1 + Math.floor(random() * 10) },
        () => pieces[Math.floor(random() * pieces.length)] ?? '',
      ).join('');
      const text = `diff --git ${header}\n--- ${header}\n+++ ${header}\nrename to ${header}`;
      recorded.push([text, next.extractPatchTargetsFromToolInput(text)]);
    }
    expectRecordedDigest('core-tool-input/fuzzed-patch-targets', recorded);
  });

  test('rejects unsafe and oversized shapes with the same limit error', () => {
    const accessor = Object.defineProperty({}, 'command', { enumerable: true, get: () => 'x' });
    const inherited = Object.create({ command: 'inherited' });
    const proxy = new Proxy({ command: 'proxied', file_path: 'p' }, {});
    const oversizedString = 'z'.repeat(next.TOOL_INPUT_LIMITS.maxStringBytes + 1);
    const aggregate = Array.from({ length: 5 }, () =>
      'z'.repeat(next.TOOL_INPUT_LIMITS.maxStringBytes),
    );
    const manyNodes = Array.from({ length: next.TOOL_INPUT_LIMITS.maxNodes + 1 }, () => 1);
    const manyKeys = Object.fromEntries(
      Array.from({ length: next.TOOL_INPUT_LIMITS.maxKeys + 1 }, (_, index) => [`k${index}`, 1]),
    );
    const tooDeep = nested(next.TOOL_INPUT_LIMITS.maxDepth + 1, { file_path: 'x' });
    const manyCandidates = `diff --git ${Array.from({ length: 70 }, (_, index) => `p${index}`).join(' ')}`;
    const traversals = ['paths', 'targets'] as const;
    const everything = ['command', ...traversals] as const;
    const rejected: readonly {
      readonly input: unknown;
      readonly throwsIn: readonly (typeof everything)[number][];
    }[] = [
      { input: accessor, throwsIn: everything },
      { input: inherited, throwsIn: everything },
      { input: proxy, throwsIn: everything },
      { input: new Map([['command', 'x']]), throwsIn: everything },
      { input: Object.create(Array.prototype), throwsIn: everything },
      { input: { file_path: oversizedString }, throwsIn: traversals },
      { input: { patch: oversizedString }, throwsIn: traversals },
      { input: { files: aggregate }, throwsIn: traversals },
      { input: manyNodes, throwsIn: traversals },
      { input: manyKeys, throwsIn: traversals },
      { input: tooDeep, throwsIn: traversals },
      { input: cycle(), throwsIn: traversals },
      { input: { list: [accessor] }, throwsIn: traversals },
      { input: { patch: manyCandidates }, throwsIn: ['targets'] },
    ];
    const runners = {
      command: next.getCommandFromToolInput,
      paths: (input: unknown) => next.extractPathLikeToolValues(input, PATH_LIKE_KEYS),
      targets: next.extractPatchTargetsFromToolInput,
    };

    for (const row of rejected) {
      for (const kind of row.throwsIn) {
        expect(() => runners[kind](row.input)).toThrow('tool input traversal limit exceeded');
      }
    }
  });
});
