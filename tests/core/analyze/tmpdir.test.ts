import { describe, expect, test } from 'bun:test';
import { tmpdir } from 'node:os';
import { sep } from 'node:path';
import { isTmpdirOverriddenToNonTemp } from '@/core/analyze/tmpdir';

describe('isTmpdirOverriddenToNonTemp', () => {
  test('allows known temp subpaths', () => {
    expect(isTmpdirOverriddenToNonTemp(new Map([['TMPDIR', '/tmp/subdir']]))).toBe(false);
    expect(isTmpdirOverriddenToNonTemp(new Map([['TMPDIR', '/var/tmp/subdir']]))).toBe(false);
  });

  test('blocks traversal that escapes /tmp', () => {
    expect(isTmpdirOverriddenToNonTemp(new Map([['TMPDIR', '/tmp/../root']]))).toBe(true);
  });

  test('blocks traversal that escapes /var/tmp', () => {
    expect(isTmpdirOverriddenToNonTemp(new Map([['TMPDIR', '/var/tmp/../root']]))).toBe(true);
  });

  test('blocks traversal that escapes the system tmpdir', () => {
    const systemTmpdir = tmpdir();
    const escapedTmpdir = systemTmpdir.endsWith(sep)
      ? `${systemTmpdir}..${sep}escape`
      : `${systemTmpdir}${sep}..${sep}escape`;

    expect(isTmpdirOverriddenToNonTemp(new Map([['TMPDIR', escapedTmpdir]]))).toBe(true);
  });
});
