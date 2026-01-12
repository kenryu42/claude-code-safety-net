import { describe, expect, test } from 'bun:test';
import { envAssignmentTruthy, envTruthy } from '../src/core/env.ts';

describe('envTruthy', () => {
  test("returns true for '1'", () => {
    process.env.TEST_ENV_TRUTHY = '1';
    expect(envTruthy('TEST_ENV_TRUTHY')).toBe(true);
    delete process.env.TEST_ENV_TRUTHY;
  });

  test("returns true for 'true'", () => {
    process.env.TEST_ENV_TRUTHY = 'true';
    expect(envTruthy('TEST_ENV_TRUTHY')).toBe(true);
    delete process.env.TEST_ENV_TRUTHY;
  });

  test("returns true for 'TRUE'", () => {
    process.env.TEST_ENV_TRUTHY = 'TRUE';
    expect(envTruthy('TEST_ENV_TRUTHY')).toBe(true);
    delete process.env.TEST_ENV_TRUTHY;
  });

  test("returns true for 'True'", () => {
    process.env.TEST_ENV_TRUTHY = 'True';
    expect(envTruthy('TEST_ENV_TRUTHY')).toBe(true);
    delete process.env.TEST_ENV_TRUTHY;
  });

  test("returns false for 'false'", () => {
    process.env.TEST_ENV_TRUTHY = 'false';
    expect(envTruthy('TEST_ENV_TRUTHY')).toBe(false);
    delete process.env.TEST_ENV_TRUTHY;
  });

  test("returns false for 'FALSE'", () => {
    process.env.TEST_ENV_TRUTHY = 'FALSE';
    expect(envTruthy('TEST_ENV_TRUTHY')).toBe(false);
    delete process.env.TEST_ENV_TRUTHY;
  });

  test("returns false for '0'", () => {
    process.env.TEST_ENV_TRUTHY = '0';
    expect(envTruthy('TEST_ENV_TRUTHY')).toBe(false);
    delete process.env.TEST_ENV_TRUTHY;
  });

  test('returns false for empty string', () => {
    process.env.TEST_ENV_TRUTHY = '';
    expect(envTruthy('TEST_ENV_TRUTHY')).toBe(false);
    delete process.env.TEST_ENV_TRUTHY;
  });

  test('returns false for undefined', () => {
    delete process.env.TEST_ENV_TRUTHY;
    expect(envTruthy('TEST_ENV_TRUTHY')).toBe(false);
  });

  test('returns false for random string', () => {
    process.env.TEST_ENV_TRUTHY = 'yes';
    expect(envTruthy('TEST_ENV_TRUTHY')).toBe(false);
    delete process.env.TEST_ENV_TRUTHY;
  });
});

describe('envAssignmentTruthy', () => {
  test("returns true for '1'", () => {
    const assignments = new Map<string, string>([['TEST_ENV_TRUTHY', '1']]);
    expect(envAssignmentTruthy(assignments, 'TEST_ENV_TRUTHY')).toBe(true);
  });

  test("returns true for 'true'", () => {
    const assignments = new Map<string, string>([['TEST_ENV_TRUTHY', 'true']]);
    expect(envAssignmentTruthy(assignments, 'TEST_ENV_TRUTHY')).toBe(true);
  });

  test("returns true for 'TRUE'", () => {
    const assignments = new Map<string, string>([['TEST_ENV_TRUTHY', 'TRUE']]);
    expect(envAssignmentTruthy(assignments, 'TEST_ENV_TRUTHY')).toBe(true);
  });

  test("returns false for 'false'", () => {
    const assignments = new Map<string, string>([['TEST_ENV_TRUTHY', 'false']]);
    expect(envAssignmentTruthy(assignments, 'TEST_ENV_TRUTHY')).toBe(false);
  });

  test('returns false for missing key', () => {
    const assignments = new Map<string, string>();
    expect(envAssignmentTruthy(assignments, 'TEST_ENV_TRUTHY')).toBe(false);
  });
});
