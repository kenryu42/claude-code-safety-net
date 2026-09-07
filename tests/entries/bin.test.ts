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

/**
 * The bin over the row's bytes. Each row is fed to `src/entries/bin.ts` through the bun running the
 * suite — `process.execPath`, so the run does not depend on a `bun` on `PATH` — under one temp home
 * whose audit tree is read back. Every row has to answer with the verdict the shared table declares
 * for it, the same one the in-process adapter run answers with: this is the whole hook path —
 * argument to flag to adapter to gate to document — which the in-process runs cannot reach, because
 * they call the adapters directly.
 */

const REPO_ROOT = join(import.meta.dir, '..', '..');
const PORTED = 'src/entries/bin.ts';
const CLAUDE_DENIAL = 'a denied command';

const fixture = createHookFixture('bin-');

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

/** The verdict the run answered with, whichever host protocol carried it. */
function expectOutcome(ported: ReturnType<typeof runEntry>, expected: HookRow['expected']): void {
  // The bin reports a decision through the document it prints, never through the exit code: a
  // non-zero status would read to the host as the hook itself having failed.
  expect(ported.exitCode).toBe(0);
  expect(ported.stderr.split('\n').filter((line) => line !== '')).toHaveLength(
    expected.stderr ?? 0,
  );
  expect(ported.audit.map((line) => line.entry.decision)).toEqual(
    expected.audit === 'none' ? [] : [expected.audit],
  );
  if (expected.ruleId !== undefined) expect(ported.audit[0]?.entry.ruleId).toBe(expected.ruleId);
  if (expected.document === 'none') {
    expect(ported.stdout).toBe('');
    return;
  }
  // One document per call, and a denial says so in the words the reader acts on.
  expect(ported.stdout.trimEnd().split('\n')).toHaveLength(1);
  expect(ported.stdout.includes('BLOCKED by CC Safety Net')).toBe(expected.document === 'deny');
}

for (const host of HOOK_HOSTS) {
  describe(`hook ${host.flag}`, () => {
    for (const row of host.rows(fixture)) {
      test(row.name, () => {
        expectOutcome(runEntry(['hook', host.flag], row), row.expected);
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
      expectOutcome(runEntry(argv, denialRow), denialRow.expected);
    }, 60_000);
  }

  for (const argv of [['hook'], ['hook', '--cursor', '--kimi-code']]) {
    test(`\`${argv.join(' ')}\` names no integration`, () => {
      const ported = runEntry(argv, denialRow);
      // Naming no integration is the bin failing rather than a host being answered, so nothing is
      // printed, nothing is audited, and the status is the one the shell reads as a failure.
      expect(ported.stdout).toBe('');
      expect(ported.audit).toEqual([]);
      expect(ported.exitCode).toBe(1);
    }, 60_000);
  }
});
