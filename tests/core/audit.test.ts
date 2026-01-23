import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { redactSecrets, sanitizeSessionIdForFilename, writeAuditLog } from '@/core/audit';
import type { AuditLogEntry } from '@/types';

describe('sanitizeSessionIdForFilename', () => {
  test('returns valid session id unchanged', () => {
    expect(sanitizeSessionIdForFilename('test-session-123')).toBe('test-session-123');
  });

  test('replaces invalid characters with underscores', () => {
    expect(sanitizeSessionIdForFilename('test/session')).toBe('test_session');
    expect(sanitizeSessionIdForFilename('test\\session')).toBe('test_session');
    expect(sanitizeSessionIdForFilename('test:session')).toBe('test_session');
  });

  test('strips leading/trailing special chars', () => {
    expect(sanitizeSessionIdForFilename('.session')).toBe('session');
    expect(sanitizeSessionIdForFilename('session.')).toBe('session');
    expect(sanitizeSessionIdForFilename('-session-')).toBe('session');
    expect(sanitizeSessionIdForFilename('_session_')).toBe('session');
  });

  test('returns null for empty or invalid input', () => {
    expect(sanitizeSessionIdForFilename('')).toBeNull();
    expect(sanitizeSessionIdForFilename('   ')).toBeNull();
    expect(sanitizeSessionIdForFilename('...')).toBeNull();
    expect(sanitizeSessionIdForFilename('..')).toBeNull();
    expect(sanitizeSessionIdForFilename('.')).toBeNull();
  });

  test('truncates long session ids', () => {
    const longId = 'a'.repeat(200);
    const result = sanitizeSessionIdForFilename(longId);
    expect(result?.length).toBeLessThanOrEqual(128);
  });

  test('handles path traversal attempts', () => {
    const result = sanitizeSessionIdForFilename('../../etc/passwd');
    expect(result).not.toContain('/');
    expect(result).not.toContain('..');
  });
});

describe('redactSecrets', () => {
  test('redacts TOKEN=value patterns', () => {
    const result = redactSecrets('TOKEN=secret123 git reset --hard');
    expect(result).toContain('<redacted>');
    expect(result).not.toContain('secret123');
  });

  test('redacts API_KEY patterns', () => {
    const result = redactSecrets('API_KEY=mysecretkey');
    expect(result).toContain('<redacted>');
    expect(result).not.toContain('mysecretkey');
  });

  test('redacts GitHub tokens', () => {
    const result = redactSecrets('ghp_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx');
    expect(result).toBe('<redacted>');
  });

  test('redacts URL credentials', () => {
    const result = redactSecrets('https://user:password@example.com');
    expect(result).not.toContain('password');
    expect(result).toContain('<redacted>');
  });

  test('preserves non-secret content', () => {
    const result = redactSecrets('git reset --hard');
    expect(result).toBe('git reset --hard');
  });

  test('redacts Authorization Bearer token', () => {
    const result = redactSecrets('curl -H "Authorization: Bearer abc123" https://example.com');
    expect(result).not.toContain('abc123');
    expect(result).toContain('<redacted>');
  });

  test('redacts Authorization Basic token', () => {
    const result = redactSecrets("curl -H 'Authorization: Basic abc123' https://example.com");
    expect(result).not.toContain('abc123');
    expect(result).toContain('<redacted>');
  });
});

describe('writeAuditLog', () => {
  let testDir: string;

  beforeEach(() => {
    testDir = join(
      tmpdir(),
      `safety-net-test-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    );
    mkdirSync(testDir, { recursive: true });
  });

  afterEach(() => {
    if (existsSync(testDir)) {
      rmSync(testDir, { recursive: true, force: true });
    }
  });

  function getLogFile(sessionId: string): string {
    return join(testDir, '.cc-safety-net', 'logs', `${sessionId}.jsonl`);
  }

  function readLogEntries(sessionId: string): AuditLogEntry[] {
    const logFile = getLogFile(sessionId);
    if (!existsSync(logFile)) {
      return [];
    }
    const content = readFileSync(logFile, 'utf-8');
    return content
      .split('\n')
      .filter((line) => line.trim())
      .map((line) => JSON.parse(line) as AuditLogEntry);
  }

  test('denied command creates log entry', () => {
    const sessionId = 'test-session-123';
    writeAuditLog(
      sessionId,
      'git reset --hard',
      'git reset --hard',
      'git reset --hard destroys uncommitted changes',
      '/home/user/project',
      { homeDir: testDir },
    );

    const entries = readLogEntries(sessionId);
    expect(entries.length).toBe(1);
    expect(entries[0]?.command).toContain('git reset --hard');
  });

  test('log format has correct fields', () => {
    const sessionId = 'test-session-789';
    writeAuditLog(
      sessionId,
      'git reset --hard',
      'git reset --hard',
      'git reset --hard destroys uncommitted changes',
      '/home/user/project',
      { homeDir: testDir },
    );

    const entries = readLogEntries(sessionId);
    expect(entries.length).toBe(1);

    expect(entries[0]).toHaveProperty('ts');
    expect(entries[0]).toHaveProperty('command');
    expect(entries[0]).toHaveProperty('segment');
    expect(entries[0]).toHaveProperty('reason');
    expect(entries[0]).toHaveProperty('cwd');

    expect(entries[0]?.cwd).toBe('/home/user/project');
    expect(entries[0]?.reason).toContain('git reset --hard');
  });

  test('log redacts secrets', () => {
    const sessionId = 'test-session-redact';
    writeAuditLog(
      sessionId,
      'TOKEN=secret123 git reset --hard',
      'TOKEN=secret123 git reset --hard',
      'git reset --hard destroys uncommitted changes',
      null,
      { homeDir: testDir },
    );

    const entries = readLogEntries(sessionId);
    expect(entries.length).toBe(1);
    expect(entries[0]?.command).not.toContain('secret123');
    expect(entries[0]?.command).toContain('<redacted>');
  });

  test('missing session id creates no log', () => {
    // Empty session ID
    writeAuditLog('', 'git reset --hard', 'git reset --hard', 'reason', null, {
      homeDir: testDir,
    });

    const logsDir = join(testDir, '.cc-safety-net', 'logs');
    if (existsSync(logsDir)) {
      const files = readdirSync(logsDir);
      expect(files.length).toBe(0);
    }
  });

  test('multiple denials append to same log', () => {
    const sessionId = 'test-session-multi';
    writeAuditLog(sessionId, 'git reset --hard', 'git reset --hard', 'reason1', null, {
      homeDir: testDir,
    });
    writeAuditLog(sessionId, 'git clean -f', 'git clean -f', 'reason2', null, {
      homeDir: testDir,
    });
    writeAuditLog(sessionId, 'rm -rf /', 'rm -rf /', 'reason3', null, {
      homeDir: testDir,
    });

    const entries = readLogEntries(sessionId);
    expect(entries.length).toBe(3);
    expect(entries[0]?.command).toContain('git reset --hard');
    expect(entries[1]?.command).toContain('git clean -f');
    expect(entries[2]?.command).toContain('rm -rf /');
  });

  test('session id path traversal does not escape logs dir', () => {
    const sessionId = '../../outside';
    writeAuditLog(sessionId, 'git reset --hard', 'git reset --hard', 'reason', null, {
      homeDir: testDir,
    });

    // Verify no file was created outside the logs dir
    expect(existsSync(join(testDir, 'outside.jsonl'))).toBe(false);

    // Verify log was created in the correct location
    const logsDir = join(testDir, '.cc-safety-net', 'logs');
    if (existsSync(logsDir)) {
      const files = readdirSync(logsDir).filter((f) => f.endsWith('.jsonl'));
      expect(files.length).toBe(1);
      // The file should be inside logs dir
      for (const file of files) {
        const fullPath = join(logsDir, file);
        expect(fullPath.startsWith(logsDir)).toBe(true);
      }
    }
  });

  test('session id absolute path does not escape logs dir', () => {
    const sessionId = join(testDir, 'escaped');
    writeAuditLog(sessionId, 'git reset --hard', 'git reset --hard', 'reason', null, {
      homeDir: testDir,
    });

    // Verify no file was created at the escaped location
    expect(existsSync(join(testDir, 'escaped.jsonl'))).toBe(false);

    // Verify log was created in the correct location
    const logsDir = join(testDir, '.cc-safety-net', 'logs');
    if (existsSync(logsDir)) {
      const files = readdirSync(logsDir).filter((f) => f.endsWith('.jsonl'));
      expect(files.length).toBe(1);
      for (const file of files) {
        const fullPath = join(logsDir, file);
        expect(fullPath.startsWith(logsDir)).toBe(true);
      }
    }
  });

  test('cwd null when not provided', () => {
    const sessionId = 'test-session-no-cwd';
    writeAuditLog(sessionId, 'git reset --hard', 'git reset --hard', 'reason', null, {
      homeDir: testDir,
    });

    const entries = readLogEntries(sessionId);
    expect(entries.length).toBe(1);
    expect(entries[0]?.cwd).toBeNull();
  });

  test('truncates long commands', () => {
    const sessionId = 'test-session-long';
    const longCommand = `git reset --hard ${'x'.repeat(500)}`;
    writeAuditLog(sessionId, longCommand, longCommand, 'reason', null, {
      homeDir: testDir,
    });

    const entries = readLogEntries(sessionId);
    expect(entries.length).toBe(1);
    expect(entries[0]?.command.length).toBeLessThanOrEqual(300);
  });
});
