import { expect } from 'bun:test';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, sep } from 'node:path';
import { createTestEnvironment, type Environment } from '@/core/environment';
import { createToolInvocation, type ToolInvocation, type ToolRoute } from '@/gate/invocation';
import {
  type GuardEvaluation,
  type GuardDependencies as PortedDependencies,
  evaluateGuard as portedEvaluateGuard,
} from '@/gate/pipeline';
import { writeTree } from './fixture-tree';
import { normalize, rootFolds } from './temp-home';

/**
 * The gate under test. The end-to-end files (`harvested`, `tool-routes`, `failure-injection`) all
 * need the same three things — a fixture the corpora and the harvest can name, one invocation
 * shape, and one recordable verdict — so they share them here instead of spelling them out three
 * times.
 */

/**
 * Process state for the trace recordings: a synthetic home over an empty filesystem, so a
 * recording depends on nothing but the command — no path exists and `realpath` answers null.
 */
export const SYNTHETIC_ENVIRONMENT = createTestEnvironment({
  env: new Map([
    ['HOME', '/home/agent'],
    ['PATH', '/usr/local/bin:/usr/bin:/bin'],
    ['SHELL', '/bin/bash'],
    ['TMPDIR', '/tmp'],
    ['USER', 'agent'],
  ]),
  home: '/home/agent',
  tmpdir: '/tmp',
});

/** A plain workspace, a real repository and an empty home under one removable root. */
export function createGateTree(prefix: string) {
  const root = mkdtempSync(join(tmpdir(), prefix));
  writeTree(root, { workspace: null, repository: null, home: null });
  const repository = join(root, 'repository');
  execFileSync('git', ['init', '--quiet', repository]);
  return {
    root,
    repository,
    workspace: join(root, 'workspace'),
    home: join(root, 'home'),
    remove: () => rmSync(root, { recursive: true, force: true }),
  };
}

export function bashCall(command: string, cwd: string): ToolInvocation {
  return toolCall('Bash', { command }, { kind: 'command', shell: 'posix' }, cwd);
}

export function toolCall(
  toolName: string,
  input: unknown,
  route: ToolRoute,
  cwd: string,
): ToolInvocation {
  return createToolInvocation(
    toolName,
    input,
    route,
    { configCwd: cwd, executionCwd: cwd },
    route.kind === 'command' && input !== null && typeof input === 'object'
      ? ((input as { command?: string }).command ?? null)
      : null,
  );
}

/**
 * Everything a caller may record about one evaluation: the stage, the decision's own fields, the
 * level in force, and — where the guard failed closed — the class it threw. An exception that is
 * not a `GuardEvaluationError` is reported rather than rethrown, so a leak past the catch boundary
 * shows up in the record instead of as a crashed test.
 */
export type GateVerdict = Readonly<{
  stage?: unknown;
  outcome: 'allow' | 'deny' | 'uncaught';
  thrown?: string;
  reason?: string;
  intent?: string;
  ruleId?: string;
  evidence?: unknown;
  level?: string;
  configFallback?: unknown;
}>;

function describeEvaluation(evaluation: GuardEvaluation, thrown?: string): GateVerdict {
  const decision = evaluation.decision;
  return {
    stage: evaluation.stage,
    outcome: decision.kind,
    ...(thrown === undefined ? {} : { thrown }),
    ...(decision.kind === 'deny'
      ? {
          reason: decision.reason,
          intent: decision.intent,
          ruleId: decision.ruleId,
          evidence: decision.evidence,
        }
      : {}),
    ...(evaluation.level === undefined ? {} : { level: evaluation.level }),
    ...(evaluation.configFallback === undefined
      ? {}
      : { configFallback: evaluation.configFallback }),
  };
}

function gateVerdict(run: () => GuardEvaluation): GateVerdict {
  try {
    return describeEvaluation(run());
  } catch (error) {
    const failure = error as Error & { evaluation?: GuardEvaluation };
    if (failure.name === 'GuardEvaluationError' && failure.evaluation) {
      return describeEvaluation(failure.evaluation, failure.name);
    }
    return { outcome: 'uncaught', thrown: failure.name, reason: failure.message };
  }
}

export function portedVerdict(
  call: ToolInvocation,
  environment: Environment,
  dependencies: Partial<PortedDependencies>,
): GateVerdict {
  return gateVerdict(() => portedEvaluateGuard(call, { environment, dependencies }));
}

const DIGEST_FILE = join(import.meta.dir, '..', 'fixtures', 'gate', 'harvested-digests.json');

/**
 * The canonical spelling of the system directories that are symlinks on macOS (`/tmp`, `/etc` and
 * `/var` resolve under `/private`): a corpus source that changes into one is canonicalized there,
 * and the digests were recorded where they are real directories.
 */
const SYSTEM_DIRECTORY_FOLDS = ['/tmp', '/etc', '/var'].flatMap((directory) =>
  existsSync(directory) && realpathSync(directory) !== directory
    ? [[realpathSync(directory), directory] as const]
    : [],
);

/**
 * The recorded oracle for a corpus too large to snapshot row by row: the SHA-256 of the canonical
 * JSON of `pairs` — sorted by input, with every plain object's keys sorted — under `key` in
 * `tests/fixtures/gate/harvested-digests.json`. Call it with the values the gate produced, folded
 * of anything a second machine spells differently.
 *
 * A recorded key is compared and the failure names the key and the pair count;
 * `CC_SAFETY_NET_UPDATE_GOLDENS=1` rewrites it instead. An unrecorded key is written locally but
 * throws under `CI`, the way bun refuses to create a missing snapshot there, so a renamed key
 * cannot pass vacuously. `CC_SAFETY_NET_DUMP_VERDICTS=<dir>` also writes the whole pair list to
 * `<dir>/<key>.json`, so two runs can be diffed instead of two hashes.
 *
 * `root` is the temp root a fixture handed the run: both its spellings are folded to `<root>` in
 * every label and every value, so a caller that only has to hide one root does not repeat the
 * fold at each recording site. A run that folds more than that folds it itself and omits `root`.
 * The path separator is folded to `/` with it, so a digest recorded here is not off by the
 * recording host's separator alone on the Windows leg — the same fold `recordPorted` makes.
 *
 * @internal
 */
export function expectRecordedDigest(
  key: string,
  pairs: readonly (readonly [string, unknown])[],
  root?: string,
): void {
  const folds = [
    ...(root === undefined ? [] : rootFolds(root)),
    ...SYSTEM_DIRECTORY_FOLDS,
    ...(sep === '/' ? [] : [[sep, '/'] as const]),
  ];
  const rows = pairs.map(([label, value]) => [normalize(label, folds), value] as const);
  // Every string is folded here rather than up front, because folding a whole value walks it with
  // `normalize`, which rebuilds a `Map` or a `Set` as a plain object — that is, as `{}`. Both are
  // spread instead, so a table or an assignment map is hashed by its contents.
  const json = JSON.stringify(
    [...rows].sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0)),
    (_name, value) =>
      typeof value === 'string'
        ? normalize(value, folds)
        : value instanceof Map || value instanceof Set
          ? [...value]
          : value !== null && typeof value === 'object' && !Array.isArray(value)
            ? Object.fromEntries(Object.entries(value).sort())
            : value,
  );
  const digest = createHash('sha256').update(json).digest('hex');
  const dump = process.env.CC_SAFETY_NET_DUMP_VERDICTS;
  if (dump !== undefined) {
    mkdirSync(dump, { recursive: true });
    writeFileSync(join(dump, `${key.replaceAll('/', '-')}.json`), json);
  }
  const recorded = existsSync(DIGEST_FILE)
    ? (JSON.parse(readFileSync(DIGEST_FILE, 'utf8')) as Record<string, string>)
    : {};
  if (recorded[key] !== undefined && process.env.CC_SAFETY_NET_UPDATE_GOLDENS !== '1') {
    expect(digest, `${key}: ${pairs.length} pairs`).toBe(recorded[key]);
    return;
  }
  if (process.env.CI)
    throw new Error(
      `${key}: no recorded digest for ${pairs.length} pairs; run without CI to record`,
    );
  mkdirSync(dirname(DIGEST_FILE), { recursive: true });
  writeFileSync(
    DIGEST_FILE,
    `${JSON.stringify(Object.fromEntries(Object.entries({ ...recorded, [key]: digest }).sort()), null, 2)}\n`,
  );
}
