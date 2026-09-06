import { describe, test } from 'bun:test';
import { homedir } from 'node:os';
import { dirname } from 'node:path';
import {
  expandAllowPathHome,
  getAllowPathHomeConflictError,
  getDestructiveAllowPathError,
  getSecretAllowPathError,
  getSecretDenyPathError,
} from '@/core/policy/allow-paths';
import { recordPorted } from '../../helpers/temp-home';

const HOMES = [homedir(), '/srv/home/tester', '/srv/home/tester/'];

/** The real home never reaches a test name or a record; the two literal homes are already fixed. */
const HOME_FOLDS = [[homedir(), '<home>']] as const;
const named = (home: string) => (home === homedir() ? '<home>' : home);

const VALUES: readonly unknown[] = [
  ' ',
  '',
  42,
  null,
  'rel/path',
  '~',
  '~/',
  '~/scratch',
  '$HOME',
  '${HOME}',
  '$HOME/..',
  '$HOME/x',
  '/',
  '/opt/x',
  homedir(),
  `${homedir()}/`,
  dirname(homedir()),
  `${homedir()}/.cc-safety-net`,
  `${homedir()}/.cc-safety-net/policy.json`,
  '~/.cc-safety-net',
  '**',
  'apps/*/.env',
  '.env.v?',
  '~/**/.ssh/config',
];

describe('allow path validators parity', () => {
  for (const home of HOMES) {
    test(`unknown values against ${named(home)}`, () => {
      const errors = VALUES.map((value) => ({
        destructive: getDestructiveAllowPathError(value, home),
        secretDeny: getSecretDenyPathError(value, home),
        secretAllow: getSecretAllowPathError(value, home),
      }));
      // VALUES[16] is `dirname(homedir())`, which every nested home answers differently and no fold
      // reaches — `dirname('/root')` is `'/'`, the literal row above it. Left out of the record.
      recordPorted(
        errors.filter((_, index) => index !== 16),
        HOME_FOLDS,
      );
    });

    test(`path strings against ${named(home)}`, () => {
      const strings = VALUES.filter((value): value is string => typeof value === 'string');
      const expansions = strings.map((value) => ({
        expanded: expandAllowPathHome(value, home),
        conflict: getAllowPathHomeConflictError(value, home),
      }));
      // The same `dirname(homedir())` row, at index 14 once the two non-strings are dropped.
      recordPorted(
        expansions.filter((_, index) => index !== 14),
        HOME_FOLDS,
      );
    });
  }
});
