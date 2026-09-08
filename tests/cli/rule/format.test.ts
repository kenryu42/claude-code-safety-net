import { describe, expect, test } from 'bun:test';
import * as portedFormat from '@/cli/rule/format';
import { captureConsole } from '../../helpers/console-capture';

/**
 * The add and change reports over fixed result objects. A repository add is the only caller that
 * fills the `add` block, and it is unreachable without the network, so the block is handed to the
 * printers directly here and the process-level rows cover the local shapes end to end.
 */

type Printers = Pick<typeof portedFormat, 'printRuleAddResult' | 'printRuleChangeResult'>;

const SCOPE_LINE = 'Project scope: .cc-safety-net/rules/rule.json';
const CATALOG_A = { spec: 'acme/catalog#main/a', name: 'a', version: '1.0.0', ruleCount: 1 };
const CATALOG_B = { spec: 'acme/catalog#main/b', name: 'b', version: '2.1.0', ruleCount: 3 };
const LOCAL_ENTRY = { spec: 'team-rules', name: 'team-rules', version: '1.0.0', ruleCount: 1 };

const rows = [
  {
    name: 'a catalogue add names what it took, what it skipped and the commit it pinned',
    print: (printers: Printers) =>
      printers.printRuleAddResult(
        {
          ok: true,
          errors: [],
          changes: ['  + acme/catalog#main/a', '  + acme/catalog#main/b'],
          entries: [CATALOG_A, CATALOG_B],
          add: {
            source: 'acme/catalog',
            ref: 'main',
            selected: ['a', 'b', 'c'],
            added: ['a', 'b'],
            alreadyConfigured: ['c'],
            commits: ['0123456789abcdef'],
          },
        },
        'acme/catalog',
        SCOPE_LINE,
      ),
    log: [
      SCOPE_LINE,
      'Added 2 rulebooks from acme/catalog at main:',
      '  - a',
      '  - b',
      'Rulebooks already configured from acme/catalog at main: c',
      'Vendored at 0123456.',
      '  + acme/catalog#main/a',
      '  + acme/catalog#main/b',
      'Rule config updated.',
      '',
      'Active rulebooks (2):',
      '  - a 1.0.0 (1 rule)',
      '    Source: acme/catalog#main/a',
      '  - b 2.1.0 (3 rules)',
      '    Source: acme/catalog#main/b',
    ],
    error: [],
  },
  {
    name: 'one rulebook out of a catalogue is counted in the singular',
    print: (printers: Printers) =>
      printers.printRuleAddResult(
        {
          ok: true,
          errors: [],
          entries: [CATALOG_A],
          add: {
            source: 'acme/catalog',
            ref: 'main',
            selected: ['a'],
            added: ['a'],
            alreadyConfigured: [],
            commits: ['0123456789abcdef'],
          },
        },
        'acme/catalog',
        SCOPE_LINE,
      ),
    log: [
      SCOPE_LINE,
      'Added 1 rulebook from acme/catalog at main:',
      '  - a',
      'Vendored at 0123456.',
      'Rule config updated.',
      '',
      'Active rulebooks (1):',
      '  - a 1.0.0 (1 rule)',
      '    Source: acme/catalog#main/a',
    ],
    error: [],
  },
  {
    name: 'a re-add that took nothing says so without an added list or a commit line',
    print: (printers: Printers) =>
      printers.printRuleAddResult(
        {
          ok: true,
          errors: [],
          entries: [CATALOG_A],
          add: {
            source: 'acme/catalog',
            ref: 'main',
            selected: ['a'],
            added: [],
            alreadyConfigured: ['a'],
            commits: [],
          },
        },
        'acme/catalog',
        SCOPE_LINE,
      ),
    log: [
      SCOPE_LINE,
      'Rulebooks already configured from acme/catalog at main: a',
      'Rule config updated.',
      '',
      'Active rulebooks (1):',
      '  - a 1.0.0 (1 rule)',
      '    Source: acme/catalog#main/a',
    ],
    error: [],
  },
  {
    name: 'a local add carries no add block and names the source it took',
    print: (printers: Printers) =>
      printers.printRuleAddResult(
        { ok: true, errors: [], changes: ['  + team-rules'], entries: [LOCAL_ENTRY] },
        'team-rules',
        SCOPE_LINE,
      ),
    log: [
      SCOPE_LINE,
      '  + team-rules',
      'Added rulebook source: team-rules',
      '',
      'Active rulebooks (1):',
      '  - team-rules 1.0.0 (1 rule)',
      '    Source: team-rules',
    ],
    error: [],
  },
  {
    name: 'a failed local add names no scope, because it wrote nowhere',
    print: (printers: Printers) =>
      printers.printRuleAddResult(
        { ok: false, errors: ['Rulebook not found: team-rules'], entries: [] },
        'team-rules',
        SCOPE_LINE,
      ),
    log: [],
    error: ['Rulebook not found: team-rules'],
  },
  {
    name: 'a failed catalogue add reports its errors and nothing it would have taken',
    print: (printers: Printers) =>
      printers.printRuleAddResult(
        {
          ok: false,
          errors: ['Failed to fetch acme/catalog: 500'],
          entries: [],
          add: {
            source: 'acme/catalog',
            ref: 'main',
            selected: ['a'],
            added: ['a'],
            alreadyConfigured: [],
            commits: ['0123456789abcdef'],
          },
        },
        'acme/catalog',
        SCOPE_LINE,
      ),
    log: [],
    error: ['Failed to fetch acme/catalog: 500'],
  },
  {
    name: 'a scope left with nothing active says so instead of printing an empty list',
    print: (printers: Printers) =>
      printers.printRuleChangeResult(
        { ok: true, errors: [], changes: ['  - team-rules'], entries: [] },
        'Removed rulebook source: team-rules',
      ),
    log: ['  - team-rules', 'Removed rulebook source: team-rules', '', 'Active rulebooks: (none)'],
    error: [],
  },
  {
    name: 'a change that leaves one rulebook counts its single rule in the singular',
    print: (printers: Printers) =>
      printers.printRuleChangeResult(
        { ok: true, errors: [], entries: [LOCAL_ENTRY] },
        'Rule config updated.',
      ),
    log: [
      'Rule config updated.',
      '',
      'Active rulebooks (1):',
      '  - team-rules 1.0.0 (1 rule)',
      '    Source: team-rules',
    ],
    error: [],
  },
] as const;

describe('the rule report both implementations print', () => {
  for (const row of rows) {
    test(row.name, async () => {
      const ported = await captureConsole(() => row.print(portedFormat));
      expect(ported.log).toEqual([...row.log]);
      expect(ported.error).toEqual([...row.error]);
    });
  }
});
