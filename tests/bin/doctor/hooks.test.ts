/**
 * Tests for the doctor command hooks functions.
 */

import { describe, expect, test } from 'bun:test';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { detectAllHooks, stripJsonComments } from '@/bin/doctor/hooks';
import { withEnv } from '../../helpers.ts';

function _writeCopilotHook(
  filePath: string,
  command: string = 'npx -y cc-safety-net --copilot-cli',
  commandKey: 'bash' | 'powershell' = 'bash',
): void {
  writeFileSync(
    filePath,
    JSON.stringify({
      version: 1,
      hooks: {
        preToolUse: [
          {
            type: 'command',
            [commandKey]: command,
            cwd: '.',
            timeoutSec: 15,
          },
        ],
      },
    }),
  );
}

function _writeCopilotInlineConfig(
  filePath: string,
  command: string = 'npx -y cc-safety-net --copilot-cli',
  options: {
    commandKey?: 'command' | 'bash' | 'powershell';
    disableAllHooks?: boolean;
  } = {},
): void {
  const { commandKey = 'command', disableAllHooks } = options;
  writeFileSync(
    filePath,
    JSON.stringify({
      ...(disableAllHooks !== undefined ? { disableAllHooks } : {}),
      hooks: {
        preToolUse: [
          {
            type: 'command',
            [commandKey]: command,
            cwd: '.',
            timeoutSec: 15,
          },
        ],
      },
    }),
  );
}

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

    const copilotDir = join(projectDir, '.github', 'hooks');
    mkdirSync(copilotDir, { recursive: true });
    _writeCopilotHook(join(copilotDir, 'safety-net.json'));

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

      const copilot = hooks.find((hook) => hook.platform === 'copilot-cli');
      expect(copilot?.status).toBe('configured');
      expect(copilot?.method).toBe('hook config');
      expect(copilot?.selfTest?.passed).toBe(copilot?.selfTest?.total);
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

  test('Copilot CLI: configured from local project hook config', () => {
    const tmpBase = join(tmpdir(), `doctor-copilot-${Date.now()}`);
    const homeDir = join(tmpBase, 'home');
    const projectDir = join(tmpBase, 'project');
    const copilotDir = join(projectDir, '.github', 'hooks');
    mkdirSync(homeDir, { recursive: true });
    mkdirSync(copilotDir, { recursive: true });
    _writeCopilotHook(join(copilotDir, 'safety-net.json'));

    try {
      const hooks = detectAllHooks(projectDir, { homeDir });
      const copilot = hooks.find((hook) => hook.platform === 'copilot-cli');

      expect(copilot?.status).toBe('configured');
      expect(copilot?.configPath).toBe(join(copilotDir, 'safety-net.json'));
      expect(copilot?.selfTest?.failed).toBe(0);
    } finally {
      rmSync(tmpBase, { recursive: true, force: true });
    }
  });

  test('Copilot CLI: configured from global hook config', () => {
    const tmpBase = join(tmpdir(), `doctor-copilot-${Date.now()}`);
    const homeDir = join(tmpBase, 'home');
    const projectDir = join(tmpBase, 'project');
    const copilotDir = join(homeDir, '.copilot', 'hooks');
    mkdirSync(projectDir, { recursive: true });
    mkdirSync(copilotDir, { recursive: true });
    _writeCopilotHook(join(copilotDir, 'global.json'));

    try {
      const hooks = detectAllHooks(projectDir, { homeDir, copilotCliVersion: '1.0.9' });
      const copilot = hooks.find((hook) => hook.platform === 'copilot-cli');

      expect(copilot?.status).toBe('configured');
      expect(copilot?.configPath).toBe(join(copilotDir, 'global.json'));
      expect(copilot?.configPaths).toEqual([join(copilotDir, 'global.json')]);
    } finally {
      rmSync(tmpBase, { recursive: true, force: true });
    }
  });

  test('Copilot CLI: ignores global hook config on unsupported versions', () => {
    const tmpBase = join(tmpdir(), `doctor-copilot-${Date.now()}`);
    const homeDir = join(tmpBase, 'home');
    const projectDir = join(tmpBase, 'project');
    const copilotDir = join(homeDir, '.copilot', 'hooks');
    mkdirSync(projectDir, { recursive: true });
    mkdirSync(copilotDir, { recursive: true });
    _writeCopilotHook(join(copilotDir, 'global.json'));

    try {
      const hooks = detectAllHooks(projectDir, { homeDir, copilotCliVersion: '0.0.421' });
      const copilot = hooks.find((hook) => hook.platform === 'copilot-cli');

      expect(copilot?.status).toBe('n/a');
      expect(copilot?.selfTest).toBeUndefined();
      expect(copilot?.errors?.some((e) => e.includes('does not support user hook files'))).toBe(
        true,
      );
    } finally {
      rmSync(tmpBase, { recursive: true, force: true });
    }
  });

  test('Copilot CLI: unsupported user hook warning uses resolved COPILOT_HOME hooks path', () => {
    const tmpBase = join(tmpdir(), `doctor-copilot-${Date.now()}`);
    const homeDir = join(tmpBase, 'home');
    const customCopilotHome = join(tmpBase, 'custom-copilot');
    const customHooksDir = join(customCopilotHome, 'hooks');
    const projectDir = join(tmpBase, 'project');
    mkdirSync(projectDir, { recursive: true });
    mkdirSync(customHooksDir, { recursive: true });
    _writeCopilotHook(join(customHooksDir, 'global.json'));

    try {
      const hooks = withEnv({ COPILOT_HOME: customCopilotHome }, () =>
        detectAllHooks(projectDir, { homeDir, copilotCliVersion: '0.0.421' }),
      );
      const copilot = hooks.find((hook) => hook.platform === 'copilot-cli');

      expect(copilot?.status).toBe('n/a');
      expect(
        copilot?.errors?.some((error) =>
          error.includes(`user hook files in ${join(customCopilotHome, 'hooks')}`),
        ) ?? false,
      ).toBe(true);
      expect(copilot?.errors?.some((error) => error.includes('~/.copilot/hooks')) ?? false).toBe(
        false,
      );
    } finally {
      rmSync(tmpBase, { recursive: true, force: true });
    }
  });

  test('Copilot CLI: ignores malformed global hook config on unsupported versions', () => {
    const tmpBase = join(tmpdir(), `doctor-copilot-${Date.now()}`);
    const homeDir = join(tmpBase, 'home');
    const projectDir = join(tmpBase, 'project');
    const copilotDir = join(homeDir, '.copilot', 'hooks');
    mkdirSync(projectDir, { recursive: true });
    mkdirSync(copilotDir, { recursive: true });
    writeFileSync(join(copilotDir, 'broken.json'), '{ invalid json }');

    try {
      const hooks = detectAllHooks(projectDir, { homeDir, copilotCliVersion: '0.0.421' });
      const copilot = hooks.find((hook) => hook.platform === 'copilot-cli');

      expect(copilot?.status).toBe('n/a');
      expect(copilot?.errors?.some((error) => error.includes('Failed to parse')) ?? false).toBe(
        false,
      );
      expect(copilot?.errors?.some((error) => error.includes('user hook files')) ?? false).toBe(
        false,
      );
    } finally {
      rmSync(tmpBase, { recursive: true, force: true });
    }
  });

  test('Copilot CLI: does not warn about unsupported user hook files when none configure Safety Net', () => {
    const tmpBase = join(tmpdir(), `doctor-copilot-${Date.now()}`);
    const homeDir = join(tmpBase, 'home');
    const projectDir = join(tmpBase, 'project');
    const copilotDir = join(homeDir, '.copilot', 'hooks');
    mkdirSync(projectDir, { recursive: true });
    mkdirSync(copilotDir, { recursive: true });
    _writeCopilotHook(join(copilotDir, 'other.json'), 'echo safe');

    try {
      const hooks = detectAllHooks(projectDir, { homeDir });
      const copilot = hooks.find((hook) => hook.platform === 'copilot-cli');

      expect(copilot?.status).toBe('n/a');
      expect(copilot?.errors?.some((error) => error.includes('user hook files')) ?? false).toBe(
        false,
      );
    } finally {
      rmSync(tmpBase, { recursive: true, force: true });
    }
  });

  test('Copilot CLI: reports repo and global hook configs together', () => {
    const tmpBase = join(tmpdir(), `doctor-copilot-${Date.now()}`);
    const homeDir = join(tmpBase, 'home');
    const projectDir = join(tmpBase, 'project');
    const localDir = join(projectDir, '.github', 'hooks');
    const globalDir = join(homeDir, '.copilot', 'hooks');
    mkdirSync(localDir, { recursive: true });
    mkdirSync(globalDir, { recursive: true });
    _writeCopilotHook(join(globalDir, 'global.json'));
    _writeCopilotHook(join(localDir, 'local.json'));

    try {
      const hooks = detectAllHooks(projectDir, { homeDir, copilotCliVersion: '1.0.9' });
      const copilot = hooks.find((hook) => hook.platform === 'copilot-cli');

      expect(copilot?.status).toBe('configured');
      expect(copilot?.configPath).toBe(join(localDir, 'local.json'));
      expect(copilot?.configPaths).toEqual([
        join(localDir, 'local.json'),
        join(globalDir, 'global.json'),
      ]);
    } finally {
      rmSync(tmpBase, { recursive: true, force: true });
    }
  });

  test('Copilot CLI: continues checking files after parse errors', () => {
    const tmpBase = join(tmpdir(), `doctor-copilot-${Date.now()}`);
    const homeDir = join(tmpBase, 'home');
    const projectDir = join(tmpBase, 'project');
    const copilotDir = join(projectDir, '.github', 'hooks');
    mkdirSync(homeDir, { recursive: true });
    mkdirSync(copilotDir, { recursive: true });
    writeFileSync(join(copilotDir, 'broken.json'), '{ invalid json }');
    _writeCopilotHook(join(copilotDir, 'safety-net.json'));

    try {
      const hooks = detectAllHooks(projectDir, { homeDir });
      const copilot = hooks.find((hook) => hook.platform === 'copilot-cli');

      expect(copilot?.status).toBe('configured');
      expect(copilot?.errors?.some((e) => e.includes('Failed to parse'))).toBe(true);
      expect(copilot?.configPath).toBe(join(copilotDir, 'safety-net.json'));
    } finally {
      rmSync(tmpBase, { recursive: true, force: true });
    }
  });

  test('Copilot CLI: ignores non-Safety Net preToolUse hooks', () => {
    const tmpBase = join(tmpdir(), `doctor-copilot-${Date.now()}`);
    const homeDir = join(tmpBase, 'home');
    const projectDir = join(tmpBase, 'project');
    const copilotDir = join(projectDir, '.github', 'hooks');
    mkdirSync(homeDir, { recursive: true });
    mkdirSync(copilotDir, { recursive: true });
    _writeCopilotHook(join(copilotDir, 'other.json'), 'echo safe');

    try {
      const hooks = detectAllHooks(projectDir, { homeDir });
      const copilot = hooks.find((hook) => hook.platform === 'copilot-cli');

      expect(copilot?.status).toBe('n/a');
      expect(copilot?.selfTest).toBeUndefined();
    } finally {
      rmSync(tmpBase, { recursive: true, force: true });
    }
  });

  test('Copilot CLI: supports powershell hook commands', () => {
    const tmpBase = join(tmpdir(), `doctor-copilot-${Date.now()}`);
    const homeDir = join(tmpBase, 'home');
    const projectDir = join(tmpBase, 'project');
    const copilotDir = join(projectDir, '.github', 'hooks');
    mkdirSync(homeDir, { recursive: true });
    mkdirSync(copilotDir, { recursive: true });
    _writeCopilotHook(
      join(copilotDir, 'powershell.json'),
      'npx -y cc-safety-net --copilot-cli',
      'powershell',
    );

    try {
      const hooks = detectAllHooks(projectDir, { homeDir });
      const copilot = hooks.find((hook) => hook.platform === 'copilot-cli');

      expect(copilot?.status).toBe('configured');
      expect(copilot?.configPath).toBe(join(copilotDir, 'powershell.json'));
    } finally {
      rmSync(tmpBase, { recursive: true, force: true });
    }
  });

  test('Copilot CLI: reports parse errors when all hook files are invalid', () => {
    const tmpBase = join(tmpdir(), `doctor-copilot-${Date.now()}`);
    const homeDir = join(tmpBase, 'home');
    const projectDir = join(tmpBase, 'project');
    const copilotDir = join(projectDir, '.github', 'hooks');
    mkdirSync(homeDir, { recursive: true });
    mkdirSync(copilotDir, { recursive: true });
    writeFileSync(join(copilotDir, 'bad1.json'), '{ invalid }');
    writeFileSync(join(copilotDir, 'bad2.json'), 'not json');

    try {
      const hooks = detectAllHooks(projectDir, { homeDir });
      const copilot = hooks.find((hook) => hook.platform === 'copilot-cli');

      expect(copilot?.status).toBe('n/a');
      expect(copilot?.errors?.length).toBe(2);
      expect(copilot?.errors?.every((e) => e.includes('Failed to parse'))).toBe(true);
    } finally {
      rmSync(tmpBase, { recursive: true, force: true });
    }
  });

  test('Copilot CLI: supports the short -cp flag', () => {
    const tmpBase = join(tmpdir(), `doctor-copilot-${Date.now()}`);
    const homeDir = join(tmpBase, 'home');
    const projectDir = join(tmpBase, 'project');
    const copilotDir = join(projectDir, '.github', 'hooks');
    mkdirSync(homeDir, { recursive: true });
    mkdirSync(copilotDir, { recursive: true });
    _writeCopilotHook(join(copilotDir, 'short-flag.json'), 'bunx cc-safety-net -cp');

    try {
      const hooks = detectAllHooks(projectDir, { homeDir });
      const copilot = hooks.find((hook) => hook.platform === 'copilot-cli');

      expect(copilot?.status).toBe('configured');
      expect(copilot?.configPath).toBe(join(copilotDir, 'short-flag.json'));
    } finally {
      rmSync(tmpBase, { recursive: true, force: true });
    }
  });

  test('Copilot CLI: configured from global config.json inline hooks', () => {
    const tmpBase = join(tmpdir(), `doctor-copilot-${Date.now()}`);
    const homeDir = join(tmpBase, 'home');
    const projectDir = join(tmpBase, 'project');
    const configDir = join(homeDir, '.copilot');
    mkdirSync(projectDir, { recursive: true });
    mkdirSync(configDir, { recursive: true });
    _writeCopilotInlineConfig(join(configDir, 'config.json'));

    try {
      const hooks = detectAllHooks(projectDir, { homeDir, copilotCliVersion: '1.0.9' });
      const copilot = hooks.find((hook) => hook.platform === 'copilot-cli');

      expect(copilot?.status).toBe('configured');
      expect(copilot?.configPath).toBe(join(configDir, 'config.json'));
      expect(copilot?.configPaths).toEqual([join(configDir, 'config.json')]);
    } finally {
      rmSync(tmpBase, { recursive: true, force: true });
    }
  });

  test('Copilot CLI: ignores global config.json inline hooks on unsupported versions', () => {
    const tmpBase = join(tmpdir(), `doctor-copilot-${Date.now()}`);
    const homeDir = join(tmpBase, 'home');
    const projectDir = join(tmpBase, 'project');
    const configDir = join(homeDir, '.copilot');
    mkdirSync(projectDir, { recursive: true });
    mkdirSync(configDir, { recursive: true });
    _writeCopilotInlineConfig(join(configDir, 'config.json'));

    try {
      const hooks = detectAllHooks(projectDir, { homeDir, copilotCliVersion: '1.0.7' });
      const copilot = hooks.find((hook) => hook.platform === 'copilot-cli');

      expect(copilot?.status).toBe('n/a');
      expect(
        copilot?.errors?.some((e) => e.includes('does not support inline hook definitions')),
      ).toBe(true);
    } finally {
      rmSync(tmpBase, { recursive: true, force: true });
    }
  });

  test('Copilot CLI: supports global config.json inline hooks at the minimum supported version', () => {
    const tmpBase = join(tmpdir(), `doctor-copilot-${Date.now()}`);
    const homeDir = join(tmpBase, 'home');
    const projectDir = join(tmpBase, 'project');
    const configDir = join(homeDir, '.copilot');
    mkdirSync(projectDir, { recursive: true });
    mkdirSync(configDir, { recursive: true });
    _writeCopilotInlineConfig(join(configDir, 'config.json'));

    try {
      const hooks = detectAllHooks(projectDir, { homeDir, copilotCliVersion: '1.0.8' });
      const copilot = hooks.find((hook) => hook.platform === 'copilot-cli');

      expect(copilot?.status).toBe('configured');
      expect(copilot?.configPath).toBe(join(configDir, 'config.json'));
      expect(copilot?.configPaths).toEqual([join(configDir, 'config.json')]);
    } finally {
      rmSync(tmpBase, { recursive: true, force: true });
    }
  });

  test('Copilot CLI: configured from repository settings.json inline hooks', () => {
    const tmpBase = join(tmpdir(), `doctor-copilot-${Date.now()}`);
    const homeDir = join(tmpBase, 'home');
    const projectDir = join(tmpBase, 'project');
    const configDir = join(projectDir, '.github', 'copilot');
    mkdirSync(homeDir, { recursive: true });
    mkdirSync(configDir, { recursive: true });
    _writeCopilotInlineConfig(join(configDir, 'settings.json'));

    try {
      const hooks = detectAllHooks(projectDir, { homeDir, copilotCliVersion: '1.0.9' });
      const copilot = hooks.find((hook) => hook.platform === 'copilot-cli');

      expect(copilot?.status).toBe('configured');
      expect(copilot?.configPath).toBe(join(configDir, 'settings.json'));
      expect(copilot?.configPaths).toEqual([join(configDir, 'settings.json')]);
    } finally {
      rmSync(tmpBase, { recursive: true, force: true });
    }
  });

  test('Copilot CLI: configured from repository settings.local.json inline hooks', () => {
    const tmpBase = join(tmpdir(), `doctor-copilot-${Date.now()}`);
    const homeDir = join(tmpBase, 'home');
    const projectDir = join(tmpBase, 'project');
    const configDir = join(projectDir, '.github', 'copilot');
    mkdirSync(homeDir, { recursive: true });
    mkdirSync(configDir, { recursive: true });
    _writeCopilotInlineConfig(join(configDir, 'settings.local.json'));

    try {
      const hooks = detectAllHooks(projectDir, { homeDir, copilotCliVersion: '1.0.9' });
      const copilot = hooks.find((hook) => hook.platform === 'copilot-cli');

      expect(copilot?.status).toBe('configured');
      expect(copilot?.configPath).toBe(join(configDir, 'settings.local.json'));
      expect(copilot?.configPaths).toEqual([join(configDir, 'settings.local.json')]);
    } finally {
      rmSync(tmpBase, { recursive: true, force: true });
    }
  });

  test('Copilot CLI: user disableAllHooks reports disabled', () => {
    const tmpBase = join(tmpdir(), `doctor-copilot-${Date.now()}`);
    const homeDir = join(tmpBase, 'home');
    const projectDir = join(tmpBase, 'project');
    const hooksDir = join(projectDir, '.github', 'hooks');
    const configDir = join(homeDir, '.copilot');
    mkdirSync(hooksDir, { recursive: true });
    mkdirSync(configDir, { recursive: true });
    _writeCopilotHook(join(hooksDir, 'safety-net.json'));
    writeFileSync(join(configDir, 'config.json'), JSON.stringify({ disableAllHooks: true }));

    try {
      const hooks = detectAllHooks(projectDir, { homeDir, copilotCliVersion: '1.0.9' });
      const copilot = hooks.find((hook) => hook.platform === 'copilot-cli');

      expect(copilot?.status).toBe('disabled');
      expect(copilot?.configPath).toBe(join(configDir, 'config.json'));
      expect(copilot?.configPaths).toEqual([join(configDir, 'config.json')]);
      expect(copilot?.selfTest).toBeUndefined();
    } finally {
      rmSync(tmpBase, { recursive: true, force: true });
    }
  });

  test('Copilot CLI: unknown version still honors inline disableAllHooks over repo hook files', () => {
    const tmpBase = join(tmpdir(), `doctor-copilot-${Date.now()}`);
    const homeDir = join(tmpBase, 'home');
    const projectDir = join(tmpBase, 'project');
    const hooksDir = join(projectDir, '.github', 'hooks');
    const configDir = join(projectDir, '.github', 'copilot');
    mkdirSync(hooksDir, { recursive: true });
    mkdirSync(configDir, { recursive: true });
    _writeCopilotHook(join(hooksDir, 'safety-net.json'));
    writeFileSync(join(configDir, 'settings.json'), JSON.stringify({ disableAllHooks: true }));

    try {
      const hooks = detectAllHooks(projectDir, { homeDir });
      const copilot = hooks.find((hook) => hook.platform === 'copilot-cli');

      expect(copilot?.status).toBe('disabled');
      expect(copilot?.configPath).toBe(join(configDir, 'settings.json'));
      expect(copilot?.configPaths).toEqual([join(configDir, 'settings.json')]);
      expect(copilot?.errors?.some((e) => e.includes('version unavailable'))).toBe(true);
      expect(copilot?.selfTest).toBeUndefined();
    } finally {
      rmSync(tmpBase, { recursive: true, force: true });
    }
  });

  test('Copilot CLI: repository settings can override user disableAllHooks', () => {
    const tmpBase = join(tmpdir(), `doctor-copilot-${Date.now()}`);
    const homeDir = join(tmpBase, 'home');
    const projectDir = join(tmpBase, 'project');
    const userConfigDir = join(homeDir, '.copilot');
    const repoConfigDir = join(projectDir, '.github', 'copilot');
    mkdirSync(userConfigDir, { recursive: true });
    mkdirSync(repoConfigDir, { recursive: true });
    writeFileSync(join(userConfigDir, 'config.json'), JSON.stringify({ disableAllHooks: true }));
    writeFileSync(join(repoConfigDir, 'settings.json'), JSON.stringify({ disableAllHooks: false }));
    _writeCopilotInlineConfig(join(repoConfigDir, 'settings.local.json'));

    try {
      const hooks = detectAllHooks(projectDir, { homeDir, copilotCliVersion: '1.0.9' });
      const copilot = hooks.find((hook) => hook.platform === 'copilot-cli');

      expect(copilot?.status).toBe('configured');
      expect(copilot?.configPath).toBe(join(repoConfigDir, 'settings.local.json'));
      expect(copilot?.configPaths).toEqual([join(repoConfigDir, 'settings.local.json')]);
    } finally {
      rmSync(tmpBase, { recursive: true, force: true });
    }
  });

  test('Copilot CLI: settings.local disableAllHooks overrides broader configs', () => {
    const tmpBase = join(tmpdir(), `doctor-copilot-${Date.now()}`);
    const homeDir = join(tmpBase, 'home');
    const projectDir = join(tmpBase, 'project');
    const userConfigDir = join(homeDir, '.copilot');
    const repoConfigDir = join(projectDir, '.github', 'copilot');
    mkdirSync(userConfigDir, { recursive: true });
    mkdirSync(repoConfigDir, { recursive: true });
    _writeCopilotInlineConfig(join(userConfigDir, 'config.json'));
    _writeCopilotInlineConfig(join(repoConfigDir, 'settings.json'));
    writeFileSync(
      join(repoConfigDir, 'settings.local.json'),
      JSON.stringify({ disableAllHooks: true }),
    );

    try {
      const hooks = detectAllHooks(projectDir, { homeDir, copilotCliVersion: '1.0.9' });
      const copilot = hooks.find((hook) => hook.platform === 'copilot-cli');

      expect(copilot?.status).toBe('disabled');
      expect(copilot?.configPath).toBe(join(repoConfigDir, 'settings.local.json'));
      expect(copilot?.configPaths).toEqual([join(repoConfigDir, 'settings.local.json')]);
    } finally {
      rmSync(tmpBase, { recursive: true, force: true });
    }
  });

  test('Copilot CLI: honors COPILOT_HOME for user config discovery', () => {
    const tmpBase = join(tmpdir(), `doctor-copilot-${Date.now()}`);
    const homeDir = join(tmpBase, 'home');
    const customCopilotHome = join(tmpBase, 'custom-copilot');
    const projectDir = join(tmpBase, 'project');
    mkdirSync(projectDir, { recursive: true });
    mkdirSync(customCopilotHome, { recursive: true });
    _writeCopilotInlineConfig(join(customCopilotHome, 'config.json'));

    try {
      const hooks = withEnv({ COPILOT_HOME: customCopilotHome }, () =>
        detectAllHooks(projectDir, { homeDir, copilotCliVersion: '1.0.9' }),
      );
      const copilot = hooks.find((hook) => hook.platform === 'copilot-cli');

      expect(copilot?.status).toBe('configured');
      expect(copilot?.configPath).toBe(join(customCopilotHome, 'config.json'));
      expect(copilot?.configPaths).toEqual([join(customCopilotHome, 'config.json')]);
    } finally {
      rmSync(tmpBase, { recursive: true, force: true });
    }
  });

  test('Copilot CLI: warns when version is unavailable for gated sources', () => {
    const tmpBase = join(tmpdir(), `doctor-copilot-${Date.now()}`);
    const homeDir = join(tmpBase, 'home');
    const projectDir = join(tmpBase, 'project');
    const configDir = join(homeDir, '.copilot');
    mkdirSync(projectDir, { recursive: true });
    mkdirSync(configDir, { recursive: true });
    _writeCopilotInlineConfig(join(configDir, 'config.json'));

    try {
      const hooks = detectAllHooks(projectDir, { homeDir });
      const copilot = hooks.find((hook) => hook.platform === 'copilot-cli');

      expect(copilot?.status).toBe('n/a');
      expect(copilot?.errors?.some((e) => e.includes('Copilot CLI version unavailable'))).toBe(
        true,
      );
    } finally {
      rmSync(tmpBase, { recursive: true, force: true });
    }
  });

  test('Copilot CLI: does not warn about unsupported inline hooks when none configure Safety Net', () => {
    const tmpBase = join(tmpdir(), `doctor-copilot-${Date.now()}`);
    const homeDir = join(tmpBase, 'home');
    const projectDir = join(tmpBase, 'project');
    const configDir = join(homeDir, '.copilot');
    mkdirSync(projectDir, { recursive: true });
    mkdirSync(configDir, { recursive: true });
    _writeCopilotInlineConfig(join(configDir, 'config.json'), 'echo safe');

    try {
      const hooks = detectAllHooks(projectDir, { homeDir, copilotCliVersion: '1.0.7' });
      const copilot = hooks.find((hook) => hook.platform === 'copilot-cli');

      expect(copilot?.status).toBe('n/a');
      expect(
        copilot?.errors?.some((error) => error.includes('inline hook definitions')) ?? false,
      ).toBe(false);
    } finally {
      rmSync(tmpBase, { recursive: true, force: true });
    }
  });

  test('Copilot CLI: ignores malformed inline config on unsupported versions', () => {
    const tmpBase = join(tmpdir(), `doctor-copilot-${Date.now()}`);
    const homeDir = join(tmpBase, 'home');
    const projectDir = join(tmpBase, 'project');
    const configDir = join(homeDir, '.copilot');
    mkdirSync(projectDir, { recursive: true });
    mkdirSync(configDir, { recursive: true });
    writeFileSync(join(configDir, 'config.json'), '{ invalid json }');

    try {
      const hooks = detectAllHooks(projectDir, { homeDir, copilotCliVersion: '1.0.7' });
      const copilot = hooks.find((hook) => hook.platform === 'copilot-cli');

      expect(copilot?.status).toBe('n/a');
      expect(copilot?.errors?.some((error) => error.includes('Failed to parse')) ?? false).toBe(
        false,
      );
      expect(
        copilot?.errors?.some((error) => error.includes('inline hook definitions')) ?? false,
      ).toBe(false);
    } finally {
      rmSync(tmpBase, { recursive: true, force: true });
    }
  });

  test('Copilot CLI: ignores malformed inline config when version is unavailable', () => {
    const tmpBase = join(tmpdir(), `doctor-copilot-${Date.now()}`);
    const homeDir = join(tmpBase, 'home');
    const projectDir = join(tmpBase, 'project');
    const configDir = join(homeDir, '.copilot');
    mkdirSync(projectDir, { recursive: true });
    mkdirSync(configDir, { recursive: true });
    writeFileSync(join(configDir, 'config.json'), '{ invalid json }');

    try {
      const hooks = detectAllHooks(projectDir, { homeDir });
      const copilot = hooks.find((hook) => hook.platform === 'copilot-cli');

      expect(copilot?.status).toBe('n/a');
      expect(copilot?.errors?.some((error) => error.includes('Failed to parse')) ?? false).toBe(
        false,
      );
      expect(
        copilot?.errors?.some((error) => error.includes('Copilot CLI version unavailable')) ??
          false,
      ).toBe(false);
    } finally {
      rmSync(tmpBase, { recursive: true, force: true });
    }
  });

  test('Copilot CLI: continues after inline config parse errors', () => {
    const tmpBase = join(tmpdir(), `doctor-copilot-${Date.now()}`);
    const homeDir = join(tmpBase, 'home');
    const projectDir = join(tmpBase, 'project');
    const configDir = join(homeDir, '.copilot');
    const hooksDir = join(configDir, 'hooks');
    mkdirSync(projectDir, { recursive: true });
    mkdirSync(configDir, { recursive: true });
    mkdirSync(hooksDir, { recursive: true });
    writeFileSync(join(configDir, 'config.json'), '{ invalid json }');
    _writeCopilotHook(join(hooksDir, 'global.json'));

    try {
      const hooks = detectAllHooks(projectDir, { homeDir, copilotCliVersion: '1.0.9' });
      const copilot = hooks.find((hook) => hook.platform === 'copilot-cli');

      expect(copilot?.status).toBe('configured');
      expect(copilot?.errors?.some((e) => e.includes('Failed to parse'))).toBe(true);
      expect(copilot?.configPaths).toEqual([join(homeDir, '.copilot', 'hooks', 'global.json')]);
    } finally {
      rmSync(tmpBase, { recursive: true, force: true });
    }
  });

  test('Copilot CLI: reports an error when the repository hooks path is not a directory', () => {
    const tmpBase = join(tmpdir(), `doctor-copilot-${Date.now()}`);
    const homeDir = join(tmpBase, 'home');
    const projectDir = join(tmpBase, 'project');
    const githubDir = join(projectDir, '.github');
    mkdirSync(homeDir, { recursive: true });
    mkdirSync(githubDir, { recursive: true });
    writeFileSync(join(githubDir, 'hooks'), 'not a directory');

    try {
      const hooks = detectAllHooks(projectDir, { homeDir });
      const copilot = hooks.find((hook) => hook.platform === 'copilot-cli');

      expect(copilot?.status).toBe('n/a');
      expect(copilot?.selfTest).toBeUndefined();
      expect(
        copilot?.errors?.some(
          (error) =>
            error.includes('Failed to read') &&
            error.includes(join(projectDir, '.github', 'hooks')),
        ),
      ).toBe(true);
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
