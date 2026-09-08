import { afterEach, describe, expect, spyOn, test } from 'bun:test';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { runExplain } from '@/cli/explain/run';
import { AnalysisLimit } from '@/core/budget';
import { explainCommand, getConfigSource } from '@/gate/explain';
import { StructuralShellSyntaxLimitError } from '@/gate/guards/semantic-facts';
import { GuardEvaluationError } from '@/gate/pipeline';
import { createLinkedWorktreeFixture } from '../helpers';
import { EXPLAIN_CASES, LIMIT_MESSAGES, LIMIT_SLUGS } from '../helpers/explain-cases';
import { withStdoutTTY } from '../helpers/fake-tty';
import { type TreeSpec, writeTree } from '../helpers/fixture-tree';
import { policySnapshot } from '../helpers/policy';
import {
  createTempRoot,
  environmentFor,
  isolationEnv,
  removeTempRoots,
  withProcessEnv,
} from '../helpers/temp-home';

/**
 * The projection itself, field by field, where the rendered rows only record the bytes that survive
 * formatting. `explainCommand` reads its home and modes from an Environment, so each row runs it
 * against the values its fixture spells and records the result as data.
 */

afterEach(() => {
  removeTempRoots();
});

/** The modes a developer's shell may carry in; each row sets the ones it is about. */
const MODES_UNSET: Record<string, string | undefined> = {
  CC_SAFETY_NET_LEVEL: undefined,
  CC_SAFETY_NET_STRICT: undefined,
  CC_SAFETY_NET_PARANOID: undefined,
  CC_SAFETY_NET_WORKTREE: undefined,
};

function fixture(files: TreeSpec = {}, env: Record<string, string | undefined> = {}) {
  const root = createTempRoot('explain-');
  const home = join(root, 'home');
  const project = join(root, 'project');
  mkdirSync(project, { recursive: true });
  writeTree(root, files);
  return { root, home, project, values: { ...MODES_UNSET, ...isolationEnv(home), ...env } };
}

type Fixture = ReturnType<typeof fixture>;

/** The result as plain data: a `Map`-free copy of the frozen projection records cleanly. */
const asData = (result: unknown) => JSON.parse(JSON.stringify(result)) as Record<string, unknown>;

function compareSides(
  side: Fixture,
  command: string,
  options: Parameters<typeof explainCommand>[1] = {},
) {
  const withCwd = { cwd: side.project, ...options };
  const ported = withStdoutTTY(false, () =>
    asData(explainCommand(command, withCwd, environmentFor(side.home, side.values))),
  );
  // The worktree row's project is a `git worktree add` fixture of its own, outside the row's
  // root; every other row's project is already inside it, so the second pair folds nothing.
  return ported;
}

describe('explainCommand projects the same result as the shipped engine', () => {
  for (const explainCase of EXPLAIN_CASES.filter((entry) => !LIMIT_SLUGS.includes(entry.slug))) {
    test(explainCase.slug, () => {
      compareSides(fixture(explainCase.files, explainCase.env), explainCase.command);
    });
  }
});

describe('explainCommand honours its options', () => {
  test('strict raises the modes the analyzer runs under', () => {
    // Row 10 is allowed at standard because its rule waits on `fail_closed`; row 18 needs
    // strict for the unparseable text to be reported at all.
    for (const slug of ['10-dynamic-target', '18-strict-unparseable']) {
      const explainCase = EXPLAIN_CASES.find((entry) => entry.slug === slug);
      if (!explainCase) throw new Error(`no explain case named ${slug}`);
      const result = compareSides(fixture(explainCase.files), explainCase.command, {
        strict: true,
      });
      expect(result.result).toBe('blocked');
    }
  });

  test('a supplied snapshot replaces the one the loader would read', () => {
    const side = fixture();
    const result = compareSides(side, 'git reset --hard', {
      policySnapshot: policySnapshot({ safety: { level: 'strict' } }),
    });
    expect(result.selectedPreset).toBe('strict');
  });

  test('a user config directory moves the reported config source', () => {
    const side = fixture({
      'userrules/rule.json': `${JSON.stringify({ version: 1, rules: [] }, null, 2)}\n`,
    });
    const result = compareSides(side, 'git status', {
      userConfigDir: join(side.root, 'userrules'),
    });
    expect(result.configSource).toBe(join(side.root, 'userrules', 'rule.json'));
    expect(result.configValid).toBe(true);
  });
});

describe('getConfigSource reports the rule config explain resolved against', () => {
  const rows: { name: string; files: TreeSpec; source: string | null; valid: boolean }[] = [
    { name: 'no config anywhere', files: {}, source: null, valid: true },
    {
      name: 'a valid project config',
      files: { 'project/.cc-safety-net/rules/rule.json': '{ "version": 1 }' },
      source: 'project',
      valid: true,
    },
    {
      name: 'a project config that is not JSON',
      files: { 'project/.cc-safety-net/rules/rule.json': 'not json' },
      source: 'project',
      valid: false,
    },
    {
      name: 'a user config when the project has none',
      files: { 'home/.cc-safety-net/rules/rule.json': '{ "version": 1 }' },
      source: 'user',
      valid: true,
    },
  ];

  for (const row of rows) {
    test(row.name, () => {
      const side = fixture(row.files);
      const ported = withProcessEnv(side.values, () =>
        getConfigSource(environmentFor(side.home, side.values), { cwd: side.project }),
      );
      expect(ported.configValid).toBe(row.valid);
      expect(ported.configSource).toBe(
        row.source === null
          ? null
          : join(
              row.source === 'project' ? side.project : side.home,
              '.cc-safety-net',
              'rules',
              'rule.json',
            ),
      );
    });
  }
});

/**
 * Worktree relaxation needs a real repository with a linked worktree, so it is compared here
 * rather than through the two bins: the process-level harness puts an empty directory on `PATH`
 * and no `git` binary can be found from there.
 */
test('a linked worktree relaxes the reset rule on both sides', () => {
  const worktree = createLinkedWorktreeFixture();
  const side = { ...fixture(), project: worktree.linkedWorktree };
  const withMode = { ...side, values: { ...side.values, CC_SAFETY_NET_WORKTREE: '1' } };
  const result = compareSides(withMode, 'git reset --hard');
  worktree.cleanup();
  expect(result.result).toBe('allowed');
  expect(
    (result.trace as { segments: { steps: { type: string }[] }[] }).segments.flatMap((segment) =>
      segment.steps.map((step) => step.type),
    ),
  ).toContain('worktree-relaxation');
});

const limitCase = (slug: string) => {
  const explainCase = EXPLAIN_CASES.find((entry) => entry.slug === slug);
  if (!explainCase) throw new Error(`no explain case named ${slug}`);
  return explainCase.command;
};

function thrownBy(run: () => unknown): unknown {
  try {
    run();
  } catch (error) {
    return error;
  }
  return null;
}

describe('explainCommand fails closed on an analysis budget breach', () => {
  test('a structural-limit syntax throws before the guard runs', () => {
    const side = fixture();
    expect(
      thrownBy(() =>
        explainCommand(
          limitCase('21-structural-limit'),
          { cwd: side.project },
          environmentFor(side.home, side.values),
        ),
      ),
    ).toBeInstanceOf(StructuralShellSyntaxLimitError);
  });

  test('a path-canonicalization breach arrives wrapped by the guard', () => {
    const side = fixture();
    const error = thrownBy(() =>
      explainCommand(
        limitCase('22-path-limit'),
        { cwd: side.project },
        environmentFor(side.home, side.values),
      ),
    );
    expect(error).toBeInstanceOf(GuardEvaluationError);
    expect((error as GuardEvaluationError).cause).toBeInstanceOf(AnalysisLimit);
  });

  test('runExplain reports both breaches with the shipped wording', async () => {
    const side = fixture();
    const environment = environmentFor(side.home, side.values);
    const written: string[] = [];
    const write = spyOn(process.stdout, 'write').mockImplementation(((
      chunk: string,
      callback?: () => void,
    ) => {
      written.push(chunk);
      callback?.();
      return true;
    }) as typeof process.stdout.write);
    const reported: string[] = [];
    const errors = spyOn(console, 'error').mockImplementation((message: string) => {
      reported.push(message);
    });
    const codes = [
      await runExplain(environment, [
        '--json',
        '--cwd',
        side.project,
        limitCase('21-structural-limit'),
      ]),
      await runExplain(environment, ['--cwd', side.project, limitCase('22-path-limit')]),
    ];
    write.mockRestore();
    errors.mockRestore();
    expect(codes).toEqual([1, 1]);
    expect(written).toEqual([`${JSON.stringify({ error: LIMIT_MESSAGES[0] })}\n`]);
    expect(reported).toEqual([LIMIT_MESSAGES[1] as string]);
  });
});
