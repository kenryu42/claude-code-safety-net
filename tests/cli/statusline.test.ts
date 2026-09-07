import { afterEach, describe, expect, test } from 'bun:test';
import { type CliRow, runCliDifferential, seedFiles } from '../helpers/cli-differential';
import {
  PLUGIN_SETTINGS,
  RULE_SWITCHED_OFF,
  USER_POLICY,
  WEAKENED_BY_PROJECT,
} from '../helpers/cli-fixtures';
import { removeTempRoots } from '../helpers/temp-home';

/**
 * The statusline is one line of glyphs a teammate reads without opening anything, so each row
 * pins the whole line: the plugin probe answers first, then the level glyph, then the worktree,
 * weakening and degraded suffixes. A JSON payload on stdin is the host's own status document
 * and is swallowed; anything else is echoed in front of the line.
 */

afterEach(() => {
  removeTempRoots();
});

const HOST_PAYLOAD = '{"model":"x"}';

const enabled =
  (extra: Record<string, string> = {}) =>
  (side: Parameters<typeof seedFiles>[0]) =>
    seedFiles(side, { 'home/.claude/settings.json': PLUGIN_SETTINGS, ...extra });

const runStatusline = async (row: CliRow) => await runCliDifferential(row);

describe('statusline', () => {
  test('a disabled plugin is the whole answer', async () => {
    const outcome = await runStatusline({
      args: ['statusline', '-cc'],
      stdin: HOST_PAYLOAD,
    });
    expect(outcome.exitCode).toBe(0);
    expect(outcome.stdout).toBe('🛡️ CC Safety Net ❌\n');
  }, 60_000);

  test('a non-JSON payload is echoed in front of the line', async () => {
    const outcome = await runStatusline({ args: ['statusline', '-cc'], stdin: 'hello' });
    expect(outcome.stdout).toBe('hello | 🛡️ CC Safety Net ❌\n');
  }, 60_000);

  for (const [name, row, expected] of [
    ['standard', {}, '🛡️ CC Safety Net ✅\n'],
    ['strict', { env: { CC_SAFETY_NET_LEVEL: 'strict' } }, '🛡️ CC Safety Net 🔒\n'],
    ['paranoid', { env: { CC_SAFETY_NET_LEVEL: 'paranoid' } }, '🛡️ CC Safety Net 👁️\n'],
    // A rule switched off against what the level grants replaces the level glyph rather than
    // adding to it: the line reports the level it no longer has.
    [
      'a rule override that changes inherited behaviour',
      { seed: enabled({ [USER_POLICY]: RULE_SWITCHED_OFF }) },
      '🛡️ CC Safety Net 🔧\n',
    ],
    ['worktree', { env: { CC_SAFETY_NET_WORKTREE: '1' } }, '🛡️ CC Safety Net ✅🌳\n'],
  ] as const) {
    test(`an enabled plugin at ${name}`, async () => {
      const outcome = await runStatusline({
        args: ['statusline', '--claude-code'],
        stdin: HOST_PAYLOAD,
        seed: enabled(),
        ...row,
      });
      expect(outcome.stdout).toBe(expected);
    }, 60_000);
  }

  test('a malformed user policy adds the degraded glyph', async () => {
    const outcome = await runStatusline({
      args: ['statusline', '-cc'],
      stdin: HOST_PAYLOAD,
      seed: enabled({ [USER_POLICY]: 'not json' }),
    });
    expect(outcome.stdout).toBe('🛡️ CC Safety Net ✅⚠️\n');
  }, 60_000);

  test('a project policy that weakens the user policy adds its own glyph', async () => {
    const outcome = await runStatusline({
      args: ['statusline', '-cc'],
      stdin: HOST_PAYLOAD,
      seed: enabled(WEAKENED_BY_PROJECT),
    });
    expect(outcome.stdout).toBe('🛡️ CC Safety Net ✅🔻\n');
  }, 60_000);

  test('the legacy top-level spelling prints the same line', async () => {
    const outcome = await runStatusline({
      args: ['--statusline'],
      stdin: HOST_PAYLOAD,
      seed: enabled(),
    });
    expect(outcome.exitCode).toBe(0);
    expect(outcome.stdout).toBe('🛡️ CC Safety Net ✅\n');
  }, 60_000);

  test('the flag is required', async () => {
    const outcome = await runStatusline({ args: ['statusline'], stdin: HOST_PAYLOAD });
    expect(outcome.exitCode).toBe(1);
    expect(outcome.stdout).toBe('');
    expect(outcome.stderr.split('\n')[0]).toBe('statusline requires --claude-code (-cc)');
    expect(outcome.stderr).toContain('cc-safety-net statusline');
  }, 60_000);

  test('a stray positional is refused with the command help', async () => {
    const outcome = await runStatusline({
      args: ['statusline', '--claude-code', 'extra'],
      stdin: HOST_PAYLOAD,
    });
    expect(outcome.exitCode).toBe(1);
    expect(outcome.stderr.split('\n')[0]).toBe('Unexpected argument for statusline: extra');
  }, 60_000);
});
