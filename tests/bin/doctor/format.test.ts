/**
 * Tests for the doctor command formatting functions.
 */

import { describe, expect, test } from 'bun:test';
import { getEnvironmentInfo } from '@/bin/doctor/environment';
import {
  formatActivitySection,
  formatConfigSection,
  formatEnvironmentSection,
  formatHooksSection,
  formatRulesTable,
  formatSummary,
  formatSystemInfoSection,
  formatUpdateSection,
} from '@/bin/doctor/format';
import { getSystemInfo } from '@/bin/doctor/system-info';
import type { DoctorReport, EffectiveRule, HookStatus } from '@/bin/doctor/types';
import { mockVersionFetcher } from '../../helpers.ts';

describe('formatRulesTable', () => {
  test('formats rules as ASCII table', () => {
    const rules: EffectiveRule[] = [
      {
        source: 'user',
        name: 'no-npm-publish',
        command: 'npm',
        blockArgs: ['publish'],
        reason: 'Block publishing',
      },
      {
        source: 'project',
        name: 'block-deploy',
        command: 'deploy',
        blockArgs: ['--prod'],
        reason: 'Block prod deploys',
      },
    ];

    const table = formatRulesTable(rules);
    expect(table).toContain('Source');
    expect(table).toContain('Name');
    expect(table).toContain('Command');
    expect(table).toContain('Block Args');
    expect(table).toContain('no-npm-publish');
    expect(table).toContain('block-deploy');
    expect(table).toContain('user');
    expect(table).toContain('project');
  });

  test('handles empty rules list', () => {
    const table = formatRulesTable([]);
    expect(table).toContain('no custom rules');
  });

  test('handles rules with subcommand', () => {
    const rules: EffectiveRule[] = [
      {
        source: 'user',
        name: 'no-git-push-force',
        command: 'git',
        subcommand: 'push',
        blockArgs: ['--force'],
        reason: 'Block force push',
      },
    ];

    const table = formatRulesTable(rules);
    expect(table).toContain('git push');
  });
});

describe('formatHooksSection', () => {
  test('formats configured hooks with self-test', () => {
    const hooks: HookStatus[] = [
      {
        platform: 'claude-code',
        status: 'configured',
        method: 'marketplace plugin',
        selfTest: {
          passed: 5,
          failed: 0,
          total: 5,
          results: [
            {
              command: 'git reset --hard',
              description: 'git reset --hard',
              expected: 'blocked',
              actual: 'blocked',
              passed: true,
            },
          ],
        },
      },
    ];

    const output = formatHooksSection(hooks);
    expect(output).toContain('Hook Integration');
    expect(output).toContain('Claude Code');
    expect(output).toContain('Configured');
    expect(output).toContain('5/5 OK');
  });

  test('formats unconfigured hooks', () => {
    const hooks: HookStatus[] = [{ platform: 'gemini-cli', status: 'n/a' }];

    const output = formatHooksSection(hooks);
    expect(output).toContain('Gemini CLI');
    expect(output).toContain('N/A');
  });

  test('shows error for failed detection', () => {
    const hooks: HookStatus[] = [{ platform: 'opencode', status: 'n/a', errors: ['Parse error'] }];

    const output = formatHooksSection(hooks);
    expect(output).toContain('Error (OpenCode): Parse error');
  });

  test('shows warning for configured hooks with errors', () => {
    const hooks: HookStatus[] = [
      {
        platform: 'claude-code',
        status: 'configured',
        errors: ['Something went wrong during detection'],
      },
    ];

    const output = formatHooksSection(hooks);
    expect(output).toContain('Warning (Claude Code): Something went wrong during detection');
  });

  test('formats disabled hooks', () => {
    const hooks: HookStatus[] = [{ platform: 'claude-code', status: 'disabled' }];

    const output = formatHooksSection(hooks);
    expect(output).toContain('Claude Code');
    expect(output).toContain('Disabled');
  });

  test('shows failures below table in red', () => {
    const hooks: HookStatus[] = [
      {
        platform: 'claude-code',
        status: 'configured',
        selfTest: {
          passed: 2,
          failed: 1,
          total: 3,
          results: [
            {
              command: 'git reset --hard',
              description: 'git reset --hard',
              expected: 'blocked',
              actual: 'blocked',
              passed: true,
            },
            {
              command: 'rm -rf /',
              description: 'rm -rf /',
              expected: 'blocked',
              actual: 'allowed',
              passed: false,
            },
          ],
        },
      },
    ];

    const output = formatHooksSection(hooks);
    expect(output).toContain('2/3 FAIL');
    expect(output).toContain('Failures:');
    expect(output).toContain('Claude Code: rm -rf /');
    expect(output).toContain('expected blocked, got allowed');
  });
});

describe('formatEnvironmentSection', () => {
  test('formats environment variables as table', () => {
    const envVars = getEnvironmentInfo();
    const output = formatEnvironmentSection(envVars);
    expect(output).toContain('Environment');
    // Should be a table with Variable and Status columns
    expect(output).toContain('Variable');
    expect(output).toContain('Status');
    expect(output).toContain('SAFETY_NET_STRICT');
    // Should have table borders
    expect(output).toContain('┌');
    expect(output).toContain('┘');
  });

  test('shows ✓ for enabled variables', () => {
    const envVars = [
      {
        name: 'SAFETY_NET_STRICT',
        description: 'Fail-closed',
        defaultBehavior: 'permissive',
        value: '1',
        isSet: true,
      },
    ];
    const output = formatEnvironmentSection(envVars);
    expect(output).toContain('✓');
  });

  test('shows ✗ for disabled variables', () => {
    const envVars = [
      {
        name: 'SAFETY_NET_STRICT',
        description: 'Fail-closed',
        defaultBehavior: 'permissive',
        value: undefined,
        isSet: false,
      },
    ];
    const output = formatEnvironmentSection(envVars);
    expect(output).toContain('✗');
  });
});

describe('formatActivitySection', () => {
  test('formats empty activity', () => {
    const activity = { totalBlocked: 0, sessionCount: 0, recentEntries: [] };
    const output = formatActivitySection(activity);
    expect(output).toContain('Recent Activity');
    expect(output).toContain('No blocked commands');
  });

  test('formats activity with entries', () => {
    const activity = {
      totalBlocked: 3,
      sessionCount: 2,
      recentEntries: [
        {
          timestamp: '2025-01-01T00:00:00Z',
          command: 'git reset --hard',
          reason: 'Blocked',
          relativeTime: '1h ago',
        },
      ],
    };
    const output = formatActivitySection(activity);
    // Header now shows summary in compact format
    expect(output).toContain('3 blocked');
    expect(output).toContain('2 sessions');
    // Table format
    expect(output).toContain('Time');
    expect(output).toContain('Command');
    expect(output).toContain('1h ago');
    expect(output).toContain('git reset --hard');
    // Should have table borders
    expect(output).toContain('┌');
    expect(output).toContain('┘');
  });
});

describe('formatUpdateSection', () => {
  test('formats update available as table', () => {
    const update = {
      currentVersion: '0.6.0',
      latestVersion: '0.7.0',
      updateAvailable: true,
    };
    const output = formatUpdateSection(update);
    expect(output).toContain('Update Check');
    expect(output).toContain('Update Available');
    expect(output).toContain('0.6.0');
    expect(output).toContain('0.7.0');
    expect(output).toContain('bunx');
    expect(output).toContain('npx');
    // Should have table borders
    expect(output).toContain('┌');
    expect(output).toContain('┘');
  });

  test('formats up to date as table', () => {
    const update = {
      currentVersion: '0.7.0',
      latestVersion: '0.7.0',
      updateAvailable: false,
    };
    const output = formatUpdateSection(update);
    expect(output).toContain('Update Check');
    expect(output).toContain('Up to date');
    expect(output).toContain('0.7.0');
    // Should have table borders
    expect(output).toContain('┌');
    expect(output).toContain('┘');
  });

  test('formats skipped update check as table', () => {
    const update = {
      currentVersion: '0.6.0',
      latestVersion: null,
      updateAvailable: false,
    };
    const output = formatUpdateSection(update);
    expect(output).toContain('Update Check');
    expect(output).toContain('Skipped');
    expect(output).toContain('0.6.0');
    // Should have table borders
    expect(output).toContain('┌');
    expect(output).toContain('┘');
  });

  test('formats error as table', () => {
    const update = {
      currentVersion: '0.6.0',
      latestVersion: null,
      updateAvailable: false,
      error: 'Network error',
    };
    const output = formatUpdateSection(update);
    expect(output).toContain('Update Check');
    expect(output).toContain('Error');
    expect(output).toContain('0.6.0');
    expect(output).toContain('Network error');
    // Should have table borders
    expect(output).toContain('┌');
    expect(output).toContain('┘');
  });
});

describe('formatSystemInfoSection', () => {
  test('formats system info as table', async () => {
    const sysInfo = await getSystemInfo(mockVersionFetcher);
    const output = formatSystemInfoSection(sysInfo);
    expect(output).toContain('System Info');
    // Table headers
    expect(output).toContain('Component');
    expect(output).toContain('Version');
    // Component names (without colons since it's a table)
    expect(output).toContain('cc-safety-net');
    expect(output).toContain('Platform');
    expect(output).toContain('Bun');
    // Should have table borders
    expect(output).toContain('┌');
    expect(output).toContain('┘');
  });

  test('formats null versions as "not found"', () => {
    const sysInfo = {
      version: 'dev',
      claudeCodeVersion: null,
      openCodeVersion: null,
      geminiCliVersion: null,
      nodeVersion: '22.0.0',
      npmVersion: null,
      bunVersion: '1.0.0',
      platform: 'darwin arm64',
    };
    const output = formatSystemInfoSection(sysInfo);
    expect(output).toContain('not found');
  });
});

describe('formatConfigSection', () => {
  test('formats config with no rules', () => {
    const report: DoctorReport = {
      hooks: [],
      userConfig: {
        path: '/home/user/.cc-safety-net/config.json',
        exists: false,
        valid: false,
        ruleCount: 0,
      },
      projectConfig: {
        path: './.safety-net.json',
        exists: false,
        valid: false,
        ruleCount: 0,
      },
      effectiveRules: [],
      shadowedRules: [],
      environment: [],
      activity: { totalBlocked: 0, sessionCount: 0, recentEntries: [] },
      update: {
        currentVersion: '0.6.0',
        latestVersion: '0.6.0',
        updateAvailable: false,
      },
      system: {
        version: '0.6.0',
        claudeCodeVersion: '1.0.0',
        openCodeVersion: '0.1.0',
        geminiCliVersion: null,
        nodeVersion: '22.0.0',
        npmVersion: '10.0.0',
        bunVersion: '1.0.0',
        platform: 'darwin arm64',
      },
    };
    const output = formatConfigSection(report);
    expect(output).toContain('Configuration');
    expect(output).toContain('User');
    expect(output).toContain('Project');
    expect(output).toContain('N/A');
  });

  test('formats config with shadow warnings', () => {
    const report: DoctorReport = {
      hooks: [],
      userConfig: {
        path: '/home/user/.cc-safety-net/config.json',
        exists: true,
        valid: true,
        ruleCount: 1,
      },
      projectConfig: {
        path: './.safety-net.json',
        exists: true,
        valid: true,
        ruleCount: 1,
      },
      effectiveRules: [
        {
          source: 'project',
          name: 'test-rule',
          command: 'test',
          blockArgs: ['--flag'],
          reason: 'Test',
        },
      ],
      shadowedRules: [{ name: 'test-rule', shadowedBy: 'project' }],
      environment: [],
      activity: { totalBlocked: 0, sessionCount: 0, recentEntries: [] },
      update: {
        currentVersion: '0.6.0',
        latestVersion: '0.6.0',
        updateAvailable: false,
      },
      system: {
        version: '0.6.0',
        claudeCodeVersion: '1.0.0',
        openCodeVersion: '0.1.0',
        geminiCliVersion: null,
        nodeVersion: '22.0.0',
        npmVersion: '10.0.0',
        bunVersion: '1.0.0',
        platform: 'darwin arm64',
      },
    };
    const output = formatConfigSection(report);
    expect(output).toContain('shadows user rule');
  });

  test('formats config with invalid config showing errors', () => {
    const report: DoctorReport = {
      hooks: [],
      userConfig: {
        path: '/home/user/.cc-safety-net/config.json',
        exists: true,
        valid: false,
        ruleCount: 0,
        errors: ['Invalid version: expected 1, got 99'],
      },
      projectConfig: {
        path: './.safety-net.json',
        exists: true,
        valid: false,
        ruleCount: 0,
        errors: ['Malformed JSON'],
      },
      effectiveRules: [],
      shadowedRules: [],
      environment: [],
      activity: { totalBlocked: 0, sessionCount: 0, recentEntries: [] },
      update: {
        currentVersion: '0.6.0',
        latestVersion: '0.6.0',
        updateAvailable: false,
      },
      system: {
        version: '0.6.0',
        claudeCodeVersion: '1.0.0',
        openCodeVersion: '0.1.0',
        geminiCliVersion: null,
        nodeVersion: '22.0.0',
        npmVersion: '10.0.0',
        bunVersion: '1.0.0',
        platform: 'darwin arm64',
      },
    };
    const output = formatConfigSection(report);
    expect(output).toContain('Invalid');
    expect(output).toContain('Invalid version: expected 1, got 99');
    expect(output).toContain('Malformed JSON');
  });
});

describe('formatSummary', () => {
  test('formats all passed', () => {
    const report: DoctorReport = {
      hooks: [{ platform: 'claude-code', status: 'configured' }],
      userConfig: { path: '', exists: false, valid: false, ruleCount: 0 },
      projectConfig: { path: '', exists: false, valid: false, ruleCount: 0 },
      effectiveRules: [],
      shadowedRules: [],
      environment: [],
      activity: { totalBlocked: 1, sessionCount: 1, recentEntries: [] },
      update: { currentVersion: '0.6.0', latestVersion: '0.6.0', updateAvailable: false },
      system: {
        version: '0.6.0',
        claudeCodeVersion: null,
        openCodeVersion: null,
        geminiCliVersion: null,
        nodeVersion: '22.0.0',
        npmVersion: '10.0.0',
        bunVersion: '1.0.0',
        platform: 'darwin',
      },
    };
    const output = formatSummary(report);
    expect(output).toContain('All checks passed');
  });

  test('formats with warnings', () => {
    const report: DoctorReport = {
      hooks: [{ platform: 'claude-code', status: 'configured' }],
      userConfig: { path: '', exists: false, valid: false, ruleCount: 0 },
      projectConfig: { path: '', exists: false, valid: false, ruleCount: 0 },
      effectiveRules: [],
      shadowedRules: [],
      environment: [],
      activity: { totalBlocked: 0, sessionCount: 0, recentEntries: [] },
      update: { currentVersion: '0.6.0', latestVersion: '0.7.0', updateAvailable: true },
      system: {
        version: '0.6.0',
        claudeCodeVersion: null,
        openCodeVersion: null,
        geminiCliVersion: null,
        nodeVersion: '22.0.0',
        npmVersion: '10.0.0',
        bunVersion: '1.0.0',
        platform: 'darwin',
      },
    };
    const output = formatSummary(report);
    expect(output).toContain('warning');
  });

  test('formats with failures', () => {
    const report: DoctorReport = {
      hooks: [],
      userConfig: { path: '', exists: false, valid: false, ruleCount: 0 },
      projectConfig: { path: '', exists: false, valid: false, ruleCount: 0 },
      effectiveRules: [],
      shadowedRules: [],
      environment: [],
      activity: { totalBlocked: 0, sessionCount: 0, recentEntries: [] },
      update: { currentVersion: '0.6.0', latestVersion: '0.6.0', updateAvailable: false },
      system: {
        version: '0.6.0',
        claudeCodeVersion: null,
        openCodeVersion: null,
        geminiCliVersion: null,
        nodeVersion: '22.0.0',
        npmVersion: '10.0.0',
        bunVersion: '1.0.0',
        platform: 'darwin',
      },
    };
    const output = formatSummary(report);
    expect(output).toContain('failed');
  });
});
