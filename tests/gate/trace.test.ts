import { describe, expect, test } from 'bun:test';
import {
  type CommandTraceEvent,
  type CommandTraceTerminal,
  createCommandTraceContext as createPortedContext,
  createCommandTraceRecorder as createPortedRecorder,
  type TraceStep,
} from '@/gate/trace';

/**
 * What the recorder retains, bounds and redacts: every step kind, a secret-bearing payload and each
 * terminal shape go through it and are recorded.
 */

const PORTED = { recorder: createPortedRecorder, context: createPortedContext };

const SECRETS = [
  'hunter2',
  'derived-value-9',
  'ghp_abcdefghijklmnopqrstuvwxyz012345',
  'AKIAIOSFODNN7EXAMPLE',
  'Bearer top-secret',
  'admin:swordfish',
  'eyJhbGciOiJIUzI1NiJ9.c2lnbmVk.c2lnbmVk',
];

const globalEvent = (step: TraceStep): CommandTraceEvent => ({
  kind: 'step',
  scope: 'global',
  step,
});

const segmentEvent = (segmentIndex: number, step: TraceStep): CommandTraceEvent => ({
  kind: 'step',
  scope: 'segment',
  segmentIndex,
  step,
});

function cyclicEvent(): CommandTraceEvent {
  const step: Record<string, unknown> = { type: 'error', message: 'AWS_KEY=derived-value-9' };
  step.self = step;
  step.nested = { deeper: { deepest: ['derived-value-9', 'AKIAIOSFODNN7EXAMPLE'] } };
  return globalEvent(step as unknown as TraceStep);
}

const EVENTS: readonly CommandTraceEvent[] = [
  globalEvent({
    type: 'parse',
    input:
      'AWS_KEY=derived-value-9 PASSWORD=hunter2 curl -u admin:swordfish https://api.example.com',
    segments: [['derived-value-9'], ['ghp_abcdefghijklmnopqrstuvwxyz012345'], ['echo', 'ok']],
  }),
  globalEvent({
    type: 'env-strip',
    input: ['PASSWORD=hunter2', 'git', 'status'],
    envVars: ['PASSWORD'],
    output: ['git', 'status'],
  }),
  globalEvent({
    type: 'leading-tokens-stripped',
    input: ['sudo', '-u', 'root', '--', 'rm', '-rf', '/'],
    removed: ['sudo', '-u', 'root', '--'],
    output: ['rm', '-rf', '/'],
  }),
  globalEvent({ type: 'shell-wrapper', wrapper: 'bash', innerCommand: 'rm -rf /tmp/x' }),
  globalEvent({
    type: 'interpreter',
    interpreter: 'python3',
    codeArg: 'import os; os.environ["TOKEN"]="hunter2"',
    paranoidBlocked: true,
  }),
  globalEvent({ type: 'busybox', subcommand: 'rm' }),
  globalEvent({ type: 'transparent-wrapper', wrapper: 'env', output: ['rm', '-rf', '.'] }),
  globalEvent({ type: 'recurse', reason: 'shell-wrapper', innerCommand: 'rm -rf /', depth: 1 }),
  globalEvent({ type: 'recurse', reason: 'heredoc-file', innerCommand: 'cat <<EOF', depth: 4 }),
  globalEvent({
    type: 'tmpdir-check',
    tmpdirValue: '/home/agent/not-temp',
    isOverriddenToNonTemp: true,
    allowTmpdirVar: false,
  }),
  globalEvent({
    type: 'strict-unparseable',
    rawCommand: 'echo "unclosed',
    reason: 'unclosed quote',
  }),
  segmentEvent(0, { type: 'rule-check', rule: 'rm-rf-root', matched: true, reason: 'Blocked' }),
  segmentEvent(0, { type: 'rule-check', rule: 'git-clean', matched: false }),
  segmentEvent(1, { type: 'worktree-relaxation', originalReason: 'discard', gitCwd: '/work/repo' }),
  segmentEvent(1, {
    type: 'fallback-scan',
    tokensScanned: ['Authorization: Bearer top-secret', 'eyJhbGciOiJIUzI1NiJ9.c2lnbmVk.c2lnbmVk'],
    embeddedCommandFound: 'rm -rf /',
  }),
  segmentEvent(2, { type: 'custom-rules-check', rulesChecked: true, matched: true, reason: 'r' }),
  segmentEvent(2, { type: 'custom-rules-check', rulesChecked: false, matched: false }),
  segmentEvent(2, { type: 'cwd-change', segment: 'cd /tmp', effectiveCwdNowUnknown: true }),
  segmentEvent(3, { type: 'dangerous-text', token: 'AKIAIOSFODNN7EXAMPLE', matched: false }),
  segmentEvent(3, { type: 'segment-skipped', index: 3, reason: 'prior-segment-blocked' }),
  segmentEvent(4, { type: 'error', message: 'boom', partial: true }),
  cyclicEvent(),
  { kind: 'step', scope: 'nowhere', step: { type: 'busybox', subcommand: 'ls' } } as never,
  undefined as never,
];

const TERMINALS: readonly CommandTraceTerminal[] = [
  { result: 'allowed' },
  { result: 'blocked', reason: 'Blocked destructive command.', segment: 'rm -rf /' },
  {
    result: 'blocked',
    reason: 'Blocked: PASSWORD=hunter2 leaked into the reason',
    segment: 'curl -u admin:swordfish https://api.example.com',
    ruleId: 'destructive-rm-rf',
  },
  { result: 'interrupted', reason: 'x', segment: 'y' } as never,
  {
    result: 'blocked',
    reason: 'r'.repeat(9_000),
    segment: 's'.repeat(9_000),
    ruleId: '',
    extra: 'ignored',
  } as never,
];

const OPTION_SETS: readonly Parameters<typeof createPortedRecorder>[0][] = [
  undefined,
  {},
  { maxEvents: 4 },
  { maxTextLength: 10, maxListLength: 2, maxDepth: 2 },
  { maxTextLength: 24, maxListLength: 1, maxObjectProperties: 1, maxDepth: 1 },
];

function recordAll(
  createRecorder: typeof createPortedRecorder,
  options: Parameters<typeof createPortedRecorder>[0],
  terminal: CommandTraceTerminal,
) {
  const recorder = createRecorder(options);
  EVENTS.forEach((event) => {
    recorder.record(event);
  });
  const trace = recorder.finish(terminal);
  recorder.record(EVENTS[0] as CommandTraceEvent);
  return { trace, afterFinish: recorder.finish({ result: 'allowed' }) };
}

function walkContext(module: typeof PORTED) {
  const recorder = module.recorder({ maxEvents: 16 });
  const context = module.context(recorder);
  const beforeAnySegment = context.getNextSegmentIndex();
  context.recordSegment({ type: 'busybox', subcommand: 'dropped-without-current-segment' });
  const first = context.allocateSegment();
  context.currentSegmentIndex = first;
  context.recordSegment({ type: 'rule-check', rule: 'first', matched: false });
  const second = context.allocateSegment();
  context.recordSegment({ type: 'rule-check', rule: 'explicit', matched: true }, second);
  context.recordGlobal({ type: 'parse', input: 'PASSWORD=hunter2 id', segments: [['id']] });
  return {
    beforeAnySegment,
    first,
    second,
    afterAllocation: context.getNextSegmentIndex(),
    trace: recorder.finish({ result: 'blocked', reason: 'no', segment: 'id', ruleId: 'r' }),
  };
}

describe('ported command trace recorder', () => {
  test('produces the shipped trace for every option set and terminal', () => {
    OPTION_SETS.forEach((options) => {
      TERMINALS.forEach((terminal) => {
        expect(recordAll(createPortedRecorder, options, terminal)).toMatchSnapshot();
      });
    });
  });

  test('redacts assignment, derived and provider secrets exactly as shipped', () => {
    const trace = recordAll(createPortedRecorder, undefined, TERMINALS[2] as CommandTraceTerminal);
    const serialized = JSON.stringify(trace.trace);

    expect(SECRETS.filter((secret) => serialized.includes(secret))).toEqual([]);
    expect(serialized).toContain('<redacted>');
    expect(serialized).toMatchSnapshot();
  });

  test('freezes the trace and its events as shipped', () => {
    const ported = recordAll(createPortedRecorder, {}, TERMINALS[1] as CommandTraceTerminal).trace;

    const frozen = [
      Object.isFrozen(ported),
      Object.isFrozen(ported.events),
      Object.isFrozen(ported.events[0]?.step),
      Object.isFrozen(ported.terminal),
    ];
    expect(frozen).toMatchSnapshot();
  });

  test('allocates segments and routes steps like the shipped context', () => {
    expect(walkContext(PORTED)).toMatchSnapshot();
  });
});
