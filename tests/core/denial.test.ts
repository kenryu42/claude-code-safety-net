import { describe, expect, test } from 'bun:test';
import { BLOCK_INTENTS, type BlockIntent, type Decision } from '@/core/decision';
import * as next from '@/core/denial';
import { corpusStrings } from './differential-inputs';

const LONG_COMMAND = `rm -rf ${'./build/artifacts '.repeat(20)}`;
const LONG_REASON = `Blocked: ${'the target is outside the workspace and cannot be recovered '.repeat(5)}`;
const SECRET_COMMAND =
  'GITHUB_TOKEN=ghp_abcdefghijklmnopqrstuvwxyz0123 git push --force origin main';

function deny(
  reason: string,
  intent: BlockIntent,
  evidence: { command: string; segment?: string }[],
  ruleId?: string,
): Decision {
  return {
    kind: 'deny',
    reason,
    intent,
    ...(ruleId === undefined ? {} : { ruleId }),
    evidence: evidence.map((item) => ({ kind: 'command' as const, ...item })),
  };
}

type Evaluation = { decision: Decision; configFallback?: { reason: string } };

/** Every intent with and without a rule id, segment equal to and narrower than the command. */
const EVALUATIONS: readonly Evaluation[] = [
  { decision: { kind: 'allow' } },
  ...BLOCK_INTENTS.flatMap((intent, index) => [
    {
      decision: deny(`Reason for ${intent}`, intent, [
        {
          command: `git push --force origin main; echo ${index}`,
          segment: 'git push --force origin main',
        },
      ]),
    },
    {
      decision: deny(
        `Reason for ${intent} with rule`,
        intent,
        [{ command: 'rm -rf ./build', segment: 'rm -rf ./build' }],
        `test.${intent}`,
      ),
    },
  ]),
  { decision: deny('No evidence at all', 'hard_stop', [], 'test.no-evidence') },
  { decision: deny('Evidence without a segment', 'scope_down', [{ command: 'find . -delete' }]) },
  { decision: deny('Empty command evidence', 'manual_only', [{ command: '', segment: '' }]) },
  {
    decision: deny('Long command and segment', 'use_alternative', [
      { command: LONG_COMMAND, segment: LONG_COMMAND.slice(0, 250) },
    ]),
  },
  {
    decision: deny(LONG_REASON, 'stop_and_explain', [
      { command: 'x'.repeat(201), segment: 'x'.repeat(200) },
    ]),
  },
  {
    decision: deny(
      'Secrets in every field',
      'hard_stop',
      [{ command: SECRET_COMMAND, segment: 'git push --force origin main' }],
      'secret.token',
    ),
    configFallback: { reason: 'invalid policy config: token sk-proj-abcdefghijklmnopqrstuvwxyz' },
  },
  {
    decision: deny(
      'Degraded configuration rides along',
      'manual_only',
      [{ command: 'git reset --hard' }],
      'git.reset-hard',
    ),
    configFallback: {
      reason: 'local source digest mismatch for team/rules; enforcing the verified cached rulebook',
    },
  },
  {
    decision: deny('Multiple evidence items keep the first command', 'scope_down', [
      { command: 'first', segment: 'one' },
      { command: 'second', segment: 'two' },
    ]),
  },
  {
    decision: deny('Unicode 😀 日本語 command', 'hard_stop', [
      { command: 'echo 😀 日本語', segment: '日本語' },
    ]),
  },
  {
    decision: deny('Multi-line command', 'use_alternative', [{ command: 'a\nb\nc', segment: 'b' }]),
  },
];

const OPTIONS = [
  { includeEvidence: true },
  { includeEvidence: false },
  { includeEvidence: true, toolName: 'Read' },
  { includeEvidence: false, toolName: 'Bash' },
  { includeEvidence: true, toolName: '' },
] as const;

describe('denial renderer', () => {
  test('projects and formats every decision like the shipped integration layer', () => {
    let formatted = 0;
    for (const evaluation of EVALUATIONS) {
      for (const options of OPTIONS) {
        const nextDenial = next.projectGuardDenial(evaluation, options);
        expect(nextDenial).toMatchSnapshot();
        if (nextDenial === undefined) continue;
        expect(next.formatDenial(nextDenial)).toMatchSnapshot();
        formatted++;
      }
    }
    expect(formatted).toBe((EVALUATIONS.length - 1) * OPTIONS.length);
  });

  test('renders every corpus command as evidence identically', () => {
    for (const command of corpusStrings()) {
      const denial = {
        reason: 'Corpus command',
        intent: 'hard_stop' as const,
        command,
        segment: command.slice(0, Math.ceil(command.length / 2)),
        toolName: 'Bash',
      };
      expect(next.formatDenial(denial)).toMatchSnapshot();
    }
  });

  test('formats explicit inputs, caps, and redactors like the shipped frame', () => {
    const inputs: readonly next.FormatBlockedMessageInput[] = [
      { reason: 'plain' },
      { reason: 'default intent falls back to manual_only', command: 'rm -rf /' },
      {
        reason: 'tool line rides between reason and command',
        command: 'cat ~/.ssh/id_rsa',
        toolName: 'Read',
      },
      {
        reason: 'segment equals command',
        command: 'git reset --hard',
        segment: 'git reset --hard',
      },
      { reason: 'segment only', segment: 'git reset --hard' },
      {
        reason: 'custom cap',
        command: LONG_COMMAND,
        segment: LONG_COMMAND.slice(0, 60),
        maxLen: 50,
      },
      { reason: 'default cap', command: LONG_COMMAND, segment: 'short' },
      { reason: 'exactly at the cap', command: 'y'.repeat(200), segment: 'y'.repeat(200).slice(1) },
      { reason: 'zero cap', command: 'abc', maxLen: 0 },
      {
        reason: 'custom redactor over secret',
        command: 'rm -rf /secret/path',
        segment: 'echo secret',
        configWarning: 'secret warning',
        redact: (text) => text.replace(/secret/g, '***'),
      },
      {
        reason: 'config warning without redactor',
        configWarning: 'invalid policy config: token sk-proj-abcdefghijklmnopqrstuvwxyz',
      },
      {
        reason: 'empty strings are omitted',
        ruleId: '',
        command: '',
        segment: '',
        toolName: '',
        configWarning: '',
      },
      ...BLOCK_INTENTS.map((intent) => ({
        reason: `intent ${intent}`,
        intent,
        ruleId: `rule.${intent}`,
      })),
    ];
    for (const input of inputs) {
      expect(next.formatBlockedMessage(input)).toMatchSnapshot();
    }
  });

  test('builds the failed-closed denial and error text like the shipped helpers', () => {
    const options = [
      {},
      { command: 'rm -rf /' },
      { command: 'rm -rf /', toolName: 'Bash' },
      { command: 'a && b', segment: 'b', toolName: 'Write' },
      { segment: 'orphan segment' },
      { command: SECRET_COMMAND },
    ];
    for (const option of options) {
      expect(next.createFailedClosedDenial(option)).toMatchSnapshot();
      expect(next.formatDenial(next.createFailedClosedDenial(option))).toMatchSnapshot();
    }
    expect(next.createFailedClosedDenial()).toMatchSnapshot();
    for (const cause of [
      new Error(`boom ${SECRET_COMMAND}`),
      new TypeError('typed'),
      'string cause with ghp_abcdefghijklmnopqrstuvwxyz0123',
      42,
      null,
      undefined,
      { message: 'object' },
    ]) {
      expect(next.formatIntegrationError(cause)).toMatchSnapshot();
    }
  });
});
