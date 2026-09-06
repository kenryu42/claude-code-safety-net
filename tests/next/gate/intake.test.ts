import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { mkdirSync, mkdtempSync, realpathSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { isAbsolute, join, relative, resolve } from 'node:path';
import type { IntegrationDenial } from '@next/core/denial';
import { processPathResolver } from '@next/core/environment';
import {
  firstTrustedRoot,
  getToolRoute,
  HOOK_INPUT_MAX_BYTES,
  isSameOrInsidePath,
  isUsableDirectory,
  outputFailedClosed,
  parseHookJson,
  readBoundedHookInput,
  resolveCanonicalCwd,
  resolveContainedCwd,
  resolveStandardHookContext,
} from '@next/gate/intake';
import type { CommandToolKind } from '@next/gate/invocation';
import {
  firstTrustedRoot as shippedFirstTrustedRoot,
  isSameOrInsidePath as shippedIsSameOrInsidePath,
  isUsableDirectory as shippedIsUsableDirectory,
  resolveCanonicalCwd as shippedResolveCanonicalCwd,
  resolveContainedCwd as shippedResolveContainedCwd,
} from '@/integrations/cwd-containment';
import {
  HOOK_INPUT_MAX_BYTES as SHIPPED_HOOK_INPUT_MAX_BYTES,
  getToolRoute as shippedGetToolRoute,
  outputFailedClosed as shippedOutputFailedClosed,
  parseHookJson as shippedParseHookJson,
  readBoundedHookInput as shippedReadBoundedHookInput,
  resolveStandardHookContext as shippedResolveStandardHookContext,
} from '@/integrations/hook/common';
import { recordPorted, rootFolds } from '../helpers/temp-home';

/**
 * Intake is where the gate reads the process: the stdin document, the tool name, and the
 * directory a host claims the call runs in. A divergence here changes the input every later
 * stage sees, so each surface is compared against the shipped one.
 */

const TOOL_NAMES = `applypatch patch create edit listdir listpermissions ls multiedit
 multireplacefilecontent notebookedit read readfile readurlcontent replacefilecontent searchweb
 strreplaceeditor view viewfile write writefile writetofile grep grepsearch rg find findbyname
 glob Bash PowerShell bash powershell run_command run_shell_command run_terminal_command terminal
 Shell Read read_file Notebook-Edit NOTEBOOKEDIT Apply-Patch apply_patch Str_Replace_Editor
 WebFetch mcp__server__tool unknown_tool`
  .split(/\s+/)
  .filter((name) => name !== '');

const COMMAND_TOOL_TABLES: readonly (readonly (readonly [string, CommandToolKind])[])[] = [
  [],
  [
    ['Bash', 'posix'],
    ['PowerShell', 'powershell'],
  ],
  [
    ['bash', 'auto'],
    ['Bash', 'auto'],
    ['powershell', 'powershell'],
    ['PowerShell', 'powershell'],
  ],
  [['Shell', 'auto']],
  [['run_shell_command', 'auto']],
  [['run_terminal_command', 'auto']],
  [['run_command', 'auto']],
  [['terminal', 'posix']],
  [['read', 'posix']],
];

let root = '';
const tree = { workspace: '', inner: '', outside: '', link: '', escape: '', file: '', missing: '' };

beforeAll(() => {
  root = realpathSync(mkdtempSync(join(tmpdir(), 'next-intake-')));
  tree.workspace = join(root, 'workspace');
  tree.inner = join(tree.workspace, 'inner');
  tree.outside = join(root, 'outside');
  tree.link = join(tree.workspace, 'link');
  tree.escape = join(tree.workspace, 'escape');
  tree.file = join(tree.workspace, 'file.txt');
  tree.missing = join(tree.workspace, 'missing');
  mkdirSync(tree.inner, { recursive: true });
  mkdirSync(tree.outside, { recursive: true });
  writeFileSync(tree.file, 'x');
  symlinkSync(tree.inner, tree.link);
  symlinkSync(tree.outside, tree.escape);
});

afterAll(() => {
  rmSync(root, { recursive: true, force: true });
});

/**
 * Whether a requested directory canonicalizes above the fixture root, where the only answer is
 * the temp directory the host chose. It cannot be folded away — the fold would rewrite the
 * literal `/tmp` a corpus row spells — so the row is compared and left out of the record.
 */
const climbsOut = (base: string, requested: string) =>
  !isAbsolute(requested) && relative(root, resolve(base, requested)).startsWith('..');

function requestedPaths(): string[] {
  return [
    tree.workspace,
    tree.inner,
    tree.link,
    tree.escape,
    tree.file,
    tree.missing,
    tree.outside,
    root,
    'inner',
    './inner',
    '..',
    '.',
    '',
    join(tree.inner, '..', 'inner'),
  ];
}

function rootSets(): string[][] {
  return [
    [],
    [tree.workspace],
    [tree.inner],
    [tree.missing],
    [tree.file],
    [tree.missing, tree.workspace],
    [tree.workspace, tree.outside],
    [tree.outside],
  ];
}

async function* chunks(values: readonly (string | Uint8Array)[]) {
  for (const value of values) yield value;
}

function oversizedInput() {
  const stopped: string[] = [];
  const megabyte = Buffer.alloc(1024 * 1024, 0x61);
  return {
    stopped,
    input: Object.assign(
      (async function* () {
        for (let index = 0; index < 9; index++) yield megabyte;
      })(),
      { destroy: () => stopped.push('destroy') },
    ),
  };
}

function deepInput(depth: number): unknown {
  return Array.from({ length: depth }).reduce<unknown>((inner) => ({ nested: inner }), {
    command: 'rm -rf /',
  });
}

describe('next/gate/intake tool routing against src/integrations/hook/common', () => {
  test('caps hook input at the same size', () => {
    expect(HOOK_INPUT_MAX_BYTES).toBe(SHIPPED_HOOK_INPUT_MAX_BYTES);
    expect(HOOK_INPUT_MAX_BYTES).toMatchSnapshot();
  });

  test('routes every tool name src knows the same way, under every host table', () => {
    for (const table of COMMAND_TOOL_TABLES) {
      const commandTools = new Map(table);
      for (const toolName of TOOL_NAMES) {
        const routed = { toolName, route: getToolRoute(toolName, commandTools) };
        expect(routed).toStrictEqual({
          toolName,
          route: shippedGetToolRoute(toolName, commandTools),
        });
        expect(routed).toMatchSnapshot();
      }
    }
  });
});

describe('next/gate/intake stdin reading', () => {
  test('concatenates string and byte chunks identically', async () => {
    const values = ['{"a":', new TextEncoder().encode('1}'), '', '\n'];
    const read = await readBoundedHookInput(chunks(values));
    expect(read).toBe(await shippedReadBoundedHookInput(chunks(values)));
    expect(read).toMatchSnapshot();
  });

  test('rejects input over the cap and stops the stream, as src does', async () => {
    const next = oversizedInput();
    const shipped = oversizedInput();
    await expect(readBoundedHookInput(next.input)).rejects.toThrow(
      'hook input byte limit exceeded',
    );
    await expect(shippedReadBoundedHookInput(shipped.input)).rejects.toThrow(
      'hook input byte limit exceeded',
    );
    expect(next.stopped).toStrictEqual(shipped.stopped);
    expect(next.stopped).toStrictEqual(['destroy']);
  });

  test('parses the same JSON and denies the same malformed documents', () => {
    for (const text of ['{"a":1}', '[]', 'null', '"text"', '', '{', '{"a":}', 'undefined']) {
      const nextDenials: IntegrationDenial[] = [];
      const shippedDenials: IntegrationDenial[] = [];
      const parsed = parseHookJson(text, (denial) => nextDenials.push(denial), 'bad json');
      expect(parsed).toStrictEqual(
        shippedParseHookJson(text, (denial) => shippedDenials.push(denial), 'bad json'),
      );
      expect(parsed).toMatchSnapshot();
      expect(nextDenials).toStrictEqual(shippedDenials);
      expect(nextDenials).toMatchSnapshot();
    }
  });
});

describe('next/gate/intake containment against src/integrations/cwd-containment', () => {
  test('resolves the same contained directory in every containment mode', () => {
    for (const roots of rootSets()) {
      for (const requested of requestedPaths()) {
        const contained = {
          roots,
          requested,
          contained: resolveContainedCwd(requested, roots, processPathResolver),
        };
        expect(contained).toStrictEqual({
          roots,
          requested,
          contained: shippedResolveContainedCwd(requested, roots),
        });
        recordPorted(contained, rootFolds(root));
      }
      const trusted = firstTrustedRoot(roots, processPathResolver);
      expect(trusted).toStrictEqual(shippedFirstTrustedRoot(roots));
      recordPorted(trusted, rootFolds(root));
    }
  });

  test('canonicalizes outside the roots the same way', () => {
    for (const base of [tree.workspace, tree.outside, root]) {
      for (const requested of requestedPaths()) {
        const canonical = {
          base,
          requested,
          canonical: resolveCanonicalCwd(requested, base, processPathResolver),
        };
        expect(canonical).toStrictEqual({
          base,
          requested,
          canonical: shippedResolveCanonicalCwd(requested, base),
        });
        if (!climbsOut(base, requested)) recordPorted(canonical, rootFolds(root));
      }
    }
  });

  test('agrees on usable directories and containment arithmetic', () => {
    for (const path of requestedPaths()) {
      const usable = isUsableDirectory(path);
      expect(usable).toBe(shippedIsUsableDirectory(path));
      expect(usable).toMatchSnapshot();
      for (const other of [tree.workspace, tree.outside, root]) {
        const inside = isSameOrInsidePath(path, other);
        expect(inside).toBe(shippedIsSameOrInsidePath(path, other));
        expect(inside).toMatchSnapshot();
      }
    }
  });

  test('the fixture exercises the escaping symlink, the file and the missing directory', () => {
    expect(resolveContainedCwd(tree.link, [tree.workspace], processPathResolver)).toBe(tree.inner);
    expect(resolveContainedCwd(tree.escape, [tree.workspace], processPathResolver)).toBeUndefined();
    expect(resolveContainedCwd(tree.file, [tree.workspace], processPathResolver)).toBeUndefined();
    expect(
      resolveContainedCwd(tree.missing, [tree.workspace], processPathResolver),
    ).toBeUndefined();
    expect(resolveCanonicalCwd(tree.escape, tree.workspace, processPathResolver)).toBe(
      tree.outside,
    );
  });
});

describe('next/gate/intake execution-directory resolution', () => {
  test('resolves or fails closed on the same requested directories', () => {
    for (const cwdInput of [
      undefined,
      '',
      '   ',
      tree.workspace,
      tree.link,
      tree.missing,
      tree.file,
      42,
      null,
      { path: tree.workspace },
    ]) {
      const nextDenials: IntegrationDenial[] = [];
      const shippedDenials: IntegrationDenial[] = [];
      const context = resolveStandardHookContext(
        cwdInput,
        { command: 'echo hi' },
        'Bash',
        (denial) => nextDenials.push(denial),
        processPathResolver,
        process.cwd(),
      );
      expect(context).toStrictEqual(
        shippedResolveStandardHookContext(cwdInput, { command: 'echo hi' }, 'Bash', (denial) =>
          shippedDenials.push(denial),
        ),
      );
      recordPorted(context, [...rootFolds(root), [process.cwd(), '<cwd>']]);
      expect(nextDenials).toStrictEqual(shippedDenials);
      recordPorted(nextDenials, [...rootFolds(root), [process.cwd(), '<cwd>']]);
    }
  });

  test('builds the same fail-closed denial, including past a tool-input limit', () => {
    for (const toolInput of [
      undefined,
      { command: 'rm -rf /' },
      { command: '' },
      'text',
      deepInput(200),
      {
        get command() {
          return 'rm -rf /';
        },
      },
    ]) {
      for (const segment of [undefined, '/some/segment']) {
        const nextDenials: IntegrationDenial[] = [];
        const shippedDenials: IntegrationDenial[] = [];
        outputFailedClosed((denial) => nextDenials.push(denial), toolInput, 'Bash', segment);
        shippedOutputFailedClosed(
          (denial) => shippedDenials.push(denial),
          toolInput,
          'Bash',
          segment,
        );
        expect(nextDenials).toStrictEqual(shippedDenials);
        expect(nextDenials).toMatchSnapshot();
      }
    }
  });
});
