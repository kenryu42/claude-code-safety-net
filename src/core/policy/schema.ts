import * as z from 'zod';
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
import { getRulebookSourceSyntaxError, NAME_PATTERN } from './source-syntax';
import { isReservedTransparentWrapper } from './transparent-wrappers';
import { collectValidSources, renderIssuePath, sortIssues } from './validate';

let schemas: ReturnType<typeof createSchemas> | undefined;
const OVER_LIMIT_RULE_SOURCES = Array(RULE_SOURCE_LIMIT + 1).fill('over-limit');
const RULE_OVERRIDE_KEY_PATTERN = /^[^/]+\/[^/]+$/;
const AUDIT_RETENTION_ERROR = `must be an integer between ${MIN_AUDIT_RETENTION_DAYS} and ${MAX_AUDIT_RETENTION_DAYS}`;
const RULES_CONFIG_FIELDS = ['version', 'rules', 'overrides', 'transparent_wrappers'];
const USER_POLICY_FIELDS = [
  'version',
  'safety',
  'workflow',
  'destructive_command_protection',
  'secret_protection',
  'audit',
];

// Zod skips a container's refinement once one of its entries fails fatally, which
// would hide the remaining entry diagnostics. `when` opts the refinement out of
// that short-circuit so every entry still reports its own error.
const alwaysRun = <T>(refinement: (value: T, context: z.core.$RefinementCtx<T>) => void) => {
  const check = z.superRefine(refinement);
  check._zod.def.when = () => true;
  return check;
};

function preflightRulesConfig(config: unknown): unknown {
  if (
    !isRecord(config) ||
    !Array.isArray(config.rules) ||
    config.rules.length <= RULE_SOURCE_LIMIT
  ) {
    return config;
  }
  return {
    $schema: config.$schema,
    version: config.version,
    rules: OVER_LIMIT_RULE_SOURCES,
    overrides: config.overrides,
    transparent_wrappers: config.transparent_wrappers,
  };
}

function createSchemas() {
  const BlockIntentSchema = z.enum(BLOCK_INTENTS);
  const RuleOverrideSchema = z
    .union(
      [
        z.literal('off'),
        z.looseObject({
          reason: z
            .string({ error: 'required non-empty string' })
            .min(1, 'required non-empty string')
            .max(MAX_REASON_LENGTH, `must be at most ${MAX_REASON_LENGTH} characters`)
            .describe('Replacement block reason'),
          intent: BlockIntentSchema.optional(),
        }),
      ],
      { error: 'must be "off" or an object' },
    )
    .describe('Disable a rule or replace its block reason and intent.');
  const RuleSourceSchema = z
    .string({ error: 'must be a rulebook source string' })
    .min(1, 'must be a non-empty rulebook source string');
  const TransparentWrapperSchema = z
    .string({ error: 'must be a command string' })
    .regex(COMMAND_PATTERN, 'must match command pattern')
    .describe("Command name such as 'git', 'docker', or 'rtk'.");
  const RulesConfigObjectSchema = z.looseObject({
    $schema: z.unknown().optional().describe('JSON Schema reference for IDE support'),
    version: z.literal(1).describe('Schema version (must be 1)'),
    rules: z
      .array(RuleSourceSchema, { error: 'must be an array of rulebook source strings' })
      .max(RULE_SOURCE_LIMIT, RULE_SOURCE_LIMIT_ERROR)
      .default([])
      .describe('Rulebook source strings such as project-rules or owner/repo#main/team-rules'),
    // The key pattern rides on metadata rather than on the key schema: Zod drops the
    // value of an entry whose key fails, which would hide the override's own errors.
    overrides: z
      .record(z.string().meta({ pattern: RULE_OVERRIDE_KEY_PATTERN.source }), RuleOverrideSchema)
      .default({})
      .describe('Rule overrides by id'),
    transparent_wrappers: z
      .array(TransparentWrapperSchema, { error: 'must be an array of command strings' })
      .default([])
      .describe('Commands that transparently execute a visible protected child command'),
  });
  const refineRulesConfig = (
    config: z.output<typeof RulesConfigObjectSchema>,
    context: z.core.$RefinementCtx,
  ) => {
    if (!isRecord(config)) return;
    if (Array.isArray(config.rules) && config.rules.length <= RULE_SOURCE_LIMIT) {
      const sources = new Set<string>();
      config.rules.forEach((source, index) => {
        // Non-strings and empty strings already carry the element's own issue.
        if (typeof source !== 'string' || source === '') return;
        if (source.trim() === '') {
          context.addIssue({
            code: 'custom',
            message: 'must be a non-empty rulebook source string',
            path: ['rules', index],
          });
          return;
        }
        const sourceError = getRulebookSourceSyntaxError(source);
        if (sourceError) {
          context.addIssue({ code: 'custom', message: sourceError, path: ['rules', index] });
          return;
        }
        if (sources.has(source)) {
          context.addIssue({
            code: 'custom',
            message: `duplicate rulebook source "${source}"`,
            path: ['rules', index],
          });
          return;
        }
        sources.add(source);
      });
    }

    if (isRecord(config.overrides)) {
      for (const key of Object.keys(config.overrides)) {
        if (RULE_OVERRIDE_KEY_PATTERN.test(key)) continue;
        context.addIssue({
          code: 'custom',
          message: 'must use <rulebook-name>/<rule-name>',
          path: ['overrides', key],
        });
      }
    }

    if (!Array.isArray(config.transparent_wrappers)) return;
    const wrappers = new Set<string>();
    config.transparent_wrappers.forEach((wrapper, index) => {
      if (typeof wrapper !== 'string' || !COMMAND_PATTERN.test(wrapper)) return;
      if (wrappers.has(wrapper)) {
        context.addIssue({
          code: 'custom',
          message: `duplicate command "${wrapper}"`,
          path: ['transparent_wrappers', index],
        });
        return;
      }
      if (isReservedTransparentWrapper(wrapper)) {
        context.addIssue({
          code: 'custom',
          message: `reserved command "${wrapper}" cannot be a wrapper`,
          path: ['transparent_wrappers', index],
        });
        return;
      }
      wrappers.add(wrapper);
    });
  };
  const RulesConfigSchema = z.preprocess(
    preflightRulesConfig,
    RulesConfigObjectSchema.check(z.superRefine(refineRulesConfig)),
  );
  // Same shape and same refinement, but reporting instead of parsing: it keeps naming
  // config problems that the authoritative parse stops looking for after a fatal one.
  const RulesConfigDiagnosticSchema = z.preprocess(
    preflightRulesConfig,
    RulesConfigObjectSchema.check(alwaysRun(refineRulesConfig)),
  );
  const refineDuplicateRuleNames = (rules: unknown[], context: z.core.$RefinementCtx) => {
    if (!Array.isArray(rules)) return;
    const names = new Set<string>();
    rules.forEach((rule, index) => {
      const name = isRecord(rule) ? rule.name : undefined;
      if (typeof name !== 'string') return;
      if (names.has(name.toLowerCase())) {
        context.addIssue({
          code: 'custom',
          message: `duplicate rule name "${name}"`,
          path: [index, 'name'],
        });
        return;
      }
      names.add(name.toLowerCase());
    });
  };
  // The custom rules a legacy config carries inline. Rulebooks accept the same rules
  // with their own wording, which `validate.ts` reports without the schema library.
  const commandPatternError = 'must match pattern (letters, numbers, hyphens, underscores)';
  const customRuleObjectSchema = z.looseObject(
    {
      name: z
        .string({ error: 'required string' })
        .regex(
          NAME_PATTERN,
          'must match pattern (letters, numbers, hyphens, underscores; max 64 chars)',
        ),
      command: z.string({ error: 'required string' }).regex(COMMAND_PATTERN, commandPatternError),
      subcommand: z
        .string({ error: 'must be a string if provided' })
        .regex(COMMAND_PATTERN, commandPatternError)
        .optional(),
      block_args: z
        .array(
          z
            .string({ error: 'must be a string' })
            .refine((arg) => arg !== '', { error: 'must not be empty' }),
          { error: 'required array' },
        )
        .refine((args) => args.length > 0, { error: 'must have at least one element' }),
      reason: z
        .string({ error: 'required string' })
        .refine((reason) => reason !== '', { error: 'must not be empty' })
        .refine((reason) => reason.length <= MAX_REASON_LENGTH, {
          error: `must be at most ${MAX_REASON_LENGTH} characters`,
        }),
      intent: BlockIntentSchema.optional(),
    },
    { error: 'must be an object' },
  );
  const LegacyConfigSchema = z.looseObject({
    version: z.literal(1),
    rules: z
      .array(customRuleObjectSchema, { error: 'must be an array' })
      .check(alwaysRun(refineDuplicateRuleNames))
      .optional(),
  });
  return {
    RulesConfigSchema,
    RulesConfigDiagnosticSchema,
    LegacyConfigSchema,
  };
}

// The path validators read the caller's home, so the user policy schema is the one
// schema that cannot be shared across callers.
function createUserPolicySchema(home: string) {
  const SafetyOverridesSchema = z.strictObject({
    fail_closed: z.boolean().optional(),
    paranoid_rm: z.boolean().optional(),
    paranoid_interpreters: z.boolean().optional(),
  });
  // The rule id lives in the record key, so the key schema is the only place that can
  // name it; Zod nests the resulting issue under `invalid_key` and then drops that
  // entry's value, so a second record reports the values independently.
  const ruleIdOverridesSchema = (knownIds: ReadonlySet<string>, label: string) =>
    z.intersection(
      z.record(
        z.string().refine((id) => knownIds.has(id), {
          error: (issue) => `unknown ${label} rule id "${String(issue.input)}"`,
        }),
        z.unknown(),
      ),
      z.record(z.string(), z.enum(['on', 'off'])),
    );
  const policyPathsSchema = (getPathError: (value: unknown, home: string) => string | null) =>
    z
      .array(z.string({ error: 'must be a non-empty path string' }), {
        error: 'must be an array of paths',
      })
      .check(
        alwaysRun<string[]>((paths, context) => {
          if (!Array.isArray(paths)) return;
          paths.forEach((path, index) => {
            if (typeof path !== 'string') return;
            const error = getPathError(path, home);
            if (error) context.addIssue({ code: 'custom', message: error, path: [index] });
          });
        }),
      );
  return z.strictObject({
    version: z.literal(1),
    safety: z
      .strictObject({
        level: z.enum(['standard', 'strict', 'paranoid']).optional(),
        overrides: SafetyOverridesSchema.optional(),
      })
      .optional(),
    workflow: z.strictObject({ worktree_mode: z.boolean().optional() }).optional(),
    destructive_command_protection: z
      .strictObject({
        enabled: z.boolean().optional(),
        overrides: ruleIdOverridesSchema(
          DESTRUCTIVE_COMMAND_RULE_ID_SET,
          'destructive command',
        ).optional(),
        allow_paths: policyPathsSchema(getDestructiveAllowPathError).optional(),
      })
      .optional(),
    secret_protection: z
      .strictObject({
        enabled: z.boolean().optional(),
        overrides: ruleIdOverridesSchema(
          SECRET_PROTECTION_RULE_ID_SET,
          'secret protection',
        ).optional(),
        deny_paths: policyPathsSchema(getSecretDenyPathError).optional(),
        allow_paths: policyPathsSchema(getSecretAllowPathError).optional(),
      })
      .optional(),
    audit: z
      .strictObject({
        retention_days: z
          .number({ error: AUDIT_RETENTION_ERROR })
          .int(AUDIT_RETENTION_ERROR)
          .min(MIN_AUDIT_RETENTION_DAYS, AUDIT_RETENTION_ERROR)
          .max(MAX_AUDIT_RETENTION_DAYS, AUDIT_RETENTION_ERROR)
          .optional()
          .describe('Days of audit log history to keep before the sweep deletes it'),
      })
      .optional(),
  });
}

function getSchemas() {
  schemas ??= createSchemas();
  return schemas;
}

export function getRulesConfigSchema() {
  return getSchemas().RulesConfigSchema;
}

/** @internal */
export function getUserPolicySchema(home: string) {
  return createUserPolicySchema(home);
}

export function getLegacyConfigSchema() {
  return getSchemas().LegacyConfigSchema;
}

/** @internal */
export function getRulesConfigDiagnostics(config: unknown): string[] {
  return getRulesConfigValidation(config).errors;
}

/** @internal */
export function getRulesConfigValidation(config: unknown): {
  errors: string[];
  sources: Set<string>;
} {
  const parsed = getSchemas().RulesConfigDiagnosticSchema.safeParse(config);
  if (parsed.success) return { errors: [], sources: new Set(parsed.data.rules) };
  return {
    errors: formatSchemaIssues(
      sortIssues(parsed.error.issues, RULES_CONFIG_FIELDS, (issue) => issue.code === 'custom'),
    ),
    sources: collectValidSources(config, parsed.error.issues),
  };
}

/** @internal */
export function getUserPolicyDiagnostics(config: unknown, home: string): string[] {
  const parsed = getUserPolicySchema(home).safeParse(config);
  if (parsed.success) return [];
  return formatSchemaIssues(
    sortIssues(parsed.error.issues, USER_POLICY_FIELDS, (issue) => issue.code === 'custom'),
    ' ',
  );
}

/**
 * Renders Zod issues as this project's diagnostic strings: a `field.path` prefix joined
 * to a short reason, where nested fields use `separator` (`rules[0]: ...`) and top-level
 * ones use `topLevelSeparator`, a sentence by default (`version must be 1`). Both halves
 * of an intersection can name the same problem, so an identical string is reported once.
 */
export function formatSchemaIssues(
  issues: readonly z.core.$ZodIssue[],
  separator = ': ',
  topLevelSeparator = ' ',
): string[] {
  return [
    ...new Set(
      issues.flatMap((issue) => formatSchemaIssue(issue, separator, topLevelSeparator, [])),
    ),
  ];
}

function formatSchemaIssue(
  issue: z.core.$ZodIssue,
  separator: string,
  topLevelSeparator: string,
  prefix: readonly PropertyKey[],
): string[] {
  const path = [...prefix, ...issue.path];
  const rendered = renderIssuePath(path);
  if (issue.code === 'unrecognized_keys') {
    return issue.keys.map((key) => `${rendered ? `${rendered}.` : ''}unknown field "${key}"`);
  }
  // A record key error is raised by the key schema, which knows the key and so
  // already carries the whole message.
  if (issue.code === 'invalid_key') return issue.issues.map((inner) => inner.message);
  if (issue.code === 'invalid_union') {
    const inner = issue.errors.flat().filter((candidate) => candidate.path.length > 0);
    if (inner.length > 0) {
      return inner.flatMap((candidate) =>
        formatSchemaIssue(candidate, separator, topLevelSeparator, path),
      );
    }
  }
  if (path.length === 0) {
    return [issue.code === 'invalid_type' ? 'Config must be an object' : issue.message];
  }
  // A top-level collection size limit describes the whole config, not one field of it.
  if (
    path.length === 1 &&
    (issue.code === 'too_big' || issue.code === 'too_small') &&
    issue.origin === 'array'
  ) {
    return [issue.message];
  }
  return [`${rendered}${path.length === 1 ? topLevelSeparator : separator}${describeIssue(issue)}`];
}

function describeIssue(issue: z.core.$ZodIssue): string {
  if (issue.code === 'invalid_value') return `must be ${renderExpectedValues(issue.values)}`;
  // Only Zod's own wording is rephrased; a schema that supplies its own keeps it.
  if (issue.code !== 'invalid_type' || !issue.message.startsWith('Invalid input:')) {
    return issue.message;
  }
  if (issue.expected === 'object' || issue.expected === 'record') {
    return 'must be an object if provided';
  }
  return issue.expected === 'boolean' ? 'must be a boolean' : issue.message;
}

function renderExpectedValues(values: readonly z.core.util.Primitive[]) {
  if (values.length > 3) return `one of ${values.join(', ')}`;
  const rendered = values.map((value) =>
    typeof value === 'string' ? `"${value}"` : String(value),
  );
  if (rendered.length < 2) return `${rendered[0]}`;
  return `${rendered.slice(0, -1).join(', ')}${rendered.length > 2 ? ',' : ''} or ${rendered.at(-1)}`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}
