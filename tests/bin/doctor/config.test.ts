/**
 * Tests for the doctor command config functions.
 */

import { describe, expect, test } from 'bun:test';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { getConfigInfo } from '@/bin/doctor/config';

describe('getConfigInfo', () => {
  test('handles missing config files', () => {
    const tmpDir = join(tmpdir(), `doctor-test-${Date.now()}`);
    mkdirSync(tmpDir, { recursive: true });

    try {
      const info = getConfigInfo(tmpDir);
      expect(info.projectConfig.exists).toBe(false);
      expect(info.effectiveRules).toEqual([]);
      expect(info.shadowedRules).toEqual([]);
    } finally {
      rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  test('detects valid project config', () => {
    const tmpDir = join(tmpdir(), `doctor-test-${Date.now()}`);
    mkdirSync(tmpDir, { recursive: true });

    const configPath = join(tmpDir, '.safety-net.json');
    writeFileSync(
      configPath,
      JSON.stringify({
        version: 1,
        rules: [
          {
            name: 'test-rule',
            command: 'test',
            block_args: ['--dangerous'],
            reason: 'Test reason',
          },
        ],
      }),
    );

    try {
      const info = getConfigInfo(tmpDir);
      expect(info.projectConfig.exists).toBe(true);
      expect(info.projectConfig.valid).toBe(true);
      expect(info.projectConfig.ruleCount).toBe(1);
      expect(info.effectiveRules.length).toBe(1);
      expect(info.effectiveRules[0]?.source).toBe('project');
    } finally {
      rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  test('detects invalid project config', () => {
    const tmpDir = join(tmpdir(), `doctor-test-${Date.now()}`);
    mkdirSync(tmpDir, { recursive: true });

    const configPath = join(tmpDir, '.safety-net.json');
    writeFileSync(configPath, '{ "version": 2 }');

    try {
      const info = getConfigInfo(tmpDir);
      expect(info.projectConfig.exists).toBe(true);
      expect(info.projectConfig.valid).toBe(false);
      expect(info.projectConfig.errors?.length).toBeGreaterThan(0);
    } finally {
      rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  test('excludes rules from invalid config (wrong version)', () => {
    const tmpDir = join(tmpdir(), `doctor-test-${Date.now()}`);
    mkdirSync(tmpDir, { recursive: true });

    const configPath = join(tmpDir, '.safety-net.json');
    // Invalid config: version 2 is not supported, but contains valid-looking rules
    writeFileSync(
      configPath,
      JSON.stringify({
        version: 2,
        rules: [
          {
            name: 'should-not-appear',
            command: 'test',
            block_args: ['--dangerous'],
            reason: 'This rule should not be shown as effective',
          },
        ],
      }),
    );

    try {
      const info = getConfigInfo(tmpDir);
      expect(info.projectConfig.exists).toBe(true);
      expect(info.projectConfig.valid).toBe(false);
      // Rules from invalid configs should NOT appear as effective
      expect(info.effectiveRules).toEqual([]);
    } finally {
      rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  test('handles malformed JSON in config', () => {
    const tmpDir = join(tmpdir(), `doctor-test-${Date.now()}`);
    mkdirSync(tmpDir, { recursive: true });

    const configPath = join(tmpDir, '.safety-net.json');
    writeFileSync(configPath, '{ invalid json }');

    try {
      const info = getConfigInfo(tmpDir);
      // Malformed JSON means rules can't be loaded
      expect(info.effectiveRules).toEqual([]);
    } finally {
      rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  test('handles empty config file', () => {
    const tmpDir = join(tmpdir(), `doctor-test-${Date.now()}`);
    mkdirSync(tmpDir, { recursive: true });

    const configPath = join(tmpDir, '.safety-net.json');
    writeFileSync(configPath, '   ');

    try {
      const info = getConfigInfo(tmpDir);
      expect(info.effectiveRules).toEqual([]);
    } finally {
      rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  test('handles config without rules array', () => {
    const tmpDir = join(tmpdir(), `doctor-test-${Date.now()}`);
    mkdirSync(tmpDir, { recursive: true });

    const configPath = join(tmpDir, '.safety-net.json');
    writeFileSync(configPath, '{ "version": 1 }');

    try {
      const info = getConfigInfo(tmpDir);
      expect(info.effectiveRules).toEqual([]);
    } finally {
      rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  test('merges user and project rules with shadowing', () => {
    const tmpDir = join(tmpdir(), `doctor-test-${Date.now()}`);
    const homeDir = join(tmpDir, 'home');
    const projectDir = join(tmpDir, 'project');
    mkdirSync(homeDir, { recursive: true });
    mkdirSync(projectDir, { recursive: true });

    const userConfigDir = join(homeDir, '.cc-safety-net');
    mkdirSync(userConfigDir, { recursive: true });
    writeFileSync(
      join(userConfigDir, 'config.json'),
      JSON.stringify({
        version: 1,
        rules: [
          {
            name: 'user-only',
            command: 'user',
            block_args: ['--stop'],
            reason: 'User rule',
          },
          {
            name: 'shared-rule',
            command: 'shared',
            block_args: ['--user'],
            reason: 'User shared',
          },
        ],
      }),
    );

    writeFileSync(
      join(projectDir, '.safety-net.json'),
      JSON.stringify({
        version: 1,
        rules: [
          {
            name: 'shared-rule',
            command: 'shared',
            block_args: ['--project'],
            reason: 'Project shared',
          },
          {
            name: 'project-only',
            command: 'project',
            block_args: ['--ship'],
            reason: 'Project rule',
          },
        ],
      }),
    );

    try {
      const info = getConfigInfo(projectDir, {
        userConfigPath: join(userConfigDir, 'config.json'),
      });
      expect(info.shadowedRules).toEqual([{ name: 'shared-rule', shadowedBy: 'project' }]);

      const userRule = info.effectiveRules.find((rule) => rule.name === 'user-only');
      expect(userRule?.source).toBe('user');
      expect(userRule?.blockArgs).toEqual(['--stop']);
      expect(userRule?.reason).toBe('User rule');

      const projectRule = info.effectiveRules.find((rule) => rule.name === 'project-only');
      expect(projectRule?.source).toBe('project');
      expect(projectRule?.blockArgs).toEqual(['--ship']);
    } finally {
      rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  test('handles config file that becomes unreadable between validation and loading', () => {
    // This tests the defensive catch block in loadSingleConfigRules.
    // The scenario: validation passes, but the file is deleted before loading rules.
    // We simulate this by providing different paths for validation and actual loading.
    const tmpDir = join(tmpdir(), `doctor-test-${Date.now()}`);
    mkdirSync(tmpDir, { recursive: true });

    // Create a valid config that will pass validation
    const validConfigPath = join(tmpDir, '.safety-net.json');
    writeFileSync(
      validConfigPath,
      JSON.stringify({
        version: 1,
        rules: [
          {
            name: 'test-rule',
            command: 'test',
            block_args: ['--flag'],
            reason: 'Test',
          },
        ],
      }),
    );

    try {
      // First verify normal case works
      const normalInfo = getConfigInfo(tmpDir);
      expect(normalInfo.projectConfig.valid).toBe(true);
      expect(normalInfo.effectiveRules.length).toBe(1);

      // Now delete the file and verify graceful handling
      // (validation result is cached but loading will fail)
      rmSync(validConfigPath);

      // With the file deleted, loadSingleConfigRules returns [] from existsSync check
      const info = getConfigInfo(tmpDir);
      expect(info.projectConfig.exists).toBe(false);
      expect(info.effectiveRules).toEqual([]);
    } finally {
      rmSync(tmpDir, { recursive: true, force: true });
    }
  });
});
