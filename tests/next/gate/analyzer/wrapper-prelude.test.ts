import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { textCommandWords } from '@next/gate/analyzer/command-words';
import {
  parseEnvAssignment,
  reconstructEnvSplitWords,
  stripEnvAssignmentWords,
  stripWrappersForPathScan,
  stripWrappersWithInfo,
  stripWrapperWords,
} from '@next/gate/analyzer/wrapper-prelude';
import { textCommandWords as shippedTextCommandWords } from '@/analyzer/command-words';
import {
  parseEnvAssignment as shippedParseEnvAssignment,
  reconstructEnvSplitWords as shippedReconstructEnvSplitWords,
  stripEnvAssignmentWords as shippedStripEnvAssignmentWords,
  stripWrappersForPathScan as shippedStripForPathScan,
  stripWrappersWithInfo as shippedStripWithInfo,
  stripWrapperWords as shippedStripWrapperWords,
} from '@/analyzer/wrapper-prelude';
import { pairedEnvironments } from '../../core/differential-inputs';
import { expectRecordedDigest } from '../../helpers/gate-differential';
import { corpusCommands } from '../../helpers/shell-inputs';

/**
 * The prelude peel is fed the corpus commands and a table of every wrapper form it recognizes,
 * against a real directory tree so the `--chdir` resolutions walk the same filesystem on both
 * sides.
 */

const PRELUDES: readonly string[] = [
  '',
  'echo hi',
  'FOO=bar echo hi',
  'FOO=bar BAZ=qux echo hi',
  'FOO=bar',
  'TMPDIR+=/extra echo hi',
  'GIT_DIR+=/extra git status',
  'PATH+=:/x echo hi',
  '1BAD=x echo hi',
  'sudo rm -rf /tmp/x',
  'sudo -u root rm -rf /tmp/x',
  'sudo -i rm -rf /tmp/x',
  'sudo --login rm -rf /tmp/x',
  'sudo -D SUBDIR rm -rf x',
  'sudo --chdir=SUBDIR rm -rf x',
  'sudo -DSUBDIR rm -rf x',
  'sudo --chdir= rm -rf x',
  'sudo -D missing rm -rf x',
  'sudo -u root -- rm -rf x',
  'sudo -- rm -rf x',
  'sudo -p prompt rm -rf x',
  'sudo',
  'env rm -rf /tmp/x',
  'env -i rm -rf x',
  'env - rm -rf x',
  'env -u PATH rm -rf x',
  'env -uPATH rm -rf x',
  'env -u= rm -rf x',
  'env --unset=PATH rm -rf x',
  'env -C SUBDIR rm -rf x',
  'env --chdir=SUBDIR rm -rf x',
  'env -CSUBDIR rm -rf x',
  'env -C=SUBDIR rm -rf x',
  'env -C missing rm -rf x',
  'env -S LC_ALL=C rm -rf x',
  'env -SLC_ALL=C',
  'env --split-string=rm -rf x',
  'env --split-string rm -rf x',
  'env FOO=bar rm -rf x',
  'env FOO=bar -- rm -rf x',
  'env -0 printf x',
  'env -P /bin echo x',
  'env --null printf x',
  'env',
  'command rm -rf x',
  'command -p rm -rf x',
  'command -v ls',
  'command -pv ls',
  'command -V ls',
  'command -- rm -rf x',
  'command -x rm',
  'command',
  'builtin cd /tmp',
  'builtin -- echo hi',
  'nice -n 10 rm -rf x',
  'time rm -rf x',
  'exec rm -rf x',
  'sudo env FOO=1 command -p rm -rf x',
  'env sudo -u root rm -rf x',
  'FOO=1 sudo -u root env BAR=2 rm -rf x',
  'env -C SUBDIR env -C .. rm -rf x',
  'sudo -D SUBDIR env FOO=1 command -v ls',
];

const INHERITED = new Map([
  ['TMPDIR', '/inherited/tmp'],
  ['GIT_DIR', '/inherited/git'],
]);

const VARIABLES = {
  TMPDIR: '/process/tmp',
  HOME: '/home/tester',
  PATH: '/usr/bin',
  CO: 'checkout',
};

let root = '';

beforeAll(() => {
  root = mkdtempSync(join(tmpdir(), 'next-prelude-'));
  mkdirSync(join(root, 'sub'));
  writeFileSync(join(root, 'file'), 'x');
});

afterAll(() => {
  rmSync(root, { recursive: true, force: true });
});

function preludeArgvs(): readonly string[][] {
  return [
    ...PRELUDES.map((line) => line.split(/\s+/).filter((word) => word.length > 0)),
    ...corpusCommands().map((line) => line.split(/\s+/).filter((word) => word.length > 0)),
  ];
}

/** The table's `SUBDIR` placeholder resolved against the temporary tree. */
function withRoot(argv: readonly string[]): string[] {
  return argv.map((token) => token.replace('SUBDIR', join(root, 'sub')));
}

describe('env assignment words', () => {
  test('parseEnvAssignment agrees for every corpus word and prelude token', () => {
    const recorded: [string, unknown][] = [];
    for (const argv of preludeArgvs()) {
      for (const token of argv) {
        const assignment = parseEnvAssignment(token);
        expect(assignment).toStrictEqual(shippedParseEnvAssignment(token));
        recorded.push([token, assignment]);
      }
    }
    expectRecordedDigest('analyzer-wrapper-prelude/env-assignment', recorded, root);
  });

  test('stripEnvAssignmentWords agrees for every prelude', () => {
    const recorded: [string, unknown][] = [];
    for (const argv of preludeArgvs()) {
      const stripped = stripEnvAssignmentWords(textCommandWords(argv));
      expect(stripped).toStrictEqual(shippedStripEnvAssignmentWords(shippedTextCommandWords(argv)));
      recorded.push([argv.join(' '), stripped]);
    }
    expectRecordedDigest('analyzer-wrapper-prelude/strip-assignments', recorded, root);
  });
});

describe('wrapper peel', () => {
  test('stripWrapperWords agrees for every prelude, cwd and inherited assignment set', () => {
    const recorded: [string, unknown][] = [];
    const environments = pairedEnvironments(VARIABLES, '/home/tester');
    for (const argv of preludeArgvs()) {
      const tokens = withRoot(argv);
      for (const cwd of [undefined, null, root, join(root, 'file'), '/nowhere']) {
        for (const inherited of [undefined, INHERITED]) {
          const peeled = stripWrapperWords(
            textCommandWords(tokens),
            environments.next,
            cwd,
            inherited,
          );
          expect(peeled).toStrictEqual(
            shippedStripWrapperWords(
              shippedTextCommandWords(tokens),
              environments.shipped,
              cwd,
              inherited,
            ),
          );
          recorded.push([argv.join(' '), peeled]);
        }
      }
    }
    expectRecordedDigest('analyzer-wrapper-prelude/strip-wrappers', recorded, root);
  });

  test('the token views agree for every prelude', () => {
    const recorded: [string, unknown][] = [];
    const environments = pairedEnvironments(VARIABLES, '/home/tester');
    for (const argv of preludeArgvs()) {
      const tokens = withRoot(argv);
      const info = stripWrappersWithInfo(tokens, environments.next, root);
      expect(info).toStrictEqual(shippedStripWithInfo(tokens, environments.shipped, root));
      const scanned = stripWrappersForPathScan(tokens, environments.next, root);
      expect(scanned).toStrictEqual(shippedStripForPathScan(tokens, environments.shipped, root));
      recorded.push([argv.join(' '), { info, scanned }]);
    }
    expectRecordedDigest('analyzer-wrapper-prelude/token-views', recorded, root);
  });

  test('reconstructEnvSplitWords agrees on inert values and the splice budget', () => {
    const cases: readonly (readonly string[])[] = [
      [],
      ['LC_ALL=C rm -rf x'],
      ['  spaced   words  '],
      ['has "quote"'],
      ["has 'quote'"],
      ['has $var'],
      ['has `tick`'],
      ['has #comment'],
      ['has {brace}'],
      ['has \\escape'],
      [Array.from({ length: 70 }, (_, index) => `w${index}`).join(' ')],
    ];
    const recorded: [string, unknown][] = [];
    for (const values of cases) {
      for (const operands of [[], ['tail'], ['a', 'b']]) {
        const spliced = reconstructEnvSplitWords(values, operands);
        expect(spliced).toStrictEqual(shippedReconstructEnvSplitWords(values, operands));
        recorded.push([`${values.join('|')} ${operands.join('|')}`, spliced]);
      }
    }
    expectRecordedDigest('analyzer-wrapper-prelude/env-split-words', recorded, root);
  });
});
