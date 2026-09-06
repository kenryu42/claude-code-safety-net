import { afterAll, beforeAll, describe, test } from 'bun:test';
import { mkdirSync, mkdtempSync, realpathSync, rmSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import * as next from '@/core/paths/tmpdir';
import { expectRecordedDigest } from '../../helpers/gate-differential';
import { normalize, rootFolds } from '../../helpers/temp-home';
import { corpusWords, pairedEnvironments, pickWord, seededRandom } from '../differential-inputs';

const IFS_VALUES = [undefined, '', ' \t\n', ':', 'x'];
const FRAGMENTS = [
  '/tmp',
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

let root = '';
let outside = '';

/**
 * Every machine-specific temp path a recorded value carries: the two fixture roots, under their
 * own names. The host's temp directory itself is not folded — it is `/tmp` here and
 * `/var/folders/…` on a macOS runner, so folding it would rewrite every literal `/tmp…` row of the
 * table on one host and none of them on the other.
 */
const tmpdirFolds = () => [
  [realpathSync(outside), '<outside>'] as const,
  [outside, '<outside>'] as const,
  ...rootFolds(root),
];

function tmpdirValues(): (string | undefined)[] {
  return [
    undefined,
    '/tmp',
    '/tmp/',
    '/tmp/sub',
    '/var/tmp/x',
    '/private/tmp/x',
    '/private/var/tmp',
    '/tmp/../etc',
    '/tmp-evil',
    '',
    ' ',
    '/tmp/$x',
    '/tmp/`x`',
    '/tmp/{a,b}',
    '/tmp/{1..3}',
    '/tmp/+(x)',
    '/tmp/a b',
    'relative/tmp',
    '~/tmp',
    '/tmp/*',
    '/tmp/?',
    '/tmp/[a]',
    '/tmp\0x',
    root,
    join(root, 'escape'),
    join(root, 'escape', 'x'),
    join(root, 'inner'),
    join(root, 'broken'),
    outside,
    ...corpusWords(),
  ];
}

/** The six answers for one row, ready to be recorded. */
function compare(
  envValue: string | undefined,
  assigned: string | undefined,
  ifs: string | undefined,
): readonly [string, unknown] {
  const env = {
    ...(envValue === undefined ? {} : { TMPDIR: envValue }),
    ...(ifs === undefined ? {} : { IFS: ifs }),
  };
  const environment = pairedEnvironments(env, '/srv/home/tester');
  const assignments = new Map(assigned === undefined ? [] : [['TMPDIR', assigned]]);
  const overridden = next.isTmpdirOverriddenToNonTemp(assignments, environment);
  const trusted = next.isTmpdirValueTrusted(assignments, environment);
  const effective = next.getEffectiveTmpdirValue(assignments, environment);
  const splitting = next.hasUnsafeTmpdirWordSplitting(assignments, environment);
  const value = assigned ?? envValue ?? '';
  const trustedPath = next.isTrustedTempPath(value, environment);
  const trustedRoot = next.isTrustedTempRootPath(value, environment);
  return [
    `${envValue} | ${assigned} | ${ifs}`,
    { overridden, trusted, effective, splitting, trustedPath, trustedRoot },
  ];
}

/** Every slot one value can occupy for one IFS: inherited, assigned, and each opposite `/tmp`. */
const slots = (value: string | undefined, ifs: string | undefined) => [
  compare(value, undefined, ifs),
  compare(undefined, value, ifs),
  compare('/tmp', value, ifs),
  compare(value, '/tmp', ifs),
];

beforeAll(() => {
  root = mkdtempSync(join(tmpdir(), 'next-tmpdir-'));
  outside = mkdtempSync(join(tmpdir(), 'next-tmpdir-outside-'));
  mkdirSync(join(root, 'inner'));
  symlinkSync(outside, join(root, 'escape'));
  symlinkSync(join(root, 'nowhere'), join(root, 'broken'));
});

afterAll(() => {
  rmSync(root, { recursive: true, force: true });
  rmSync(outside, { recursive: true, force: true });
});

describe('tmpdir trust', () => {
  test('agrees with the shipped checks over the table, as inherited and as assigned', () => {
    const recorded = tmpdirValues().flatMap((value) =>
      IFS_VALUES.flatMap((ifs) => slots(value, ifs)),
    );
    // The host's own temp directory and a path under it decide like every other row and are spelled
    // differently on every machine: decided in every slot, recorded in none.
    for (const value of [tmpdir(), join(tmpdir(), 'x')])
      for (const ifs of IFS_VALUES) slots(value, ifs);
    expectRecordedDigest('core-tmpdir/table', normalize(recorded, tmpdirFolds()));
  });

  test('agrees with the shipped checks on a seeded fuzz of assigned values', () => {
    const random = seededRandom(0x7e3d_1201);
    const words = [...FRAGMENTS, ...corpusWords()];
    const recorded: (readonly [string, unknown])[] = [];
    for (let sample = 0; sample < 300; sample++) {
      const length = 1 + Math.floor(random() * 6);
      const value = Array.from({ length }, () => pickWord(random, words)).join('');
      recorded.push(compare(undefined, value, undefined));
      recorded.push(
        compare(
          value,
          undefined,
          pickWord(
            random,
            IFS_VALUES.filter((ifs) => ifs !== undefined),
          ),
        ),
      );
    }
    // Every fuzzed value is built from FRAGMENTS and the corpus alone, so nothing here is folded.
    expectRecordedDigest('core-tmpdir/fuzz', recorded);
  });
});
