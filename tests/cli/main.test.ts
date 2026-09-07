import { afterEach, describe, expect, test } from 'bun:test';
import { posix } from 'node:path';
import { installCursor } from '@/hosts/cursor/install';
import { type CliRow, runCliDifferential } from '../helpers/cli-differential';
import { environmentFor, removeTempRoots } from '../helpers/temp-home';

/**
 * Dispatch is contract: the same argument vector has to reach the same handler, print the same
 * bytes and exit the same way, even though the bin resolves the hook verb before it loads the CLI
 * chunk at all. Every row below is one argument vector; the record pins what came back, and the
 * pin behind it stops a row passing by staying silent.
 */

afterEach(() => {
  removeTempRoots();
});

const differential = async (row: CliRow) => await runCliDifferential(row);

describe('help', () => {
  for (const args of [['help'], ['--help'], ['-h'], []]) {
    test(`\`${args.join(' ') || 'no arguments'}\` prints the main help`, async () => {
      const outcome = await differential({ args });
      expect(outcome.exitCode).toBe(0);
      expect(outcome.stdout).toContain('cc-safety-net vdev');
      expect(outcome.stderr).toBe('');
    }, 60_000);
  }

  for (const name of [
    'status',
    'doctor',
    'logs',
    'explain',
    'rule',
    'policy',
    'install',
    'update',
    'uninstall',
    'hook',
    'gui',
    'statusline',
  ]) {
    test(`\`help ${name}\` prints the command help`, async () => {
      const outcome = await differential({ args: ['help', name] });
      expect(outcome.exitCode).toBe(0);
      expect(outcome.stdout.split('\n')[0]).toBe(`cc-safety-net ${name}`);
    }, 60_000);
  }

  test('`help frob` names the unknown command', async () => {
    const outcome = await differential({ args: ['help', 'frob'] });
    expect(outcome.exitCode).toBe(1);
    expect(outcome.stderr).toBe(
      "Unknown command: frob\nRun 'cc-safety-net --help' for available commands.\n",
    );
  }, 60_000);

  for (const args of [
    ['status', '--help'],
    ['doctor', '-h'],
    ['gui', '--help'],
  ]) {
    test(`\`${args.join(' ')}\` prints that command's help`, async () => {
      const outcome = await differential({ args });
      expect(outcome.exitCode).toBe(0);
      expect(outcome.stdout.split('\n')[0]).toBe(`cc-safety-net ${args[0]}`);
    }, 60_000);
  }
});

describe('version', () => {
  for (const args of [['--version'], ['-V']]) {
    test(`\`${args.join(' ')}\` prints the version`, async () => {
      const outcome = await differential({ args });
      expect(outcome.exitCode).toBe(0);
      expect(outcome.stdout).toBe('dev\n');
    }, 60_000);
  }

  // The ported bin resolves the legacy top-level hook flags itself, so the global scan has to
  // gate that lookup: without it `-cc -V` would run the Claude Code hook over an empty stdin
  // instead of answering the version request.
  test('`-cc -V` prints the version instead of running the Claude Code hook', async () => {
    const outcome = await differential({ args: ['-cc', '-V'] });
    expect(outcome.exitCode).toBe(0);
    expect(outcome.stdout).toBe('dev\n');
  }, 60_000);
});

describe('unknown input', () => {
  test('`frob` is an unknown command', async () => {
    const outcome = await differential({ args: ['frob'] });
    expect(outcome.exitCode).toBe(1);
    expect(outcome.stderr).toBe("Unknown command: frob\nRun 'cc-safety-net --help' for usage.\n");
  }, 60_000);

  test('`--frob` is an unknown option', async () => {
    const outcome = await differential({ args: ['--frob'] });
    expect(outcome.exitCode).toBe(1);
    expect(outcome.stderr.split('\n')[0]).toBe('Unknown option: --frob');
  }, 60_000);

  test('`status extra` refuses the positional', async () => {
    const outcome = await differential({ args: ['status', 'extra'] });
    expect(outcome.exitCode).toBe(1);
    expect(outcome.stderr).toBe('Unexpected argument for status: extra\n');
    expect(outcome.stdout).toBe('');
  }, 60_000);
});

describe('hook', () => {
  for (const args of [['hook'], ['hook', '--cursor', '--kimi-code']]) {
    test(`\`${args.join(' ')}\` names no integration`, async () => {
      const outcome = await differential({ args });
      expect(outcome.exitCode).toBe(1);
      expect(outcome.stdout).toBe('');
      expect(outcome.stderr.split('\n')[0]).toBe(
        'hook requires exactly one integration flag. Try: cc-safety-net hook --kimi-code',
      );
      expect(outcome.stderr).toContain('-cc, --coding-cli');
    }, 60_000);
  }

  // The other half of the scan gate: the flag names an integration, but the request is for help.
  test('`hook --claude-code --help` prints the hook help', async () => {
    const outcome = await differential({ args: ['hook', '--claude-code', '--help'] });
    expect(outcome.exitCode).toBe(0);
    expect(outcome.stdout.split('\n')[0]).toBe('cc-safety-net hook');
    expect(outcome.stderr).toBe('');
  }, 60_000);
});

describe('install, update and uninstall reach the Phase 6 flows', () => {
  test('`install --cursor` writes the Cursor hook', async () => {
    const outcome = await differential({ args: ['install', '--cursor'] });
    expect(outcome.exitCode).toBe(0);
    expect(outcome.stdout).toBe(
      `Installed Cursor hook in ${posix.join('<root>', 'home/.cursor/hooks.json')}\n`,
    );
    expect(outcome.tree.map((entry) => entry.path)).toContain('home/.cursor/hooks.json');
  }, 60_000);

  test('`uninstall --cursor` removes it again', async () => {
    const outcome = await differential({
      args: ['uninstall', '--cursor'],
      seed: (side) => {
        installCursor(environmentFor(side.home, side.env));
      },
    });
    expect(outcome.exitCode).toBe(0);
    expect(outcome.stdout).toBe(
      `Uninstalled Cursor hook from ${posix.join('<root>', 'home/.cursor/hooks.json')}\n`,
    );
  }, 60_000);

  test('`install` with no target and no terminal refuses to guess', async () => {
    const outcome = await differential({ args: ['install'] });
    expect(outcome.exitCode).toBe(1);
    expect(outcome.stdout).toBe('');
    expect(outcome.stderr.split('\n')[0]).toStartWith('Choose exactly one install target: ');
  }, 60_000);

  test('`update --nope` fails on the flag before any registry probe', async () => {
    const outcome = await differential({ args: ['update', '--nope'] });
    expect(outcome.exitCode).toBe(1);
    expect(outcome.stdout).toBe('');
    expect(outcome.stderr).toBe('Unknown option for update: --nope\n');
  }, 60_000);

  // The one `gui` vector both bins can run to completion: the usage error is decided before a
  // server is ever bound, so neither side is left holding a listener that never exits.
  test('`gui --bad` fails on the flag before the server is bound', async () => {
    const outcome = await differential({ args: ['gui', '--bad'] });
    expect(outcome.exitCode).toBe(1);
    expect(outcome.stdout).toBe('');
    expect(outcome.stderr).toBe(
      'Unknown option for gui: --bad\nUsage: cc-safety-net gui [--no-open]\n',
    );
  }, 60_000);
});
