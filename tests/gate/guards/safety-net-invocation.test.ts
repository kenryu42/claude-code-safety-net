import { describe, expect, test } from 'bun:test';
import { safetyNetSubcommandIndex } from '@/gate/guards/safety-net-invocation';
import { expectRecordedDigest } from '../../helpers/gate-differential';

/**
 * Two guards read this index with opposite strictness, so the port is checked against every
 * runner spelling in both modes: a disagreement either exempts a real command from secret
 * protection or lets `policy apply` through.
 */

const RUNNER_COMMANDS = [
  'cc-safety-net',
  'ccsn',
  'npx',
  'bunx',
  'pnpx',
  'pnpm',
  'yarn',
  'npm',
  'bun',
  'node',
  'deno',
  'sh',
];

const TOKEN_LISTS: readonly (readonly string[])[] = [
  [],
  ['explain', 'rm -rf /'],
  ['policy', 'apply'],
  ['-y', 'cc-safety-net', 'explain', 'x'],
  ['--yes', 'ccsn', 'policy', 'apply'],
  ['cc-safety-net', 'policy', 'apply'],
  ['ccsn@latest', 'explain', 'x'],
  ['cc-safety-net@2.3.0', 'status'],
  ['cc-safety-net@npm:other', 'status'],
  ['cc-safety-net@file:../local', 'status'],
  ['cc-safety-net@', 'status'],
  ['@scope/cc-safety-net', 'status'],
  ['./node_modules/.bin/cc-safety-net', 'status'],
  ['--loglevel=silent', 'cc-safety-net', 'policy', 'apply'],
  ['--package', 'cc-safety-net', 'ccsn', 'policy', 'apply'],
  ['dlx', 'cc-safety-net', 'policy', 'apply'],
  ['dlx', '-y', 'cc-safety-net', 'policy', 'apply'],
  ['dlx', 'other-package', 'policy', 'apply'],
  ['--silent', 'dlx', 'cc-safety-net', 'policy', 'apply'],
  ['exec', 'cc-safety-net', 'policy', 'apply'],
  ['exec', 'ccsn', 'explain', 'cat ~/.ssh/config'],
  ['--silent', 'exec', 'cc-safety-net', 'policy', 'apply'],
  ['exec', '--', 'cc-safety-net', 'policy', 'apply'],
  ['run', 'dist/bin/cc-safety-net.js', 'policy', 'apply'],
  ['run', 'other.js', 'policy', 'apply'],
  ['dist/bin/cc-safety-net.js', 'policy', 'apply'],
  ['src/cli/cc-safety-net.ts', 'explain', 'x'],
  ['/opt/app/dist/bin/cc-safety-net.js', 'policy', 'apply'],
  ['C:\\app\\dist\\bin\\cc-safety-net.js', 'policy', 'apply'],
  ['--experimental-strip-types', 'src/cli/cc-safety-net.ts', 'explain', 'x'],
  ['--', 'dist/bin/cc-safety-net.js', 'policy', 'apply'],
  ['cc-safety-net'],
  ['ccsn', 'ccsn', 'explain', 'x'],
];

const MODES = [{}, { broad: false }, { broad: true }];

describe('next/gate/guards/safety-net-invocation against src/guards/safety-net-invocation', () => {
  const rows = RUNNER_COMMANDS.flatMap((command) =>
    TOKEN_LISTS.flatMap((tokens) => MODES.map((options) => ({ command, tokens, options }))),
  );

  test('locates the same subcommand for every runner spelling in both modes', () => {
    const recorded: [string, unknown][] = [];
    for (const row of rows) {
      recorded.push([
        JSON.stringify(row),
        safetyNetSubcommandIndex(row.command, row.tokens, row.options),
      ]);
    }
    expectRecordedDigest('guards-safety-net-invocation/subcommand-index', recorded);
  });

  test('the cutover entrypoint is recognized like the retired one', () => {
    const cutover = safetyNetSubcommandIndex('bun', ['src/entries/bin.ts', 'explain', 'x'], {});

    expect(cutover).not.toBeNull();
    expect(cutover).toBe(
      safetyNetSubcommandIndex('bun', ['src/cli/cc-safety-net.ts', 'explain', 'x'], {}),
    );
  });

  test('the table reaches both answers, so parity is not vacuous', () => {
    const indexes = rows.map((row) =>
      safetyNetSubcommandIndex(row.command, row.tokens, row.options),
    );
    expect(indexes.filter((index) => index !== null).length).toBeGreaterThan(40);
    expect(indexes.filter((index) => index === null).length).toBeGreaterThan(40);
  });
});
