/**
 * Tests for the doctor command hooks functions.
 */

import { describe, expect, test } from 'bun:test';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { detectAllHooks, stripJsonComments } from '@/bin/doctor/hooks';

describe('detectAllHooks', () => {
  test('detects configured hooks and runs self-test', () => {
    const tmpBase = join(tmpdir(), `doctor-hooks-${Date.now()}`);
    const homeDir = join(tmpBase, 'home');
    const projectDir = join(tmpBase, 'project');
    mkdirSync(homeDir, { recursive: true });
    mkdirSync(projectDir, { recursive: true });

    const claudeDir = join(homeDir, '.claude');
    mkdirSync(claudeDir, { recursive: true });
    writeFileSync(
      join(claudeDir, 'settings.json'),
      JSON.stringify({
        enabledPlugins: { 'safety-net@cc-marketplace': true },
      }),
    );

    const opencodeDir = join(homeDir, '.config', 'opencode');
    mkdirSync(opencodeDir, { recursive: true });
    writeFileSync(
      join(opencodeDir, 'opencode.jsonc'),
      `{
        // comment
        "plugin": ["cc-safety-net",],
      }`,
    );

    const geminiDir = join(homeDir, '.gemini');
    const geminiExtDir = join(geminiDir, 'extensions');
    mkdirSync(geminiExtDir, { recursive: true });
    writeFileSync(
      join(geminiExtDir, 'extension-enablement.json'),
      JSON.stringify({
        'gemini-safety-net': { overrides: ['/Users/kenryu/*'] },
      }),
    );
    writeFileSync(
      join(geminiDir, 'settings.json'),
      JSON.stringify({
        tools: { enableHooks: true },
      }),
    );

    try {
      const hooks = detectAllHooks(projectDir, { homeDir });

      const claude = hooks.find((hook) => hook.platform === 'claude-code');
      expect(claude?.status).toBe('configured');
      expect(claude?.method).toBe('marketplace plugin');
      expect(claude?.selfTest?.failed).toBe(0);

      const opencode = hooks.find((hook) => hook.platform === 'opencode');
      expect(opencode?.status).toBe('configured');
      expect(opencode?.method).toBe('plugin array');
      expect(opencode?.selfTest?.total).toBe(3);

      const gemini = hooks.find((hook) => hook.platform === 'gemini-cli');
      expect(gemini?.status).toBe('configured');
      expect(gemini?.method).toBe('extension plugin');
      expect(gemini?.selfTest?.passed).toBe(gemini?.selfTest?.total);
    } finally {
      rmSync(tmpBase, { recursive: true, force: true });
    }
  });

  test('Claude Code: disabled when enabledPlugins value is false', () => {
    const tmpBase = join(tmpdir(), `doctor-hooks-${Date.now()}`);
    const homeDir = join(tmpBase, 'home');
    const projectDir = join(tmpBase, 'project');
    mkdirSync(homeDir, { recursive: true });
    mkdirSync(projectDir, { recursive: true });

    const claudeDir = join(homeDir, '.claude');
    mkdirSync(claudeDir, { recursive: true });
    writeFileSync(
      join(claudeDir, 'settings.json'),
      JSON.stringify({
        enabledPlugins: { 'safety-net@cc-marketplace': false },
      }),
    );

    try {
      const hooks = detectAllHooks(projectDir, { homeDir });
      const claude = hooks.find((hook) => hook.platform === 'claude-code');
      expect(claude?.status).toBe('disabled');
      expect(claude?.method).toBe('marketplace plugin');
    } finally {
      rmSync(tmpBase, { recursive: true, force: true });
    }
  });

  test('reports parse errors for invalid hook configs', () => {
    const tmpBase = join(tmpdir(), `doctor-hooks-${Date.now()}`);
    const homeDir = join(tmpBase, 'home');
    const projectDir = join(tmpBase, 'project');
    mkdirSync(homeDir, { recursive: true });
    mkdirSync(projectDir, { recursive: true });

    const claudeDir = join(homeDir, '.claude');
    mkdirSync(claudeDir, { recursive: true });
    writeFileSync(join(claudeDir, 'settings.json'), '{ invalid json }');

    const opencodeDir = join(homeDir, '.config', 'opencode');
    mkdirSync(opencodeDir, { recursive: true });
    writeFileSync(join(opencodeDir, 'opencode.json'), '{ invalid json }');

    const geminiDir = join(homeDir, '.gemini');
    const geminiExtDir = join(geminiDir, 'extensions');
    mkdirSync(geminiExtDir, { recursive: true });
    writeFileSync(join(geminiExtDir, 'extension-enablement.json'), '{ invalid json }');

    try {
      const hooks = detectAllHooks(projectDir, { homeDir });

      const claude = hooks.find((hook) => hook.platform === 'claude-code');
      expect(claude?.status).toBe('n/a');
      expect(claude?.errors?.some((e) => e.includes('Failed to parse'))).toBe(true);

      const opencode = hooks.find((hook) => hook.platform === 'opencode');
      expect(opencode?.status).toBe('n/a');
      expect(opencode?.errors?.some((e) => e.includes('Failed to parse'))).toBe(true);

      const gemini = hooks.find((hook) => hook.platform === 'gemini-cli');
      expect(gemini?.status).toBe('n/a');
      expect(gemini?.errors?.some((e) => e.includes('Failed to parse'))).toBe(true);
    } finally {
      rmSync(tmpBase, { recursive: true, force: true });
    }
  });

  test('Claude Code: returns n/a with error when settings.json is invalid', () => {
    const tmpBase = join(tmpdir(), `doctor-hooks-${Date.now()}`);
    const homeDir = join(tmpBase, 'home');
    const projectDir = join(tmpBase, 'project');
    mkdirSync(homeDir, { recursive: true });
    mkdirSync(projectDir, { recursive: true });

    const claudeDir = join(homeDir, '.claude');
    mkdirSync(claudeDir, { recursive: true });
    writeFileSync(join(claudeDir, 'settings.json'), '{ invalid json }');

    try {
      const hooks = detectAllHooks(projectDir, { homeDir });
      const claude = hooks.find((hook) => hook.platform === 'claude-code');
      expect(claude?.status).toBe('n/a');
      expect(claude?.errors?.some((e) => e.includes('Failed to parse'))).toBe(true);
    } finally {
      rmSync(tmpBase, { recursive: true, force: true });
    }
  });

  test('continues checking fallback configs after parse errors (OpenCode)', () => {
    const tmpBase = join(tmpdir(), `doctor-hooks-${Date.now()}`);
    const homeDir = join(tmpBase, 'home');
    const projectDir = join(tmpBase, 'project');
    mkdirSync(homeDir, { recursive: true });
    mkdirSync(projectDir, { recursive: true });

    const opencodeDir = join(homeDir, '.config', 'opencode');
    mkdirSync(opencodeDir, { recursive: true });

    writeFileSync(join(opencodeDir, 'opencode.json'), '{ invalid json }');
    writeFileSync(
      join(opencodeDir, 'opencode.jsonc'),
      `{
        // This is valid JSONC
        "plugin": ["cc-safety-net"]
      }`,
    );

    try {
      const hooks = detectAllHooks(projectDir, { homeDir });
      const opencode = hooks.find((hook) => hook.platform === 'opencode');
      expect(opencode?.status).toBe('configured');
      expect(opencode?.method).toBe('plugin array');
      expect(opencode?.errors?.some((e) => e.includes('Failed to parse'))).toBe(true);
    } finally {
      rmSync(tmpBase, { recursive: true, force: true });
    }
  });

  test('Gemini CLI: disabled when overrides is empty', () => {
    const tmpBase = join(tmpdir(), `doctor-gemini-${Date.now()}`);
    const homeDir = join(tmpBase, 'home');
    const projectDir = join(tmpBase, 'project');
    mkdirSync(homeDir, { recursive: true });
    mkdirSync(projectDir, { recursive: true });

    const geminiExtDir = join(homeDir, '.gemini', 'extensions');
    mkdirSync(geminiExtDir, { recursive: true });
    writeFileSync(
      join(geminiExtDir, 'extension-enablement.json'),
      JSON.stringify({
        'gemini-safety-net': { overrides: [] },
      }),
    );

    try {
      const hooks = detectAllHooks(projectDir, { homeDir });
      const gemini = hooks.find((hook) => hook.platform === 'gemini-cli');
      expect(gemini?.status).toBe('disabled');
      expect(gemini?.errors?.some((e) => e.includes('no enabled workspace overrides'))).toBe(true);
    } finally {
      rmSync(tmpBase, { recursive: true, force: true });
    }
  });

  test('Gemini CLI: disabled when all overrides are negated', () => {
    const tmpBase = join(tmpdir(), `doctor-gemini-${Date.now()}`);
    const homeDir = join(tmpBase, 'home');
    const projectDir = join(tmpBase, 'project');
    mkdirSync(homeDir, { recursive: true });
    mkdirSync(projectDir, { recursive: true });

    const geminiExtDir = join(homeDir, '.gemini', 'extensions');
    mkdirSync(geminiExtDir, { recursive: true });
    writeFileSync(
      join(geminiExtDir, 'extension-enablement.json'),
      JSON.stringify({
        'gemini-safety-net': { overrides: ['!/Users/disabled/*', '!/other/*'] },
      }),
    );

    try {
      const hooks = detectAllHooks(projectDir, { homeDir });
      const gemini = hooks.find((hook) => hook.platform === 'gemini-cli');
      expect(gemini?.status).toBe('disabled');
      expect(gemini?.errors?.some((e) => e.includes('no enabled workspace overrides'))).toBe(true);
    } finally {
      rmSync(tmpBase, { recursive: true, force: true });
    }
  });

  test('Gemini CLI: not configured when hooks not enabled in settings', () => {
    const tmpBase = join(tmpdir(), `doctor-gemini-${Date.now()}`);
    const homeDir = join(tmpBase, 'home');
    const projectDir = join(tmpBase, 'project');
    mkdirSync(homeDir, { recursive: true });
    mkdirSync(projectDir, { recursive: true });

    const geminiDir = join(homeDir, '.gemini');
    const geminiExtDir = join(geminiDir, 'extensions');
    mkdirSync(geminiExtDir, { recursive: true });
    writeFileSync(
      join(geminiExtDir, 'extension-enablement.json'),
      JSON.stringify({
        'gemini-safety-net': { overrides: ['/Users/kenryu/*'] },
      }),
    );

    try {
      const hooks = detectAllHooks(projectDir, { homeDir });
      const gemini = hooks.find((hook) => hook.platform === 'gemini-cli');
      expect(gemini?.status).toBe('n/a');
      expect(gemini?.errors?.some((e) => e.includes('tools.enableHooks'))).toBe(true);
    } finally {
      rmSync(tmpBase, { recursive: true, force: true });
    }
  });

  test('Gemini CLI: uses local project settings.json for hooks check', () => {
    const tmpBase = join(tmpdir(), `doctor-gemini-${Date.now()}`);
    const homeDir = join(tmpBase, 'home');
    const projectDir = join(tmpBase, 'project');
    mkdirSync(homeDir, { recursive: true });
    mkdirSync(projectDir, { recursive: true });

    const geminiExtDir = join(homeDir, '.gemini', 'extensions');
    mkdirSync(geminiExtDir, { recursive: true });
    writeFileSync(
      join(geminiExtDir, 'extension-enablement.json'),
      JSON.stringify({
        'gemini-safety-net': { overrides: ['/Users/kenryu/*'] },
      }),
    );

    const localGeminiDir = join(projectDir, '.gemini');
    mkdirSync(localGeminiDir, { recursive: true });
    writeFileSync(
      join(localGeminiDir, 'settings.json'),
      JSON.stringify({
        tools: { enableHooks: true },
      }),
    );

    try {
      const hooks = detectAllHooks(projectDir, { homeDir });
      const gemini = hooks.find((hook) => hook.platform === 'gemini-cli');
      expect(gemini?.status).toBe('configured');
      expect(gemini?.method).toBe('extension plugin');
    } finally {
      rmSync(tmpBase, { recursive: true, force: true });
    }
  });

  test('Gemini CLI: not configured when plugin key does not exist', () => {
    const tmpBase = join(tmpdir(), `doctor-gemini-${Date.now()}`);
    const homeDir = join(tmpBase, 'home');
    const projectDir = join(tmpBase, 'project');
    mkdirSync(homeDir, { recursive: true });
    mkdirSync(projectDir, { recursive: true });

    const geminiExtDir = join(homeDir, '.gemini', 'extensions');
    mkdirSync(geminiExtDir, { recursive: true });
    writeFileSync(
      join(geminiExtDir, 'extension-enablement.json'),
      JSON.stringify({
        'other-plugin': { overrides: ['/Users/kenryu/*'] },
      }),
    );

    try {
      const hooks = detectAllHooks(projectDir, { homeDir });
      const gemini = hooks.find((hook) => hook.platform === 'gemini-cli');
      expect(gemini?.status).toBe('n/a');
      expect(gemini?.errors).toBeUndefined();
    } finally {
      rmSync(tmpBase, { recursive: true, force: true });
    }
  });

  test('Gemini CLI: reports error when settings.json is malformed', () => {
    const tmpBase = join(tmpdir(), `doctor-gemini-${Date.now()}`);
    const homeDir = join(tmpBase, 'home');
    const projectDir = join(tmpBase, 'project');
    mkdirSync(homeDir, { recursive: true });
    mkdirSync(projectDir, { recursive: true });

    const geminiDir = join(homeDir, '.gemini');
    const geminiExtDir = join(geminiDir, 'extensions');
    mkdirSync(geminiExtDir, { recursive: true });

    writeFileSync(
      join(geminiExtDir, 'extension-enablement.json'),
      JSON.stringify({
        'gemini-safety-net': { overrides: ['/Users/kenryu/*'] },
      }),
    );

    writeFileSync(join(geminiDir, 'settings.json'), '{ invalid json }');

    try {
      const hooks = detectAllHooks(projectDir, { homeDir });
      const gemini = hooks.find((hook) => hook.platform === 'gemini-cli');
      expect(gemini?.status).toBe('n/a');
      expect(gemini?.errors?.some((e) => e.includes('Failed to parse'))).toBe(true);
      expect(gemini?.errors?.some((e) => e.includes('tools.enableHooks'))).toBe(true);
    } finally {
      rmSync(tmpBase, { recursive: true, force: true });
    }
  });
});

describe('stripJsonComments', () => {
  test('removes single-line comments', () => {
    const input = `{
      "key": "value" // this is a comment
    }`;
    const result = stripJsonComments(input);
    expect(JSON.parse(result)).toEqual({ key: 'value' });
  });

  test('removes multi-line comments', () => {
    const input = `{
      /* comment */
      "key": "value"
    }`;
    const result = stripJsonComments(input);
    expect(JSON.parse(result)).toEqual({ key: 'value' });
  });

  test('removes trailing commas before }', () => {
    const input = `{
      "key": "value",
    }`;
    const result = stripJsonComments(input);
    expect(JSON.parse(result)).toEqual({ key: 'value' });
  });

  test('removes trailing commas before ]', () => {
    const input = `{
      "arr": ["a", "b",]
    }`;
    const result = stripJsonComments(input);
    expect(JSON.parse(result)).toEqual({ arr: ['a', 'b'] });
  });

  test('handles comments inside arrays', () => {
    const input = `{
      "arr": [
        // "commented-out",
        "active"
      ]
    }`;
    const result = stripJsonComments(input);
    expect(JSON.parse(result)).toEqual({ arr: ['active'] });
  });

  test('preserves // inside strings', () => {
    const input = `{
      "url": "https://example.com"
    }`;
    const result = stripJsonComments(input);
    expect(JSON.parse(result)).toEqual({ url: 'https://example.com' });
  });

  test('preserves /* inside strings', () => {
    const input = `{
      "pattern": "/* glob */"
    }`;
    const result = stripJsonComments(input);
    expect(JSON.parse(result)).toEqual({ pattern: '/* glob */' });
  });

  test('handles escaped quotes in strings', () => {
    const input = `{
      "escaped": "say \\"hello\\""
    }`;
    const result = stripJsonComments(input);
    expect(JSON.parse(result)).toEqual({ escaped: 'say "hello"' });
  });

  test('preserves comma-bracket sequences inside strings', () => {
    const input = `{"pattern": ",]", "other": ",}"}`;
    const result = stripJsonComments(input);
    expect(JSON.parse(result)).toEqual({ pattern: ',]', other: ',}' });
  });

  test('preserves complex patterns inside strings with trailing commas outside', () => {
    const input = `{
      "pattern": ",]",
      "arr": ["a", "b",],
    }`;
    const result = stripJsonComments(input);
    expect(JSON.parse(result)).toEqual({ pattern: ',]', arr: ['a', 'b'] });
  });

  test('handles complex JSONC like opencode config', () => {
    const input = `{
      "$schema": "https://opencode.ai/config.json",
      "plugin": [
        // "disabled-plugin",
        "active-plugin",
      ],
      "options": {
        "key": "value", /* trailing */
      }
    }`;
    const result = stripJsonComments(input);
    const parsed = JSON.parse(result);
    expect(parsed.$schema).toBe('https://opencode.ai/config.json');
    expect(parsed.plugin).toEqual(['active-plugin']);
    expect(parsed.options).toEqual({ key: 'value' });
  });
});
