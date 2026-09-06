import { describe, expect, test } from 'bun:test';
import { commandSignature, formatRelativeTime } from '@/audit/display';

const MINUTE_MS = 60_000;
const HOUR_MS = 60 * MINUTE_MS;
const DAY_MS = 24 * HOUR_MS;

const SIGNATURES: readonly { name: string; source: string | undefined; key: string | null }[] = [
  { name: 'strips leading assignments', source: 'FOO=1 BAR_2=x git status', key: 'git status' },
  { name: 'reduces an absolute binary to its basename', source: '/usr/bin/rm -rf /t', key: 'rm' },
  { name: 'keeps a subcommand', source: 'git push --force', key: 'git push' },
  { name: 'drops an uppercase second token', source: 'npm RUN build', key: 'npm' },
  { name: 'drops an option as a second token', source: 'ls -la', key: 'ls' },
  { name: 'has no key for assignments alone', source: 'FOO=1', key: null },
  { name: 'has no key for whitespace', source: '   ', key: null },
  { name: 'has no key for an empty string', source: '', key: null },
  { name: 'has no key for nothing at all', source: undefined, key: null },
];

/**
 * Distances that print the same text no matter which side of a millisecond the clock is read on:
 * each sits far from the boundary of the unit it prints.
 */
const DISTANCES: readonly { name: string; ago: number; text: string }[] = [
  { name: '5 seconds', ago: 5_000, text: 'just now' },
  { name: '90 seconds', ago: 90_000, text: '1m ago' },
  { name: '90 minutes', ago: 90 * MINUTE_MS, text: '1h ago' },
  { name: '30 hours', ago: 30 * HOUR_MS, text: '1d ago' },
  { name: '3 days', ago: 3 * DAY_MS, text: '3d ago' },
];

describe('audit display parity', () => {
  for (const signature of SIGNATURES) {
    test(`commandSignature ${signature.name}`, () => {
      expect(commandSignature(signature.source)).toBe(signature.key);
    });
  }

  for (const distance of DISTANCES) {
    test(`formatRelativeTime reads ${distance.name} the same way`, () => {
      expect(formatRelativeTime(new Date(Date.now() - distance.ago))).toBe(distance.text);
    });
  }

  test('formatRelativeTime has nothing to say about an unparseable timestamp', () => {
    expect(formatRelativeTime('not a timestamp')).toBe('');
  });
});
