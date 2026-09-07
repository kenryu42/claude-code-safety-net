import { afterEach, describe, expect, spyOn, test } from 'bun:test';
import { lstatSync } from 'node:fs';
import { join, posix } from 'node:path';
import { PassThrough } from 'node:stream';
import { runPolicyCommand as portedPolicyCommand } from '@/cli/policy/index';
import { runCliDifferential, seedFiles } from '../../helpers/cli-differential';
import { json, PROJECT_POLICY, USER_POLICY } from '../../helpers/cli-fixtures';
import { createFakeOutput } from '../../helpers/fake-tty';
import { snapshotTree, writeTree } from '../../helpers/fixture-tree';
import {
  createTempRoot,
  environmentFor,
  isolationEnv,
  normalize,
  removeTempRoots,
  WINDOWS_SEPARATOR_FOLDS,
} from '../../helpers/temp-home';

/**
 * `policy check` reports what a proposal would change, `policy apply` writes it after a human
 * confirms. The reported diff is the whole value of `check`, so each row pins the rows it prints
 * for one seeded scope; `apply` is driven in-process because a real terminal is the one thing the
 * process harness cannot hand it.
 */

afterEach(() => {
  removeTempRoots();
});

const STRICT_PROPOSAL = json({ version: 1, safety: { level: 'strict' } });
const STANDARD_PROPOSAL = json({ version: 1, safety: { level: 'standard' } });
const PROPOSAL_FILE = 'project/prop.json';

async function runPolicy(args: readonly string[], files: Record<string, string> = {}) {
  return await runCliDifferential({
    args: ['policy', ...args],
    seed: (side) => seedFiles(side, files),
  });
}

describe('policy check', () => {
  test('a project proposal is reported against the merged effective policy', async () => {
    const outcome = await runPolicy(['check', 'prop.json'], { [PROPOSAL_FILE]: STRICT_PROPOSAL });
    expect(outcome.exitCode).toBe(0);
    expect(outcome.stdout).toBe(
      [
        `Scope: project (${posix.join('<root>', PROJECT_POLICY)})`,
        'Proposal: prop.json',
        'Effective policy (user + project merged):',
        'Changes (1):',
        '  safety.level: standard -> strict',
        '',
      ].join('\n'),
    );
    expect(outcome.stderr).toBe('');
  }, 60_000);

  test('--global reports the same proposal against the user file', async () => {
    const outcome = await runPolicy(['check', 'prop.json', '--global'], {
      [PROPOSAL_FILE]: STRICT_PROPOSAL,
    });
    expect(outcome.exitCode).toBe(0);
    expect(outcome.stdout).toContain(`Scope: user (${posix.join('<root>', USER_POLICY)})`);
    expect(outcome.stdout).toContain('  safety.level: standard -> strict');
  }, 60_000);

  test('a proposal that relaxes the user scope shows the level it drops', async () => {
    const outcome = await runPolicy(['check', 'prop.json', '--global'], {
      [PROPOSAL_FILE]: STANDARD_PROPOSAL,
      [USER_POLICY]: STRICT_PROPOSAL,
    });
    expect(outcome.stdout).toContain('  safety.level: strict -> standard');
  }, 60_000);

  test('an unrecognized level is refused with the validator diagnostic', async () => {
    const outcome = await runPolicy(['check', 'prop.json'], {
      [PROPOSAL_FILE]: json({ version: 1, safety: { level: 'nope' } }),
    });
    expect(outcome.exitCode).toBe(1);
    expect(outcome.stdout).toBe('');
    expect(outcome.stderr).toContain('prop.json: ');
    expect(outcome.stderr).toContain('safety.level');
  }, 60_000);

  test('an audit section names the one scope that reads it', async () => {
    const outcome = await runPolicy(['check', 'prop.json'], {
      [PROPOSAL_FILE]: json({ version: 1, audit: { retention_days: 5 } }),
    });
    expect(outcome.exitCode).toBe(1);
    expect(outcome.stderr).toBe(
      'prop.json: audit settings are user scope only; remove the audit section from a project proposal\n',
    );
  }, 60_000);

  test('a file that does not exist is reported by path', async () => {
    const outcome = await runPolicy(['check', 'missing.json']);
    expect(outcome.exitCode).toBe(1);
    expect(outcome.stderr).toBe(
      'missing.json: file not found\nmissing.json: Config must be an object\n',
    );
  }, 60_000);
});

describe('policy usage', () => {
  test('the bare verb prints its help on stderr', async () => {
    const outcome = await runPolicy([]);
    expect(outcome.exitCode).toBe(1);
    expect(outcome.stdout).toBe('');
    expect(outcome.stderr).toContain('cc-safety-net policy');
  }, 60_000);

  test('an unknown subcommand, a missing file and an extra argument each name themselves', async () => {
    const unknown = await runPolicy(['frob', 'x']);
    expect(unknown.stderr).toBe('Unknown policy subcommand: frob\n');
    const noFile = await runPolicy(['check']);
    expect(noFile.stderr).toBe('policy check requires a file\n');
    const extra = await runPolicy(['check', 'a', 'b', 'c']);
    expect(extra.stderr).toBe('Unexpected policy argument: b\nUnexpected policy argument: c\n');
  }, 60_000);
});

describe('policy apply without a terminal', () => {
  test('a piped stdin is refused in both scopes and writes nothing', async () => {
    const outcome = await runPolicy(['apply', 'prop.json'], { [PROPOSAL_FILE]: STRICT_PROPOSAL });
    expect(outcome.exitCode).toBe(1);
    expect(outcome.stderr).toBe(
      [
        'policy apply confirms interactively; run this yourself in a terminal:',
        '  cc-safety-net policy apply prop.json',
        '',
      ].join('\n'),
    );
    expect(outcome.tree.map((entry) => entry.path)).toEqual([
      'home',
      'home/tmp',
      'project',
      'project/prop.json',
    ]);
    const global = await runPolicy(['apply', 'prop.json', '--global'], {
      [PROPOSAL_FILE]: STRICT_PROPOSAL,
    });
    expect(global.stderr).toContain('  cc-safety-net policy apply prop.json --global\n');
    expect(global.tree).toStrictEqual(outcome.tree);
  }, 60_000);
});

/** One `policy apply` run against a private root, with the terminal it insists on. */
async function driveApply(
  label: string,
  extra: readonly string[],
  answer: (input: PassThrough) => void,
  call: (context: {
    home: string;
    env: Record<string, string | undefined>;
    cwd: string;
    args: string[];
    input: NodeJS.ReadStream;
    output: NodeJS.WriteStream;
  }) => Promise<number>,
) {
  const root = createTempRoot(`policy-${label}-`);
  const home = join(root, 'home');
  const env = isolationEnv(home);
  writeTree(root, { [PROPOSAL_FILE]: STRICT_PROPOSAL });
  // A `PassThrough` rather than the suite's fake terminal: readline consumes a real readable.
  const input = Object.assign(new PassThrough(), { isTTY: true }) as unknown as NodeJS.ReadStream;
  const output = createFakeOutput({ isTTY: true });
  const written: string[] = [];
  const record = (...parts: unknown[]) => {
    written.push(parts.join(' '));
  };
  const log = spyOn(console, 'log').mockImplementation(record);
  const error = spyOn(console, 'error').mockImplementation(record);
  try {
    const running = call({
      home,
      env,
      cwd: join(root, 'project'),
      // The proposal is named absolutely: the file is read relative to the process working
      // directory, which an in-process run cannot move.
      args: ['apply', join(root, PROPOSAL_FILE), ...extra],
      input,
      output: output as unknown as NodeJS.WriteStream,
    });
    answer(input as unknown as PassThrough);
    const code = await running;
    return {
      home,
      outcome: normalize({ code, written, prompt: output.text(), tree: snapshotTree(root) }, [
        [root, '<root>'],
        ...WINDOWS_SEPARATOR_FOLDS,
      ]),
    };
  } finally {
    log.mockRestore();
    error.mockRestore();
  }
}

async function applyBothWays(extra: readonly string[], answer: (input: PassThrough) => void) {
  const ported = await driveApply('ported', extra, answer, (context) =>
    portedPolicyCommand(environmentFor(context.home, context.env), context.args, {
      cwd: context.cwd,
      input: context.input,
      output: context.output,
    }),
  );
  expect(ported.outcome).toMatchSnapshot();
  return { ...ported.outcome, home: ported.home };
}

describe('policy apply at a terminal', () => {
  test('a typed yes writes only the fields the proposal set', async () => {
    const outcome = await applyBothWays([], (input) => input.write('y\n'));
    expect(outcome.code).toBe(0);
    expect(outcome.prompt).toBe(
      `Apply this policy to ${posix.join('<root>', PROJECT_POLICY)}? [y/N] `,
    );
    expect(outcome.written).toContain(`Policy applied: ${posix.join('<root>', PROJECT_POLICY)}`);
    const applied = outcome.tree.find(
      (entry) => entry.path === 'project/.cc-safety-net/policy.json',
    );
    expect(applied?.content).toBe(STRICT_PROPOSAL);
  }, 30_000);

  test('--global writes the user file readable by its owner alone', async () => {
    const outcome = await applyBothWays(['--global'], (input) => input.write('y\n'));
    expect(outcome.code).toBe(0);
    const applied = outcome.tree.find((entry) => entry.path === 'home/.cc-safety-net/policy.json');
    expect(JSON.parse(applied?.content ?? '')).toMatchObject({ safety: { level: 'strict' } });
    // Windows has no POSIX mode to assert.
    if (process.platform === 'win32') return;
    expect(lstatSync(join(outcome.home, '.cc-safety-net', 'policy.json')).mode & 0o777).toBe(0o600);
  }, 30_000);

  test('a typed no cancels and leaves the scope untouched', async () => {
    const outcome = await applyBothWays([], (input) => input.write('n\n'));
    expect(outcome.code).toBe(0);
    expect(outcome.written).toContain('Cancelled; nothing was written.');
    expect(outcome.tree.map((entry) => entry.path)).toEqual([
      'home',
      'home/tmp',
      'project',
      'project/prop.json',
    ]);
  }, 30_000);

  test('a closed stream declines rather than waiting for a line that never comes', async () => {
    const outcome = await applyBothWays([], (input) => input.end());
    expect(outcome.code).toBe(0);
    expect(outcome.written).toContain('Cancelled; nothing was written.');
  }, 30_000);
});
