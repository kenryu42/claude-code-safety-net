import { describe, expect, test } from 'bun:test';
import { deriveDoctorFindings as derivePorted } from '@/cli/doctor/findings';
import type { DoctorReport } from '@/hosts/doctor-types';

/**
 * The finding catalog is the doctor's failure contract: an `error` finding is what makes the
 * command exit 1, and the ids are what a user greps for. Every rule gets a row built from hand,
 * so a rule that stops firing — or starts firing on the wrong facts — fails here rather than
 * silently turning a red report green. The severity is stated per
 * rule below, because it decides the exit code; the wording of the two findings that assemble
 * their own text is stated where those rows are.
 */

type DoctorFacts = Omit<DoctorReport, 'findings'>;

const CAPABILITY_OFF = { enabled: false, source: 'preset', sources: [] } as const;

const SAFETY: DoctorFacts['effectiveSafety'] = {
  selectedPreset: 'standard',
  level: 'standard',
  capabilities: {
    fail_closed: CAPABILITY_OFF,
    paranoid_rm: CAPABILITY_OFF,
    paranoid_interpreters: CAPABILITY_OFF,
  },
  ruleOverrides: {},
  weakenedRuleOverrides: [],
  ruleCounts: { stored: 0, effective: 0 },
};

const absentConfig = (path: string) => ({ path, exists: false, valid: false, ruleCount: 0 });

const NOTHING_PROBED: DoctorFacts['system'] = {
  version: '9.9.9',
  versions: {},
  codexPluginListOutput: null,
  ampPluginListOutput: null,
  nodeVersion: null,
  npmVersion: null,
  bunVersion: null,
  platform: 'linux x64',
};

const BASE: DoctorFacts = {
  hooks: [],
  engineSelfTest: { passed: 3, failed: 0, total: 3, results: [] },
  userConfig: absentConfig('/u/rules/rule.json'),
  projectConfig: absentConfig('/p/rules/rule.json'),
  configState: { state: 'ready' },
  effectiveRules: [],
  shadowedRules: [],
  environment: [],
  effectiveSafety: SAFETY,
  posture: { directories: [] },
  activity: { totalBlocked: 0, sessionCount: 0, recentEntries: [], unreadable: 0 },
  update: { currentVersion: '9.9.9', latestVersion: null, updateAvailable: false },
  system: NOTHING_PROBED,
};

const facts = (overrides: Partial<DoctorFacts>): DoctorFacts => ({ ...BASE, ...overrides });

const hook = (
  platform: 'claude-code' | 'cursor' | 'codex',
  overrides: Record<string, unknown>,
) => ({
  platform,
  detected: false,
  configured: false,
  inspectionStatus: 'not-applicable' as const,
  ...overrides,
});

const auditScope = (value: string) => [
  {
    name: 'CC_SAFETY_NET_AUDIT_SCOPE',
    value,
    isSet: true,
    description: 'scope',
    defaultBehavior: 'all',
  },
];

const unsafe = (kind: 'policy' | 'config' | 'audit', path: string, issues: string[]) => ({
  kind,
  path,
  status: 'unsafe' as const,
  issues: issues as ('ownership' | 'permissions' | 'symlink' | 'not-directory')[],
});

const rows: Array<{ name: string; facts: DoctorFacts; ids: string[] }> = [
  { name: 'no facts at all yield no findings', facts: BASE, ids: [] },
  {
    name: 'every discovered integration unconfigured',
    facts: facts({ hooks: [hook('claude-code', {}), hook('cursor', {})] }),
    ids: ['integration.none-configured'],
  },
  {
    name: 'one configured integration silences the catalog',
    facts: facts({
      hooks: [hook('claude-code', { detected: true, configured: true }), hook('cursor', {})],
    }),
    ids: [],
  },
  {
    name: 'two failed inspections each earn their own finding',
    facts: facts({
      hooks: [
        hook('claude-code', { configured: true, inspectionStatus: 'failed' }),
        hook('cursor', { configured: true, inspectionStatus: 'failed' }),
      ],
    }),
    ids: ['integration.inspection-failed', 'integration.inspection-failed'],
  },
  {
    name: 'an invalid config in each scope',
    facts: facts({
      userConfig: { path: '/u/rules/rule.json', exists: true, valid: false, ruleCount: 0 },
      projectConfig: { path: '/p/rules/rule.json', exists: true, valid: false, ruleCount: 0 },
    }),
    ids: ['config.user-invalid', 'config.project-invalid'],
  },
  {
    name: 'a valid config in each scope',
    facts: facts({
      userConfig: { path: '/u/rules/rule.json', exists: true, valid: true, ruleCount: 2 },
      projectConfig: { path: '/p/rules/rule.json', exists: true, valid: true, ruleCount: 1 },
    }),
    ids: [],
  },
  {
    name: 'a degraded runtime',
    facts: facts({ configState: { state: 'degraded', reason: 'user policy is not valid JSON' } }),
    ids: ['config.runtime-degraded'],
  },
  {
    name: 'version 2 lock and cache leftovers',
    facts: facts({ v2Leftovers: ['/p/rules/rule.lock', '/u/cache'] }),
    ids: ['config.v2-leftovers'],
  },
  {
    name: 'an empty leftovers list is not a finding',
    facts: facts({ v2Leftovers: [] }),
    ids: [],
  },
  {
    name: 'an unparseable audit scope',
    facts: facts({ environment: auditScope('bogus') }),
    ids: ['environment.audit-scope-invalid'],
  },
  {
    name: 'the blocked audit scope is valid',
    facts: facts({ environment: auditScope('blocked') }),
    ids: [],
  },
  {
    name: 'each protected directory kind, with each issue wording',
    facts: facts({
      posture: {
        directories: [
          unsafe('policy', '/u', ['symlink']),
          unsafe('config', '/u/rules', ['not-directory']),
          unsafe('audit', '/u/logs', ['ownership', 'permissions']),
        ],
      },
    }),
    ids: [
      'posture.policy-directory-unsafe',
      'posture.config-directory-unsafe',
      'posture.audit-directory-unsafe',
    ],
  },
  {
    name: 'two unsafe directories of one kind keep their occurrence order',
    facts: facts({
      posture: {
        directories: [
          unsafe('config', '/first', ['ownership']),
          { kind: 'audit', path: '/safe', status: 'safe', issues: [] },
          unsafe('config', '/second', ['permissions']),
        ],
      },
    }),
    ids: ['posture.config-directory-unsafe', 'posture.config-directory-unsafe'],
  },
  {
    name: 'rule overrides that weaken the preset',
    facts: facts({
      effectiveSafety: {
        ...SAFETY,
        weakenedRuleOverrides: ['rm.recursive-force-root-or-home', 'git.reset-hard'],
      },
    }),
    ids: ['posture.rule-overrides-weaken-preset'],
  },
  {
    name: 'severity outranks catalog order, which outranks occurrence',
    facts: facts({
      hooks: [hook('claude-code', {}), hook('cursor', { inspectionStatus: 'failed' })],
      userConfig: { path: '/u/rules/rule.json', exists: true, valid: false, ruleCount: 0 },
      configState: { state: 'degraded', reason: 'project policy is not valid JSON' },
      environment: auditScope('nonsense'),
      v2Leftovers: ['/u/cache'],
      posture: { directories: [unsafe('policy', '/u', ['permissions'])] },
      effectiveSafety: {
        ...SAFETY,
        weakenedRuleOverrides: ['git.reset-hard'],
      },
    }),
    ids: [
      'integration.none-configured',
      'integration.inspection-failed',
      'config.user-invalid',
      'posture.policy-directory-unsafe',
      'config.runtime-degraded',
      'environment.audit-scope-invalid',
      'posture.rule-overrides-weaken-preset',
      'config.v2-leftovers',
    ],
  },
];

/** What each rule costs the run: an `error` is what makes `doctor` exit 1. */
const SEVERITIES: Readonly<Record<string, 'error' | 'warning' | 'info'>> = {
  'integration.none-configured': 'error',
  'integration.inspection-failed': 'error',
  'config.user-invalid': 'error',
  'config.project-invalid': 'error',
  'config.runtime-degraded': 'warning',
  'config.v2-leftovers': 'info',
  'environment.audit-scope-invalid': 'warning',
  'posture.policy-directory-unsafe': 'error',
  'posture.config-directory-unsafe': 'error',
  'posture.audit-directory-unsafe': 'error',
  'posture.rule-overrides-weaken-preset': 'warning',
};

describe('deriveDoctorFindings', () => {
  for (const row of rows) {
    test(row.name, () => {
      const ported = derivePorted(row.facts);

      expect(ported.map((finding) => `${finding.checkId} ${finding.severity}`)).toEqual(
        row.ids.map((id) => `${id} ${SEVERITIES[id]}`),
      );
      // Every finding is read by a person: it says what is wrong and what to do about it.
      for (const finding of ported) {
        expect(finding.title, finding.checkId).not.toBe('');
        expect(finding.detail, finding.checkId).not.toBe('');
        expect(finding.fixHint, finding.checkId).not.toBe('');
      }
    });
  }

  test('the weakened override list is sorted in both the detail and the fix', () => {
    const [finding] = derivePorted(
      facts({
        effectiveSafety: {
          ...SAFETY,
          weakenedRuleOverrides: ['rm.recursive-force-root-or-home', 'git.reset-hard'],
        },
      }),
    );
    expect(finding?.detail).toBe(
      'Explicit overrides disable rules the resolved preset would enable: git.reset-hard, rm.recursive-force-root-or-home.',
    );
    expect(finding?.fixHint).toBe(
      'Remove these `off` overrides or set them to `on`: git.reset-hard, rm.recursive-force-root-or-home.',
    );
  });

  test('the audit directory wording joins its two issues', () => {
    const [finding] = derivePorted(
      facts({
        posture: { directories: [unsafe('audit', '/u/logs', ['ownership', 'permissions'])] },
      }),
    );
    expect(finding?.detail).toBe(
      'The audit directory is not owned by the current user and has unsafe permissions.',
    );
    expect(finding?.title).toBe('Audit directory is unsafe');
  });
});
