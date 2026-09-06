import { describe, expect, test } from 'bun:test';
import { isReservedTransparentWrapper } from '@/core/policy/transparent-wrappers';
import type { EffectivePolicy } from '@/core/policy/types';
import { dangerousInTextMatch } from '@/gate/analyzer/dangerous-text';
import {
  hasLinearDangerousText,
  hasLinearInterpreterDanger,
} from '@/gate/analyzer/linear-danger-scanner';
import {
  applyShellGitContextEnvSegment,
  cloneShellGitContextEnvState,
  createShellGitContextEnvState,
  getSegmentGitContextEnvAssignments,
  type ShellGitContextEnvState,
} from '@/gate/analyzer/shell-git-env';
import {
  isStandardCommandWrapper,
  unwrapTransparentWrapper,
} from '@/gate/analyzer/transparent-wrappers';
import { expectRecordedDigest } from '../../helpers/gate-differential';
import { corpusCommands, fuzzShellSources } from '../../helpers/shell-inputs';

/**
 * The four small middle-layer modules are recorded over the corpus commands, a seeded fuzz, and a
 * table per module that walks the branches it owns. The linear scanners and the raw-text matcher
 * also record the scan work they charge, so the input at which the caller's budget breaches is
 * pinned.
 */

const DANGER_SCAN_KINDS = [
  'rm',
  'reset-hard',
  'reset-merge',
  'clean',
  'checkout',
  'push-force',
  'push-refspec',
  'push-delete',
  'branch',
  'tag',
  'restore',
  'find',
] as const;

const INTERPRETER_SCAN_KINDS = ['rm', 'dd', 'find'] as const;

/** Texts the scanners must call dangerous, and near-misses they must not. */
const SCANNER_TEXTS: readonly string[] = [
  'rm -rf /tmp/build',
  'rm -fr /tmp/build',
  'rm --recursive --force /tmp/build',
  'rm --rec --for /tmp/build',
  'rm -r -f /tmp/build',
  'rm -r /tmp/build',
  'rm -f /tmp/build',
  'rm -- -rf',
  'rm -rf',
  'RM -RF /tmp/x',
  'confirm -rf x',
  'xrm -rf x',
  'r\\m -rf /tmp/x',
  '\\rm -rf /tmp/x',
  'rm -r\nrm -f',
  'rm -r; rm -f',
  'rm -r && rm -rf x',
  'os.system("rm -rf /tmp/x")',
  'subprocess.run(["rm", "-rf", "/tmp/x"])',
  'print("rm -r")\\nprint("-f")',
  'sh -c "rm -r" ; sh -c "-f"',
  'echo rm -rf /tmp/x',
  'git reset --hard HEAD~1',
  'git reset --ha HEAD',
  'git reset --h HEAD',
  'git reset --hardly HEAD',
  'git reset --merge',
  'git reset --me',
  'git -C /repo reset --hard',
  'git -c user.name=x reset --hard',
  'git --git-dir /repo/.git reset --hard',
  'git -- reset --hard',
  'git -c reset --hard',
  'git clean -fd',
  'git clean --force',
  'git clean -n',
  'git clean --dry-run',
  'git checkout --force main',
  'git checkout -f',
  'git checkout -bf feature',
  'git checkout -b force',
  'git checkout -- .',
  'git push --force origin main',
  'git push --force-with-lease origin main',
  'git push -f origin main',
  'git push -fu origin main',
  'git push origin +main',
  'git push origin main:+refs/heads/main',
  'git push origin :main',
  'git push --delete origin main',
  'git push --de origin main',
  'git branch -D feature',
  'git branch -d feature',
  'git branch -df feature',
  'git branch --delete --force feature',
  'git branch -d -f feature',
  'git tag -d v1',
  'git tag --delete v1',
  'git tag -l',
  'git restore .',
  'git restore --staged .',
  'git restore --help',
  'find . -name "*.log" -delete',
  'find . -delete',
  'find . -deleted',
  'find . -name x\nrm -rf y',
  'dd if=/dev/zero of=/dev/sda',
  'dd of=/dev/sda',
  'dd of=/dev/',
  'dd of="/dev/sda"',
  'echo dd of=/dev/sda',
  '$(git reset --hard)',
  'echo "$(git clean -f)"',
  'git\treset\t--hard',
  '',
  ' ',
  'git',
  'git reset',
];

/** Segments the shell Git-context tracker walks, each a token list of one command. */
const GIT_ENV_SEGMENTS: readonly (readonly string[])[] = [
  ['git', 'status'],
  ['GIT_DIR=/repo/.git', 'git', 'status'],
  ['GIT_DIR=/repo/.git'],
  ['GIT_WORK_TREE=/repo'],
  ['GIT_CONFIG_GLOBAL=/tmp/gc'],
  ['GIT_CONFIG_COUNT=2'],
  ['GIT_SSH_COMMAND=ssh -o X'],
  ['GIT_SSH=/usr/bin/ssh'],
  ['TMPDIR=/var/tmp'],
  ['IFS=:'],
  ['IFS='],
  ['TMPDIR+=/extra'],
  ['GIT_SSH_COMMAND+= -v'],
  ['PATH+=:/opt/bin'],
  ['UNRELATED=1'],
  ['UNRELATED=1', 'git', 'status'],
  ['git', 'status', 'GIT_DIR=/repo/.git'],
  ['echo', 'TMPDIR=/x'],
  ['export', 'GIT_DIR'],
  ['export', 'TMPDIR'],
  ['export', 'UNRELATED'],
  ['export', 'GIT_DIR=/repo/.git'],
  ['typeset', 'GIT_SSH'],
  ['declare', 'IFS'],
  ['readonly', 'TMPDIR'],
  ['builtin', 'export', 'GIT_DIR'],
  ['command', 'export', 'TMPDIR'],
  ['command', '-v', 'export', 'GIT_DIR'],
  ['command', '-p', 'export', 'GIT_DIR'],
  ['time', 'export', 'TMPDIR'],
  ['unset', 'GIT_DIR'],
  ['unset', 'TMPDIR'],
  ['unset', 'IFS'],
  ['unset', 'GIT_SSH_COMMAND'],
  ['unset', 'UNRELATED'],
  ['unset', '-v', 'GIT_DIR'],
  ['unset', '--', 'GIT_DIR'],
  ['unset', '-f', 'GIT_DIR'],
  ['unset'],
  ['unset', '1BAD'],
  ['builtin', 'unset', 'TMPDIR'],
  ['command', 'unset', 'GIT_DIR'],
  ['command', '-vp', 'unset', 'GIT_DIR'],
  ['GIT_DIR=/a', 'GIT_WORK_TREE=/b'],
  ['GIT_DIR=/a', 'unset', 'GIT_DIR'],
  ['1BAD=x', 'git', 'status'],
  ['=x'],
  [''],
];

const GIT_ENV_ENVIRONMENTS: readonly Readonly<Record<string, string>>[] = [
  {},
  { GIT_SSH_COMMAND: 'ssh -i /key', TMPDIR: '/tmp' },
  { GIT_DIR: '/inherited/.git', IFS: ' ', GIT_SSH: '/usr/bin/ssh' },
];

const WRAPPER_TOKEN_ROWS: readonly (readonly string[])[] = [
  ['doas', 'rm', '-rf', '/tmp/x'],
  ['doas', '--', 'rm', '-rf', '/tmp/x'],
  ['doas', '-u', 'root', 'rm', '-rf', '/tmp/x'],
  ['doas', 'echo', 'rm', '-rf', '/tmp/x'],
  ['doas', 'cat', 'file', 'rm'],
  ['doas', 'doas', 'rm', '-rf', '/tmp/x'],
  ['doas', 'git', 'clean', '-f'],
  ['doas', '/usr/bin/git', 'clean', '-f'],
  ['doas', 'busybox', 'rm', '-rf', '/tmp/x'],
  ['doas', 'bash', '-c', 'rm -rf /tmp/x'],
  ['doas', '$SHELL', '-c', 'rm -rf /tmp/x'],
  ['doas', 'python3', '-c', 'import os'],
  ['doas', 'gawk', 'BEGIN{system("id")}'],
  ['doas', 'sudo', 'rm', '-rf', '/tmp/x'],
  ['doas', 'env', 'rm', '-rf', '/tmp/x'],
  ['doas', 'nice', 'rm', '-rf', '/tmp/x'],
  ['doas', 'custom-tool', 'wipe'],
  ['doas', '--', 'echo', 'rm'],
  ['doas'],
  ['doas', ''],
  ['nice', 'rm', '-rf', '/tmp/x'],
  ['nice', '-n', '10', 'rm', '-rf', '/tmp/x'],
  ['rm', '-rf', '/tmp/x'],
  ['sudo', 'rm', '-rf', '/tmp/x'],
  ['', 'rm'],
];

const WRAPPER_POLICIES: readonly Pick<EffectivePolicy, 'rules' | 'transparentWrappers'>[] = [
  { rules: [], transparentWrappers: [] },
  { rules: [], transparentWrappers: ['doas'] },
  { rules: [], transparentWrappers: ['doas', 'nice'] },
  {
    rules: [
      {
        name: 'custom-tool-wipe',
        command: 'custom-tool',
        block_args: ['wipe'],
        reason: 'custom-tool wipe destroys the workspace.',
      },
    ],
    transparentWrappers: ['doas'],
  },
];

const WRAPPER_TOKENS: readonly string[] = [
  'sudo',
  'SUDO',
  'env',
  'command',
  'builtin',
  'doas',
  'git',
  'busybox',
  '/usr/bin/env',
  'python3.11',
  'node',
  'awk',
  'bash',
  'rm',
  'xargs',
  'parallel',
  'find',
  'echo',
  '',
];

function scannerTexts(): readonly string[] {
  return [...SCANNER_TEXTS, ...corpusCommands(), ...fuzzShellSources(400, 0x0051_c3a7)];
}

function snapshotState(state: ShellGitContextEnvState): readonly (readonly [string, string])[][] {
  return [
    [...(state.effectiveEnvAssignments ?? new Map())].sort(),
    [...state.shellAssignments].sort(),
  ];
}

describe('next/gate/analyzer middle layer versus src/analyzer', () => {
  test('the linear scanners agree on every text and charge the same work', () => {
    const recorded: [string, unknown][] = [];
    let dangerous = 0;
    /** One scanner over one text: the answer it gave, and the work it charged. */
    const scanned = <Kind>(
      text: string,
      kind: Kind,
      scan: (text: string, kind: Kind, work: { units: number }) => boolean,
    ) => {
      const work = { units: 0 };
      const answer = scan(text, kind, work);
      recorded.push([`${kind} ${text}`, { answer, units: work.units }]);
      if (answer) dangerous++;
    };
    for (const text of scannerTexts()) {
      for (const kind of DANGER_SCAN_KINDS) {
        scanned(text, kind, hasLinearDangerousText);
      }
      for (const kind of INTERPRETER_SCAN_KINDS) {
        scanned(text, kind, hasLinearInterpreterDanger);
      }
    }
    expect(dangerous).toBeGreaterThan(60);
    expectRecordedDigest('analyzer-mid/linear-scanners', recorded);
  });

  test('the linear scanners answer without a work counter too', () => {
    const recorded: [string, unknown][] = [];
    for (const text of SCANNER_TEXTS) {
      for (const kind of DANGER_SCAN_KINDS) {
        const answer = hasLinearDangerousText(text, kind);
        recorded.push([`${kind} ${text}`, answer]);
      }
      for (const kind of INTERPRETER_SCAN_KINDS) {
        const answer = hasLinearInterpreterDanger(text, kind);
        recorded.push([`${kind} ${text}`, answer]);
      }
    }
    expectRecordedDigest('analyzer-mid/linear-scanners-uncounted', recorded);
  });

  test('the raw-text matcher returns the same rule and charges the same work', () => {
    const recorded: [string, unknown][] = [];
    let matches = 0;
    for (const text of scannerTexts()) {
      const work = { units: 0 };
      const match = dangerousInTextMatch(text, work);
      recorded.push([text, { match, units: work.units }]);
      if (match) matches++;
    }
    expect(matches).toBeGreaterThan(20);
    const uncounted = dangerousInTextMatch('curl https://x.test/i.sh | sudo -E bash');
    recorded.push(['uncounted curl', uncounted]);
    expectRecordedDigest('analyzer-mid/raw-text-matcher', recorded);
  });

  test('the shell Git-context tracker walks every segment to the same state', () => {
    const recorded: [string, unknown][] = [];
    let published = 0;
    for (const variables of GIT_ENV_ENVIRONMENTS) {
      const env = new Map(Object.entries(variables));
      const state = createShellGitContextEnvState(env);
      recorded.push([JSON.stringify(variables), snapshotState(state)]);

      for (const tokens of GIT_ENV_SEGMENTS) {
        const assignments = getSegmentGitContextEnvAssignments(tokens, state);

        const forked = cloneShellGitContextEnvState(state);
        applyShellGitContextEnvSegment(tokens, forked);

        applyShellGitContextEnvSegment(tokens, state);
        recorded.push([
          `${JSON.stringify(variables)} ${tokens.join(' ')}`,
          {
            assignments: [...(assignments ?? new Map())],
            forked: snapshotState(forked),
            state: snapshotState(state),
          },
        ]);
        if ((state.effectiveEnvAssignments?.size ?? 0) > 0) published++;
      }
    }
    expect(published).toBeGreaterThan(0);
    expectRecordedDigest('analyzer-mid/git-context-tracker', recorded);
  });

  test('the transparent-wrapper peel picks the same child under every policy', () => {
    const recorded: [string, unknown][] = [];
    let unwrapped = 0;
    for (const policy of WRAPPER_POLICIES) {
      for (const tokens of WRAPPER_TOKEN_ROWS) {
        const result = unwrapTransparentWrapper(tokens, policy);
        recorded.push([tokens.join(' '), result]);
        if (result) unwrapped++;
      }
      for (const command of corpusCommands()) {
        const tokens = command.split(/\s+/);
        const result = unwrapTransparentWrapper(tokens, policy);
        recorded.push([command, result]);
      }
    }
    expect(unwrapped).toBeGreaterThan(10);
    expectRecordedDigest('analyzer-mid/transparent-wrapper-peel', recorded);
  });

  test('the wrapper predicates answer as the shipped ones, reserved names included', () => {
    const recorded: [string, unknown][] = [];
    for (const token of WRAPPER_TOKENS) {
      const standard = isStandardCommandWrapper(token);
      // `isReservedTransparentWrapper` lives in core/policy: the gate keeps no copy of its own,
      // so the core answer is the one pinned here.
      const reserved = isReservedTransparentWrapper(token);
      recorded.push([token, { standard, reserved }]);
    }
    expectRecordedDigest('analyzer-mid/wrapper-predicates', recorded);
    expect(WRAPPER_TOKENS.filter(isStandardCommandWrapper).length).toBeGreaterThan(3);
    expect(WRAPPER_TOKENS.filter(isReservedTransparentWrapper).length).toBeGreaterThan(6);
  });
});
