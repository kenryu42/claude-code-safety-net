import { describe, expect, test } from 'bun:test';
import * as next from '@/core/tool-input';
import { expectRecordedDigest } from '../helpers/gate-differential';
import { corpusToolInputs, createSeededRandom, FUZZ_SEED } from '../helpers/shell-inputs';

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

/** The five files the apply-patch document above names, in the order it names them. */
const APPLY_PATCH_TARGETS = [
  'src/new.ts',
  'src/quoted name.ts',
  'docs/old.md',
  'src/move.ts',
  'src/moved.ts',
];

/**
 * Every file the git diff above names, in order and with its repetitions: a header names the same
 * file on several lines, and the reader reports each occurrence rather than a set, so a later
 * stage sees how often a path was asked for.
 */
const GIT_DIFF_TARGETS = [
  'src/a.ts',
  'src/a.ts',
  'src/a.ts',
  'src/a.ts',
  'sp ace.txt',
  'sp ace.txt',
  'sp ace.txt',
  'sp ace.txt',
  'renamed.ts',
  'renamed-new.ts',
  'renamed.ts',
  'renamed-new.ts',
  'deleted.ts',
  'deleted.ts',
  'a/deleted.ts',
  'deleted.ts',
  'old/x',
  'new/x',
  'x',
  '\\303\\251.txt',
  '\\303\\251.txt',
  'q.txt',
  'q.txt',
  'copied.ts',
  'copied copy.ts',
  'solo',
  'solo',
  'b/created.ts',
  'created.ts',
];

describe('next/core/tool-input against src/parser/tool-input', () => {
  const depthUnderCap = next.TOOL_INPUT_LIMITS.maxDepth - 2;

  /** What the three readers found, with the empty answers left out so a row states only what it
   *  is about. */
  const expectRead = (
    input: unknown,
    expected: { command?: string; paths?: readonly string[]; targets?: readonly string[] },
  ) => {
    expect({
      command: next.getCommandFromToolInput(input),
      paths: next.extractPathLikeToolValues(input, PATH_LIKE_KEYS),
      targets: next.extractPatchTargetsFromToolInput(input),
    }).toEqual({
      command: expected.command,
      paths: [...(expected.paths ?? [])],
      targets: [...(expected.targets ?? [])],
    });
  };

  test('the traversal limits and the error a breach carries', () => {
    expect(next.TOOL_INPUT_LIMITS).toEqual({
      maxDepth: 64,
      maxNodes: 10_000,
      maxKeys: 10_000,
      maxStringBytes: 1024 * 1024,
      maxAggregateStringBytes: 4 * 1024 * 1024,
    });
    const error = new next.ToolInputLimitError();
    expect(error.name).toBe('ToolInputLimitError');
    expect(error.message).toBe('tool input traversal limit exceeded');
  });

  /**
   * How a host's spelling of a tool becomes the kind the gate routes it by. The name is folded to
   * lowercase alphanumerics, so case, spaces, dashes and underscores are all the same name; read
   * only marks the tools that cannot change anything, which relaxes the metadata-only rules.
   */
  test.each([
    ['Bash', 'bash', 'unknown', false],
    ['PowerShell', 'powershell', 'unknown', false],
    ['Read', 'read', 'path', true],
    ['read_file', 'readfile', 'path', true],
    ['Read-File', 'readfile', 'path', true],
    [' Read File ', 'readfile', 'path', true],
    ['ReadFile ', 'readfile', 'path', true],
    ['READ_URL_CONTENT', 'readurlcontent', 'path', true],
    ['Write', 'write', 'path', false],
    ['write_to_file', 'writetofile', 'path', false],
    ['Edit', 'edit', 'path', false],
    ['MultiEdit', 'multiedit', 'path', false],
    ['multi_replace_file_content', 'multireplacefilecontent', 'path', false],
    ['NotebookEdit', 'notebookedit', 'path', false],
    ['notebook-edit', 'notebookedit', 'path', false],
    ['str_replace_editor', 'strreplaceeditor', 'path', false],
    ['Create', 'create', 'path', false],
    ['view', 'view', 'path', true],
    ['view_file', 'viewfile', 'path', true],
    ['list_dir', 'listdir', 'path', true],
    ['list_permissions', 'listpermissions', 'path', true],
    ['ls', 'ls', 'path', true],
    ['search_web', 'searchweb', 'path', true],
    ['Grep', 'grep', 'grep', true],
    ['grep_search', 'grepsearch', 'grep', true],
    // `rg` runs a real ripgrep, which can write with `--files-with-matches -0 | xargs`, so it is
    // the one grep spelling the read-only relaxation does not cover.
    ['rg', 'rg', 'grep', false],
    ['Glob', 'glob', 'glob', true],
    ['find', 'find', 'glob', true],
    ['find_by_name', 'findbyname', 'glob', true],
    ['apply_patch', 'applypatch', 'patch', false],
    ['applyPatch', 'applypatch', 'patch', false],
    ['patch', 'patch', 'patch', false],
    ['execute_command', 'executecommand', 'unknown', false],
    ['mcp__shell__run', 'mcpshellrun', 'unknown', false],
    ['mcp__filesystem__read_file', 'mcpfilesystemreadfile', 'unknown', false],
    ['WebFetch', 'webfetch', 'unknown', false],
    ['', '', 'unknown', false],
  ] as const)('%s normalizes to %s, a %s tool', (toolName, normalized, kind, readOnly) => {
    expect(next.normalizeToolName(toolName)).toBe(normalized);
    expect(next.getNonCommandToolInputKind(toolName)).toBe(kind);
    expect(next.isReadOnlyTool(toolName)).toBe(readOnly);
  });

  /**
   * What the three readers take out of a payload. Each row names the rule it stands for; a row
   * with no `command`, `paths` or `targets` says the reader found nothing to hand on.
   */
  test.each([
    ['a payload that is not an object carries nothing', undefined, {}],
    ['null', null, {}],
    ['a number', 0, {}],
    ['a bare string is not a command', 'rm -rf /', {}],
    ['an array of words is not a command', ['git', 'status'], {}],
    ['a command that is not a string', { command: 123 }, {}],
    ['an empty command is no command', { command: '' }, {}],
    [
      'a command and a path field are both read',
      { command: 'git status', file_path: 'x' },
      { command: 'git status', paths: ['x'] },
    ],
    ['the command key is matched exactly, so `Command` is not one', { Command: 'git status' }, {}],
    [
      "a command below the top level is not the call's command",
      { nested: { command: 'hidden' } },
      {},
    ],
  ] as const)('%s', (_label, input, expected) => {
    expectRead(input, expected);
  });

  test('a path-like key is matched wherever it appears, and only when it holds the string', () => {
    // `file-path` and `FILE_PATH` fold to keys the set lists; the array under `file_path` holds
    // the string at an index rather than at a path-like key, so only the nested `path` matches.
    expectRead(
      { 'file-path': 'hyphen.txt', FILE_PATH: 'upper.txt', file_path: ['array', { path: 'deep' }] },
      { paths: ['hyphen.txt', 'upper.txt', 'deep'] },
    );
    expectRead(
      { paths: [{ notebook_path: 'n.ipynb' }, ['skip', { absolutePath: '/abs' }]] },
      { paths: ['n.ipynb', '/abs'] },
    );
    // A value that is not a string under a path-like key contributes nothing.
    expectRead(
      { edits: [{ target_file: 'a.ts' }, { target_file: 'b.ts' }], path: 7, file: null },
      { paths: ['a.ts', 'b.ts'] },
    );
    // The same object reached three ways is read three times: the readers report occurrences.
    const shared = { file_path: 'shared.txt' };
    expectRead(
      { first: shared, second: shared, third: [shared] },
      { paths: ['shared.txt', 'shared.txt', 'shared.txt'] },
    );
  });

  test('only a plain own enumerable property is read', () => {
    // A symbol key and a non-enumerable one are both invisible to the walk.
    expectRead({ [Symbol('secret')]: 'sym', path: 'visible' }, { paths: ['visible'] });
    expectRead(
      Object.defineProperty({ path: 'shown' }, 'file_path', {
        value: 'hidden',
        enumerable: false,
      }),
      { paths: ['shown'] },
    );
    // An object with no prototype is still a plain object.
    expectRead(Object.assign(Object.create(null), { command: 'proto-less', path: 'p' }), {
      command: 'proto-less',
      paths: ['p'],
    });
  });

  test('patch text is scanned wherever a patch-carrying key holds it', () => {
    for (const input of [
      { input: APPLY_PATCH_TEXT },
      { command: ['apply_patch', APPLY_PATCH_TEXT] },
      APPLY_PATCH_TEXT,
    ]) {
      expectRead(input, { targets: APPLY_PATCH_TARGETS });
    }
    expectRead({ patch: GIT_DIFF_TEXT }, { targets: GIT_DIFF_TARGETS });
    expectRead(
      { patchText: APPLY_PATCH_TEXT, diff: GIT_DIFF_TEXT },
      { targets: [...APPLY_PATCH_TARGETS, ...GIT_DIFF_TARGETS] },
    );
    expectRead([APPLY_PATCH_TEXT, { input: GIT_DIFF_TEXT }], {
      targets: [...APPLY_PATCH_TARGETS, ...GIT_DIFF_TARGETS],
    });
    // Each occurrence is scanned; the targets are not deduplicated across them.
    expectRead(
      { command: [{ diff: GIT_DIFF_TEXT }, GIT_DIFF_TEXT] },
      { targets: [...GIT_DIFF_TARGETS, ...GIT_DIFF_TARGETS] },
    );
    // A key that carries no patch is not scanned, even when its value is a patch.
    expectRead({ other: APPLY_PATCH_TEXT }, {});
    expectRead(
      { patch: { nested: APPLY_PATCH_TEXT, diff: GIT_DIFF_TEXT } },
      {
        targets: GIT_DIFF_TARGETS,
      },
    );
    // Depth is no obstacle below the cap: both readers still reach the leaf.
    expectRead(nested(depthUnderCap, { file_path: 'deep.txt', patch: GIT_DIFF_TEXT }), {
      paths: ['deep.txt'],
      targets: GIT_DIFF_TARGETS,
    });
  });

  test('every corpus payload is read without refusing it', () => {
    for (const { input } of corpusToolInputs()) {
      const command = next.getCommandFromToolInput(input);
      // A command that comes back is the text a later stage analyzes, never an empty one.
      if (command !== undefined) expect(command.length).toBeGreaterThan(0);
      expect(next.extractPathLikeToolValues(input, PATH_LIKE_KEYS)).toBeArray();
      expect(next.extractPatchTargetsFromToolInput(input)).toBeArray();
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
