import { afterEach, describe, expect, test } from 'bun:test';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { runAmpCommand } from '@/hosts/amp/run';
import { createFakeBin, type FakeScriptEntry } from '../../helpers/fake-bin';
import {
  createTempRoot,
  recordPorted,
  removeTempRoots,
  withProcessEnv,
} from '../../helpers/temp-home';

/**
 * The one subprocess boundary of the Amp integration. What the installer reads off it is the exit
 * status, both streams and — when the command never started — the spawn error, because that is
 * what turns into "Amp CLI not found" instead of a stack trace.
 */

const SCRIPT: readonly FakeScriptEntry[] = [
  { command: 'amp', args: ['plugins'], stdout: 'listed\n', stderr: 'notice\n' },
  { command: 'amp', args: ['clone'], stdout: 'partial', stderr: 'clone refused', exit: 3 },
  { command: 'git', args: ['status'], stdout: ' M cc-safety-net/index.ts\n' },
];

/** The directory a command without a workdir runs in: the checkout the suite itself runs in. */
const CWD_FOLD = [[process.cwd(), '<cwd>']] as const;

/** One call with its own fake `amp`, `git` and log. */
async function bothSides(command: readonly [string, ...string[]], workdir?: string) {
  const root = createTempRoot('next-amp-run-');
  const side = async (name: string, run: typeof runAmpCommand) => {
    const bin = createFakeBin(join(root, name), SCRIPT);
    const cwd = workdir === undefined ? undefined : join(root, name, workdir);
    if (cwd !== undefined) mkdirSync(cwd, { recursive: true });
    const result = await withProcessEnv(bin.env, () => run(command, cwd));
    return { result, log: bin.readLog() };
  };
  return side('ported', runAmpCommand);
}

afterEach(removeTempRoots);

describe('running an amp or git command', () => {
  test('hands back the exit status and both streams', async () => {
    const listed = await bothSides(['amp', 'plugins', 'list']);
    recordPorted(listed, CWD_FOLD);
    expect(listed.result).toEqual({
      status: 0,
      errorCode: undefined,
      stdout: 'listed\n',
      stderr: 'notice\n',
    });
  });

  test('keeps what a failing command printed before it gave up', async () => {
    const refused = await bothSides(['amp', 'clone', 'user-plugins', '/nowhere']);
    recordPorted(refused, CWD_FOLD);
    expect(refused.result).toEqual({
      status: 3,
      errorCode: undefined,
      stdout: 'partial',
      stderr: 'clone refused',
    });
  });

  test('reports a command that is not on PATH as a spawn failure', async () => {
    const { result } = await bothSides(['cc-safety-net-absent-cli', '--version']);
    expect({ status: result.status, stdout: result.stdout }).toEqual({ status: null, stdout: '' });
    // The runtime words the failure itself; what the installer needs is a code to branch on and a
    // message to print, so both must be there whichever runtime spawned it.
    expect(result.errorCode).toBeString();
    expect(result.stderr).toContain('cc-safety-net-absent-cli');
  });

  test('runs the command in the directory it was given', async () => {
    const inCheckout = await bothSides(['git', 'status', '--porcelain'], 'checkout');
    recordPorted(inCheckout, CWD_FOLD);
    expect(inCheckout.log).toEqual(['git status --porcelain\t<root>/checkout']);
  });
});
