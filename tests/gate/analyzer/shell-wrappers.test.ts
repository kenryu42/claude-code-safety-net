import { describe, expect, test } from 'bun:test';
import {
  extractDashCArg,
  extractShellStartupLoaderMetadata,
  isShellSyntaxCheck,
  parseShellArgv,
} from '@/gate/analyzer/shell-wrappers';
import { expectRecordedDigest } from '../../helpers/gate-differential';
import { corpusCommands, createSeededRandom, FIXED_COMMANDS } from '../../helpers/shell-inputs';

/**
 * The wrapper argv reader decides which operand of `bash -c …` is a command and which startup
 * file a shell would source, so the port has to agree token for token.
 */

const SHELLS = [
  'bash',
  'sh',
  'dash',
  'ksh',
  'zsh',
  'BASH',
  'busybox',
  '/usr/local/bin/bash',
  'fish',
  '',
];

const OPTION_TOKENS = [
  '-c',
  '-lc',
  '-nc',
  '-cn',
  '-i',
  '-ic',
  '-n',
  '+n',
  '+in',
  '-o',
  'emacs',
  '-onotify',
  '-oc',
  '-o-c',
  '-O',
  '-Oextglob',
  'extglob',
  '--init-file',
  '--rcfile',
  '--rcfile=late.sh',
  '--init-file=early.sh',
  '--norc',
  '--posix',
  '--',
  '-',
  '-s',
  '-x',
  '-e',
  '-l',
  '-p',
  'start.sh',
];

const PAYLOADS = ['rm -rf /tmp/x', 'echo hi', '', 'script.sh', '-badflag', '--'];

/** Every wrapper argv the recorded table feeds the wrapper analyzer. */
function argvTable(): string[][] {
  const random = createSeededRandom(0x5eed_1234);
  const generated = Array.from({ length: 1_200 }, () => {
    const shell = SHELLS[Math.floor(random() * SHELLS.length)] ?? 'bash';
    const options = Array.from(
      { length: Math.floor(random() * 4) },
      () => OPTION_TOKENS[Math.floor(random() * OPTION_TOKENS.length)] ?? '-c',
    );
    return [shell, ...options, PAYLOADS[Math.floor(random() * PAYLOADS.length)] ?? ''];
  });
  const fromCorpus = [...corpusCommands(), ...FIXED_COMMANDS].map((command) =>
    command.split(/\s+/).filter((token) => token !== ''),
  );
  return [...generated, ...fromCorpus, [], ['bash'], ['bash', '-c']];
}

const FIXED_ARGV: readonly string[][] = [
  ['bash', '-c', 'rm -rf /tmp/x'],
  ['bash', '-c', '--', 'rm -rf /tmp/x'],
  ['bash', '-lc', 'rm -rf /tmp/x'],
  ['bash', '--', '-c', 'rm -rf /tmp/x'],
  ['bash', '-i', '--rcfile', 'evil.sh', '-c', 'echo hi'],
  ['bash', '--init-file', 'first.sh', '--rcfile', 'second.sh', '-i', '-c', 'echo hi'],
  ['bash', '--rcfile'],
  ['bash', '--rcfile=inline.sh', '-i', '-c', 'echo hi'],
  ['bash', '-c', '-x', 'echo hi'],
  ['bash', '-nc', 'rm -rf /'],
  ['bash', '-n', '-c', 'rm -rf /'],
  ['bash', '-n', '+n', '-c', 'rm -rf /'],
  ['sh', '-c', 'rm -rf /tmp/x'],
  ['sh', '-i', '-c', 'echo hi'],
  ['dash', '-c', 'echo hi'],
  ['ksh', '-onotify', '-c', 'echo hi'],
  ['ksh', '-o', 'notify', '-c', 'echo hi'],
  ['ksh', '-o', '-c', 'echo hi'],
  ['ksh', '-o-c', 'echo hi'],
  ['zsh', '-onotify', '-c', 'echo hi'],
  ['zsh', '-o', 'notify', '-c', 'echo hi'],
  ['zsh', '-n', '-c', 'echo hi'],
  ['bash', '-s', 'arg'],
  ['bash', '-', 'arg'],
  ['bash', 'script.sh', '-c', 'not-a-command'],
  ['/usr/local/bin/bash', '-c', 'echo hi'],
  ['BASH', '-C', 'echo hi'],
  ['fish', '-c', 'echo hi'],
  ['busybox', 'sh', '-c', 'echo hi'],
];

describe('next/gate/analyzer/shell-wrappers against src/analyzer/shell-wrappers', () => {
  const table = [...FIXED_ARGV, ...argvTable()];

  test('feeds both implementations the corpus, the fixed table and the seeded argv fuzz', () => {
    expect(table.length).toBeGreaterThan(1_200);
  });

  test('reads the same argv split', () => {
    const recorded: [string, unknown][] = [];
    for (const tokens of table) {
      const split = { tokens, parsed: parseShellArgv(tokens) };
      recorded.push([tokens.join(' '), split]);
    }
    expectRecordedDigest('analyzer-shell-wrappers/argv-split', recorded);
  });

  test('extracts the same -c operand', () => {
    const recorded: [string, unknown][] = [];
    for (const tokens of table) {
      const extracted = { tokens, arg: extractDashCArg(tokens) };
      recorded.push([tokens.join(' '), extracted]);
    }
    expectRecordedDigest('analyzer-shell-wrappers/dash-c-operand', recorded);
  });

  test('agrees on the syntax-check flag', () => {
    const recorded: [string, unknown][] = [];
    for (const tokens of table) {
      const checked = { tokens, check: isShellSyntaxCheck(tokens) };
      recorded.push([tokens.join(' '), checked]);
    }
    expectRecordedDigest('analyzer-shell-wrappers/syntax-check', recorded);
  });

  test('reports the same startup loader metadata', () => {
    const recorded: [string, unknown][] = [];
    for (const tokens of table) {
      const loader = { tokens, metadata: extractShellStartupLoaderMetadata(tokens) };
      recorded.push([tokens.join(' '), loader]);
    }
    expectRecordedDigest('analyzer-shell-wrappers/startup-loader', recorded);
  });
});
