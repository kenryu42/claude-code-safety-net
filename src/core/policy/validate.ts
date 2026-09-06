import { BLOCK_INTENTS } from '@/core/decision';
import { COMMAND_PATTERN, MAX_REASON_LENGTH } from '@/core/rules/constants';
import { DESTRUCTIVE_COMMAND_RULE_ID_SET } from '@/core/rules/destructive';
import { SECRET_PROTECTION_RULE_ID_SET } from '@/core/rules/secret';
import {
  getDestructiveAllowPathError,
  getSecretAllowPathError,
  getSecretDenyPathError,
} from './allow-paths';
import { MAX_AUDIT_RETENTION_DAYS, MIN_AUDIT_RETENTION_DAYS } from './audit-retention-days';
import { RULE_SOURCE_LIMIT, RULE_SOURCE_LIMIT_ERROR } from './resource-limits';
import {
  isRulebookWithinAcceptanceLimits,
  RULEBOOK_LIMIT_ERROR,
  RULEBOOK_LIMITS,
  RULEBOOK_VALIDATION_TRUNCATED,
} from './rulebook-limits';
import { getRulebookSourceSyntaxError, NAME_PATTERN } from './source-syntax';
import { isReservedTransparentWrapper } from './transparent-wrappers';

/**
 * The diagnostics the schema module produces, without the schema library: the loader
 * runs on the hook's hot path and may not pay for it. Every message, and the order the
 * messages come out in, mirrors `schema.ts` exactly — `tests/core/policy/validate.test.ts`
 * holds the two implementations to the same strings.
 *
 * An issue is emitted where the schema would raise it, in the schema's own traversal
 * order, and carries the kind the renderer needs: a `typed` or `custom` reason, the
 * `unknownKeys` of a strict object (one issue per key), a record `key` error that already
 * names its key, or a whole-document `limit`.
 */
type Issue = {
  path: readonly PropertyKey[];
  message: string;
  kind: 'typed' | 'custom' | 'unknownKeys' | 'key' | 'limit';
};

const typed = (path: readonly PropertyKey[], message: string): Issue => ({
  path,
  message,
  kind: 'typed',
});

const custom = (path: readonly PropertyKey[], message: string): Issue => ({
  path,
  message,
  kind: 'custom',
});

const AUDIT_RETENTION_ERROR = `must be an integer between ${MIN_AUDIT_RETENTION_DAYS} and ${MAX_AUDIT_RETENTION_DAYS}`;
const INTENT_ERROR = `must be one of ${BLOCK_INTENTS.join(', ')}`;
const RULEBOOK_REASON_ERROR = `required non-empty string up to ${MAX_REASON_LENGTH} characters`;
const RULE_OVERRIDE_KEY_PATTERN = /^[^/]+\/[^/]+$/;
const TOKEN_LIST_ERROR = 'must be a non-empty array of unique non-empty strings';
const COMMAND_PATH_ERROR = 'required non-empty array of non-empty strings';
const RULES_CONFIG_FIELDS = ['version', 'rules', 'overrides', 'transparent_wrappers'];
const USER_POLICY_FIELDS = [
  'version',
  'safety',
  'workflow',
  'destructive_command_protection',
  'secret_protection',
  'audit',
];

export function getUserPolicyDiagnostics(value: unknown, home: string): string[] {
  return formatIssues(
    sortIssues(
      userPolicyIssues(value, home),
      USER_POLICY_FIELDS,
      (issue) => issue.kind === 'custom',
    ),
    ' ',
    ' ',
  );
}

export function getRulesConfigValidation(config: unknown): {
  errors: string[];
  sources: Set<string>;
} {
  const issues = rulesConfigIssues(config);
  return {
    errors: formatIssues(
      sortIssues(issues, RULES_CONFIG_FIELDS, (issue) => issue.kind === 'custom'),
      ': ',
      ' ',
    ),
    sources: collectValidSources(config, issues),
  };
}

export function validateRulebook(rulebook: unknown): { errors: string[]; ruleNames: Set<string> } {
  if (!isRecord(rulebook)) {
    return { errors: ['Rulebook must be an object'], ruleNames: new Set() };
  }
  if (!isRulebookWithinAcceptanceLimits(rulebook)) {
    return { errors: [RULEBOOK_LIMIT_ERROR], ruleNames: new Set() };
  }
  const errors = [
    // The only rulebook diagnostic that reads as a sentence; the rest are `field: reason`.
    ...(rulebook.rulebook_version === 1 || rulebook.rulebook_version === 2
      ? []
      : ['rulebook_version must be 1 or 2']),
    ...formatIssues(rulebookIssues(rulebook, rulebook.rulebook_version === 2), ': ', ': '),
  ];
  return {
    errors:
      errors.length > RULEBOOK_LIMITS.maxValidationErrors
        ? [...errors.slice(0, RULEBOOK_LIMITS.maxValidationErrors), RULEBOOK_VALIDATION_TRUNCATED]
        : errors,
    ruleNames: new Set(collectCustomRuleNames(rulebook).map((name) => name.toLowerCase())),
  };
}

/** Custom rule names as written, in declaration order. */
export function collectCustomRuleNames(config: unknown): string[] {
  const rules = isRecord(config) ? config.rules : undefined;
  return (Array.isArray(rules) ? rules : []).flatMap((rule) => {
    const name = isRecord(rule) ? rule.name : undefined;
    return typeof name === 'string' ? [name] : [];
  });
}

function userPolicyIssues(value: unknown, home: string): Issue[] {
  if (!isRecord(value)) return [typed([], 'Config must be an object')];
  return [
    ...(value.version === 1 ? [] : [typed(['version'], 'must be 1')]),
    ...sectionIssues(value.safety, ['safety'], ['level', 'overrides'], (safety) => [
      ...(safety.level === undefined ||
      safety.level === 'standard' ||
      safety.level === 'strict' ||
      safety.level === 'paranoid'
        ? []
        : [typed(['safety', 'level'], 'must be "standard", "strict", or "paranoid"')]),
      ...sectionIssues(
        safety.overrides,
        ['safety', 'overrides'],
        ['fail_closed', 'paranoid_rm', 'paranoid_interpreters'],
        (overrides) =>
          ['fail_closed', 'paranoid_rm', 'paranoid_interpreters'].flatMap((key) =>
            overrides[key] === undefined || typeof overrides[key] === 'boolean'
              ? []
              : [typed(['safety', 'overrides', key], 'must be a boolean')],
          ),
      ),
    ]),
    ...sectionIssues(value.workflow, ['workflow'], ['worktree_mode'], (workflow) =>
      workflow.worktree_mode === undefined || typeof workflow.worktree_mode === 'boolean'
        ? []
        : [typed(['workflow', 'worktree_mode'], 'must be a boolean')],
    ),
    ...protectionIssues(value.destructive_command_protection, home, {
      field: 'destructive_command_protection',
      ids: DESTRUCTIVE_COMMAND_RULE_ID_SET,
      label: 'destructive command',
      pathFields: [['allow_paths', getDestructiveAllowPathError]],
    }),
    ...protectionIssues(value.secret_protection, home, {
      field: 'secret_protection',
      ids: SECRET_PROTECTION_RULE_ID_SET,
      label: 'secret protection',
      pathFields: [
        ['deny_paths', getSecretDenyPathError],
        ['allow_paths', getSecretAllowPathError],
      ],
    }),
    ...sectionIssues(value.audit, ['audit'], ['retention_days'], (audit) =>
      audit.retention_days === undefined ||
      (typeof audit.retention_days === 'number' &&
        Number.isInteger(audit.retention_days) &&
        audit.retention_days >= MIN_AUDIT_RETENTION_DAYS &&
        audit.retention_days <= MAX_AUDIT_RETENTION_DAYS)
        ? []
        : [typed(['audit', 'retention_days'], AUDIT_RETENTION_ERROR)],
    ),
    ...unknownKeyIssues(value, [], USER_POLICY_FIELDS),
  ];
}

/** A strict object reports its own type error, then its fields, then its unknown keys. */
function sectionIssues(
  section: unknown,
  path: readonly PropertyKey[],
  known: readonly string[],
  fields: (section: Record<string, unknown>) => Issue[],
): Issue[] {
  if (section === undefined) return [];
  if (!isRecord(section)) return [typed(path, 'must be an object if provided')];
  return [...fields(section), ...unknownKeyIssues(section, path, known)];
}

function unknownKeyIssues(
  record: Record<string, unknown>,
  path: readonly PropertyKey[],
  known: readonly string[],
): Issue[] {
  return Object.keys(record)
    .filter((key) => !known.includes(key))
    .map((key) => ({ path, message: key, kind: 'unknownKeys' as const }));
}

function protectionIssues(
  section: unknown,
  home: string,
  spec: {
    field: string;
    ids: ReadonlySet<string>;
    label: string;
    pathFields: readonly [string, (value: unknown, home: string) => string | null][];
  },
): Issue[] {
  return sectionIssues(
    section,
    [spec.field],
    ['enabled', 'overrides', ...spec.pathFields.map((entry) => entry[0])],
    (protection) => [
      ...(protection.enabled === undefined || typeof protection.enabled === 'boolean'
        ? []
        : [typed([spec.field, 'enabled'], 'must be a boolean')]),
      ...ruleIdOverrideIssues(
        protection.overrides,
        [spec.field, 'overrides'],
        spec.ids,
        spec.label,
      ),
      ...spec.pathFields.flatMap(([key, getPathError]) =>
        policyPathIssues(protection[key], [spec.field, key], getPathError, home),
      ),
    ],
  );
}

/**
 * The rule id lives in the record key, so the key error names it in full and the values
 * are judged by a second record: every unknown id first, then every unusable value.
 */
function ruleIdOverrideIssues(
  overrides: unknown,
  path: readonly PropertyKey[],
  ids: ReadonlySet<string>,
  label: string,
): Issue[] {
  if (overrides === undefined) return [];
  if (!isRecord(overrides)) return [typed(path, 'must be an object if provided')];
  return [
    ...Object.keys(overrides)
      .filter((key) => !ids.has(key))
      .map((key) => ({
        path,
        message: `unknown ${label} rule id "${key}"`,
        kind: 'key' as const,
      })),
    ...Object.keys(overrides)
      .filter((key) => overrides[key] !== 'on' && overrides[key] !== 'off')
      .map((key) => typed([...path, key], 'must be "on" or "off"')),
  ];
}

function policyPathIssues(
  paths: unknown,
  path: readonly PropertyKey[],
  getPathError: (value: unknown, home: string) => string | null,
  home: string,
): Issue[] {
  if (paths === undefined) return [];
  if (!Array.isArray(paths)) return [typed(path, 'must be an array of paths')];
  return [
    ...paths.flatMap((entry, index) =>
      typeof entry === 'string' ? [] : [typed([...path, index], 'must be a non-empty path string')],
    ),
    ...paths.flatMap((entry, index) => {
      if (typeof entry !== 'string') return [];
      const error = getPathError(entry, home);
      return error === null ? [] : [custom([...path, index], error)];
    }),
  ];
}

function rulesConfigIssues(config: unknown): Issue[] {
  if (!isRecord(config)) return [typed([], 'Config must be an object')];
  // Over the source limit the config is replaced by a stand-in that carries the limit
  // error alone, so no source reports a problem of its own.
  const overLimit = Array.isArray(config.rules) && config.rules.length > RULE_SOURCE_LIMIT;
  return [
    ...(config.version === 1 ? [] : [typed(['version'], 'must be 1')]),
    ...ruleSourceIssues(config.rules, overLimit),
    ...ruleOverrideIssues(config.overrides),
    ...transparentWrapperIssues(config.transparent_wrappers),
    ...(overLimit ? [] : duplicateRuleSourceIssues(config.rules)),
    ...(isRecord(config.overrides)
      ? Object.keys(config.overrides)
          .filter((key) => !RULE_OVERRIDE_KEY_PATTERN.test(key))
          .map((key) => custom(['overrides', key], 'must use <rulebook-name>/<rule-name>'))
      : []),
    ...reservedWrapperIssues(config.transparent_wrappers),
  ];
}

function ruleSourceIssues(rules: unknown, overLimit: boolean): Issue[] {
  if (rules === undefined) return [];
  if (!Array.isArray(rules)) {
    return [
      typed(['rules'], 'must be an array of rulebook source strings'),
      // A length bound judges anything that has a length, so a long string is over the
      // source limit too — and names the field, because the limit is not an array's.
      ...(exceedsLength(rules, RULE_SOURCE_LIMIT)
        ? [typed(['rules'], RULE_SOURCE_LIMIT_ERROR)]
        : []),
    ];
  }
  if (overLimit) return [{ path: ['rules'], message: RULE_SOURCE_LIMIT_ERROR, kind: 'limit' }];
  return rules.flatMap((source, index) => {
    if (typeof source !== 'string') {
      return [
        typed(['rules', index], 'must be a rulebook source string'),
        ...(fallsShortOfLength(source, 1)
          ? [typed(['rules', index], 'must be a non-empty rulebook source string')]
          : []),
      ];
    }
    return source === ''
      ? [typed(['rules', index], 'must be a non-empty rulebook source string')]
      : [];
  });
}

/**
 * A length bound runs on any value that carries a length, which the string and array
 * types themselves reject; both bounds report the value they were given.
 */
function exceedsLength(value: unknown, maximum: number): boolean {
  const length = lengthOf(value);
  return length !== undefined && !(length <= maximum);
}

function fallsShortOfLength(value: unknown, minimum: number): boolean {
  const length = lengthOf(value);
  return length !== undefined && !(length >= minimum);
}

function lengthOf(value: unknown): number | undefined {
  if (value === null || value === undefined) return undefined;
  const length = (value as { length?: unknown }).length;
  return length === undefined ? undefined : Number(length);
}

function duplicateRuleSourceIssues(rules: unknown): Issue[] {
  if (!Array.isArray(rules)) return [];
  const sources = new Set<string>();
  return rules.flatMap((source, index) => {
    // Non-strings and empty strings already carry the element's own issue.
    if (typeof source !== 'string' || source === '') return [];
    if (source.trim() === '') {
      return [custom(['rules', index], 'must be a non-empty rulebook source string')];
    }
    const sourceError = getRulebookSourceSyntaxError(source);
    if (sourceError) return [custom(['rules', index], sourceError)];
    if (sources.has(source)) {
      return [custom(['rules', index], `duplicate rulebook source "${source}"`)];
    }
    sources.add(source);
    return [];
  });
}

function ruleOverrideIssues(overrides: unknown): Issue[] {
  if (overrides === undefined) return [];
  if (!isRecord(overrides)) return [typed(['overrides'], 'must be an object if provided')];
  return Object.keys(overrides).flatMap((key) => {
    const override = overrides[key];
    if (override === 'off') return [];
    if (!isRecord(override)) return [typed(['overrides', key], 'must be "off" or an object')];
    return [
      ...overrideReasonIssues(override.reason, ['overrides', key, 'reason']),
      ...(override.intent === undefined || isBlockIntent(override.intent)
        ? []
        : [typed(['overrides', key, 'intent'], INTENT_ERROR)]),
    ];
  });
}

function overrideReasonIssues(reason: unknown, path: readonly PropertyKey[]): Issue[] {
  if (typeof reason !== 'string') {
    // The lower bound repeats the type error word for word, so only the upper one can
    // add a diagnostic of its own here.
    return [
      typed(path, 'required non-empty string'),
      ...(exceedsLength(reason, MAX_REASON_LENGTH)
        ? [typed(path, `must be at most ${MAX_REASON_LENGTH} characters`)]
        : []),
    ];
  }
  if (reason === '') return [typed(path, 'required non-empty string')];
  return reason.length > MAX_REASON_LENGTH
    ? [typed(path, `must be at most ${MAX_REASON_LENGTH} characters`)]
    : [];
}

function transparentWrapperIssues(wrappers: unknown): Issue[] {
  if (wrappers === undefined) return [];
  if (!Array.isArray(wrappers)) {
    return [typed(['transparent_wrappers'], 'must be an array of command strings')];
  }
  return wrappers.flatMap((wrapper, index) => {
    if (typeof wrapper !== 'string') {
      return [typed(['transparent_wrappers', index], 'must be a command string')];
    }
    return COMMAND_PATTERN.test(wrapper)
      ? []
      : [typed(['transparent_wrappers', index], 'must match command pattern')];
  });
}

function reservedWrapperIssues(wrappers: unknown): Issue[] {
  if (!Array.isArray(wrappers)) return [];
  const seen = new Set<string>();
  return wrappers.flatMap((wrapper, index) => {
    if (typeof wrapper !== 'string' || !COMMAND_PATTERN.test(wrapper)) return [];
    if (seen.has(wrapper)) {
      return [custom(['transparent_wrappers', index], `duplicate command "${wrapper}"`)];
    }
    if (isReservedTransparentWrapper(wrapper)) {
      return [
        custom(
          ['transparent_wrappers', index],
          `reserved command "${wrapper}" cannot be a wrapper`,
        ),
      ];
    }
    seen.add(wrapper);
    return [];
  });
}

/**
 * Sources that carry no issue of their own stay usable even when the rest of the
 * config is rejected; an over-limit or non-array `rules` field yields none.
 */
export function collectValidSources(
  config: unknown,
  issues: readonly { path: readonly PropertyKey[] }[],
): Set<string> {
  const rules = isRecord(config) ? config.rules : undefined;
  if (!Array.isArray(rules)) return new Set();
  if (issues.some((issue) => issue.path.length === 1 && issue.path[0] === 'rules')) {
    return new Set();
  }
  const rejected = new Set(
    issues
      .filter((issue) => issue.path[0] === 'rules' && typeof issue.path[1] === 'number')
      .map((issue) => issue.path[1]),
  );
  return new Set(
    rules.filter(
      (source, index): source is string => typeof source === 'string' && !rejected.has(index),
    ),
  );
}

function rulebookIssues(rulebook: Record<string, unknown>, v2: boolean): Issue[] {
  return [
    ...(typeof rulebook.name === 'string' && NAME_PATTERN.test(rulebook.name)
      ? []
      : [typed(['name'], 'required string matching rule name pattern')]),
    ...(typeof rulebook.version === 'string' && rulebook.version !== ''
      ? []
      : [typed(['version'], 'required non-empty string')]),
    ...allowedCommandIssues(rulebook.allowed_commands),
    ...rulebookRuleIssues(rulebook.rules, v2),
    ...rulebookTestIssues(rulebook.tests),
    ...unknownFixtureRuleIssues(rulebook),
    ...unlistedRuleCommandIssues(rulebook),
  ];
}

function allowedCommandIssues(commands: unknown): Issue[] {
  if (!Array.isArray(commands)) return [typed(['allowed_commands'], 'required array')];
  const seen = new Set<string>();
  return [
    ...commands.flatMap((command, index) =>
      typeof command === 'string' && COMMAND_PATTERN.test(command)
        ? []
        : [typed(['allowed_commands', index], 'must match command pattern')],
    ),
    ...commands.flatMap((command, index) => {
      if (typeof command !== 'string' || !COMMAND_PATTERN.test(command)) return [];
      if (seen.has(command)) {
        return [custom(['allowed_commands', index], `duplicate command "${command}"`)];
      }
      seen.add(command);
      return [];
    }),
  ];
}

function rulebookRuleIssues(rules: unknown, v2: boolean): Issue[] {
  if (!Array.isArray(rules)) return [typed(['rules'], 'required array')];
  const names = new Set<string>();
  return [
    ...rules.flatMap((rule, index) => {
      if (!isRecord(rule)) return [typed(['rules', index], 'must be an object')];
      return v2 ? v2RuleIssues(rule, ['rules', index]) : v1RuleIssues(rule, ['rules', index]);
    }),
    ...rules.flatMap((rule, index) => {
      const name = isRecord(rule) ? rule.name : undefined;
      if (typeof name !== 'string') return [];
      if (names.has(name.toLowerCase())) {
        return [custom(['rules', index, 'name'], `duplicate rule name "${name}"`)];
      }
      names.add(name.toLowerCase());
      return [];
    }),
  ];
}

function v1RuleIssues(rule: Record<string, unknown>, path: readonly PropertyKey[]): Issue[] {
  return [
    ...ruleNameIssues(rule.name, path),
    ...ruleCommandIssues(rule.command, path),
    ...(rule.subcommand === undefined ||
    (typeof rule.subcommand === 'string' && COMMAND_PATTERN.test(rule.subcommand))
      ? []
      : [typed([...path, 'subcommand'], 'must match command pattern')]),
    ...tokenArrayIssues(
      rule.block_args,
      [...path, 'block_args'],
      'required non-empty array',
      false,
    ),
    ...ruleReasonIssues(rule.reason, path),
    ...ruleIntentIssues(rule.intent, path),
  ];
}

function v2RuleIssues(rule: Record<string, unknown>, path: readonly PropertyKey[]): Issue[] {
  return [
    ...ruleNameIssues(rule.name, path),
    ...ruleCommandIssues(rule.command, path),
    ...ruleReasonIssues(rule.reason, path),
    ...ruleIntentIssues(rule.intent, path),
    ...v2MatchIssues(rule.match, [...path, 'match']),
    ...(rule.subcommand === undefined
      ? []
      : [typed([...path, 'subcommand'], 'not supported in rulebook_version 2')]),
    ...(rule.block_args === undefined
      ? []
      : [typed([...path, 'block_args'], 'not supported in rulebook_version 2')]),
  ];
}

function ruleNameIssues(name: unknown, path: readonly PropertyKey[]): Issue[] {
  if (typeof name !== 'string') return [typed([...path, 'name'], 'required string')];
  return NAME_PATTERN.test(name) ? [] : [typed([...path, 'name'], 'must match rule name pattern')];
}

function ruleCommandIssues(command: unknown, path: readonly PropertyKey[]): Issue[] {
  return typeof command === 'string' && COMMAND_PATTERN.test(command)
    ? []
    : [typed([...path, 'command'], 'required string matching command pattern')];
}

function ruleReasonIssues(reason: unknown, path: readonly PropertyKey[]): Issue[] {
  return typeof reason === 'string' && reason !== '' && reason.length <= MAX_REASON_LENGTH
    ? []
    : [typed([...path, 'reason'], RULEBOOK_REASON_ERROR)];
}

function ruleIntentIssues(intent: unknown, path: readonly PropertyKey[]): Issue[] {
  return intent === undefined || isBlockIntent(intent)
    ? []
    : [typed([...path, 'intent'], INTENT_ERROR)];
}

function v2MatchIssues(match: unknown, path: readonly PropertyKey[]): Issue[] {
  if (!isRecord(match)) return [typed(path, 'required object')];
  return [
    ...tokenArrayIssues(match.command_path, [...path, 'command_path'], COMMAND_PATH_ERROR, false),
    ...(match.any_args === undefined
      ? []
      : tokenArrayIssues(match.any_args, [...path, 'any_args'], TOKEN_LIST_ERROR, true)),
    ...(match.exclude_args === undefined
      ? []
      : tokenArrayIssues(match.exclude_args, [...path, 'exclude_args'], TOKEN_LIST_ERROR, true)),
  ];
}

/**
 * A token list reports each unusable element, then its own emptiness and duplication —
 * but only when no element was the wrong type, which stops the list's checks the way a
 * fatal element issue stops the schema's.
 */
function tokenArrayIssues(
  tokens: unknown,
  path: readonly PropertyKey[],
  arrayError: string,
  unique: boolean,
): Issue[] {
  if (!Array.isArray(tokens)) return [typed(path, arrayError)];
  const elements = tokens.flatMap((token, index) => {
    if (typeof token !== 'string') {
      return [typed([...path, index], 'must be a non-empty string')];
    }
    return token === '' ? [custom([...path, index], 'must be a non-empty string')] : [];
  });
  if (tokens.some((token) => typeof token !== 'string')) return elements;
  return [
    ...elements,
    ...(tokens.length === 0 ? [custom(path, arrayError)] : []),
    ...(unique && new Set(tokens).size !== tokens.length
      ? [custom(path, 'must not contain duplicate values')]
      : []),
  ];
}

function rulebookTestIssues(tests: unknown): Issue[] {
  if (tests === undefined) return [];
  if (!Array.isArray(tests)) return [typed(['tests'], 'must be an array if provided')];
  return tests.flatMap((fixture, index) => {
    if (!isRecord(fixture)) return [typed(['tests', index], 'must be an object')];
    return [
      ...(typeof fixture.command === 'string' && fixture.command.trim() !== ''
        ? []
        : [typed(['tests', index, 'command'], 'required non-empty string')]),
      ...(fixture.expect === 'blocked' || fixture.expect === 'allowed'
        ? []
        : [typed(['tests', index, 'expect'], 'must be "blocked" or "allowed"')]),
      ...(fixture.rule === undefined || typeof fixture.rule === 'string'
        ? []
        : [typed(['tests', index, 'rule'], 'must be a string if provided')]),
      ...(fixture.expect === 'blocked' && typeof fixture.rule !== 'string'
        ? [custom(['tests', index, 'rule'], 'required string for blocked fixtures')]
        : []),
    ];
  });
}

function unknownFixtureRuleIssues(rulebook: Record<string, unknown>): Issue[] {
  if (!Array.isArray(rulebook.tests)) return [];
  const declared = new Set(collectCustomRuleNames(rulebook));
  return [
    ...new Set(
      rulebook.tests.flatMap((fixture) =>
        isRecord(fixture) && fixture.expect === 'blocked' && typeof fixture.rule === 'string'
          ? [fixture.rule]
          : [],
      ),
    ),
  ]
    .filter((rule) => !declared.has(rule))
    .map((rule) => custom(['tests'], `blocked fixture references unknown rule "${rule}"`));
}

function unlistedRuleCommandIssues(rulebook: Record<string, unknown>): Issue[] {
  if (!Array.isArray(rulebook.allowed_commands) || !Array.isArray(rulebook.rules)) return [];
  const allowed = new Set(
    rulebook.allowed_commands.filter((command) => typeof command === 'string'),
  );
  return rulebook.rules.flatMap((rule, index) => {
    const command = isRecord(rule) ? rule.command : undefined;
    if (typeof command !== 'string' || allowed.has(command)) return [];
    return [custom(['rules', index, 'command'], `"${command}" must be listed in allowed_commands`)];
  });
}

/**
 * The schema reports issues in declaration order and appends refinement issues last,
 * so group them back into the field order the diagnostics have always used.
 */
export function sortIssues<T extends { path: readonly PropertyKey[] }>(
  issues: readonly T[],
  fields: readonly string[],
  isRefinement: (issue: T) => boolean,
): T[] {
  const entries = issues.map((issue) => issue.path[1]);
  const entryOrder = [...new Set(entries.filter((entry) => typeof entry === 'string'))];
  const rank = (issue: T, entry: PropertyKey | undefined) =>
    [
      issue.path.length === 0 ? -1 : fields.indexOf(String(issue.path[0])),
      typeof entry === 'number' ? entry : entryOrder.indexOf(String(entry)),
      isRefinement(issue) ? 0 : 1,
    ] as const;
  return issues
    .map((issue, index) => ({ issue, rank: rank(issue, entries[index]) }))
    .sort((a, b) => a.rank[0] - b.rank[0] || a.rank[1] - b.rank[1] || a.rank[2] - b.rank[2])
    .map((entry) => entry.issue);
}

/**
 * Renders issues as this project's diagnostic strings: a `field.path` prefix joined to a
 * short reason, where nested fields use `separator` and top-level ones use
 * `topLevelSeparator`. Two checks can name the same problem, so an identical string is
 * reported once.
 */
function formatIssues(
  issues: readonly Issue[],
  separator: string,
  topLevelSeparator: string,
): string[] {
  return [
    ...new Set(
      issues.map((issue) => {
        const rendered = renderIssuePath(issue.path);
        if (issue.kind === 'unknownKeys') {
          return `${rendered ? `${rendered}.` : ''}unknown field "${issue.message}"`;
        }
        // A record key error already names its key; a collection size limit describes
        // the whole document, not one field of it.
        if (issue.kind === 'key' || issue.kind === 'limit' || issue.path.length === 0) {
          return issue.message;
        }
        return `${rendered}${issue.path.length === 1 ? topLevelSeparator : separator}${issue.message}`;
      }),
    ),
  ];
}

export function renderIssuePath(path: readonly PropertyKey[]): string {
  return path
    .map((segment, index) => {
      if (typeof segment === 'number') return `[${segment}]`;
      return index === 0 ? String(segment) : `.${String(segment)}`;
    })
    .join('');
}

function isBlockIntent(value: unknown): boolean {
  return (BLOCK_INTENTS as readonly unknown[]).includes(value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}
