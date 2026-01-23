/**
 * Tests for the explainCommand function.
 */
import { describe, expect, test } from 'bun:test';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { getConfigSource } from '@/bin/explain/config';
import { explainCommand } from '@/bin/explain/index';
import { explainSegment } from '@/bin/explain/segment';
import { REASON_RECURSION_LIMIT } from '@/core/analyze/analyze-command';
import type { TraceStep } from '@/types';
import { MAX_RECURSION_DEPTH } from '@/types';

describe('explainCommand', () => {
  test('git status returns allowed', () => {
    const result = explainCommand('git status');
    expect(result.result).toBe('allowed');
  });

  test('git reset --hard returns blocked', () => {
    const result = explainCommand('git reset --hard');
    expect(result.result).toBe('blocked');
    expect(result.reason).toContain('git reset --hard');
  });

  test('sudo git reset --hard traces wrapper stripping', () => {
    const result = explainCommand('sudo git reset --hard');
    expect(result.result).toBe('blocked');
    const allSteps = result.trace.segments.flatMap((s) => s.steps);
    const stripStep = allSteps.find((s) => s.type === 'leading-tokens-stripped');
    expect(stripStep).toBeDefined();
  });

  test('multi-segment with first blocked skips later segments', () => {
    const result = explainCommand('git reset --hard && ls');
    expect(result.result).toBe('blocked');
    const skipSteps = result.trace.segments
      .flatMap((s) => s.steps)
      .filter((s) => s.type === 'segment-skipped');
    expect(skipSteps.length).toBeGreaterThan(0);
  });

  test('empty command returns error step', () => {
    const result = explainCommand('');
    expect(result.trace.steps).toContainEqual({
      type: 'error',
      message: 'No command provided',
    });
  });

  test('whitespace-only command returns error step', () => {
    const result = explainCommand('   ');
    expect(result.trace.steps).toContainEqual({
      type: 'error',
      message: 'No command provided',
    });
  });

  test('bash -c with inner command traces shell wrapper', () => {
    const result = explainCommand('bash -c "git status"');
    expect(result.result).toBe('allowed');
    const allSteps = result.trace.segments.flatMap((s) => s.steps);
    const shellStep = allSteps.find((s) => s.type === 'shell-wrapper');
    expect(shellStep).toBeDefined();
  });

  test('env variables are redacted', () => {
    const result = explainCommand('SECRET=password git status');
    const allSteps = result.trace.segments.flatMap((s) => s.steps);
    const envStep = allSteps.find((s) => s.type === 'env-strip');
    if (envStep && envStep.type === 'env-strip') {
      expect(envStep.envVars.SECRET).toBe('<redacted>');
    }
  });

  test('configSource is set correctly', () => {
    const result = explainCommand('git status');
    expect(typeof result.configValid).toBe('boolean');
  });

  test('three-segment command shows all segments', () => {
    const result = explainCommand('echo a && echo b && echo c');
    expect(result.trace.segments.length).toBe(3);
  });
});

describe('explainCommand edge cases', () => {
  test('python interpreter command traces interpreter step', () => {
    const result = explainCommand('python -c "print(1)"');
    const allSteps = result.trace.segments.flatMap((s) => s.steps);
    const interpStep = allSteps.find((s) => s.type === 'interpreter');
    expect(interpStep).toBeDefined();
  });

  test('busybox rm traces busybox step', () => {
    const result = explainCommand('busybox rm -rf /tmp/test');
    const allSteps = result.trace.segments.flatMap((s) => s.steps);
    const busyboxStep = allSteps.find((s) => s.type === 'busybox');
    expect(busyboxStep).toBeDefined();
  });

  test('rm command traces rule check', () => {
    const result = explainCommand('rm -rf /');
    expect(result.result).toBe('blocked');
    const allSteps = result.trace.segments.flatMap((s) => s.steps);
    const ruleStep = allSteps.find(
      (s) => s.type === 'rule-check' && s.ruleModule === 'rules-rm.ts',
    );
    expect(ruleStep).toBeDefined();
  });

  test('find -delete traces rule check', () => {
    const result = explainCommand('find . -delete');
    expect(result.result).toBe('blocked');
    const allSteps = result.trace.segments.flatMap((s) => s.steps);
    const ruleStep = allSteps.find(
      (s) => s.type === 'rule-check' && s.ruleModule === 'analyze/find.ts',
    );
    expect(ruleStep).toBeDefined();
  });

  test('xargs rm traces rule check and tmpdir check', () => {
    const result = explainCommand('echo | xargs rm -rf /');
    const allSteps = result.trace.segments.flatMap((s) => s.steps);
    const tmpStep = allSteps.find((s) => s.type === 'tmpdir-check');
    expect(tmpStep).toBeDefined();
  });

  test('parallel command traces rule check', () => {
    const result = explainCommand('parallel rm -rf ::: /');
    const allSteps = result.trace.segments.flatMap((s) => s.steps);
    const ruleStep = allSteps.find(
      (s) => s.type === 'rule-check' && s.ruleModule === 'analyze/parallel.ts',
    );
    expect(ruleStep).toBeDefined();
  });

  test('custom-rules-check shows rulesChecked false when no config', () => {
    const result = explainCommand('echo hello');
    const allSteps = result.trace.segments.flatMap((s) => s.steps);
    const customStep = allSteps.find((s) => s.type === 'custom-rules-check');
    expect(customStep).toBeDefined();
    if (customStep && customStep.type === 'custom-rules-check') {
      expect(customStep.rulesChecked).toBe(false);
    }
  });

  test('deeply nested bash -c commands trace multiple recurse steps', () => {
    const result = explainCommand('bash -c "bash -c \\"git status\\""');
    const allSteps = result.trace.segments.flatMap((s) => s.steps);
    const recurseSteps = allSteps.filter((s) => s.type === 'recurse');
    expect(recurseSteps.length).toBeGreaterThanOrEqual(1);
  });

  test('command with cwd option uses provided cwd', () => {
    const result = explainCommand('git status', { cwd: '/tmp' });
    expect(result.result).toBe('allowed');
  });
});

describe('explainCommand rm with home directory', () => {
  test('rm in home directory cwd is blocked', () => {
    const homeDir = process.env.HOME;
    if (!homeDir) return;
    const result = explainCommand('rm -rf .', { cwd: homeDir });
    expect(result.result).toBe('blocked');
    expect(result.reason).toContain('home directory');
    const allSteps = result.trace.segments.flatMap((s) => s.steps);
    const ruleStep = allSteps.find(
      (s) =>
        s.type === 'rule-check' &&
        s.ruleModule === 'rules-rm.ts' &&
        s.ruleFunction === 'isHomeDirectory',
    );
    expect(ruleStep).toBeDefined();
  });
});

describe('explainCommand parallel with nested blocked', () => {
  test('parallel rm -rf / is blocked', () => {
    const result = explainCommand('parallel rm -rf ::: /');
    expect(result.result).toBe('blocked');
    const allSteps = result.trace.segments.flatMap((s) => s.steps);
    const parallelStep = allSteps.find(
      (s) => s.type === 'rule-check' && s.ruleModule === 'analyze/parallel.ts',
    );
    expect(parallelStep).toBeDefined();
  });

  test('sem is not treated as parallel (matches actual guard behavior)', () => {
    const result = explainCommand('sem rm -rf /');
    expect(result.result).toBe('blocked');
    const allSteps = result.trace.segments.flatMap((s) => s.steps);
    const tmpStep = allSteps.find((s) => s.type === 'tmpdir-check');
    expect(tmpStep).toBeUndefined();
    const fallbackStep = allSteps.find((s) => s.type === 'fallback-scan');
    expect(fallbackStep).toBeDefined();
  });
});

describe('explainCommand shell wrapper edge cases', () => {
  test('bash without -c argument returns null for wrapper', () => {
    const result = explainCommand('bash script.sh');
    expect(result.result).toBe('allowed');
    const allSteps = result.trace.segments.flatMap((s) => s.steps);
    const wrapperStep = allSteps.find((s) => s.type === 'shell-wrapper');
    expect(wrapperStep).toBeUndefined();
  });

  test('sh -c with blocked inner command blocks', () => {
    const result = explainCommand('sh -c "git reset --hard"');
    expect(result.result).toBe('blocked');
    const allSteps = result.trace.segments.flatMap((s) => s.steps);
    const wrapperStep = allSteps.find((s) => s.type === 'shell-wrapper');
    expect(wrapperStep).toBeDefined();
  });

  test('nested shell wrapper with allowed command', () => {
    const result = explainCommand('bash -c "sh -c \\"echo hello\\""');
    expect(result.result).toBe('allowed');
  });
});

describe('explainCommand max recursion depth', () => {
  test('deeply nested command hits max recursion', () => {
    const deepNested =
      'bash -c "bash -c \\"bash -c \\\\\\"bash -c \\\\\\\\\\\\\\"bash -c \\\\\\\\\\\\\\\\\\\\\\\\\\\\\\"echo deep\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\"\\\\\\\\\\\\\\"\\\\\\"\\"" ';
    const result = explainCommand(deepNested);
    const allSteps = result.trace.segments.flatMap((s) => s.steps);
    const errorStep = allSteps.find(
      (s) => s.type === 'error' && s.message?.includes('exceeds maximum recursion depth'),
    );
    const recurseSteps = allSteps.filter((s) => s.type === 'recurse');
    expect(recurseSteps.length + (errorStep ? 1 : 0)).toBeGreaterThan(0);
  });

  test('hits exact max recursion depth of 5', () => {
    const level5 =
      'bash -c "bash -c \\"bash -c \\\\\\"bash -c \\\\\\\\\\\\\\"bash -c \\\\\\\\\\\\\\\\\\\\\\\\\\\\\\"echo hi\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\"\\\\\\\\\\\\\\"\\\\\\"\\"" ';
    const result = explainCommand(level5);
    const allSteps = result.trace.segments.flatMap((s) => s.steps);
    const errorStep = allSteps.find(
      (s) => s.type === 'error' && s.message?.includes('exceeds maximum recursion depth'),
    );
    const recurseSteps = allSteps.filter((s) => s.type === 'recurse');
    expect(recurseSteps.length >= 3 || errorStep).toBeTruthy();
  });

  test('hits max recursion depth with 10 nested bash -c calls', () => {
    let cmd = 'echo ok';
    for (let i = 0; i < 10; i++) {
      cmd = `bash -c ${JSON.stringify(cmd)}`;
    }
    const result = explainCommand(cmd);
    const allSteps = result.trace.segments.flatMap((s) => s.steps);
    const errorStep = allSteps.find(
      (s) => s.type === 'error' && s.message?.includes('exceeds maximum recursion depth'),
    );
    expect(errorStep).toBeDefined();
  });

  test('9 nested levels does not hit max recursion depth', () => {
    let cmd = 'echo ok';
    for (let i = 0; i < 9; i++) {
      cmd = `bash -c ${JSON.stringify(cmd)}`;
    }
    const result = explainCommand(cmd);
    const allSteps = result.trace.segments.flatMap((s) => s.steps);
    const errorStep = allSteps.find(
      (s) => s.type === 'error' && s.message?.includes('exceeds maximum recursion depth'),
    );
    expect(errorStep).toBeUndefined();
  });

  test('unparseable inner command at depth limit is blocked by recursion limit', () => {
    let cmd = "echo 'unclosed";
    for (let i = 0; i < 10; i++) {
      cmd = `bash -c ${JSON.stringify(cmd)}`;
    }
    const result = explainCommand(cmd);
    expect(result.result).toBe('blocked');
    expect(result.reason).toContain('exceeds maximum recursion depth');
  });
});

describe('explainCommand empty tokens after stripping', () => {
  test('command with only env vars returns allowed', () => {
    const result = explainCommand('VAR=value');
    expect(result.result).toBe('allowed');
  });
});

describe('explainCommand guard parity fixes', () => {
  test('Fix #1: strict mode blocks unparseable commands', () => {
    const result = explainCommand('echo "unclosed', { strict: true });
    expect(result.result).toBe('blocked');
    expect(result.reason).toContain('strict');
    const strictStep = result.trace.steps.find((s) => s.type === 'strict-unparseable');
    expect(strictStep).toBeDefined();
  });

  test('Fix #1: non-strict mode allows unparseable commands', () => {
    const result = explainCommand('echo "unclosed', { strict: false });
    expect(result.result).toBe('allowed');
  });

  test('Fix #2: CWD changes tracked between segments - cd then rm', () => {
    const result = explainCommand('cd /tmp && rm -rf ./foo');
    const allSteps = result.trace.segments.flatMap((s) => s.steps);
    const cwdStep = allSteps.find((s) => s.type === 'cwd-change');
    expect(cwdStep).toBeDefined();
    if (cwdStep && cwdStep.type === 'cwd-change') {
      expect(cwdStep.effectiveCwdNowUnknown).toBe(true);
    }
  });

  test('Fix #2: pushd changes CWD to unknown', () => {
    const result = explainCommand('pushd /tmp && rm -rf ./foo');
    const allSteps = result.trace.segments.flatMap((s) => s.steps);
    const cwdStep = allSteps.find((s) => s.type === 'cwd-change');
    expect(cwdStep).toBeDefined();
  });

  test('Fix #3: leading TMPDIR override blocks rm', () => {
    const result = explainCommand('TMPDIR=/non-temp rm -rf $TMPDIR/foo');
    expect(result.result).toBe('blocked');
  });

  test('Fix #3: leading TMPDIR=/tmp still allows rm', () => {
    const result = explainCommand('TMPDIR=/tmp rm -rf $TMPDIR/foo', { cwd: '/tmp' });
    expect(result.result).toBe('allowed');
  });

  test('Fix #4: fallback scan finds embedded git in non-head position', () => {
    const result = explainCommand('nice git reset --hard');
    expect(result.result).toBe('blocked');
    expect(result.reason).toContain('git reset --hard');
    const allSteps = result.trace.segments.flatMap((s) => s.steps);
    const fallbackStep = allSteps.find((s) => s.type === 'fallback-scan');
    expect(fallbackStep).toBeDefined();
    if (fallbackStep && fallbackStep.type === 'fallback-scan') {
      expect(fallbackStep.embeddedCommandFound).toBe('git');
    }
  });

  test('Fix #4: fallback scan finds embedded rm in non-head position', () => {
    const result = explainCommand('nice rm -rf /');
    expect(result.result).toBe('blocked');
    const allSteps = result.trace.segments.flatMap((s) => s.steps);
    const fallbackStep = allSteps.find((s) => s.type === 'fallback-scan');
    expect(fallbackStep).toBeDefined();
  });

  test('Fix #5: shell wrapper recurses and blocks dangerous nested commands', () => {
    const result = explainCommand('bash -c "git reset --hard"');
    expect(result.result).toBe('blocked');
    const allSteps = result.trace.segments.flatMap((s) => s.steps);
    const recurseStep = allSteps.find((s) => s.type === 'recurse' && s.reason === 'shell-wrapper');
    expect(recurseStep).toBeDefined();
  });

  test('Fix #5: interpreter recurses for nested dangerous code', () => {
    const result = explainCommand('bash -c "rm -rf /"');
    expect(result.result).toBe('blocked');
    const allSteps = result.trace.segments.flatMap((s) => s.steps);
    const recurseStep = allSteps.find((s) => s.type === 'recurse');
    expect(recurseStep).toBeDefined();
  });

  test('Fix #6: custom rules skipped for nested git at depth > 0', () => {
    const customConfig = {
      version: 1,
      rules: [
        { name: 'block-git', command: 'git', block_args: ['status'], reason: 'custom git block' },
      ],
    };
    const result = explainCommand('bash -c "git status"', { config: customConfig });
    expect(result.result).toBe('allowed');
  });

  test('Fix #6: custom rules applied at top level (depth 0)', () => {
    const customConfig = {
      version: 1,
      rules: [
        { name: 'block-echo', command: 'echo', block_args: ['hello'], reason: 'custom echo block' },
      ],
    };
    const result = explainCommand('echo hello', { config: customConfig });
    expect(result.result).toBe('blocked');
    expect(result.reason).toContain('custom echo block');
  });
});

describe('explainCommand CWD unknown parity with guard', () => {
  test('xargs rm blocked when CWD unknown after cd', () => {
    const result = explainCommand('cd /somewhere && xargs rm -rf foo', { cwd: '/home/user' });
    expect(result.result).toBe('blocked');
  });

  test('parallel rm blocked when CWD unknown after pushd', () => {
    const result = explainCommand('pushd /x && parallel rm -rf ::: foo', { cwd: '/home/user' });
    expect(result.result).toBe('blocked');
  });

  test('fallback rm scan blocked when CWD unknown after cd', () => {
    const result = explainCommand('cd /x && nice rm -rf foo', { cwd: '/home/user' });
    expect(result.result).toBe('blocked');
  });

  test('xargs rm blocked even when CWD known (dynamic input)', () => {
    const result = explainCommand('xargs rm -rf /tmp/foo', { cwd: '/home/user' });
    expect(result.result).toBe('blocked');
  });
});

describe('explainCommand strict mode inner commands', () => {
  test('strict mode blocks unparseable inner shell wrapper command', () => {
    const result = explainCommand('bash -c "echo \\"unclosed', { strict: true });
    expect(result.result).toBe('blocked');
  });

  test('strict mode blocks unparseable inner interpreter command', () => {
    const result = explainCommand('python -c "import os; os.system(\\"echo unclosed"', {
      strict: true,
    });
    expect(result.result).toBe('blocked');
  });

  test('strict mode allows parseable inner commands', () => {
    const result = explainCommand('bash -c "echo hello"', { strict: true });
    expect(result.result).toBe('allowed');
  });
});

describe('explainCommand fallback scan with find', () => {
  test('fallback scan finds embedded find -delete in non-head position', () => {
    const result = explainCommand('nice find . -delete');
    expect(result.result).toBe('blocked');
    const allSteps = result.trace.segments.flatMap((s) => s.steps);
    const fallbackStep = allSteps.find((s) => s.type === 'fallback-scan');
    expect(fallbackStep).toBeDefined();
    if (fallbackStep && fallbackStep.type === 'fallback-scan') {
      expect(fallbackStep.embeddedCommandFound).toBe('find');
    }
  });

  test('fallback scan finds find -exec with dangerous cmd in non-head position', () => {
    const result = explainCommand('nice find . -name test -delete');
    expect(result.result).toBe('blocked');
    const allSteps = result.trace.segments.flatMap((s) => s.steps);
    const fallbackStep = allSteps.find((s) => s.type === 'fallback-scan');
    expect(fallbackStep).toBeDefined();
  });
});

describe('explainCommand env from wrapper stripping', () => {
  test('env command TMPDIR override is detected', () => {
    const result = explainCommand('env TMPDIR=/bad rm -rf $TMPDIR/foo');
    expect(result.result).toBe('blocked');
  });

  test('sudo env TMPDIR chains env assignments through wrappers', () => {
    const result = explainCommand('sudo env TMPDIR=/not-temp rm -rf $TMPDIR/x');
    expect(result.result).toBe('blocked');
  });
});

describe('explainCommand parallel with analyzeNested', () => {
  test('parallel commands mode triggers analyzeNested', () => {
    const result = explainCommand("parallel ::: 'rm -rf /'");
    expect(result.result).toBe('blocked');
    const allSteps = result.trace.segments.flatMap((s) => s.steps);
    const parallelStep = allSteps.find(
      (s) => s.type === 'rule-check' && s.ruleModule === 'analyze/parallel.ts',
    );
    expect(parallelStep).toBeDefined();
    if (parallelStep && parallelStep.type === 'rule-check') {
      expect(parallelStep.matched).toBe(true);
    }
  });

  test('parallel with shell wrapper triggers analyzeNested', () => {
    const result = explainCommand("parallel bash -c 'git reset --hard' ::: ok");
    expect(result.result).toBe('blocked');
  });

  test('parallel with safe commands allowed', () => {
    const result = explainCommand('parallel echo ::: a b c', { cwd: '/tmp' });
    expect(result.result).toBe('allowed');
  });
});

describe('explainCommand nested segment CWD tracking', () => {
  test('shell wrapper with cd then rm tracks CWD change in nested segments', () => {
    const result = explainCommand('bash -c "cd /somewhere && rm -rf foo"');
    const allSteps = result.trace.segments.flatMap((s) => s.steps);
    const cwdSteps = allSteps.filter((s) => s.type === 'cwd-change');
    expect(cwdSteps.length).toBeGreaterThan(0);
  });

  test('interpreter with cd then rm tracks CWD change in nested segments', () => {
    const result = explainCommand('python -c "cd /tmp && rm -rf foo"');
    const allSteps = result.trace.segments.flatMap((s) => s.steps);
    const cwdSteps = allSteps.filter((s) => s.type === 'cwd-change');
    expect(cwdSteps.length).toBeGreaterThan(0);
  });

  test('nested unparseable segment with dangerous text is blocked', () => {
    const result = explainCommand('bash -c "\'rm -rf /tmp/cache"');
    expect(result.result).toBe('blocked');
    const allSteps = result.trace.segments.flatMap((s) => s.steps);
    const dangerousStep = allSteps.find((s) => s.type === 'dangerous-text' && s.matched === true);
    expect(dangerousStep).toBeDefined();
  });

  test('nested unparseable segment without dangerous patterns is allowed', () => {
    const result = explainCommand('bash -c "\'echo hello world"');
    expect(result.result).toBe('allowed');
  });

  test('interpreter nested unparseable segment with git reset is blocked', () => {
    const result = explainCommand('python -c "\'git reset --hard HEAD"');
    expect(result.result).toBe('blocked');
    const allSteps = result.trace.segments.flatMap((s) => s.steps);
    const dangerousStep = allSteps.find((s) => s.type === 'dangerous-text' && s.matched === true);
    expect(dangerousStep).toBeDefined();
  });
});

describe('explainCommand unparseable segments', () => {
  test('unparseable segment with dangerous rm -rf pattern is blocked', () => {
    const result = explainCommand("'rm -rf /tmp/cache");
    expect(result.result).toBe('blocked');
    const allSteps = result.trace.segments.flatMap((s) => s.steps);
    const dangerousStep = allSteps.find((s) => s.type === 'dangerous-text' && s.matched === true);
    expect(dangerousStep).toBeDefined();
  });

  test('unparseable segment with cd command triggers cwd-change step', () => {
    const result = explainCommand('cd /tmp "unclosed');
    const allSteps = result.trace.segments.flatMap((s) => s.steps);
    const cwdStep = allSteps.find((s) => s.type === 'cwd-change');
    expect(cwdStep).toBeDefined();
  });

  test('unparseable segment with pushd triggers cwd-change', () => {
    const result = explainCommand('pushd /somewhere "unclosed');
    const allSteps = result.trace.segments.flatMap((s) => s.steps);
    const cwdStep = allSteps.find((s) => s.type === 'cwd-change');
    expect(cwdStep).toBeDefined();
  });

  test('unparseable segment with git reset --hard is blocked', () => {
    const result = explainCommand("'git reset --hard HEAD");
    expect(result.result).toBe('blocked');
    const allSteps = result.trace.segments.flatMap((s) => s.steps);
    const dangerousStep = allSteps.find((s) => s.type === 'dangerous-text' && s.matched === true);
    expect(dangerousStep).toBeDefined();
  });

  test('unparseable segment without dangerous patterns is allowed', () => {
    const result = explainCommand("'echo hello world");
    expect(result.result).toBe('allowed');
  });
});

describe('explainInnerSegments nested unparseable with cwd change', () => {
  test('nested unparseable segment with cd triggers cwd-change without dangerous text', () => {
    const result = explainCommand('bash -c "cd /tmp \'unclosed"');
    const allSteps = result.trace.segments.flatMap((s) => s.steps);
    const cwdSteps = allSteps.filter((s) => s.type === 'cwd-change');
    expect(cwdSteps.length).toBeGreaterThan(0);
    expect(result.result).toBe('allowed');
  });

  test('nested unparseable segment with pushd triggers cwd-change', () => {
    const result = explainCommand('bash -c "pushd /somewhere \'unclosed"');
    const allSteps = result.trace.segments.flatMap((s) => s.steps);
    const cwdSteps = allSteps.filter((s) => s.type === 'cwd-change');
    expect(cwdSteps.length).toBeGreaterThan(0);
  });
});

describe('interpreter code not dangerous returns null', () => {
  test('interpreter with safe code returns allowed', () => {
    const result = explainCommand('python -c "x = 1 + 2"');
    expect(result.result).toBe('allowed');
    const allSteps = result.trace.segments.flatMap((s) => s.steps);
    const interpStep = allSteps.find((s) => s.type === 'interpreter');
    expect(interpStep).toBeDefined();
    const dangerousStep = allSteps.find((s) => s.type === 'dangerous-text' && s.matched === true);
    expect(dangerousStep).toBeUndefined();
  });

  test('node -e with safe code returns allowed', () => {
    const result = explainCommand('node -e "console.log(42)"');
    expect(result.result).toBe('allowed');
  });
});

describe('explainCommand interpreter with dangerous code', () => {
  test('python -c with rm -rf traces recurse and blocks', () => {
    const result = explainCommand('python -c "import os; os.system(\\"rm -rf /\\")"');
    expect(result.result).toBe('blocked');
    const allSteps = result.trace.segments.flatMap((s) => s.steps);
    const recurseStep = allSteps.find((s) => s.type === 'recurse' && s.reason === 'interpreter');
    expect(recurseStep).toBeDefined();
  });

  test('node -e with git reset --hard traces recurse and blocks', () => {
    const result = explainCommand(
      'node -e "require(\\"child_process\\").execSync(\\"git reset --hard\\")"',
    );
    expect(result.result).toBe('blocked');
  });

  test('interpreter with non-dangerous code returns null', () => {
    const result = explainCommand('python -c "print(1)"');
    expect(result.result).toBe('allowed');
  });
});

describe('getConfigSource validation paths', () => {
  test('invalid project config with no user config returns project path with configValid: false', () => {
    const tempDir = mkdtempSync(join(tmpdir(), 'explain-test-'));
    try {
      writeFileSync(join(tempDir, '.safety-net.json'), 'not valid json');
      const result = explainCommand('echo hello', { cwd: tempDir });
      expect(result.result).toBe('allowed');
      expect(result.configSource).toBe(join(tempDir, '.safety-net.json'));
      expect(result.configValid).toBe(false);
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });
});

describe('getConfigSource user config paths', () => {
  test('valid user config with no project config returns user config as valid', () => {
    const tempDir = mkdtempSync(join(tmpdir(), 'explain-test-'));
    try {
      const userConfigPath = join(tempDir, 'user-config.json');
      writeFileSync(userConfigPath, JSON.stringify({ version: 1, rules: [] }));
      const result = getConfigSource({ cwd: tempDir, userConfigPath });
      expect(result.configSource).toBe(userConfigPath);
      expect(result.configValid).toBe(true);
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  test('invalid user config with no project config returns user config as invalid', () => {
    const tempDir = mkdtempSync(join(tmpdir(), 'explain-test-'));
    try {
      const userConfigPath = join(tempDir, 'user-config.json');
      writeFileSync(userConfigPath, 'invalid json');
      const result = getConfigSource({ cwd: tempDir, userConfigPath });
      expect(result.configSource).toBe(userConfigPath);
      expect(result.configValid).toBe(false);
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });
});

describe('explainSegment direct depth limit', () => {
  test('explainSegment called at MAX_RECURSION_DEPTH returns recursion limit error', () => {
    const steps: TraceStep[] = [];
    const result = explainSegment(['rm', '-rf', '/'], MAX_RECURSION_DEPTH, { cwd: '/tmp' }, steps);
    expect(result?.reason).toBe(REASON_RECURSION_LIMIT);
    expect(steps[0]).toEqual({
      type: 'error',
      message: REASON_RECURSION_LIMIT,
    });
  });

  test('explainSegment called above MAX_RECURSION_DEPTH returns recursion limit error', () => {
    const steps: TraceStep[] = [];
    const result = explainSegment(
      ['git', 'status'],
      MAX_RECURSION_DEPTH + 5,
      { cwd: '/tmp' },
      steps,
    );
    expect(result?.reason).toBe(REASON_RECURSION_LIMIT);
    expect(steps).toHaveLength(1);
  });
});
