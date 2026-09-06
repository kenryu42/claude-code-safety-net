import { afterAll, describe, expect, test } from 'bun:test';
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';
import { createSpawnEnv } from '../../helpers';
import { clearAuditLogs, readAuditEntries } from '../helpers/hook-capture';
import {
  createHookFixture,
  HOOK_HOSTS,
  type HookHost,
  type HookRow,
  hostEnv,
} from '../helpers/hook-hosts';
import { recordPorted, rootFolds } from '../helpers/temp-home';

/**
 * The two bins over the same bytes. Each row is fed to `src/cli/cc-safety-net.ts` and to
 * `next/entries/bin.ts` through the bun running the suite — `process.execPath`, so the run does
 * not depend on a `bun` on `PATH` — under one temp home, with a per-implementation audit home so
 * both trees can be read back, and the document on stdout, the exit code, the stderr and the
 * audit lines must agree. This is the whole hook path — argument to flag to adapter to gate to
 * document — which the in-process differential cannot reach, because it calls the adapters
 * directly.
 */

const REPO_ROOT = join(import.meta.dir, '..', '..', '..');
const SHIPPED = 'src/cli/cc-safety-net.ts';
const PORTED = 'next/entries/bin.ts';
const CLAUDE_DENIAL = 'a denied command';

const fixture = createHookFixture('bin-');

/**
 * Every machine path a recorded row can spell: the fixture, and the checkout the two bins ran in.
 * Both are also spelled with `-` for every separator, the way the audit writer names the log
 * directory after the directory the call ran in.
 */
const FOLDS = [
  ...rootFolds(fixture.root),
  [fixture.root.replaceAll('/', '-'), '<root>'],
  [REPO_ROOT, '<repo>'],
  [REPO_ROOT.replaceAll('/', '-'), '<repo>'],
] as const;

afterAll(() => {
  fixture.remove();
});

function runEntry(entry: string, argv: readonly string[], row: HookRow) {
  const auditHome = join(fixture.home, entry === SHIPPED ? 'audit-shipped' : 'audit-ported');
  clearAuditLogs(auditHome);
  // A row may unset a variable, and node stringifies an `undefined` value to the literal
  // `'undefined'`, so those entries leave the map before it is merged over the parent's.
  const defined = Object.fromEntries(
    Object.entries({ ...hostEnv(fixture, auditHome), ...row.env }).flatMap(([name, value]) =>
      value === undefined ? [] : [[name, value] as const],
    ),
  );
  const result = spawnSync(process.execPath, ['run', entry, ...argv], {
    cwd: REPO_ROOT,
    input: row.stdin,
    encoding: 'utf-8',
    maxBuffer: 32 * 1024 * 1024,
    env: createSpawnEnv(defined),
  });
  return {
    stdout: result.stdout,
    exitCode: result.status,
    // The optional debug line ends in each implementation's own limit message, which Phase 1
    // rewrote; everything up to the stage label is what the line reports. Only that detail is
    // dropped, so any further stderr line still has to match byte for byte.
    stderr: result.stderr.replace(/(CC Safety Net debug: [^:\n]+: )[^\n]*/, '$1'),
    audit: readAuditEntries(auditHome),
  };
}

const denialRow = (HOOK_HOSTS.find((host) => host.id === 'claude-code') as HookHost)
  .rows(fixture)
  .find((row) => row.name === CLAUDE_DENIAL) as HookRow;

for (const host of HOOK_HOSTS) {
  describe(`hook ${host.flag}`, () => {
    for (const row of host.rows(fixture)) {
      test(row.name, () => {
        const argv = ['hook', host.flag];
        const ported = runEntry(PORTED, argv, row);
        expect(ported).toStrictEqual(runEntry(SHIPPED, argv, row));
        recordPorted(ported, FOLDS);
      }, 60_000);
    }
  });
}

describe('flag resolution', () => {
  // `Hook` is here because the shipped bin looks its verb up case-insensitively, so a
  // case-variant spelling still runs the integration rather than reporting a missing flag.
  for (const argv of [
    ['hook', '--claude-code'],
    ['Hook', '--claude-code'],
    ['--claude-code'],
    ['-cc'],
  ]) {
    test(`\`${argv.join(' ')}\` runs the Claude Code hook`, () => {
      const ported = runEntry(PORTED, argv, denialRow);
      expect(ported).toStrictEqual(runEntry(SHIPPED, argv, denialRow));
      recordPorted(ported, FOLDS);
    }, 60_000);
  }

  for (const argv of [['hook'], ['hook', '--cursor', '--kimi-code']]) {
    test(`\`${argv.join(' ')}\` names no integration`, () => {
      const ported = runEntry(PORTED, argv, denialRow);
      expect(ported).toStrictEqual(runEntry(SHIPPED, argv, denialRow));
      recordPorted(ported, FOLDS);
      expect(ported.stdout).toBe('');
      expect(ported.exitCode).toBe(1);
    }, 60_000);
  }
});
