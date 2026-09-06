import { expect } from 'bun:test';
import { mkdirSync, mkdtempSync, realpathSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, sep } from 'node:path';
import { createTestEnvironment, processPathResolver } from '@/core/environment';
import { createSpawnEnv } from '../helpers';
import { snapshotTree } from './fixture-tree';

/**
 * The isolation the installer tests run under: every home the code reads through its `Environment`
 * points at a temp root, so a case that regresses writes into a fixture instead of the developer's
 * real home.
 */

const roots: string[] = [];

export function createTempRoot(prefix: string): string {
  const root = mkdtempSync(join(process.env.CC_SAFETY_NET_TEST_TMPDIR ?? tmpdir(), prefix));
  roots.push(root);
  return root;
}

/** Drop every root `createTempRoot` handed out; call from `afterEach`. */
export function removeTempRoots(): void {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
}

/** Every variable that can move a host's config, cache or home out of the temp root. */
export const HOST_ENV_NAMES = [
  'HOME',
  'CC_SAFETY_NET_HOME',
  'CC_SAFETY_NET_AUDIT_HOME',
  'npm_config_cache',
  'TMPDIR',
  'KIMI_CODE_HOME',
  'GROK_HOME',
  'HERMES_HOME',
  'OPENCLAW_STATE_DIR',
  'OPENCLAW_CONFIG_PATH',
  'COPILOT_HOME',
  'GEMINI_CLI_HOME',
  'CODEX_HOME',
  'PI_CODING_AGENT_DIR',
  'AMP_SETTINGS_FILE',
  'CURSOR_DATA_DIR',
  'XDG_CONFIG_HOME',
  'XDG_CACHE_HOME',
  'LOCALAPPDATA',
];

export function isolationEnv(
  home: string,
  overrides: Record<string, string | undefined> = {},
): Record<string, string | undefined> {
  mkdirSync(join(home, 'tmp'), { recursive: true });
  return {
    ...Object.fromEntries(HOST_ENV_NAMES.map((name) => [name, undefined])),
    HOME: home,
    CC_SAFETY_NET_HOME: join(home, '.cc-safety-net'),
    CC_SAFETY_NET_AUDIT_HOME: join(home, '.cc-safety-net', 'audit'),
    npm_config_cache: join(home, '.npm'),
    TMPDIR: join(home, 'tmp'),
    ...overrides,
  };
}

/**
 * The same isolation as a child process environment, for spawning the built bins through node:
 * the inherited shell keeps everything the run needs (a PATH override, the terminal), while every
 * home, config and cache `isolationEnv` points at the temp root is applied over it and every host
 * variable it blanks leaves the map — Node stringifies an `undefined` value to the literal
 * `'undefined'`, so a blanked name has to be absent rather than unset.
 */
export function isolatedSpawnEnv(
  home: string,
  overrides: Record<string, string | undefined> = {},
): Record<string, string> {
  const values = isolationEnv(home, overrides);
  const blanked = new Set(Object.keys(values).filter((name) => values[name] === undefined));
  const inherited = createSpawnEnv(
    Object.fromEntries(
      Object.entries(values).filter((entry): entry is [string, string] => entry[1] !== undefined),
    ),
  );
  return Object.fromEntries(Object.entries(inherited).filter(([name]) => !blanked.has(name)));
}

/** Run `fn` with `values` applied to `process.env`, restoring the previous values afterwards. */
export function withProcessEnv<T>(values: Record<string, string | undefined>, fn: () => T): T {
  const previous = Object.keys(values).map((name) => [name, process.env[name]] as const);
  const restore = () => {
    for (const [name, value] of previous) {
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
  };
  for (const [name, value] of Object.entries(values)) {
    if (value === undefined) delete process.env[name];
    else process.env[name] = value;
  }
  let deferred = false;
  try {
    const result = fn();
    if (result instanceof Promise) {
      deferred = true;
      return result.finally(restore) as T;
    }
    return result;
  } finally {
    if (!deferred) restore();
  }
}

/** The same values as an `Environment`, so the ported code reads them without touching the process. */
export function environmentFor(home: string, values: Record<string, string | undefined>) {
  return createTestEnvironment({
    home,
    tmpdir: values.TMPDIR ?? join(home, 'tmp'),
    env: new Map(
      Object.entries(values).flatMap(([name, value]) =>
        value === undefined ? [] : [[name, value] as const],
      ),
    ),
    paths: processPathResolver,
  });
}

/** The whole home as comparable data, with its own absolute path spelled `<home>`. */
export function snapshotHome(home: string) {
  return normalize(snapshotTree(home), [[home, '<home>']]).sort((a, b) =>
    a.path.localeCompare(b.path),
  );
}

/** Replace machine-specific prefixes and Amp's random checkout id everywhere in a value. */
export function normalize<T>(
  value: T,
  replacements: readonly (readonly [string | RegExp, string])[],
): T {
  if (typeof value === 'string') {
    const replaced: string = replacements.reduce<string>(
      (text, [from, to]) => text.replaceAll(from, to),
      value,
    );
    return replaced.replace(/cc-safety-net-amp-[A-Za-z0-9]+/g, 'cc-safety-net-amp-<id>') as T;
  }
  if (Array.isArray(value)) {
    return value.map((item) => normalize(item, replacements)) as T;
  }
  if (typeof value === 'object' && value !== null) {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [key, normalize(item, replacements)]),
    ) as T;
  }
  return value;
}

/** Both spellings of a temp root, canonical first so a `/private` prefix cannot survive the fold. */
export const rootFolds = (root: string) =>
  [
    [realpathSync(root), '<root>'],
    [root, '<root>'],
  ] as const;

/**
 * Wall-clock text no two runs of a row share: ISO and `YYYY-MM-DD HH:MM` timestamps, and the day
 * and month the audit writer names its files after. Folded in the record alone, never in the
 * comparison.
 */
const CLOCK_FOLDS = [
  [/\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?Z?/g, '<time>'],
  [/\b\d{4}-\d{2}-\d{2}\b/g, '<date>'],
  [/\b\d{4}-\d{2}\b/g, '<month>'],
] as const;

/**
 * The outcome, recorded: the snapshot the record writes is what the row is asserted against.
 *
 * Every path a fold leaves behind is spelled with the recording host's separator, so a record made
 * here would fail the Windows leg of `check:ci` on the separator alone. Folding it to `/` there
 * costs nothing on a POSIX host and leaves only the gaps Windows already carries — a row whose own
 * input spells a backslash reads the same as one that spelled a path.
 */
export function recordPorted(
  value: unknown,
  replacements: readonly (readonly [string | RegExp, string])[] = [],
): void {
  expect(
    normalize(value, [
      ...replacements,
      ...CLOCK_FOLDS,
      // The syscall a thrown fs error names for the same failed stat moves between Bun versions.
      ['statx', '<stat>'],
      ['lstat', '<stat>'],
      ...(sep === '/' ? [] : [[sep, '/'] as const]),
    ]),
  ).toMatchSnapshot();
}

/** What an async call settles with: its value, or the message of what it rejected with. */
export function describeAsyncOutcome<T>(run: () => Promise<T>) {
  return run().then(
    (value) => ({ kind: 'returned' as const, value }),
    (error: unknown) => ({
      kind: 'threw' as const,
      message: error instanceof Error ? error.message : String(error),
    }),
  );
}
