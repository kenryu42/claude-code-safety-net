import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

function clearEnv(): void {
  delete process.env.SAFETY_NET_STRICT;
  delete process.env.SAFETY_NET_PARANOID;
  delete process.env.SAFETY_NET_PARANOID_RM;
  delete process.env.SAFETY_NET_PARANOID_INTERPRETERS;
  delete process.env.SAFETY_NET_WORKTREE;
  delete process.env.CLAUDE_SETTINGS_PATH;
}

describe('--statusline flag', () => {
  // Create a temp settings file with plugin enabled to test statusline modes
  // When settings file doesn't exist, isPluginEnabled() defaults to false (disabled)
  let tempDir: string;
  let enabledSettingsPath: string;

  beforeEach(async () => {
    clearEnv();
    tempDir = await mkdtemp(join(tmpdir(), 'safety-net-statusline-'));
    enabledSettingsPath = join(tempDir, 'settings.json');
    await writeFile(
      enabledSettingsPath,
      JSON.stringify({
        enabledPlugins: { 'safety-net@cc-marketplace': true },
      }),
    );
    process.env.CLAUDE_SETTINGS_PATH = enabledSettingsPath;
  });

  afterEach(async () => {
    clearEnv();
    await rm(tempDir, { recursive: true, force: true });
  });

  // 1. Enabled with no mode flags → ✅
  test('outputs enabled status with no env flags', async () => {
    const proc = Bun.spawn(['bun', 'src/bin/cc-safety-net.ts', '--statusline'], {
      stdout: 'pipe',
      stderr: 'pipe',
      env: { ...process.env, CLAUDE_SETTINGS_PATH: enabledSettingsPath },
    });

    const output = await new Response(proc.stdout).text();
    const exitCode = await proc.exited;

    expect(output.trim()).toBe('🛡️ Safety Net ✅');
    expect(exitCode).toBe(0);
  });

  // 3. Enabled + Strict → 🔒 (replaces ✅)
  test('shows strict mode emoji when SAFETY_NET_STRICT=1', async () => {
    const proc = Bun.spawn(['bun', 'src/bin/cc-safety-net.ts', '--statusline'], {
      stdout: 'pipe',
      stderr: 'pipe',
      env: { ...process.env, CLAUDE_SETTINGS_PATH: enabledSettingsPath, SAFETY_NET_STRICT: '1' },
    });

    const output = await new Response(proc.stdout).text();
    const exitCode = await proc.exited;

    expect(output.trim()).toBe('🛡️ Safety Net 🔒');
    expect(exitCode).toBe(0);
  });

  // 4. Enabled + Paranoid → 👁️
  test('shows paranoid emoji when SAFETY_NET_PARANOID=1', async () => {
    const proc = Bun.spawn(['bun', 'src/bin/cc-safety-net.ts', '--statusline'], {
      stdout: 'pipe',
      stderr: 'pipe',
      env: { ...process.env, CLAUDE_SETTINGS_PATH: enabledSettingsPath, SAFETY_NET_PARANOID: '1' },
    });

    const output = await new Response(proc.stdout).text();
    const exitCode = await proc.exited;

    expect(output.trim()).toBe('🛡️ Safety Net 👁️');
    expect(exitCode).toBe(0);
  });

  test('shows worktree emoji when SAFETY_NET_WORKTREE=1', async () => {
    const proc = Bun.spawn(['bun', 'src/bin/cc-safety-net.ts', '--statusline'], {
      stdout: 'pipe',
      stderr: 'pipe',
      env: { ...process.env, CLAUDE_SETTINGS_PATH: enabledSettingsPath, SAFETY_NET_WORKTREE: '1' },
    });

    const output = await new Response(proc.stdout).text();
    const exitCode = await proc.exited;

    expect(output.trim()).toBe('🛡️ Safety Net 🌳');
    expect(exitCode).toBe(0);
  });

  // 7. Enabled + Strict + Paranoid → 🔒👁️ (concatenated)
  test('shows strict + paranoid emojis when both set', async () => {
    const proc = Bun.spawn(['bun', 'src/bin/cc-safety-net.ts', '--statusline'], {
      stdout: 'pipe',
      stderr: 'pipe',
      env: {
        ...process.env,
        CLAUDE_SETTINGS_PATH: enabledSettingsPath,
        SAFETY_NET_STRICT: '1',
        SAFETY_NET_PARANOID: '1',
      },
    });

    const output = await new Response(proc.stdout).text();
    const exitCode = await proc.exited;

    expect(output.trim()).toBe('🛡️ Safety Net 🔒👁️');
    expect(exitCode).toBe(0);
  });

  // 5. Enabled + Paranoid RM only → 🗑️
  test('shows rm emoji when SAFETY_NET_PARANOID_RM=1 only', async () => {
    const proc = Bun.spawn(['bun', 'src/bin/cc-safety-net.ts', '--statusline'], {
      stdout: 'pipe',
      stderr: 'pipe',
      env: {
        ...process.env,
        CLAUDE_SETTINGS_PATH: enabledSettingsPath,
        SAFETY_NET_PARANOID_RM: '1',
      },
    });

    const output = await new Response(proc.stdout).text();
    const exitCode = await proc.exited;

    expect(output.trim()).toBe('🛡️ Safety Net 🗑️');
    expect(exitCode).toBe(0);
  });

  // 8. Enabled + Strict + Paranoid RM only → 🔒🗑️
  test('shows strict + rm emoji when STRICT and PARANOID_RM set', async () => {
    const proc = Bun.spawn(['bun', 'src/bin/cc-safety-net.ts', '--statusline'], {
      stdout: 'pipe',
      stderr: 'pipe',
      env: {
        ...process.env,
        CLAUDE_SETTINGS_PATH: enabledSettingsPath,
        SAFETY_NET_STRICT: '1',
        SAFETY_NET_PARANOID_RM: '1',
      },
    });

    const output = await new Response(proc.stdout).text();
    const exitCode = await proc.exited;

    expect(output.trim()).toBe('🛡️ Safety Net 🔒🗑️');
    expect(exitCode).toBe(0);
  });

  // 6. Enabled + Paranoid Interpreters only → 🐚
  test('shows interpreters emoji when SAFETY_NET_PARANOID_INTERPRETERS=1', async () => {
    const proc = Bun.spawn(['bun', 'src/bin/cc-safety-net.ts', '--statusline'], {
      stdout: 'pipe',
      stderr: 'pipe',
      env: {
        ...process.env,
        CLAUDE_SETTINGS_PATH: enabledSettingsPath,
        SAFETY_NET_PARANOID_INTERPRETERS: '1',
      },
    });

    const output = await new Response(proc.stdout).text();
    const exitCode = await proc.exited;

    expect(output.trim()).toBe('🛡️ Safety Net 🐚');
    expect(exitCode).toBe(0);
  });

  // 9. Enabled + Strict + Paranoid Interpreters only → 🔒🐚
  test('shows strict + interpreters emoji', async () => {
    const proc = Bun.spawn(['bun', 'src/bin/cc-safety-net.ts', '--statusline'], {
      stdout: 'pipe',
      stderr: 'pipe',
      env: {
        ...process.env,
        CLAUDE_SETTINGS_PATH: enabledSettingsPath,
        SAFETY_NET_STRICT: '1',
        SAFETY_NET_PARANOID_INTERPRETERS: '1',
      },
    });

    const output = await new Response(proc.stdout).text();
    const exitCode = await proc.exited;

    expect(output.trim()).toBe('🛡️ Safety Net 🔒🐚');
    expect(exitCode).toBe(0);
  });

  // 4/7. PARANOID_RM + PARANOID_INTERPRETERS together → 👁️ (same as PARANOID)
  test('shows paranoid emoji when both PARANOID_RM and PARANOID_INTERPRETERS set', async () => {
    const proc = Bun.spawn(['bun', 'src/bin/cc-safety-net.ts', '--statusline'], {
      stdout: 'pipe',
      stderr: 'pipe',
      env: {
        ...process.env,
        CLAUDE_SETTINGS_PATH: enabledSettingsPath,
        SAFETY_NET_PARANOID_RM: '1',
        SAFETY_NET_PARANOID_INTERPRETERS: '1',
      },
    });

    const output = await new Response(proc.stdout).text();
    const exitCode = await proc.exited;

    expect(output.trim()).toBe('🛡️ Safety Net 👁️');
    expect(exitCode).toBe(0);
  });

  // 7. Strict + PARANOID_RM + PARANOID_INTERPRETERS → 🔒👁️
  test('shows strict + paranoid when all three flags set', async () => {
    const proc = Bun.spawn(['bun', 'src/bin/cc-safety-net.ts', '--statusline'], {
      stdout: 'pipe',
      stderr: 'pipe',
      env: {
        ...process.env,
        CLAUDE_SETTINGS_PATH: enabledSettingsPath,
        SAFETY_NET_STRICT: '1',
        SAFETY_NET_PARANOID_RM: '1',
        SAFETY_NET_PARANOID_INTERPRETERS: '1',
      },
    });

    const output = await new Response(proc.stdout).text();
    const exitCode = await proc.exited;

    expect(output.trim()).toBe('🛡️ Safety Net 🔒👁️');
    expect(exitCode).toBe(0);
  });
});

describe('--statusline enabled/disabled detection', () => {
  let tempDir: string;

  beforeEach(async () => {
    clearEnv();
    tempDir = await mkdtemp(join(tmpdir(), 'safety-net-test-'));
  });

  afterEach(async () => {
    clearEnv();
    await rm(tempDir, { recursive: true, force: true });
  });

  test('shows ❌ when plugin is disabled in settings', async () => {
    const settingsPath = join(tempDir, 'settings.json');
    await writeFile(
      settingsPath,
      JSON.stringify({
        enabledPlugins: {
          'safety-net@cc-marketplace': false,
        },
      }),
    );

    const proc = Bun.spawn(['bun', 'src/bin/cc-safety-net.ts', '--statusline'], {
      stdout: 'pipe',
      stderr: 'pipe',
      env: { ...process.env, CLAUDE_SETTINGS_PATH: settingsPath },
    });

    const output = await new Response(proc.stdout).text();
    const exitCode = await proc.exited;

    expect(output.trim()).toBe('🛡️ Safety Net ❌');
    expect(exitCode).toBe(0);
  });

  test('shows ✅ when plugin is enabled in settings', async () => {
    const settingsPath = join(tempDir, 'settings.json');
    await writeFile(
      settingsPath,
      JSON.stringify({
        enabledPlugins: {
          'safety-net@cc-marketplace': true,
        },
      }),
    );

    const proc = Bun.spawn(['bun', 'src/bin/cc-safety-net.ts', '--statusline'], {
      stdout: 'pipe',
      stderr: 'pipe',
      env: { ...process.env, CLAUDE_SETTINGS_PATH: settingsPath },
    });

    const output = await new Response(proc.stdout).text();
    const exitCode = await proc.exited;

    expect(output.trim()).toBe('🛡️ Safety Net ✅');
    expect(exitCode).toBe(0);
  });

  test('shows ❌ when settings file does not exist (default disabled)', async () => {
    const settingsPath = join(tempDir, 'nonexistent.json');

    const proc = Bun.spawn(['bun', 'src/bin/cc-safety-net.ts', '--statusline'], {
      stdout: 'pipe',
      stderr: 'pipe',
      env: { ...process.env, CLAUDE_SETTINGS_PATH: settingsPath },
    });

    const output = await new Response(proc.stdout).text();
    const exitCode = await proc.exited;

    expect(output.trim()).toBe('🛡️ Safety Net ❌');
    expect(exitCode).toBe(0);
  });

  test('shows ❌ when enabledPlugins key is missing (default disabled)', async () => {
    const settingsPath = join(tempDir, 'settings.json');
    await writeFile(settingsPath, JSON.stringify({ model: 'opus' }));

    const proc = Bun.spawn(['bun', 'src/bin/cc-safety-net.ts', '--statusline'], {
      stdout: 'pipe',
      stderr: 'pipe',
      env: { ...process.env, CLAUDE_SETTINGS_PATH: settingsPath },
    });

    const output = await new Response(proc.stdout).text();
    const exitCode = await proc.exited;

    expect(output.trim()).toBe('🛡️ Safety Net ❌');
    expect(exitCode).toBe(0);
  });

  test('disabled plugin ignores mode flags (shows ❌ only)', async () => {
    const settingsPath = join(tempDir, 'settings.json');
    await writeFile(
      settingsPath,
      JSON.stringify({
        enabledPlugins: {
          'safety-net@cc-marketplace': false,
        },
      }),
    );

    const proc = Bun.spawn(['bun', 'src/bin/cc-safety-net.ts', '--statusline'], {
      stdout: 'pipe',
      stderr: 'pipe',
      env: {
        ...process.env,
        CLAUDE_SETTINGS_PATH: settingsPath,
        SAFETY_NET_STRICT: '1',
        SAFETY_NET_PARANOID: '1',
      },
    });

    const output = await new Response(proc.stdout).text();
    const exitCode = await proc.exited;

    expect(output.trim()).toBe('🛡️ Safety Net ❌');
    expect(exitCode).toBe(0);
  });

  test('enabled plugin with modes shows mode emojis', async () => {
    const settingsPath = join(tempDir, 'settings.json');
    await writeFile(
      settingsPath,
      JSON.stringify({
        enabledPlugins: {
          'safety-net@cc-marketplace': true,
        },
      }),
    );

    const proc = Bun.spawn(['bun', 'src/bin/cc-safety-net.ts', '--statusline'], {
      stdout: 'pipe',
      stderr: 'pipe',
      env: {
        ...process.env,
        CLAUDE_SETTINGS_PATH: settingsPath,
        SAFETY_NET_STRICT: '1',
      },
    });

    const output = await new Response(proc.stdout).text();
    const exitCode = await proc.exited;

    expect(output.trim()).toBe('🛡️ Safety Net 🔒');
    expect(exitCode).toBe(0);
  });
});
