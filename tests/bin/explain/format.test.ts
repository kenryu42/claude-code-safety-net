/**
 * Tests for the explain command formatting functions.
 */
import { describe, expect, test } from 'bun:test';
import { formatStepStyleD, getBoxChars } from '@/bin/explain/format-helpers';
import { explainCommand, formatTraceHuman, formatTraceJson } from '@/bin/explain/index';
import type { ExplainResult, TraceStep } from '@/types';
import { withEnv } from '../../helpers.ts';

describe('formatTraceHuman', () => {
  test('includes Status: BLOCKED for blocked commands', () => {
    const result = explainCommand('git reset --hard');
    const output = formatTraceHuman(result);
    expect(output).toContain('Status:');
    expect(output).toContain('BLOCKED');
  });

  test('includes Status: ALLOWED for allowed commands', () => {
    const result = explainCommand('git status');
    const output = formatTraceHuman(result);
    expect(output).toContain('Status:');
    expect(output).toContain('ALLOWED');
  });

  test('uses ASCII chars when asciiOnly is true', () => {
    const result = explainCommand('git status');
    const output = formatTraceHuman(result, { asciiOnly: true });
    expect(output).not.toContain('╔');
    expect(output).not.toContain('║');
    expect(output).not.toContain('╚');
    expect(output).not.toContain('─');
  });

  test('uses unicode box chars by default', () => {
    const result = explainCommand('git status');
    const output = formatTraceHuman(result);
    expect(output).toContain('═');
    expect(output).toContain('─');
  });

  test('shows rule module and function annotation', () => {
    const result = explainCommand('git reset --hard');
    const output = formatTraceHuman(result);
    expect(output).toContain('rules-git.ts:analyzeGit()');
  });

  test('includes CONFIG section with Path', () => {
    const result = explainCommand('git status');
    const output = formatTraceHuman(result);
    expect(output).toContain('CONFIG');
    expect(output).toContain('Path:');
  });

  test('shows segment labels for multi-segment', () => {
    const result = explainCommand('echo a && echo b');
    const output = formatTraceHuman(result);
    expect(output).toContain('Segment 1');
    expect(output).toContain('Segment 2');
  });

  test('truncates long segment command labels with ellipsis', () => {
    // Command needs to exceed 41 chars to trigger truncation (maxLabelLen=54, baseLabel~12, suffix=1)
    const longCmd = `echo ${'a'.repeat(50)}`;
    const result = explainCommand(`${longCmd} && echo b`);
    const output = formatTraceHuman(result);
    // Should contain truncated command with ellipsis
    expect(output).toContain('…');
    expect(output).toContain('Segment 1');
    expect(output).toContain('Segment 2');
  });

  test('shows rule check for git commands', () => {
    const result = explainCommand('git status');
    const output = formatTraceHuman(result);
    expect(output).toContain('Match rules');
  });
});

describe('formatTraceJson', () => {
  test('returns valid JSON', () => {
    const result = explainCommand('git status');
    const json = formatTraceJson(result);
    expect(() => JSON.parse(json)).not.toThrow();
  });

  test('parsed JSON has required fields', () => {
    const result = explainCommand('git reset --hard');
    const json = formatTraceJson(result);
    const parsed = JSON.parse(json);
    expect(parsed.result).toBe('blocked');
    expect(parsed.reason).toBeDefined();
    expect(parsed.trace).toBeDefined();
    expect(parsed.configSource).toBeDefined();
  });

  test('no Map serialization artifacts', () => {
    const result = explainCommand('VAR=secret git status');
    const json = formatTraceJson(result);
    expect(json).not.toContain('[object Map]');
    expect(json).not.toContain('[object Set]');
  });
});

describe('formatTraceHuman step formatting', () => {
  test('formats parse step', () => {
    const result = explainCommand('git status');
    const output = formatTraceHuman(result);
    expect(output).toContain('Split shell commands');
  });

  test('formats env-strip step', () => {
    const result = explainCommand('VAR=value git status');
    const output = formatTraceHuman(result);
    expect(output).toContain('Strip environment variables');
    expect(output).toContain('<redacted>');
  });

  test('formats leading-tokens-stripped step', () => {
    const result = explainCommand('sudo git status');
    const output = formatTraceHuman(result);
    expect(output).toContain('Strip wrappers');
  });

  test('formats shell-wrapper step', () => {
    const result = explainCommand('bash -c "git status"');
    const output = formatTraceHuman(result);
    expect(output).toContain('Detect shell wrapper');
  });

  test('formats interpreter step', () => {
    const result = explainCommand('python -c "print(1)"');
    const output = formatTraceHuman(result);
    expect(output).toContain('Detect interpreter');
  });

  test('formats busybox step', () => {
    const result = explainCommand('busybox echo hello');
    const output = formatTraceHuman(result);
    expect(output).toContain('Busybox wrapper');
  });

  test('formats recurse step', () => {
    const result = explainCommand('bash -c "git status"');
    const output = formatTraceHuman(result);
    expect(output).toContain('RECURSING');
  });

  test('formats rule-check step', () => {
    const result = explainCommand('git reset --hard');
    const output = formatTraceHuman(result);
    expect(output).toContain('Match rules');
    expect(output).toContain('MATCHED');
  });

  test('tmpdir-check is an internal detail not shown in human output', () => {
    const result = explainCommand('rm -rf /tmp/test');
    const allSteps = result.trace.segments.flatMap((s) => s.steps);
    const tmpStep = allSteps.find((s) => s.type === 'tmpdir-check');
    expect(tmpStep).toBeDefined();
  });

  test('formats segment-skipped step', () => {
    const result = explainCommand('git reset --hard && ls');
    const output = formatTraceHuman(result);
    expect(output).toContain('skipped');
  });

  test('formats error step', () => {
    const result = explainCommand('');
    const output = formatTraceHuman(result);
    expect(output).toContain('ERROR');
    expect(output).toContain('No command provided');
  });

  test('formats fallback-scan step', () => {
    const step: TraceStep = {
      type: 'fallback-scan',
      tokensScanned: ['echo', 'rm', '-rf'],
      embeddedCommandFound: 'rm',
    };
    const mockResult: ExplainResult = {
      trace: {
        steps: [{ type: 'parse', input: 'echo rm -rf', segments: [['echo', 'rm', '-rf']] }],
        segments: [{ index: 0, steps: [step] }],
      },
      result: 'allowed',
      configSource: null,
      configValid: true,
    };
    const output = formatTraceHuman(mockResult);
    expect(output).toContain('Fallback scan');
    expect(output).toContain('Found: rm');
  });

  test('formats fallback-scan step with nothing found omits step', () => {
    const step: TraceStep = {
      type: 'fallback-scan',
      tokensScanned: ['echo', 'hello'],
      embeddedCommandFound: undefined,
    };
    const mockResult: ExplainResult = {
      trace: {
        steps: [{ type: 'parse', input: 'echo hello', segments: [['echo', 'hello']] }],
        segments: [{ index: 0, steps: [step] }],
      },
      result: 'allowed',
      configSource: null,
      configValid: true,
    };
    const output = formatTraceHuman(mockResult);
    expect(output).not.toContain('Fallback scan');
  });

  test('cwd-change is internal detail not shown in human output', () => {
    const step: TraceStep = {
      type: 'cwd-change',
      segment: 'cd /tmp',
      effectiveCwdNowUnknown: true,
    };
    const mockResult: ExplainResult = {
      trace: {
        steps: [{ type: 'parse', input: 'cd /tmp', segments: [['cd', '/tmp']] }],
        segments: [{ index: 0, steps: [step] }],
      },
      result: 'allowed',
      configSource: null,
      configValid: true,
    };
    expect(mockResult.trace.segments[0]?.steps[0]?.type).toBe('cwd-change');
  });

  test('formats dangerous-text step', () => {
    const step: TraceStep = {
      type: 'dangerous-text',
      token: 'rm -rf /',
      matched: true,
      reason: 'contains dangerous rm command',
    };
    const mockResult: ExplainResult = {
      trace: {
        steps: [{ type: 'parse', input: 'rm -rf /', segments: [['rm', '-rf', '/']] }],
        segments: [{ index: 0, steps: [step] }],
      },
      result: 'blocked',
      reason: 'contains dangerous rm command',
      configSource: null,
      configValid: true,
    };
    const output = formatTraceHuman(mockResult);
    expect(output).toContain('Dangerous text check');
    expect(output).toContain('MATCHED');
  });

  test('dangerous-text step not matched is not shown', () => {
    const step: TraceStep = {
      type: 'dangerous-text',
      token: 'echo hello',
      matched: false,
    };
    const mockResult: ExplainResult = {
      trace: {
        steps: [{ type: 'parse', input: 'echo hello', segments: [['echo', 'hello']] }],
        segments: [{ index: 0, steps: [step] }],
      },
      result: 'allowed',
      configSource: null,
      configValid: true,
    };
    const output = formatTraceHuman(mockResult);
    expect(output).not.toContain('Dangerous text check');
  });

  test('formats strict-unparseable step', () => {
    const step: TraceStep = {
      type: 'strict-unparseable',
      rawCommand: 'bash -c "unclosed',
      reason: 'unparseable command in strict mode',
    };
    const mockResult: ExplainResult = {
      trace: {
        steps: [
          { type: 'parse', input: 'bash -c "unclosed', segments: [['bash', '-c', '"unclosed']] },
        ],
        segments: [{ index: 0, steps: [step] }],
      },
      result: 'blocked',
      reason: 'unparseable command in strict mode',
      configSource: null,
      configValid: true,
    };
    const output = formatTraceHuman(mockResult);
    expect(output).toContain('Strict mode check');
    expect(output).toContain('UNPARSEABLE');
  });
});

describe('formatTraceHuman coverage for internal step types', () => {
  test('parse step is handled in main function, formatStepStyleD returns null', () => {
    const result = explainCommand('git status');
    const output = formatTraceHuman(result);
    expect(output).toContain('Segment 1:');
  });

  test('tmpdir-check step is internal and not shown in human output', () => {
    const result = explainCommand('rm -rf /tmp/test');
    const allSteps = result.trace.segments.flatMap((s) => s.steps);
    const tmpStep = allSteps.find((s) => s.type === 'tmpdir-check');
    expect(tmpStep).toBeDefined();
    const output = formatTraceHuman(result);
    expect(output).not.toContain('TMPDIR');
  });

  test('cwd-change step is internal and not shown in human output', () => {
    const result = explainCommand('cd /tmp && echo hello');
    const allSteps = result.trace.segments.flatMap((s) => s.steps);
    const cwdStep = allSteps.find((s) => s.type === 'cwd-change');
    expect(cwdStep).toBeDefined();
    const output = formatTraceHuman(result);
    expect(output).not.toContain('effectiveCwd');
  });

  test('segment-skipped step is handled in main function', () => {
    const result = explainCommand('git reset --hard && echo hello');
    expect(result.result).toBe('blocked');
    const output = formatTraceHuman(result);
    expect(output).toContain('skipped');
  });

  test('error step in formatStepStyleD adds ERROR line', () => {
    const errorStep: TraceStep = {
      type: 'error',
      message: 'Test error message',
    };
    const mockResult: ExplainResult = {
      trace: {
        steps: [{ type: 'parse', input: 'test cmd', segments: [['test', 'cmd']] }],
        segments: [{ index: 0, steps: [errorStep] }],
      },
      result: 'allowed',
      configSource: null,
      configValid: true,
    };
    const output = formatTraceHuman(mockResult);
    expect(output).toContain('ERROR: Test error message');
  });

  test('interpreter with paranoidBlocked shows BLOCKED in human output', () => {
    withEnv({ SAFETY_NET_PARANOID_INTERPRETERS: '1' }, () => {
      const result = explainCommand('python -c "print(1)"');
      expect(result.result).toBe('blocked');
      const output = formatTraceHuman(result);
      expect(output).toContain('Detect interpreter');
      expect(output).toContain('BLOCKED (paranoid mode)');
    });
  });

  test('rule-check with no match shows No match line', () => {
    const result = explainCommand('git status');
    const output = formatTraceHuman(result);
    expect(output).toContain('No match');
  });

  test('custom-rules-check when rulesChecked true and matched', () => {
    const customConfig = {
      version: 1,
      rules: [
        { name: 'block-echo', command: 'echo', block_args: ['test'], reason: 'custom block' },
      ],
    };
    const result = explainCommand('echo test', { config: customConfig });
    expect(result.result).toBe('blocked');
    const output = formatTraceHuman(result);
    expect(output).toContain('Custom rules');
    expect(output).toContain('MATCHED');
  });

  test('custom-rules-check when rulesChecked true but not matched', () => {
    const customConfig = {
      version: 1,
      rules: [
        { name: 'block-echo', command: 'echo', block_args: ['blocked'], reason: 'custom block' },
      ],
    };
    const result = explainCommand('echo hello', { config: customConfig });
    expect(result.result).toBe('allowed');
    const output = formatTraceHuman(result);
    expect(output).toContain('Custom rules');
    expect(output).toContain('No match');
  });
});

describe('formatStepStyleD direct tests', () => {
  const box = getBoxChars(false);

  test('parse step returns null (handled in main function)', () => {
    const step: TraceStep = {
      type: 'parse',
      input: 'git status',
      segments: [['git', 'status']],
    };
    const result = formatStepStyleD(step, 1, box);
    expect(result).toBeNull();
  });

  test('segment-skipped step returns null (handled in main function)', () => {
    const step: TraceStep = {
      type: 'segment-skipped',
      index: 1,
      reason: 'prior-segment-blocked',
    };
    const result = formatStepStyleD(step, 1, box);
    expect(result).toBeNull();
  });

  test('error step returns lines with ERROR message', () => {
    const step: TraceStep = {
      type: 'error',
      message: 'Test error occurred',
    };
    const result = formatStepStyleD(step, 1, box);
    expect(result).not.toBeNull();
    expect(result?.lines).toContain('ERROR: Test error occurred');
    expect(result?.incrementStep).toBe(false);
  });

  test('strict-unparseable step returns lines with UNPARSEABLE message', () => {
    const step: TraceStep = {
      type: 'strict-unparseable',
      rawCommand: 'bash -c "unclosed',
      reason: 'unparseable command in strict mode',
    };
    const result = formatStepStyleD(step, 1, box);
    expect(result).not.toBeNull();
    expect(result?.lines.join('\n')).toContain('Strict mode check');
    expect(result?.lines.join('\n')).toContain('UNPARSEABLE');
    expect(result?.incrementStep).toBe(true);
  });
});
