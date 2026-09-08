import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { mkdirSync, mkdtempSync, realpathSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import type { IntegrationDenial } from '@/core/denial';
import { processPathResolver } from '@/core/environment';
import { getNonCommandToolInputKind, type NonCommandToolInputKind } from '@/core/tool-input';
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
} from '@/gate/intake';
import type { CommandToolKind } from '@/gate/invocation';

/**
 * Intake is where the gate reads the process: the stdin document, the tool name, and the
 * directory a host claims the call runs in. A change here changes the input every later stage
 * sees, so each surface states the answer it must produce rather than recording the one it did.
 *
 * The exhaustive tool-name-to-kind table belongs to `core/tool-input`, which owns the
 * classification; intake only decides when a host's own table overrides it.
 */

const FAIL_CLOSED_REASON =
  'CC Safety Net failed closed because command analysis failed unexpectedly. This is not caused by your command. Report it to the user.';

let root = '';
const tree = {
  workspace: '',
  inner: '',
  outside: '',
  link: '',
  escape: '',
  file: '',
  missing: '',
  sibling: '',
};

beforeAll(() => {
  root = realpathSync(mkdtempSync(join(tmpdir(), 'next-intake-')));
  tree.workspace = join(root, 'workspace');
  tree.inner = join(tree.workspace, 'inner');
  tree.outside = join(root, 'outside');
  tree.link = join(tree.workspace, 'link');
  tree.escape = join(tree.workspace, 'escape');
  tree.file = join(tree.workspace, 'file.txt');
  tree.missing = join(tree.workspace, 'missing');
  // A name the workspace's own is a string prefix of: containment compares path segments, not
  // characters, so this directory is outside the workspace however alike the two spellings read.
  tree.sibling = `${tree.workspace}-sibling`;
  mkdirSync(tree.inner, { recursive: true });
  mkdirSync(tree.outside, { recursive: true });
  mkdirSync(tree.sibling, { recursive: true });
  writeFileSync(tree.file, 'x');
  symlinkSync(tree.inner, tree.link);
  symlinkSync(tree.outside, tree.escape);
});

afterAll(() => {
  rmSync(root, { recursive: true, force: true });
});

describe('the route a tool name resolves to', () => {
  const hostTable = (entries: readonly (readonly [string, CommandToolKind])[]) => new Map(entries);

  test('a name the host lists is a command in the shell that host named', () => {
    const rows: readonly (readonly [string, CommandToolKind])[] = [
      ['Bash', 'posix'],
      ['PowerShell', 'powershell'],
      ['Shell', 'auto'],
      ['run_shell_command', 'auto'],
      ['terminal', 'posix'],
    ];
    for (const [toolName, shell] of rows) {
      expect(getToolRoute(toolName, hostTable([[toolName, shell]]))).toEqual({
        kind: 'command',
        shell,
      });
    }
  });

  test('a host that calls a file tool a shell gets a command route, not the built-in kind', () => {
    // `read` is a path tool everywhere else; a host whose `read` runs a shell must not have its
    // command handed to the path guards as a filename.
    expect(getNonCommandToolInputKind('read')).toBe('path');
    expect(getToolRoute('read', hostTable([['read', 'posix']]))).toEqual({
      kind: 'command',
      shell: 'posix',
    });
  });

  test('a name the host does not list keeps the built-in classification', () => {
    const rows: readonly (readonly [string, NonCommandToolInputKind])[] = [
      ['apply_patch', 'patch'],
      ['Str_Replace_Editor', 'path'],
      ['rg', 'grep'],
      ['glob', 'glob'],
      ['Bash', 'unknown'],
      ['mcp__server__tool', 'unknown'],
    ];
    for (const [toolName, kind] of rows) {
      expect(getToolRoute(toolName, hostTable([['Shell', 'auto']]))).toEqual({ kind });
      expect(getToolRoute(toolName, hostTable([]))).toEqual({ kind });
    }
  });

  test('the host table is read by the exact name a host sent, not a normalized one', () => {
    // The classifier folds case and separators; the host table does not, so a table listing
    // `Bash` cannot claim a call the host spelled `bash`.
    const table = hostTable([['Bash', 'posix']]);
    expect(getToolRoute('Bash', table)).toEqual({ kind: 'command', shell: 'posix' });
    expect(getToolRoute('bash', table)).toEqual({ kind: 'unknown' });
  });
});

describe('reading the hook document from stdin', () => {
  async function* chunks(values: readonly (string | Uint8Array)[]) {
    for (const value of values) yield value;
  }

  test('the cap is eight mebibytes of raw input', () => {
    expect(HOOK_INPUT_MAX_BYTES).toBe(8 * 1024 * 1024);
  });

  test('string and byte chunks concatenate into one document', async () => {
    const values = ['{"a":', new TextEncoder().encode('1}'), '', '\n'];
    expect(await readBoundedHookInput(chunks(values))).toBe('{"a":1}\n');
  });

  test('input over the cap is refused and the stream is stopped', async () => {
    const stopped: string[] = [];
    const megabyte = Buffer.alloc(1024 * 1024, 0x61);
    const input = Object.assign(
      (async function* () {
        for (let index = 0; index < 9; index++) yield megabyte;
      })(),
      { destroy: () => stopped.push('destroy') },
    );

    await expect(readBoundedHookInput(input)).rejects.toThrow('hook input byte limit exceeded');
    expect(stopped).toStrictEqual(['destroy']);
  });
});

describe('parsing the hook document', () => {
  /** Whatever JSON names is handed on; only text JSON refuses becomes a denial. */
  const rows: readonly {
    readonly text: string;
    readonly parsed: unknown;
    readonly denied: boolean;
  }[] = [
    { text: '{"a":1}', parsed: { a: 1 }, denied: false },
    { text: '[]', parsed: [], denied: false },
    { text: 'null', parsed: null, denied: false },
    { text: '"text"', parsed: 'text', denied: false },
    { text: '', parsed: undefined, denied: true },
    { text: '{', parsed: undefined, denied: true },
    { text: '{"a":}', parsed: undefined, denied: true },
    { text: 'undefined', parsed: undefined, denied: true },
  ];

  test.each(rows.map((row) => [JSON.stringify(row.text), row] as const))('%s', (_label, row) => {
    const denials: IntegrationDenial[] = [];
    const parsed: unknown = parseHookJson(row.text, (denial) => denials.push(denial), 'bad json');
    expect(parsed).toEqual(row.parsed);
    expect(denials).toEqual(row.denied ? [{ reason: 'bad json' }] : []);
  });
});

describe('the directory a call is contained to', () => {
  /** Every requested spelling the rows below draw from, named by what it is. */
  const requestedPaths = () => [
    tree.workspace,
    tree.inner,
    tree.link,
    tree.escape,
    tree.file,
    tree.missing,
    tree.outside,
    tree.sibling,
    root,
    'inner',
    './inner',
    '..',
    '.',
    '',
    join(tree.inner, '..', 'inner'),
  ];

  const rootSets = () => [
    [],
    [tree.workspace],
    [tree.inner],
    [tree.missing],
    [tree.file],
    [tree.missing, tree.workspace],
    [tree.workspace, tree.outside],
    [tree.outside],
  ];

  const contained = (requested: string, roots: readonly string[]) =>
    resolveContainedCwd(requested, roots, processPathResolver);

  test('a directory inside a trusted root resolves to its canonical self', () => {
    expect(contained(tree.workspace, [tree.workspace])).toBe(tree.workspace);
    expect(contained(tree.inner, [tree.workspace])).toBe(tree.inner);
    // A symlink is followed, so a later path guard compares the real location.
    expect(contained(tree.link, [tree.workspace])).toBe(tree.inner);
    expect(contained(join(tree.inner, '..', 'inner'), [tree.workspace])).toBe(tree.inner);
  });

  test('anything that is not a directory inside a root is refused', () => {
    // The escape link and the outside directory are the same place; neither is under the root.
    expect(contained(tree.escape, [tree.workspace])).toBeUndefined();
    expect(contained(tree.outside, [tree.workspace])).toBeUndefined();
    // A sibling whose name merely starts with the root's.
    expect(contained(tree.sibling, [tree.workspace])).toBeUndefined();
    // A parent of the root, reached by name or by climbing.
    expect(contained(root, [tree.workspace])).toBeUndefined();
    expect(contained('..', [tree.workspace])).toBeUndefined();
    // A file and a path that is not there at all.
    expect(contained(tree.file, [tree.workspace])).toBeUndefined();
    expect(contained(tree.missing, [tree.workspace])).toBeUndefined();
  });

  test('a relative request resolves against the first usable root', () => {
    expect(contained('inner', [tree.workspace])).toBe(tree.inner);
    expect(contained('./inner', [tree.workspace])).toBe(tree.inner);
    expect(contained('.', [tree.workspace])).toBe(tree.workspace);
    expect(contained('', [tree.workspace])).toBe(tree.workspace);
    // The first root that is a usable directory, so an unusable one ahead of it is stepped over.
    expect(contained('inner', [tree.missing, tree.workspace])).toBe(tree.inner);
    // Resolved against the first root, not against the one that would contain it.
    expect(contained('inner', [tree.outside, tree.workspace])).toBeUndefined();
  });

  test('no usable root means nothing is contained', () => {
    for (const roots of [[], [tree.missing], [tree.file]]) {
      expect(contained(tree.workspace, roots)).toBeUndefined();
      expect(firstTrustedRoot(roots, processPathResolver)).toBeUndefined();
    }
  });

  test('a second root admits what the first one does not', () => {
    expect(contained(tree.outside, [tree.workspace, tree.outside])).toBe(tree.outside);
    expect(contained(tree.escape, [tree.workspace, tree.outside])).toBe(tree.outside);
    expect(contained(tree.inner, [tree.workspace, tree.outside])).toBe(tree.inner);
  });

  test('firstTrustedRoot names the first root that is a usable directory', () => {
    expect(firstTrustedRoot([tree.workspace], processPathResolver)).toBe(tree.workspace);
    expect(firstTrustedRoot([tree.missing, tree.workspace], processPathResolver)).toBe(
      tree.workspace,
    );
    expect(firstTrustedRoot([tree.link], processPathResolver)).toBe(tree.inner);
  });

  /**
   * The guarantee the containment check exists for, over every pair the fixture can make: an
   * answer is never a path the caller could reach outside the roots it was given. Dropping the
   * containment test in `resolveContainedCwd` fails this on the escaping symlink alone.
   */
  test('no pair ever answers with a path outside its trusted roots', () => {
    let answered = 0;
    for (const roots of rootSets()) {
      const canonicalRoots = roots.flatMap((entry) => {
        const real = processPathResolver.realpath(entry);
        return real !== null && processPathResolver.isDirectory(real) ? [real] : [];
      });
      for (const requested of requestedPaths()) {
        const answer = contained(requested, roots);
        if (answer === undefined) continue;
        answered++;
        expect(isUsableDirectory(answer)).toBeTrue();
        expect(realpathSync(answer)).toBe(answer);
        expect(canonicalRoots.some((entry) => isSameOrInsidePath(answer, entry))).toBeTrue();
      }
    }
    // The rows above are not passing by refusing everything.
    expect(answered).toBeGreaterThan(20);
  });
});

describe('the directory a call is canonicalized to without containment', () => {
  const canonical = (requested: string, base: string) =>
    resolveCanonicalCwd(requested, base, processPathResolver);

  test('an existing directory canonicalizes wherever it lies', () => {
    expect(canonical(tree.inner, tree.workspace)).toBe(tree.inner);
    // Outside the base, which is the whole point: an agent may legitimately run elsewhere.
    expect(canonical(tree.outside, tree.workspace)).toBe(tree.outside);
    expect(canonical(tree.escape, tree.workspace)).toBe(tree.outside);
    expect(canonical(root, tree.workspace)).toBe(root);
    expect(canonical('..', root)).toBe(dirname(root));
  });

  test('a relative request resolves against the base it was given', () => {
    expect(canonical('inner', tree.workspace)).toBe(tree.inner);
    expect(canonical('./inner', tree.workspace)).toBe(tree.inner);
    expect(canonical('.', tree.outside)).toBe(tree.outside);
    expect(canonical('', tree.outside)).toBe(tree.outside);
    expect(canonical('..', tree.workspace)).toBe(root);
    // The same relative name resolves nowhere from a base that has no such child.
    expect(canonical('inner', tree.outside)).toBeUndefined();
  });

  test('a file and a missing path canonicalize to nothing', () => {
    expect(canonical(tree.file, tree.workspace)).toBeUndefined();
    expect(canonical(tree.missing, tree.workspace)).toBeUndefined();
  });
});

describe('the two path predicates intake decides with', () => {
  test('a usable directory is one that exists, is a directory, and can be entered', () => {
    const rows: readonly (readonly [() => string, boolean])[] = [
      [() => tree.workspace, true],
      [() => tree.inner, true],
      [() => tree.outside, true],
      [() => root, true],
      // A symlink to a directory is usable; the stat follows it.
      [() => tree.link, true],
      [() => tree.escape, true],
      [() => tree.file, false],
      [() => tree.missing, false],
    ];
    for (const [path, usable] of rows) expect(isUsableDirectory(path())).toBe(usable);
  });

  test('containment compares path segments, not string prefixes', () => {
    expect(isSameOrInsidePath(tree.workspace, tree.workspace)).toBeTrue();
    expect(isSameOrInsidePath(tree.inner, tree.workspace)).toBeTrue();
    expect(isSameOrInsidePath(tree.workspace, tree.inner)).toBeFalse();
    expect(isSameOrInsidePath(tree.outside, tree.workspace)).toBeFalse();
    // The prefix trap: `<root>/workspace-sibling` starts with `<root>/workspace`.
    expect(isSameOrInsidePath(tree.sibling, tree.workspace)).toBeFalse();
    expect(isSameOrInsidePath(tree.workspace, root)).toBeTrue();
    expect(isSameOrInsidePath(root, tree.workspace)).toBeFalse();
  });
});

describe('the execution directory a hook call reports', () => {
  const resolve = (cwdInput: unknown) => {
    const denials: IntegrationDenial[] = [];
    const context = resolveStandardHookContext(
      cwdInput,
      { command: 'echo hi' },
      'Bash',
      (denial) => denials.push(denial),
      processPathResolver,
      process.cwd(),
    );
    return { context, denials };
  };

  test('a usable directory becomes both the config and the execution directory', () => {
    const resolved = resolve(tree.workspace);
    expect(resolved.context).toEqual({
      configCwd: tree.workspace,
      executionCwd: tree.workspace,
    });
    expect(resolved.denials).toEqual([]);
  });

  test('a symlinked directory reports the real one', () => {
    expect(resolve(tree.link).context).toEqual({
      configCwd: tree.inner,
      executionCwd: tree.inner,
    });
  });

  test('no directory at all falls back to the process working directory', () => {
    const resolved = resolve(undefined);
    expect(resolved.context).toEqual({
      configCwd: realpathSync(process.cwd()),
      executionCwd: realpathSync(process.cwd()),
    });
    expect(resolved.denials).toEqual([]);
  });

  /**
   * Every other shape fails closed rather than guessing a directory. The denial carries what the
   * host sent when that was a string, so the report names the directory it could not use; for a
   * value that is not a string there is nothing to name and the command stands in.
   */
  test.each([
    ['an empty string', '', ''],
    ['a blank string', '   ', '   '],
    ['a path that is not there', 'missing', undefined],
    ['a file', 'file', undefined],
    ['a number', 42, 'echo hi'],
    ['null', null, 'echo hi'],
    ['an object naming a path', { path: 'workspace' }, 'echo hi'],
  ] as const)('%s fails closed', (_label, cwdInput, expectedSegment) => {
    const sent = cwdInput === 'missing' ? tree.missing : cwdInput === 'file' ? tree.file : cwdInput;
    const resolved = resolve(sent);

    expect(resolved.context).toBeNull();
    expect(resolved.denials).toEqual([
      {
        reason: FAIL_CLOSED_REASON,
        intent: 'stop_and_explain',
        command: 'echo hi',
        segment: expectedSegment === undefined ? (sent as string) : expectedSegment,
        toolName: 'Bash',
      },
    ]);
  });
});

describe('the fail-closed denial', () => {
  const denialFor = (toolInput: unknown, segment?: string) => {
    const denials: IntegrationDenial[] = [];
    outputFailedClosed((denial) => denials.push(denial), toolInput, 'Bash', segment);
    expect(denials).toHaveLength(1);
    return denials[0] as IntegrationDenial;
  };

  test('the command is carried when the input plainly holds one', () => {
    expect(denialFor({ command: 'rm -rf /' })).toEqual({
      reason: FAIL_CLOSED_REASON,
      intent: 'stop_and_explain',
      command: 'rm -rf /',
      // With no segment of its own the denial points at the whole command.
      segment: 'rm -rf /',
      toolName: 'Bash',
    });
    expect(denialFor({ command: 'rm -rf /' }, '/some/segment').segment).toBe('/some/segment');
  });

  /** Nothing here is a command the report can quote, so the denial goes out without one. */
  test.each([
    ['no input at all', undefined],
    ['an empty command', { command: '' }],
    ['a payload that is not an object', 'text'],
    ['a payload nested past the traversal cap', deepInput(200)],
    [
      'a command behind a getter, which the reader refuses to run',
      {
        get command() {
          return 'rm -rf /';
        },
      },
    ],
  ] as const)('%s denies without a command', (_label, toolInput) => {
    expect(denialFor(toolInput)).toEqual({
      reason: FAIL_CLOSED_REASON,
      intent: 'stop_and_explain',
      toolName: 'Bash',
    });
    expect(denialFor(toolInput, '/some/segment').segment).toBe('/some/segment');
  });
});

function deepInput(depth: number): unknown {
  return Array.from({ length: depth }).reduce<unknown>((inner) => ({ nested: inner }), {
    command: 'rm -rf /',
  });
}
