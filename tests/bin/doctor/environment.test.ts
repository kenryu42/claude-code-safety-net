/**
 * Tests for the doctor command environment functions.
 */

import { describe, expect, test } from 'bun:test';
import { getEnvironmentInfo } from '@/bin/doctor/environment';

describe('getEnvironmentInfo', () => {
  test('returns all expected environment variables', () => {
    const envInfo = getEnvironmentInfo();

    const names = envInfo.map((v) => v.name);
    expect(names).toContain('SAFETY_NET_STRICT');
    expect(names).toContain('SAFETY_NET_PARANOID');
    expect(names).toContain('SAFETY_NET_PARANOID_RM');
    expect(names).toContain('SAFETY_NET_PARANOID_INTERPRETERS');
  });

  test('each env var has required fields', () => {
    const envInfo = getEnvironmentInfo();

    for (const v of envInfo) {
      expect(typeof v.name).toBe('string');
      expect(typeof v.description).toBe('string');
      expect(typeof v.defaultBehavior).toBe('string');
      expect(typeof v.isSet).toBe('boolean');
    }
  });
});
