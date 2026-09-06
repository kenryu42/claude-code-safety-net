import { describe, expect, test } from 'bun:test';
import type { RulesConfig } from '@/core/policy/rules-config';
import { getRemoveMatches, getSelectedUpdateSpecs } from '@/rules-manager/sources';

/**
 * Which configured sources a match string selects decides which files `rule remove` deletes and
 * which sources `rule update` refetches, so a widened match removes a rulebook the user meant to
 * keep. One fixed config carries every shape that can collide — two refs of one repository, one
 * rulebook name under both, a name unique to a third — and each row resolves its match before
 * the refusal wording is pinned.
 */

const CONFIGURED = [
  'local-a',
  'acme/repo#main/x',
  'acme/repo#v2/x',
  'acme/repo#main/y',
  'other/repo#main/z',
];

const CONFIG: RulesConfig = {
  version: 1,
  rules: CONFIGURED,
  overrides: {},
  transparent_wrappers: [],
};

const MATCHES = [
  'acme/repo#main/x',
  'local-a',
  'z',
  'x',
  'other/repo',
  'acme/repo',
  'acme/repo#main',
  'nope',
  'acme/repo#main/absent',
];

/** The resolved match, pinned before the row asserts on it. */
function removeMatches(match: string) {
  const ported = getRemoveMatches(CONFIGURED, match);
  expect(ported).toMatchSnapshot();
  return ported;
}

describe('a remove match selects what the shipped module selects', () => {
  test.each(MATCHES)('resolves %s', (match) => {
    removeMatches(match);
  });

  test('an exact spec and a local source select themselves', () => {
    expect(removeMatches('acme/repo#main/x')).toEqual({ ok: true, specs: ['acme/repo#main/x'] });
    expect(removeMatches('local-a')).toEqual({ ok: true, specs: ['local-a'] });
  });

  test('a repository selects every ref when only one is configured', () => {
    expect(removeMatches('other/repo')).toEqual({ ok: true, specs: ['other/repo#main/z'] });
    expect(removeMatches('acme/repo#main')).toEqual({
      ok: true,
      specs: ['acme/repo#main/x', 'acme/repo#main/y'],
    });
  });

  test('a rulebook name selects the one spec that carries it', () => {
    expect(removeMatches('z')).toEqual({ ok: true, specs: ['other/repo#main/z'] });
  });

  test('a name carried by two specs is ambiguous', () => {
    expect(removeMatches('x')).toEqual({
      ok: false,
      result: {
        ok: false,
        errors: ['Ambiguous rulebook match x: acme/repo#main/x, acme/repo#v2/x'],
        entries: [],
      },
    });
  });

  test('a repository with two configured refs asks for an explicit one', () => {
    expect(removeMatches('acme/repo')).toEqual({
      ok: false,
      result: {
        ok: false,
        errors: [
          'Multiple refs are configured for acme/repo. Use an explicit ref:',
          '  cc-safety-net rule remove acme/repo#<ref>',
        ],
        entries: [],
      },
    });
  });

  test('an unconfigured match names no rulebook, whatever its syntax', () => {
    expect(removeMatches('nope')).toEqual({
      ok: false,
      result: { ok: false, errors: ['No configured rulebook matches nope'], entries: [] },
    });
    expect(removeMatches('acme/repo#main/absent')).toEqual({
      ok: false,
      result: {
        ok: false,
        errors: ['No configured rulebook matches acme/repo#main/absent'],
        entries: [],
      },
    });
  });
});

describe('an update selection matches what the shipped module selects', () => {
  test.each(MATCHES)('resolves %s', (match) => {
    expect(getSelectedUpdateSpecs(CONFIG, match)).toMatchSnapshot();
  });

  // `update` knows exact specs and rulebook names only: a repository is not a selection there,
  // so `acme/repo` reports no match rather than the two refs `remove` would have offered.
  test('a repository is not an update selection', () => {
    expect(getSelectedUpdateSpecs(CONFIG, 'acme/repo')).toEqual({
      ok: false,
      result: { ok: false, errors: ['No configured rulebook matches acme/repo'], entries: [] },
    });
    expect(getSelectedUpdateSpecs(CONFIG, 'z')).toEqual({ ok: true, specs: ['other/repo#main/z'] });
  });
});
