import { describe, expect, test } from 'bun:test';
import {
  expandAllowPathHome,
  getAllowPathHomeConflictError,
  getDestructiveAllowPathError,
  getSecretAllowPathError,
  getSecretDenyPathError,
} from '@/core/policy/allow-paths';

/**
 * These three validators decide what a user may vouch for, and the GUI and `policy apply` print
 * the message they return next to the offending entry, so both the accept/reject decision and the
 * exact wording are contract. Everything runs against a literal home, so nothing here depends on
 * the machine the test runs on.
 */

const HOME = '/srv/home/tester';

const NOT_A_PATH = 'must be a non-empty path string';
const NOT_ABSOLUTE = 'must be an absolute path or start with ~/';
const IS_HOME = 'cannot be the home directory';
const CONTAINS_HOME = 'cannot contain the home directory';
const DENY_BLOCKS_EVERYTHING =
  'cannot be the home directory or a path above it (this would block every command the agent runs)';
const ALLOW_DISABLES_EVERYTHING =
  'cannot cover the home directory or a path above it (this would disable secret protection everywhere)';
const ALLOW_COVERS_GUARD = "cannot cover the guard's own configuration";
const HAS_GLOB = 'cannot contain glob characters (* or ?); list the exact file or directory';

type Row = {
  readonly behavior: string;
  readonly value: unknown;
  readonly destructive: string | null;
  readonly secretDeny: string | null;
  readonly secretAllow: string | null;
};

const ROWS: readonly Row[] = [
  {
    behavior: 'a non-string entry is not a path in any list',
    value: 42,
    destructive: NOT_A_PATH,
    secretDeny: NOT_A_PATH,
    secretAllow: NOT_A_PATH,
  },
  {
    behavior: 'null is not a path in any list',
    value: null,
    destructive: NOT_A_PATH,
    secretDeny: NOT_A_PATH,
    secretAllow: NOT_A_PATH,
  },
  {
    behavior: 'the empty string is not a path in any list',
    value: '',
    destructive: NOT_A_PATH,
    secretDeny: NOT_A_PATH,
    secretAllow: NOT_A_PATH,
  },
  {
    behavior: 'a blank string is not a path in any list',
    value: ' ',
    destructive: NOT_A_PATH,
    secretDeny: NOT_A_PATH,
    secretAllow: NOT_A_PATH,
  },
  {
    behavior:
      'a relative entry is rejected for destructive allow but accepted by both secret lists, which resolve against each session cwd',
    value: 'rel/path',
    destructive: NOT_ABSOLUTE,
    secretDeny: null,
    secretAllow: null,
  },
  {
    behavior: 'a bare ~ is the home directory itself',
    value: '~',
    destructive: IS_HOME,
    secretDeny: DENY_BLOCKS_EVERYTHING,
    secretAllow: ALLOW_DISABLES_EVERYTHING,
  },
  {
    behavior: 'a trailing separator does not make ~/ a different directory from home',
    value: '~/',
    destructive: IS_HOME,
    secretDeny: DENY_BLOCKS_EVERYTHING,
    secretAllow: ALLOW_DISABLES_EVERYTHING,
  },
  {
    behavior: 'a home-anchored subdirectory is accepted everywhere',
    value: '~/scratch',
    destructive: null,
    secretDeny: null,
    secretAllow: null,
  },
  {
    behavior:
      '$HOME is not expanded for destructive allow paths, and expands to home for both secret lists',
    value: '$HOME',
    destructive: NOT_ABSOLUTE,
    secretDeny: DENY_BLOCKS_EVERYTHING,
    secretAllow: ALLOW_DISABLES_EVERYTHING,
  },
  {
    behavior: '${HOME} is the other spelling the secret lists expand',
    value: '${HOME}',
    destructive: NOT_ABSOLUTE,
    secretDeny: DENY_BLOCKS_EVERYTHING,
    secretAllow: ALLOW_DISABLES_EVERYTHING,
  },
  {
    behavior: 'a traversal out of home is normalized before it is judged',
    value: '$HOME/..',
    destructive: NOT_ABSOLUTE,
    secretDeny: DENY_BLOCKS_EVERYTHING,
    secretAllow: ALLOW_DISABLES_EVERYTHING,
  },
  {
    behavior: '$HOME/x expands to a subdirectory the secret lists accept',
    value: '$HOME/x',
    destructive: NOT_ABSOLUTE,
    secretDeny: null,
    secretAllow: null,
  },
  {
    behavior: 'the filesystem root contains home and is rejected by every list',
    value: '/',
    destructive: CONTAINS_HOME,
    secretDeny: DENY_BLOCKS_EVERYTHING,
    secretAllow: ALLOW_DISABLES_EVERYTHING,
  },
  {
    behavior: 'an absolute path outside home is accepted everywhere',
    value: '/opt/x',
    destructive: null,
    secretDeny: null,
    secretAllow: null,
  },
  {
    behavior: 'the home directory spelled absolutely is rejected the same way ~ is',
    value: HOME,
    destructive: IS_HOME,
    secretDeny: DENY_BLOCKS_EVERYTHING,
    secretAllow: ALLOW_DISABLES_EVERYTHING,
  },
  {
    behavior: 'a trailing separator on the absolute home changes nothing',
    value: `${HOME}/`,
    destructive: IS_HOME,
    secretDeny: DENY_BLOCKS_EVERYTHING,
    secretAllow: ALLOW_DISABLES_EVERYTHING,
  },
  {
    behavior: 'the parent of home contains home and is rejected by every list',
    value: '/srv/home',
    destructive: CONTAINS_HOME,
    secretDeny: DENY_BLOCKS_EVERYTHING,
    secretAllow: ALLOW_DISABLES_EVERYTHING,
  },
  {
    behavior:
      "the guard's own config directory may be vouched for as a destructive allow path but never as a secret allow path",
    value: `${HOME}/.cc-safety-net`,
    destructive: null,
    secretDeny: null,
    secretAllow: ALLOW_COVERS_GUARD,
  },
  {
    behavior: "a file inside the guard's config directory is covered by the same rejection",
    value: `${HOME}/.cc-safety-net/policy.json`,
    destructive: null,
    secretDeny: null,
    secretAllow: ALLOW_COVERS_GUARD,
  },
  {
    behavior: 'the home-anchored spelling of the guard config is rejected identically',
    value: '~/.cc-safety-net',
    destructive: null,
    secretDeny: null,
    secretAllow: ALLOW_COVERS_GUARD,
  },
  {
    behavior: 'a bare glob is not an absolute path and never vouches for anything',
    value: '**',
    destructive: NOT_ABSOLUTE,
    secretDeny: null,
    secretAllow: HAS_GLOB,
  },
  {
    behavior: 'a relative glob is rejected by the secret allow list on the glob alone',
    value: 'apps/*/.env',
    destructive: NOT_ABSOLUTE,
    secretDeny: null,
    secretAllow: HAS_GLOB,
  },
  {
    behavior: 'a single-character wildcard counts as a glob',
    value: '.env.v?',
    destructive: NOT_ABSOLUTE,
    secretDeny: null,
    secretAllow: HAS_GLOB,
  },
  {
    // The reason globs are rejected outright: this entry's literal prefix is harmless, and it
    // still reaches ~/.ssh/config.
    behavior: 'a home-anchored glob that can reach around its own root is rejected on the glob',
    value: '~/**/.ssh/config',
    destructive: null,
    secretDeny: null,
    secretAllow: HAS_GLOB,
  },
];

describe('allow and deny path entries', () => {
  test.each(ROWS.map((row) => [row.behavior, row] as const))('%s', (_behavior, row) => {
    expect(getDestructiveAllowPathError(row.value, HOME)).toBe(row.destructive);
    expect(getSecretDenyPathError(row.value, HOME)).toBe(row.secretDeny);
    expect(getSecretAllowPathError(row.value, HOME)).toBe(row.secretAllow);
  });

  test('a home given with a trailing separator judges every entry identically', () => {
    for (const row of ROWS) {
      expect(getDestructiveAllowPathError(row.value, `${HOME}/`)).toBe(row.destructive);
      expect(getSecretDenyPathError(row.value, `${HOME}/`)).toBe(row.secretDeny);
      expect(getSecretAllowPathError(row.value, `${HOME}/`)).toBe(row.secretAllow);
    }
  });
});

describe('home expansion', () => {
  test.each([
    ['a bare ~ becomes home', '~', HOME],
    ['~/ keeps the separator it was written with', '~/', `${HOME}/`],
    ['~/name anchors under home', '~/scratch', `${HOME}/scratch`],
    ['~name is a literal name, not an expansion', '~name', '~name'],
    ['$HOME is left alone here', '$HOME', '$HOME'],
    ['an absolute path passes through', '/opt/x', '/opt/x'],
  ])('%s', (_behavior, value, expanded) => {
    expect(expandAllowPathHome(value, HOME)).toBe(expanded);
  });
});

describe('the home conflict check that backs all three validators', () => {
  test.each([
    ['home itself is the home directory', HOME, IS_HOME],
    ['home with a trailing separator is still home', `${HOME}/`, IS_HOME],
    ['the parent of home contains home', '/srv/home', CONTAINS_HOME],
    ['the filesystem root contains home', '/', CONTAINS_HOME],
    ['a sibling directory does not contain home', '/srv/home-other', null],
    ['a subdirectory of home does not contain home', `${HOME}/scratch`, null],
    ['an unrelated absolute path does not contain home', '/opt/x', null],
  ])('%s', (_behavior, path, expected) => {
    expect(getAllowPathHomeConflictError(path, HOME)).toBe(expected);
  });
});
