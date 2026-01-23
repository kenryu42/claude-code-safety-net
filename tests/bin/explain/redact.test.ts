/**
 * Tests for the explain command secret redaction.
 */
import { describe, expect, test } from 'bun:test';
import { explainCommand, formatTraceHuman, formatTraceJson } from '@/bin/explain/index';

describe('explainCommand env wrapper redaction', () => {
  test('env wrapper with secret is redacted in leading-tokens-stripped step', () => {
    const result = explainCommand('env TOKEN=supersecret git status');
    const allSteps = result.trace.segments.flatMap((s) => s.steps);
    const stripStep = allSteps.find((s) => s.type === 'leading-tokens-stripped');
    expect(stripStep).toBeDefined();
    if (stripStep && stripStep.type === 'leading-tokens-stripped') {
      const removedStr = stripStep.removed.join(', ');
      expect(removedStr).not.toContain('supersecret');
      expect(removedStr).toContain('TOKEN=<redacted>');
    }
  });

  test('sudo env with secret is redacted in leading-tokens-stripped step', () => {
    const result = explainCommand('sudo env API_KEY=my-api-key-123 git status');
    const allSteps = result.trace.segments.flatMap((s) => s.steps);
    const stripStep = allSteps.find((s) => s.type === 'leading-tokens-stripped');
    expect(stripStep).toBeDefined();
    if (stripStep && stripStep.type === 'leading-tokens-stripped') {
      const removedStr = stripStep.removed.join(', ');
      expect(removedStr).not.toContain('my-api-key-123');
      expect(removedStr).toContain('API_KEY=<redacted>');
    }
  });

  test('formatTraceHuman does not leak secrets from env wrapper', () => {
    const result = explainCommand('env PASSWORD=hunter2 git status');
    const output = formatTraceHuman(result);
    expect(output).not.toContain('hunter2');
    expect(output).toContain('PASSWORD=<redacted>');
  });

  test('formatTraceJson does not leak secrets in leading-tokens-stripped step', () => {
    const result = explainCommand('env SECRET=topsecret git status');
    const json = formatTraceJson(result);
    const parsed = JSON.parse(json);
    const allSteps = parsed.trace.segments.flatMap((s: { steps: unknown[] }) => s.steps);
    const stripStep = allSteps.find(
      (s: { type: string }) => s.type === 'leading-tokens-stripped',
    ) as { input: string[]; removed: string[] } | undefined;
    expect(stripStep).toBeDefined();
    if (stripStep) {
      expect(stripStep.input.join(' ')).not.toContain('topsecret');
      expect(stripStep.removed.join(' ')).not.toContain('topsecret');
      expect(stripStep.input.join(' ')).toContain('SECRET=<redacted>');
      expect(stripStep.removed.join(' ')).toContain('SECRET=<redacted>');
    }
  });
});

describe('secret redaction in shell wrappers and interpreters', () => {
  test('shell-wrapper step redacts env assignments in innerCommand', () => {
    const result = explainCommand('bash -c "TOKEN=secret git status"');
    const allSteps = result.trace.segments.flatMap((s) => s.steps);
    const wrapperStep = allSteps.find((s) => s.type === 'shell-wrapper');
    expect(wrapperStep).toBeDefined();
    expect(wrapperStep?.type === 'shell-wrapper' && wrapperStep.innerCommand).toBe(
      'TOKEN=<redacted> git status',
    );
    expect(
      wrapperStep?.type === 'shell-wrapper' && wrapperStep.innerCommand.includes('secret'),
    ).toBe(false);
  });

  test('interpreter step redacts env assignments in codeArg', () => {
    const result = explainCommand('python -c "API_KEY=xyz123 print(1)"');
    const allSteps = result.trace.segments.flatMap((s) => s.steps);
    const interpStep = allSteps.find((s) => s.type === 'interpreter');
    expect(interpStep).toBeDefined();
    expect(interpStep?.type === 'interpreter' && interpStep.codeArg).toBe(
      'API_KEY=<redacted> print(1)',
    );
    expect(interpStep?.type === 'interpreter' && interpStep.codeArg.includes('xyz123')).toBe(false);
  });

  test('recurse step for shell-wrapper redacts innerCommand', () => {
    const result = explainCommand('bash -c "SECRET=abc123 echo test"');
    const allSteps = result.trace.segments.flatMap((s) => s.steps);
    const recurseStep = allSteps.find((s) => s.type === 'recurse' && s.reason === 'shell-wrapper');
    expect(recurseStep).toBeDefined();
    expect(recurseStep?.type === 'recurse' && recurseStep.innerCommand).toBe(
      'SECRET=<redacted> echo test',
    );
  });

  test('recurse step for interpreter redacts innerCommand', () => {
    const result = explainCommand('node -e "PASSWORD=hunter2 console.log(1)"');
    const allSteps = result.trace.segments.flatMap((s) => s.steps);
    const recurseStep = allSteps.find((s) => s.type === 'recurse' && s.reason === 'interpreter');
    expect(recurseStep).toBeDefined();
    expect(recurseStep?.type === 'recurse' && recurseStep.innerCommand).toBe(
      'PASSWORD=<redacted> console.log(1)',
    );
  });

  test('busybox recurse step redacts env assignments', () => {
    const result = explainCommand('busybox TOKEN=secret rm -rf /');
    const allSteps = result.trace.segments.flatMap((s) => s.steps);
    const recurseStep = allSteps.find((s) => s.type === 'recurse' && s.reason === 'busybox');
    expect(recurseStep).toBeDefined();
    expect(recurseStep?.type === 'recurse' && recurseStep.innerCommand).toBe(
      'TOKEN=<redacted> rm -rf /',
    );
  });

  test('human output does not leak secrets in shell-wrapper inner command', () => {
    const result = explainCommand('bash -c "SECRET=leaked_value git status"');
    const output = formatTraceHuman(result);
    expect(output).toContain('<redacted>');
    expect(output).not.toContain('leaked_value');
  });

  test('JSON output does not leak secrets in interpreter codeArg', () => {
    const result = explainCommand('python -c "API_KEY=secret123 x=1"');
    const output = formatTraceJson(result);
    expect(output).toContain('<redacted>');
    expect(output).not.toContain('secret123');
  });

  test('redaction handles quoted env values in shell wrapper', () => {
    const result = explainCommand('bash -c "TOKEN=\\"secret value\\" git status"');
    const allSteps = result.trace.segments.flatMap((s) => s.steps);
    const wrapperStep = allSteps.find((s) => s.type === 'shell-wrapper');
    expect(wrapperStep?.type === 'shell-wrapper' && wrapperStep.innerCommand).toContain(
      'TOKEN=<redacted>',
    );
    expect(
      wrapperStep?.type === 'shell-wrapper' && wrapperStep.innerCommand.includes('secret value'),
    ).toBe(false);
  });
});
