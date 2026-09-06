import { afterAll, describe, expect, test } from 'bun:test';
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';
import { createSpawnEnv } from '../helpers';
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
 * The bin over the row's bytes. Each row is fed to `src/entries/bin.ts` through the bun running the
 * suite — `process.execPath`, so the run does not depend on a `bun` on `PATH` — under one temp home
 * whose audit tree is read back, and the document on stdout, the exit code, the stderr and the
 * audit lines are recorded together. This is the whole hook path — argument to flag to adapter to
 * gate to document — which the in-process runs cannot reach, because they call the adapters
 * directly.
 */

const REPO_ROOT = join(import.meta.dir, '..', '..');
const PORTED = 'src/entries/bin.ts';
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

function runEntry(argv: readonly string[], row: HookRow) {
  const auditHome = join(fixture.home, 'audit-ported');
  clearAuditLogs(auditHome);
  // A row may unset a variable, and node stringifies an `undefined` value to the literal
  // `'undefined'`, so those entries leave the map before it is merged over the parent's.
  const defined = Object.fromEntries(
    Object.entries({ ...hostEnv(fixture, auditHome), ...row.env }).flatMap(([name, value]) =>
      value === undefined ? [] : [[name, value] as const],
    ),
  );
  const result = spawnSync(process.execPath, ['run', PORTED, ...argv], {
    cwd: REPO_ROOT,
    input: row.stdin,
    encoding: 'utf-8',
    maxBuffer: 32 * 1024 * 1024,
    env: createSpawnEnv(defined),
  });
  return {
    stdout: result.stdout,
    exitCode: result.status,
    // The optional debug line ends in the limit message Phase 1 rewrote; everything up to the
    // stage label is what the line reports. Only that detail is dropped, so any further stderr
    // line is recorded byte for byte.
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
        recordPorted(runEntry(argv, row), FOLDS);
      }, 60_000);
    }
  });
}

describe('flag resolution', () => {
  // `Hook` is here because the bin looks its verb up case-insensitively, so a case-variant
  // spelling still runs the integration rather than reporting a missing flag.
  for (const argv of [
    ['hook', '--claude-code'],
    ['Hook', '--claude-code'],
    ['--claude-code'],
    ['-cc'],
  ]) {
    test(`\`${argv.join(' ')}\` runs the Claude Code hook`, () => {
      recordPorted(runEntry(argv, denialRow), FOLDS);
    }, 60_000);
  }

  for (const argv of [['hook'], ['hook', '--cursor', '--kimi-code']]) {
    test(`\`${argv.join(' ')}\` names no integration`, () => {
      const ported = runEntry(argv, denialRow);
      recordPorted(ported, FOLDS);
      expect(ported.stdout).toBe('');
      expect(ported.exitCode).toBe(1);
    }, 60_000);
  }
});
