/**
 * Tests for the explain command type definitions.
 */
import { describe, expect, test } from 'bun:test';
import type { ExplainOptions, ExplainResult, ExplainTrace, TraceStep } from '@/types';

describe('TraceStep discriminated union', () => {
  test('parse step type compiles', () => {
    const step: TraceStep = {
      type: 'parse',
      input: 'git status',
      segments: [['git', 'status']],
    };
    expect(step.type).toBe('parse');
  });

  test('env-strip step type compiles', () => {
    const step: TraceStep = {
      type: 'env-strip',
      input: ['VAR=value', 'git', 'status'],
      envVars: { VAR: '<redacted>' },
      output: ['git', 'status'],
    };
    expect(step.type).toBe('env-strip');
  });

  test('leading-tokens-stripped step type compiles', () => {
    const step: TraceStep = {
      type: 'leading-tokens-stripped',
      input: ['sudo', 'git', 'status'],
      removed: ['sudo'],
      output: ['git', 'status'],
    };
    expect(step.type).toBe('leading-tokens-stripped');
  });

  test('shell-wrapper step type compiles', () => {
    const step: TraceStep = {
      type: 'shell-wrapper',
      wrapper: 'bash',
      innerCommand: 'git status',
    };
    expect(step.type).toBe('shell-wrapper');
  });

  test('interpreter step type compiles', () => {
    const step: TraceStep = {
      type: 'interpreter',
      interpreter: 'python',
      codeArg: 'import os',
      paranoidBlocked: false,
    };
    expect(step.type).toBe('interpreter');
  });

  test('busybox step type compiles', () => {
    const step: TraceStep = {
      type: 'busybox',
      subcommand: 'rm',
    };
    expect(step.type).toBe('busybox');
  });

  test('recurse step type compiles', () => {
    const step: TraceStep = {
      type: 'recurse',
      reason: 'shell-wrapper',
      innerCommand: 'git status',
      depth: 1,
    };
    expect(step.type).toBe('recurse');
  });

  test('rule-check step type compiles', () => {
    const step: TraceStep = {
      type: 'rule-check',
      ruleModule: 'rules-git.ts',
      ruleFunction: 'analyzeGit',
      matched: true,
      reason: 'git reset --hard destroys uncommitted changes',
    };
    expect(step.type).toBe('rule-check');
  });

  test('tmpdir-check step type compiles', () => {
    const step: TraceStep = {
      type: 'tmpdir-check',
      tmpdirValue: '/tmp',
      isOverriddenToNonTemp: false,
      allowTmpdirVar: true,
    };
    expect(step.type).toBe('tmpdir-check');
  });

  test('fallback-scan step type compiles', () => {
    const step: TraceStep = {
      type: 'fallback-scan',
      tokensScanned: ['echo', 'rm', '-rf'],
      embeddedCommandFound: 'rm',
    };
    expect(step.type).toBe('fallback-scan');
  });

  test('custom-rules-check step type compiles', () => {
    const step: TraceStep = {
      type: 'custom-rules-check',
      rulesChecked: true,
      matched: false,
    };
    expect(step.type).toBe('custom-rules-check');
  });

  test('cwd-change step type compiles', () => {
    const step: TraceStep = {
      type: 'cwd-change',
      segment: 'cd /tmp',
      effectiveCwdNowUnknown: true,
    };
    expect(step.type).toBe('cwd-change');
  });

  test('dangerous-text step type compiles', () => {
    const step: TraceStep = {
      type: 'dangerous-text',
      token: 'rm -rf /',
      matched: true,
      reason: 'contains dangerous rm command',
    };
    expect(step.type).toBe('dangerous-text');
  });

  test('strict-unparseable step type compiles', () => {
    const step: TraceStep = {
      type: 'strict-unparseable',
      rawCommand: 'bash -c "unclosed',
      reason: 'unparseable command in strict mode',
    };
    expect(step.type).toBe('strict-unparseable');
  });

  test('segment-skipped step type compiles', () => {
    const step: TraceStep = {
      type: 'segment-skipped',
      index: 2,
      reason: 'prior-segment-blocked',
    };
    expect(step.type).toBe('segment-skipped');
  });

  test('error step type compiles', () => {
    const step: TraceStep = {
      type: 'error',
      message: 'No command provided',
      partial: true,
    };
    expect(step.type).toBe('error');
  });
});

describe('ExplainTrace interface', () => {
  test('ExplainTrace compiles with steps and segments', () => {
    const trace: ExplainTrace = {
      steps: [{ type: 'parse', input: 'git status', segments: [['git', 'status']] }],
      segments: [{ index: 0, steps: [] }],
    };
    expect(trace.steps).toHaveLength(1);
    expect(trace.segments).toHaveLength(1);
  });
});

describe('ExplainOptions interface', () => {
  test('ExplainOptions with all fields', () => {
    const options: ExplainOptions = {
      json: true,
      cwd: '/tmp',
      asciiOnly: false,
    };
    expect(options.json).toBe(true);
  });

  test('ExplainOptions with no fields (all optional)', () => {
    const options: ExplainOptions = {};
    expect(options.json).toBeUndefined();
  });
});

describe('ExplainResult interface', () => {
  test('ExplainResult for blocked command', () => {
    const result: ExplainResult = {
      trace: {
        steps: [],
        segments: [],
      },
      result: 'blocked',
      reason: 'git reset --hard destroys uncommitted changes',
      segment: 'git reset --hard',
      configSource: '/path/to/.safety-net.json',
      configValid: true,
    };
    expect(result.result).toBe('blocked');
    expect(result.reason).toBeDefined();
  });

  test('ExplainResult for allowed command', () => {
    const result: ExplainResult = {
      trace: {
        steps: [],
        segments: [],
      },
      result: 'allowed',
      configSource: null,
      configValid: true,
    };
    expect(result.result).toBe('allowed');
    expect(result.reason).toBeUndefined();
  });

  test('ExplainResult is JSON-serializable (no Map)', () => {
    const result: ExplainResult = {
      trace: {
        steps: [
          {
            type: 'env-strip',
            input: ['VAR=secret', 'cmd'],
            envVars: { VAR: '<redacted>' },
            output: ['cmd'],
          },
        ],
        segments: [],
      },
      result: 'allowed',
      configSource: null,
      configValid: true,
    };

    const json = JSON.stringify(result);
    expect(json).not.toContain('[object Map]');
    expect(json).not.toContain('[object Set]');

    const parsed = JSON.parse(json);
    expect(parsed.result).toBe('allowed');
  });
});
