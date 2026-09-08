import { afterAll, afterEach, describe, expect, test } from 'bun:test';
import { lstatSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createTestEnvironment } from '@/core/environment';
import {
  MAX_AUDIT_RETENTION_DAYS,
  MIN_AUDIT_RETENTION_DAYS,
} from '@/core/policy/audit-retention-days';
import { mergeProjectPolicy } from '@/core/policy/merge';
import { readRetentionDays } from '@/core/policy/retention';
import * as ported from '@/core/policy/store';
import { getUserPolicyDiagnostics } from '@/core/policy/validate';
import { DESTRUCTIVE_COMMAND_RULE_ID_SET } from '@/core/rules/destructive';
import { SECRET_DEFAULT_OFF_RULE_ID_SET, SECRET_PROTECTION_RULE_ID_SET } from '@/core/rules/secret';
import { snapshotTree } from '../../helpers/fixture-tree';
import { createSeededRandom, FUZZ_SEED } from '../../helpers/shell-inputs';
import { createTempRoot, removeTempRoots } from '../../helpers/temp-home';
import { mutate, USER_POLICY_VALUES } from './policy-values';

/**
 * The salvage normalizer is what the whole loader stands on: an invalid section falls back to
 * its protective default and every other section stays in force (`docs/config-recovery.md`). The
 * store takes the home directory as an argument instead of reading it from the process, so every
 * row runs against a literal home.
 */

const HOME = '/srv/home/tester';
const MUTATION_COUNT = 200;

/** The fixture documents and a seeded mutation of each, for the properties below. */
const DOCUMENTS: readonly unknown[] = (() => {
  const random = createSeededRandom(FUZZ_SEED);
  return [
    ...USER_POLICY_VALUES,
    ...Array.from({ length: MUTATION_COUNT }, (_unused, index) =>
      mutate(USER_POLICY_VALUES[index % USER_POLICY_VALUES.length], random),
    ),
  ];
})();

describe('the built-in default policy', () => {
  test('is protective: both protections on, nothing allowed, nothing overridden', () => {
    expect(ported.DEFAULT_GUI_POLICY).toEqual({
      version: 1,
      safety: { level: 'standard', overrides: {} },
      workflow: { worktree_mode: false },
      destructive_command_protection: { enabled: true, overrides: {}, allow_paths: [] },
      secret_protection: { enabled: true, overrides: {}, deny_paths: [], allow_paths: [] },
      audit: { retention_days: 30 },
    });
  });
});

/** A document that needs no repair, so salvaging it is the identity. */
const VALID_DOCUMENT: ReturnType<typeof ported.normalizeGuiPolicy> = {
  version: 1,
  safety: { level: 'strict', overrides: { fail_closed: true, paranoid_rm: false } },
  workflow: { worktree_mode: true },
  destructive_command_protection: {
    enabled: false,
    overrides: { 'git.checkout-force': 'off' },
    allow_paths: ['/srv/data', '~/data'],
  },
  secret_protection: {
    enabled: false,
    overrides: { 'secret.basename.env': 'off' },
    deny_paths: ['config/staging.env'],
    allow_paths: ['~/work/samples/demo.env'],
  },
  audit: { retention_days: 21 },
};

const SALVAGE_ROWS: readonly {
  readonly behavior: string;
  readonly document: unknown;
  readonly expected: ReturnType<typeof ported.normalizeGuiPolicy>;
}[] = [
  {
    behavior: 'a document that is not an object salvages to the defaults',
    document: 'policy',
    expected: ported.DEFAULT_GUI_POLICY,
  },
  {
    behavior: 'a JSON array salvages to the defaults',
    document: [],
    expected: ported.DEFAULT_GUI_POLICY,
  },
  {
    behavior: 'the empty object salvages to the defaults',
    document: {},
    expected: ported.DEFAULT_GUI_POLICY,
  },
  {
    behavior: 'a fully valid document passes through unchanged',
    document: VALID_DOCUMENT,
    expected: VALID_DOCUMENT,
  },
  {
    behavior: 'an invalid level falls back to standard and leaves the other sections in force',
    document: {
      version: 1,
      safety: { level: 'lenient' },
      workflow: { worktree_mode: true },
      audit: { retention_days: 14 },
    },
    expected: {
      ...ported.DEFAULT_GUI_POLICY,
      workflow: { worktree_mode: true },
      audit: { retention_days: 14 },
    },
  },
  {
    behavior: 'a non-boolean capability override is dropped, the boolean ones beside it survive',
    document: {
      version: 1,
      safety: {
        level: 'paranoid',
        overrides: { fail_closed: 'yes', paranoid_rm: false, tighten: true },
      },
    },
    expected: {
      ...ported.DEFAULT_GUI_POLICY,
      safety: { level: 'paranoid', overrides: { paranoid_rm: false } },
    },
  },
  {
    behavior: 'a non-boolean protection switch falls back to enabled, never to disabled',
    document: {
      version: 1,
      destructive_command_protection: { enabled: 'true' },
      secret_protection: { enabled: [] },
    },
    expected: ported.DEFAULT_GUI_POLICY,
  },
  {
    behavior: 'an override naming no known rule is dropped, and so is a value that is not on/off',
    document: {
      version: 1,
      destructive_command_protection: {
        overrides: { 'git.no-such-rule': 'on', 'git.alias-config': 1, 'git.checkout-force': 'off' },
      },
      secret_protection: { overrides: { 'secret.nope': 'off', 'secret.basename.env': 'on' } },
    },
    expected: {
      ...ported.DEFAULT_GUI_POLICY,
      destructive_command_protection: {
        enabled: true,
        overrides: { 'git.checkout-force': 'off' },
        allow_paths: [],
      },
      secret_protection: {
        enabled: true,
        overrides: { 'secret.basename.env': 'on' },
        deny_paths: [],
        allow_paths: [],
      },
    },
  },
  {
    behavior: 'destructive allow paths that are not absolute or home-anchored are dropped',
    document: {
      version: 1,
      destructive_command_protection: {
        allow_paths: ['   ', 42, 'relative/dir', '~', '/', '~/keep', '/srv/keep'],
      },
    },
    expected: {
      ...ported.DEFAULT_GUI_POLICY,
      destructive_command_protection: {
        enabled: true,
        overrides: {},
        allow_paths: ['~/keep', '/srv/keep'],
      },
    },
  },
  {
    behavior: 'a deny path list that is not an array is dropped whole',
    document: { version: 1, secret_protection: { deny_paths: { path: '~' } } },
    expected: ported.DEFAULT_GUI_POLICY,
  },
  {
    behavior: 'deny entries that would block every command are dropped, relative ones are kept',
    document: {
      version: 1,
      secret_protection: { deny_paths: ['~', '/', '${HOME}', '  ', null, 'config/prod.env'] },
    },
    expected: {
      ...ported.DEFAULT_GUI_POLICY,
      secret_protection: {
        enabled: true,
        overrides: {},
        deny_paths: ['config/prod.env'],
        allow_paths: [],
      },
    },
  },
  {
    behavior: "secret allow entries that glob or cover the guard's own config are dropped",
    document: {
      version: 1,
      secret_protection: {
        allow_paths: ['~/**/config', '~/.cc-safety-net/policy.json', '~/work/sample.env'],
      },
    },
    expected: {
      ...ported.DEFAULT_GUI_POLICY,
      secret_protection: {
        enabled: true,
        overrides: {},
        deny_paths: [],
        allow_paths: ['~/work/sample.env'],
      },
    },
  },
  {
    behavior: 'an unknown top-level field changes nothing that was valid beside it',
    document: { version: 1, telemetry: true, notes: 'ignored', safety: { level: 'strict' } },
    expected: {
      ...ported.DEFAULT_GUI_POLICY,
      safety: { level: 'strict', overrides: {} },
    },
  },
  {
    // The code clamps, while audit-retention-days.ts's own docstring and docs/config-recovery.md
    // read as a fallback to the 30-day default; this row pins the code and flags the conflict.
    behavior: 'a retention window out of range clamps rather than disabling retention',
    document: { version: 1, audit: { retention_days: 0 } },
    expected: { ...ported.DEFAULT_GUI_POLICY, audit: { retention_days: 1 } },
  },
  {
    behavior: 'a wrong version does not stop the rest of the document from being salvaged',
    document: { version: 2, safety: { level: 'paranoid' } },
    expected: {
      ...ported.DEFAULT_GUI_POLICY,
      version: 1,
      safety: { level: 'paranoid', overrides: {} },
    },
  },
];

describe('salvaging one user policy document', () => {
  test.each(SALVAGE_ROWS.map((row) => [row.behavior, row] as const))('%s', (_behavior, row) => {
    expect(ported.normalizeGuiPolicy(row.document, HOME)).toEqual(row.expected);
  });
});

/**
 * The generated documents are here for the properties that must hold for every one of them; the
 * rows above pin what each individual document salvages to.
 */
describe('properties every salvaged document must satisfy', () => {
  test('salvage never produces a document that would itself fail validation', () => {
    for (const document of DOCUMENTS) {
      expect(getUserPolicyDiagnostics(ported.normalizeGuiPolicy(document, HOME), HOME)).toEqual([]);
    }
  }, 30_000);

  test('salvage is idempotent, so a repaired file reloads to itself', () => {
    for (const document of DOCUMENTS) {
      const once = ported.normalizeGuiPolicy(document, HOME);
      expect(ported.normalizeGuiPolicy(once, HOME)).toEqual(once);
    }
  }, 30_000);

  test('salvage invents nothing: every surviving entry was written in the document', () => {
    for (const document of DOCUMENTS) {
      const salvaged = ported.normalizeGuiPolicy(document, HOME);
      const section = (name: string) => {
        const value = (document as Record<string, unknown> | null)?.[name];
        return value !== null && typeof value === 'object' && !Array.isArray(value)
          ? (value as Record<string, unknown>)
          : {};
      };
      const listOf = (name: string, field: string) => {
        const value = section(name)[field];
        return Array.isArray(value) ? value : [];
      };
      const keysOf = (name: string) => {
        const value = section(name).overrides;
        return value !== null && typeof value === 'object' ? Object.keys(value) : [];
      };
      for (const [name, field, entries] of [
        [
          'destructive_command_protection',
          'allow_paths',
          salvaged.destructive_command_protection.allow_paths,
        ],
        ['secret_protection', 'deny_paths', salvaged.secret_protection.deny_paths],
        ['secret_protection', 'allow_paths', salvaged.secret_protection.allow_paths],
      ] as const) {
        expect(listOf(name, field)).toEqual(expect.arrayContaining(entries));
      }
      expect(keysOf('destructive_command_protection')).toEqual(
        expect.arrayContaining(Object.keys(salvaged.destructive_command_protection.overrides)),
      );
      expect(keysOf('secret_protection')).toEqual(
        expect.arrayContaining(Object.keys(salvaged.secret_protection.overrides)),
      );
    }
  }, 30_000);

  test('every salvaged field is inside the range its own schema allows', () => {
    for (const document of DOCUMENTS) {
      const salvaged = ported.normalizeGuiPolicy(document, HOME);
      expect(salvaged.version).toBe(1);
      expect(['standard', 'strict', 'paranoid']).toContain(salvaged.safety.level);
      expect(Number.isInteger(salvaged.audit.retention_days)).toBeTrue();
      expect(salvaged.audit.retention_days).toBeGreaterThanOrEqual(MIN_AUDIT_RETENTION_DAYS);
      expect(salvaged.audit.retention_days).toBeLessThanOrEqual(MAX_AUDIT_RETENTION_DAYS);
      for (const id of Object.keys(salvaged.destructive_command_protection.overrides)) {
        expect(DESTRUCTIVE_COMMAND_RULE_ID_SET.has(id)).toBeTrue();
      }
      for (const id of Object.keys(salvaged.secret_protection.overrides)) {
        expect(SECRET_PROTECTION_RULE_ID_SET.has(id)).toBeTrue();
      }
    }
  }, 30_000);
});

describe('projecting one project policy document', () => {
  test('a document that sets nothing recognizable projects to nothing at all', () => {
    expect(ported.projectPolicyProjection({ version: 1, tier: 'gold' }, HOME)).toEqual({
      policy: {},
      diagnostics: [],
    });
  });

  test('only the sections the file actually sets survive, so the rest keeps inheriting', () => {
    expect(
      ported.projectPolicyProjection(
        { version: 1, safety: { level: 'strict' }, secret_protection: { enabled: false } },
        HOME,
      ),
    ).toEqual({
      policy: { safety: { level: 'strict' }, secret_protection: { enabled: false } },
      diagnostics: [],
    });
  });

  test('an invalid field drops out while the valid field beside it stays', () => {
    expect(
      ported.projectPolicyProjection(
        { version: 1, safety: { level: 'lenient', overrides: { fail_closed: false } } },
        HOME,
      ),
    ).toEqual({ policy: { safety: { overrides: { fail_closed: false } } }, diagnostics: [] });
  });

  test('an empty list is a set field, so a project file can clear what it lists', () => {
    expect(
      ported.projectPolicyProjection(
        { version: 1, destructive_command_protection: { allow_paths: [] } },
        HOME,
      ),
    ).toEqual({
      policy: { destructive_command_protection: { allow_paths: [] } },
      diagnostics: [],
    });
  });

  test('an audit section is ignored with the diagnostic the recovery table names', () => {
    expect(
      ported.projectPolicyProjection({ version: 1, audit: { retention_days: 2 } }, HOME),
    ).toEqual({
      policy: {},
      diagnostics: ['project policy audit settings are ignored; audit is user scope only'],
    });
  });
});

describe('properties every project projection must satisfy', () => {
  test('a projected field always says what the user salvage would have said about it', () => {
    for (const document of DOCUMENTS) {
      const projected = ported.projectPolicyProjection(document, HOME).policy;
      const salvaged = ported.normalizeGuiPolicy(document, HOME);
      if (projected.safety?.level !== undefined) {
        expect(projected.safety.level).toBe(salvaged.safety.level);
      }
      if (projected.safety?.overrides !== undefined) {
        expect(projected.safety.overrides).toEqual(salvaged.safety.overrides);
      }
      if (projected.workflow?.worktree_mode !== undefined) {
        expect(projected.workflow.worktree_mode).toBe(salvaged.workflow.worktree_mode);
      }
      if (projected.destructive_command_protection?.allow_paths !== undefined) {
        expect(projected.destructive_command_protection.allow_paths).toEqual(
          salvaged.destructive_command_protection.allow_paths,
        );
      }
      if (projected.secret_protection?.overrides !== undefined) {
        expect(projected.secret_protection.overrides).toEqual(salvaged.secret_protection.overrides);
      }
    }
  }, 30_000);

  test('a projection never carries an empty section, because absence has to stay absence', () => {
    for (const document of DOCUMENTS) {
      for (const section of Object.values(ported.projectPolicyProjection(document, HOME).policy)) {
        expect(Object.keys(section).length).toBeGreaterThan(0);
      }
    }
  }, 30_000);

  test('the only project diagnostic is the audit one, and it appears exactly when audit is set', () => {
    for (const document of DOCUMENTS) {
      const hasAudit =
        document !== null &&
        typeof document === 'object' &&
        !Array.isArray(document) &&
        (document as Record<string, unknown>).audit !== undefined;
      expect(ported.projectPolicyProjection(document, HOME).diagnostics).toEqual(
        hasAudit ? ['project policy audit settings are ignored; audit is user scope only'] : [],
      );
    }
  }, 30_000);

  test('layering any projection over the defaults still yields a document that validates', () => {
    for (const document of DOCUMENTS) {
      const merged = mergeProjectPolicy(
        ported.DEFAULT_GUI_POLICY,
        ported.projectPolicyProjection(document, HOME).policy,
      );
      expect(getUserPolicyDiagnostics(merged.policy, HOME)).toEqual([]);
    }
  }, 30_000);
});

describe('projecting the safety section onto the runtime shape', () => {
  test('a policy that sets no capability projects to the level alone', () => {
    expect(ported.normalizeSafety({ level: 'strict', overrides: {} })).toEqual({ level: 'strict' });
  });

  test('a set capability is renamed to its runtime spelling', () => {
    expect(
      ported.normalizeSafety({
        level: 'paranoid',
        overrides: { fail_closed: true, paranoid_rm: false, paranoid_interpreters: true },
      }),
    ).toEqual({
      level: 'paranoid',
      overrides: { failClosed: true, paranoidRm: false, paranoidInterpreters: true },
    });
  });

  test('an unset capability is stripped rather than stored as undefined', () => {
    const safety = ported.normalizeSafety({ level: 'standard', overrides: { paranoid_rm: true } });
    expect(safety).toEqual({ level: 'standard', overrides: { paranoidRm: true } });
    expect(Object.keys(safety.overrides ?? {})).toEqual(['paranoidRm']);
  });

  test('every salvaged document projects to a level and, at most, the capabilities it set', () => {
    for (const document of DOCUMENTS) {
      const salvaged = ported.normalizeGuiPolicy(document, HOME);
      const safety = ported.normalizeSafety(salvaged.safety);
      expect(safety.level).toBe(salvaged.safety.level);
      expect(Object.keys(safety.overrides ?? {})).toHaveLength(
        Object.values(salvaged.safety.overrides).filter((value) => value !== undefined).length,
      );
    }
  }, 30_000);
});

const DEFAULT_OFF_IDS = [...SECRET_DEFAULT_OFF_RULE_ID_SET];

describe('which secret rules end up disabled', () => {
  test('with no overrides the whole default-off tier is disabled', () => {
    expect(ported.resolveSecretDisabledRules({}).sort()).toEqual([...DEFAULT_OFF_IDS].sort());
  });

  test('an explicit on opts a default-off rule back in', () => {
    const id = DEFAULT_OFF_IDS[0] as string;
    expect(ported.resolveSecretDisabledRules({ [id]: 'on' })).not.toContain(id);
  });

  test('an explicit off disables a rule that was on by default', () => {
    const id = [...SECRET_PROTECTION_RULE_ID_SET].find(
      (candidate) => !SECRET_DEFAULT_OFF_RULE_ID_SET.has(candidate),
    ) as string;
    expect(ported.resolveSecretDisabledRules({ [id]: 'off' })).toContain(id);
  });

  test('a rule named twice over is listed once', () => {
    const id = DEFAULT_OFF_IDS[0] as string;
    expect(ported.resolveSecretDisabledRules({ [id]: 'off' }).filter((one) => one === id)).toEqual([
      id,
    ]);
  });

  test('every override map resolves to a list with no duplicates and no opted-in rule', () => {
    const maps = [
      {},
      ...DEFAULT_OFF_IDS.slice(0, 3).map((id) => ({ [id]: 'on' as const })),
      ...[...SECRET_PROTECTION_RULE_ID_SET].slice(0, 3).map((id) => ({ [id]: 'off' as const })),
      Object.fromEntries(
        DEFAULT_OFF_IDS.slice(0, 4).map(
          (id, index) => [id, index % 2 === 0 ? 'on' : 'off'] as const,
        ),
      ),
      ...DOCUMENTS.map(
        (document) => ported.normalizeGuiPolicy(document, HOME).secret_protection.overrides,
      ),
    ];
    for (const overrides of maps) {
      const disabled = ported.resolveSecretDisabledRules(overrides);
      expect(disabled).toHaveLength(new Set(disabled).size);
      for (const [id, value] of Object.entries(overrides)) {
        if (value === 'on') expect(disabled).not.toContain(id);
        if (value === 'off') expect(disabled).toContain(id);
      }
      for (const id of DEFAULT_OFF_IDS) {
        if (overrides[id] !== 'on') expect(disabled).toContain(id);
      }
    }
  }, 30_000);
});

/**
 * Retention is read from the same salvaged policy the snapshot reads rather than from a
 * second parser, so the rows below are the ones where the two could disagree: values the
 * clamp rejects, a field of the wrong type, and every way the file can fail to be read.
 */
const RETENTION_FILES: readonly {
  readonly behavior: string;
  readonly file: string;
  readonly days: number;
}[] = [
  {
    // Same docstring/contract conflict as the salvage row above: clamp, not the 30-day default.
    behavior: 'below the minimum clamps up',
    file: '{"version":1,"audit":{"retention_days":0}}',
    days: 1,
  },
  { behavior: 'the minimum is kept', file: '{"version":1,"audit":{"retention_days":1}}', days: 1 },
  {
    behavior: 'a window inside the range is kept',
    file: '{"version":1,"audit":{"retention_days":30}}',
    days: 30,
  },
  {
    behavior: 'the maximum is kept',
    file: '{"version":1,"audit":{"retention_days":365}}',
    days: 365,
  },
  {
    behavior: 'above the maximum clamps down',
    file: '{"version":1,"audit":{"retention_days":366}}',
    days: 365,
  },
  {
    behavior: 'a fractional window falls back to the default',
    file: '{"version":1,"audit":{"retention_days":1.5}}',
    days: 30,
  },
  {
    behavior: 'a numeric string is not a number and falls back to the default',
    file: '{"version":1,"audit":{"retention_days":"5"}}',
    days: 30,
  },
  {
    behavior: 'a null window falls back to the default',
    file: '{"version":1,"audit":{"retention_days":null}}',
    days: 30,
  },
  {
    behavior: 'an audit section with no window uses the default',
    file: '{"version":1,"audit":{}}',
    days: 30,
  },
  {
    behavior: 'no audit section at all uses the default',
    file: '{"version":1,"safety":{"level":"strict"}}',
    days: 30,
  },
  {
    behavior: 'a valid window survives fields that fail validation beside it',
    file: '{"version":1,"tier":"gold","safety":{"level":"paranoid!"},"audit":{"retention_days":45}}',
    days: 45,
  },
  { behavior: 'malformed JSON falls back to the default', file: '{"version":1,"audit":', days: 30 },
  { behavior: 'an empty file falls back to the default', file: '', days: 30 },
  { behavior: 'a whitespace-only file falls back to the default', file: '   \n', days: 30 },
  { behavior: 'a JSON array falls back to the default', file: '[]', days: 30 },
];

describe('the audit retention window read from the policy file', () => {
  const root = mkdtempSync(join(tmpdir(), 'policy-retention-'));
  afterAll(() => rmSync(root, { recursive: true, force: true }));

  const windowFor = (userConfigDir: string) =>
    readRetentionDays(createTestEnvironment({ home: HOME }), { userConfigDir });

  test.each(
    RETENTION_FILES.map((row) => [row.behavior, row.file, row.days] as const),
  )('%s', (behavior, file, days) => {
    const home = join(root, behavior.replace(/\W+/g, '-'));
    mkdirSync(join(home, 'rules'), { recursive: true });
    writeFileSync(join(home, 'policy.json'), file);
    expect(windowFor(join(home, 'rules'))).toBe(days);
  });

  test('a directory where the policy file belongs falls back to the default', () => {
    const userConfigDir = join(root, 'directory', 'rules');
    mkdirSync(userConfigDir, { recursive: true });
    mkdirSync(join(root, 'directory', 'policy.json'));
    expect(windowFor(userConfigDir)).toBe(30);
  });

  test('a missing policy file falls back to the default', () => {
    const userConfigDir = join(root, 'absent', 'rules');
    mkdirSync(userConfigDir, { recursive: true });
    expect(windowFor(userConfigDir)).toBe(30);
  });
});

/**
 * `policy apply` writes the user scope through this call, so what lands on disk is contract: the
 * salvaged document, the 0600 file inside a 0700 directory, and nothing at all when the proposal
 * fails validation.
 */
describe('writing the user policy from the GUI', () => {
  afterEach(removeTempRoots);

  const environment = createTestEnvironment({ home: HOME });

  const write = (policy: unknown) => {
    const root = createTempRoot('gui-policy-write-');
    const result = ported.writeUserPolicyFromGui(environment, policy, {
      userConfigDir: join(root, '.cc-safety-net', 'rules'),
    });
    return { result, tree: snapshotTree(root), root };
  };
  /** The directory's and the file's permission bits, in that order. */
  const modes = (root: string) =>
    ['.cc-safety-net', '.cc-safety-net/policy.json'].map((path) =>
      (lstatSync(join(root, path)).mode & 0o777).toString(8),
    );

  test('an accepted proposal lands as an owner-only file inside an owner-only directory', () => {
    const written = write({
      version: 1,
      safety: { level: 'strict', overrides: { paranoid_rm: true } },
      workflow: { worktree_mode: true },
      destructive_command_protection: { allow_paths: ['~/scratch'] },
      audit: { retention_days: 45 },
    });
    expect(written.result.errors).toEqual([]);
    expect(written.result.policy.safety).toEqual({
      level: 'strict',
      overrides: { paranoid_rm: true },
    });
    expect(written.result.policy.destructive_command_protection.allow_paths).toEqual(['~/scratch']);
    expect(written.result.policy.audit.retention_days).toBe(45);
    expect(written.tree).toEqual([
      { path: '.cc-safety-net', kind: 'directory' },
      {
        path: '.cc-safety-net/policy.json',
        kind: 'file',
        content: `${JSON.stringify(written.result.policy, null, 2)}\n`,
      },
    ]);
    // Windows has no POSIX mode to assert.
    if (process.platform !== 'win32') expect(modes(written.root)).toEqual(['700', '600']);
  });

  test('the minimal document lands as the canonical default policy', () => {
    const written = write({ version: 1 });
    expect(written.result.policy).toEqual(ported.DEFAULT_GUI_POLICY);
    expect(written.tree).toEqual([
      { path: '.cc-safety-net', kind: 'directory' },
      {
        path: '.cc-safety-net/policy.json',
        kind: 'file',
        content: `${JSON.stringify(ported.DEFAULT_GUI_POLICY, null, 2)}\n`,
      },
    ]);
    if (process.platform !== 'win32') expect(modes(written.root)).toEqual(['700', '600']);
  });

  test.each([
    [
      'a level the schema rejects',
      { version: 1, safety: { level: 'nope' } },
      ['safety.level must be "standard", "strict", or "paranoid"'],
    ],
    ['a document that is not an object', 'not a policy', ['Config must be an object']],
    ['a document declaring the wrong version', { version: 2 }, ['version must be 1']],
  ] as const)('%s is reported and nothing is written', (_behavior, policy, errors) => {
    const written = write(policy);
    expect(written.result.errors).toEqual([...errors]);
    // A rejected proposal never leaves a partial file, and never touches the config directory.
    expect(written.tree).toEqual([]);
    expect(written.result.policy).toEqual(ported.DEFAULT_GUI_POLICY);
  });
});
