import { afterAll, describe, expect, test } from 'bun:test';
import { mkdirSync, mkdtempSync, rmSync, symlinkSync } from 'node:fs';
import { join } from 'node:path';
import {
  getEffectiveTmpdirValue,
  hasUnsafeTmpdirWordSplitting,
  isTmpdirOverriddenToNonTemp,
  isTmpdirValueTrusted,
  isTrustedTempPath,
  isTrustedTempRootPath,
} from '@/core/paths/tmpdir';
import { corpusWords, pairedEnvironments, pickWord, seededRandom } from '../differential-inputs';

/**
 * Which temp locations `rm -rf` may treat as disposable: the fixed roots and the OS temp
 * directory, canonicalized through the filesystem, and only when the value that names them is a
 * literal the gate can read. A `TMPDIR` an agent assigns itself, a value carrying shell
 * expansion, and a word-splitting `IFS` all put the target back under ordinary protection.
 */

const HOME = '/srv/home/tester';
// Every row spells the POSIX temp roots. Windows has none of them: its trusted root is the system
// temp directory alone, and `/tmp` there names a directory on the current drive that does not
// exist, so the fixture cannot even be made.
const POSIX_TEMP_ROOTS = process.platform !== 'win32';
// Made under the literal `/tmp` root rather than `tmpdir()`: the OS temp directory is only a
// trusted root on darwin when it is the per-user `/var/folders/xx/yyy/T` form, so a session with
// `TMPDIR` set elsewhere would otherwise decide these fixtures differently.
const root = POSIX_TEMP_ROOTS ? mkdtempSync('/tmp/next-tmpdir-') : '';
const outside = POSIX_TEMP_ROOTS ? mkdtempSync('/tmp/next-tmpdir-outside-') : '';
if (POSIX_TEMP_ROOTS) {
  mkdirSync(join(root, 'inner'));
  symlinkSync(outside, join(root, 'escape'));
  symlinkSync(join(root, 'nowhere'), join(root, 'broken'));
}

afterAll(() => {
  for (const dir of [root, outside].filter((dir) => dir !== ''))
    rmSync(dir, { recursive: true, force: true });
});

const environment = pairedEnvironments({}, HOME);

describe.skipIf(!POSIX_TEMP_ROOTS)('trusted temp locations', () => {
  const paths = [
    { name: 'the /tmp root', path: '/tmp', trusted: true, root: true },
    { name: 'the /tmp root with a trailing separator', path: '/tmp/', trusted: true, root: true },
    { name: 'a directory under /tmp', path: '/tmp/sub', trusted: true, root: false },
    { name: 'the /var/tmp root', path: '/var/tmp', trusted: true, root: true },
    { name: 'a directory under /var/tmp', path: '/var/tmp/x', trusted: true, root: false },
    {
      name: 'the macOS /private/var/tmp root',
      path: '/private/var/tmp',
      trusted: true,
      root: true,
    },
    { name: 'a directory under /private/tmp', path: '/private/tmp/x', trusted: true, root: false },
    {
      name: 'a sibling whose name only starts like the root',
      path: '/tmp-evil',
      trusted: false,
      root: false,
    },
    {
      name: 'a path that climbs out of /tmp before it is compared',
      path: '/tmp/../etc',
      trusted: false,
      root: false,
    },
    { name: 'an ordinary system directory', path: '/etc', trusted: false, root: false },
    {
      name: 'a relative path, which names no root',
      path: 'relative/tmp',
      trusted: false,
      root: false,
    },
    { name: 'an unexpanded tilde path', path: '~/tmp', trusted: false, root: false },
    { name: 'an empty path', path: '', trusted: false, root: false },
    { name: 'a path the platform rejects outright', path: '/tmp\0x', trusted: false, root: false },
    {
      name: 'a fixture directory made under /tmp',
      path: root,
      trusted: true,
      root: false,
    },
    {
      name: 'a subdirectory of that fixture',
      path: join(root, 'inner'),
      trusted: true,
      root: false,
    },
    {
      name: 'a symlink to another temp directory, followed to its target',
      path: join(root, 'escape'),
      trusted: true,
      root: false,
    },
    {
      name: 'a symlink under a temp root that resolves to nothing',
      path: join(root, 'broken'),
      trusted: false,
      root: false,
    },
  ];

  for (const row of paths) {
    test(`classifies ${row.name}`, () => {
      expect({
        trustedPath: isTrustedTempPath(row.path, environment),
        trustedRoot: isTrustedTempRootPath(row.path, environment),
      }).toEqual({ trustedPath: row.trusted, trustedRoot: row.root });
    });
  }
});

describe.skipIf(!POSIX_TEMP_ROOTS)('tmpdir trust for a command', () => {
  const rows: {
    name: string;
    env: Record<string, string>;
    assign: Record<string, string>;
    expected: {
      overridden: boolean;
      trusted: boolean;
      effective: string | undefined;
      splitting: boolean;
    };
  }[] = [
    {
      name: 'trusts an inherited TMPDIR that names a temp directory',
      env: { TMPDIR: '/tmp' },
      assign: {},
      expected: { overridden: false, trusted: true, effective: '/tmp', splitting: false },
    },
    {
      name: 'trusts a session with no TMPDIR at all',
      env: {},
      assign: {},
      expected: { overridden: false, trusted: true, effective: undefined, splitting: false },
    },
    {
      name: 'distrusts an inherited non-temp TMPDIR without calling it an override',
      env: { TMPDIR: '/Users' },
      assign: {},
      expected: { overridden: false, trusted: false, effective: '/Users', splitting: false },
    },
    {
      name: 'accepts an assignment that names a directory under a temp root',
      env: {},
      assign: { TMPDIR: '/tmp/build' },
      expected: { overridden: false, trusted: true, effective: '/tmp/build', splitting: false },
    },
    {
      name: 'reports an assignment that moves TMPDIR outside the temp roots',
      env: {},
      assign: { TMPDIR: '/Users' },
      expected: { overridden: true, trusted: false, effective: '/Users', splitting: false },
    },
    {
      name: 'reports an empty assignment, because $TMPDIR/foo would expand to /foo',
      env: { TMPDIR: '/tmp' },
      assign: { TMPDIR: '' },
      expected: { overridden: true, trusted: false, effective: '', splitting: false },
    },
    {
      name: 'reports an assignment carrying a variable the value cannot be read through',
      env: {},
      assign: { TMPDIR: '/tmp/$x' },
      expected: { overridden: true, trusted: false, effective: '/tmp/$x', splitting: false },
    },
    {
      name: 'reports an assignment carrying a command substitution',
      env: {},
      assign: { TMPDIR: '/tmp/`x`' },
      expected: { overridden: true, trusted: false, effective: '/tmp/`x`', splitting: false },
    },
    {
      name: 'reports an assignment carrying a glob',
      env: {},
      assign: { TMPDIR: '/tmp/*' },
      expected: { overridden: true, trusted: false, effective: '/tmp/*', splitting: false },
    },
    {
      name: 'reports an assignment carrying a brace expansion',
      env: {},
      assign: { TMPDIR: '/tmp/{a,b}' },
      expected: { overridden: true, trusted: false, effective: '/tmp/{a,b}', splitting: false },
    },
    {
      name: 'reports an assignment carrying an extglob',
      env: {},
      assign: { TMPDIR: '/tmp/+(x)' },
      expected: { overridden: true, trusted: false, effective: '/tmp/+(x)', splitting: false },
    },
    {
      name: 'reports an assignment carrying whitespace the shell would split',
      env: {},
      assign: { TMPDIR: '/tmp/a b' },
      expected: { overridden: true, trusted: false, effective: '/tmp/a b', splitting: false },
    },
    {
      name: 'lets a trusted assignment override an untrusted inherited value',
      env: { TMPDIR: '/Users' },
      assign: { TMPDIR: '/tmp' },
      expected: { overridden: false, trusted: true, effective: '/tmp', splitting: false },
    },
    {
      name: 'lets an untrusted assignment override a trusted inherited value',
      env: { TMPDIR: '/tmp' },
      assign: { TMPDIR: '/Users' },
      expected: { overridden: true, trusted: false, effective: '/Users', splitting: false },
    },
    {
      name: 'reports a word-splitting IFS as an override even with no TMPDIR in sight',
      env: { IFS: ':' },
      assign: {},
      expected: { overridden: true, trusted: true, effective: undefined, splitting: true },
    },
    {
      name: 'reports a word-splitting IFS over a temp TMPDIR, because $TMPDIR/x can split apart',
      env: { TMPDIR: '/tmp' },
      assign: { IFS: 'x' },
      expected: { overridden: true, trusted: true, effective: '/tmp', splitting: true },
    },
    {
      name: 'treats the default IFS as no word splitting',
      env: { IFS: ' \t\n' },
      assign: {},
      expected: { overridden: false, trusted: true, effective: undefined, splitting: false },
    },
    {
      name: 'treats an empty IFS as no word splitting',
      env: { IFS: '' },
      assign: {},
      expected: { overridden: false, trusted: true, effective: undefined, splitting: false },
    },
    {
      name: 'lets an assigned default IFS clear an inherited word-splitting one',
      env: { IFS: ':' },
      assign: { IFS: ' \t\n' },
      expected: { overridden: false, trusted: true, effective: undefined, splitting: false },
    },
  ];

  for (const row of rows) {
    test(row.name, () => {
      const paired = pairedEnvironments(row.env, HOME);
      const assigned = new Map(Object.entries(row.assign));
      expect({
        overridden: isTmpdirOverriddenToNonTemp(assigned, paired),
        trusted: isTmpdirValueTrusted(assigned, paired),
        effective: getEffectiveTmpdirValue(assigned, paired),
        splitting: hasUnsafeTmpdirWordSplitting(assigned, paired),
      }).toEqual(row.expected);
    });
  }
});

/**
 * The properties every TMPDIR value must decide by, over values glued from the fragments a shell
 * can spell and the words the two contract corpora carry: what a caller may not get is a crash,
 * a value trusted while it still carries expansion, or an override that disagrees with trust.
 */
describe.skipIf(!POSIX_TEMP_ROOTS)('tmpdir trust invariants over generated values', () => {
  const FRAGMENTS = [
    '/tmp',
    '/tmp/',
    '/var/tmp/',
    '/var',
    '/private',
    '/',
    '..',
    'x',
    '$',
    '`',
    '*',
    '?',
    '[',
    '{a,b}',
    '{1..2}',
    '@(x)',
    ' ',
    '\t',
    '~',
  ];
  const SPLITTING_IFS = ['', ' \t\n', ':', 'x'];

  /** Every answer for one generated value, or what deciding it threw. */
  function decide(value: string, ifs: string) {
    const assignedOnly = pairedEnvironments({}, HOME);
    const inheritedWithIfs = pairedEnvironments({ TMPDIR: value, IFS: ifs }, HOME);
    try {
      return {
        value,
        ifs,
        assigned: {
          overridden: isTmpdirOverriddenToNonTemp(new Map([['TMPDIR', value]]), assignedOnly),
          trusted: isTmpdirValueTrusted(new Map([['TMPDIR', value]]), assignedOnly),
          trustedPath: isTrustedTempPath(value, assignedOnly),
        },
        inherited: {
          overridden: isTmpdirOverriddenToNonTemp(new Map(), inheritedWithIfs),
          splitting: hasUnsafeTmpdirWordSplitting(new Map(), inheritedWithIfs),
        },
      };
    } catch (error) {
      return { value, ifs, error };
    }
  }

  const decided = (() => {
    const random = seededRandom(0x7e3d_1201);
    const words = [...FRAGMENTS, ...corpusWords()];
    return Array.from({ length: 300 }, () =>
      decide(
        Array.from({ length: 1 + Math.floor(random() * 6) }, () => pickWord(random, words)).join(
          '',
        ),
        pickWord(random, SPLITTING_IFS),
      ),
    );
  })();

  const generated = decided.flatMap((row) => ('error' in row ? [] : [row]));

  test('decides every generated value instead of throwing at its caller', () => {
    expect(decided.filter((row) => 'error' in row)).toEqual([]);
    expect(generated.length).toBe(decided.length);
  });

  test('reports an assigned value as an override exactly when it is not trusted', () => {
    expect(generated.filter((row) => row.assigned.trusted)).not.toEqual([]);
    expect(generated.filter((row) => !row.assigned.trusted)).not.toEqual([]);
    expect(generated.filter((row) => row.assigned.overridden !== !row.assigned.trusted)).toEqual(
      [],
    );
  });

  test('never trusts an assigned value that still carries shell expansion', () => {
    const expanding = generated.filter((row) => /[\s$`*?[]/.test(row.value));
    expect(expanding.length).toBeGreaterThan(0);
    expect(expanding.filter((row) => row.assigned.trusted)).toEqual([]);
  });

  test('only trusts a value whose canonical path sits under a temp root', () => {
    expect(generated.filter((row) => row.assigned.trusted)).not.toEqual([]);
    expect(generated.filter((row) => row.assigned.trusted && !row.assigned.trustedPath)).toEqual(
      [],
    );
  });

  test('reports a word-splitting IFS as an override whatever the inherited value is', () => {
    const splitting = generated.filter((row) => row.ifs !== '' && row.ifs !== ' \t\n');
    expect(splitting.length).toBeGreaterThan(0);
    expect(
      splitting.filter((row) => !row.inherited.splitting || !row.inherited.overridden),
    ).toEqual([]);
  });

  test('never calls an inherited value an override while IFS is harmless', () => {
    const harmless = generated.filter((row) => row.ifs === '' || row.ifs === ' \t\n');
    expect(harmless.length).toBeGreaterThan(0);
    expect(harmless.filter((row) => row.inherited.overridden)).toEqual([]);
  });
});
