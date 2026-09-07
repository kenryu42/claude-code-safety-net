import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { mkdtempSync, realpathSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { type Budget, createBudget } from '@/core/budget';
import type { Environment } from '@/core/environment';
import {
  normalizeProtectedFileCandidate,
  normalizeProtectedPathCandidate,
} from '@/core/paths/canonicalization';
import { parseCommand } from '@/core/shell/parse';
import { projectShellSyntax } from '@/core/shell/projection';
import {
  expandTrackedShellVariables,
  extractMvOperandPaths,
  findProtectedPathMutationInCommand,
  isAssignmentOnlySegment,
  type ProtectedPathShellState,
} from '@/gate/guards/protected-path-scanner';
import { pairedEnvironments } from '../../core/differential-inputs';
import { describeOutcome, type Outcome, writeTree } from '../../helpers/fixture-tree';
import { expectRecordedDigest } from '../../helpers/gate-differential';
import {
  corpusCommands,
  FIXED_COMMANDS,
  FUZZ_SAMPLE_COUNT,
  FUZZ_SEED,
  fuzzShellSources,
} from '../../helpers/shell-inputs';

/**
 * The scanner is the walk every protected-path guard drives: it decides where one segment ends,
 * which `cd` moves the tracked cwd, which assignments become tracked variables and which
 * redirection targets reach the guard. A change here silently unprotects a path, so the record
 * carries every callback the walk makes, not only what it returns.
 */

const MARKER = 'policy.json';

let root = '';
let home = '';
let workspace = '';

/** Every callback the walk made, in order, with the state it was handed. */
type Observation = string;

function describeState(state: ProtectedPathShellState): string {
  return `cwd=${state.cwd} vars=${JSON.stringify([...state.variables].sort())}`;
}

/** The three observing callbacks the walk is driven through. */
function observing(observations: Observation[], stopWord: string | null) {
  return {
    findSegmentTarget: (segment: readonly string[], state: ProtectedPathShellState) => {
      observations.push(`segment ${JSON.stringify(segment)} ${describeState(state)}`);
      return stopWord !== null && segment.includes(stopWord) ? segment.join(' ') : null;
    },
    isRedirectionTarget: (target: string, state: ProtectedPathShellState) => {
      observations.push(`redirect ${target} ${describeState(state)}`);
      return target.includes(MARKER);
    },
    findMalformedTarget: (source: string) => {
      observations.push(`malformed ${source}`);
      return source.includes(MARKER) ? source : null;
    },
  };
}

type Walk = { result: string | null; observations: readonly Observation[] };

function walkWithNext(source: string, cwd: string, environment: Environment, stop: string | null) {
  const observations: Observation[] = [];
  const result = findProtectedPathMutationInCommand(
    projectShellSyntax(source, parseCommand(source, 'posix')),
    cwd,
    environment,
    createBudget(),
    { ...observing(observations, stop), normalizeCwd: normalizeProtectedPathCandidate },
  );
  return { result, observations };
}

/** The walk over one source — value or thrown error — so a caller can record either. */
function walkPair(source: string, cwd: string, stop: string | null): Outcome<Walk> {
  const environments = pairedEnvironments({ HOME: home, TMPDIR: join(root, 'tmp') }, home);
  return describeOutcome(() => walkWithNext(source, cwd, environments, stop));
}

/** The walk that must have succeeded, for the assertions that read what it observed. */
function completedWalk(outcome: Outcome<Walk>): Walk {
  if (!outcome.ok) throw new Error(`walk threw ${outcome.error.name}`);
  return outcome.value;
}

const CD_SOURCES: readonly string[] = [
  `cd ${MARKER}`,
  'cd /nowhere && rm -rf x',
  'cd - && rm -rf x',
  'cd ..; rm -rf x',
  'cd ~ ; rm -rf x',
  'cd "$HOME" ; rm -rf x',
  'cd $DIR ; rm -rf x',
  'DIR=policy; cd $DIR; rm -rf x',
  'DIR=policy && cd ${DIR} && rm -rf x',
  'DIR=policy; cd ${OTHER:-$DIR}; rm -rf x',
  'DIR=policy; cd ${DIR:+alt}; rm -rf x',
  'EMPTY=; cd ${EMPTY:-policy}; rm -rf x',
  'EMPTY=; cd ${EMPTY-policy}; rm -rf x',
  'A=policy B=$A; cd $B; rm -rf x',
  'A=policy; B=$A; cd $B; rm -rf x',
  'cd policy | cd link | rm -rf x',
  'cd policy & cd link & rm -rf x',
  'cd policy || cd link || rm -rf x',
  'sudo cd policy && rm -rf x',
  'env -i cd policy && rm -rf x',
  'command cd policy && rm -rf x',
  'FOO=1 cd policy && rm -rf x',
  'cd link && rm -rf x',
  'cd policy/nested && rm -rf x',
  'cd /absolute/missing && rm -rf x',
  '(cd policy && rm -rf x)',
  'cd; rm -rf x',
  'cd ""; rm -rf x',
  './cd policy && rm -rf x',
  '/usr/bin/cd policy && rm -rf x',
];

const SEGMENT_SOURCES: readonly string[] = [
  `rm -rf ${MARKER}`,
  `rm -rf policy/${MARKER} && echo done`,
  `mv ${MARKER} /tmp/elsewhere`,
  `mv -t /tmp ${MARKER}`,
  `echo hi > ${MARKER}`,
  `echo hi >> policy/${MARKER}`,
  `echo hi 2> ${MARKER}`,
  `echo hi >| ${MARKER}`,
  `cat < ${MARKER}`,
  `cat <<EOF > ${MARKER}\nbody\nEOF`,
  `DEST=${MARKER}; echo hi > $DEST`,
  'DEST=policy.json; echo hi > ${DEST}',
  'DEST=policy.json echo hi > $DEST',
  `find . -name '*.json' -delete`,
  `find policy -delete`,
  `echo "unclosed > ${MARKER}`,
  `echo hi > ${MARKER}; echo second > other`,
  `A=1 B=2`,
  `A=1 B=2; rm -rf ${MARKER}`,
  `rm -rf x && echo hi > ${MARKER}`,
];

beforeAll(() => {
  root = mkdtempSync(join(tmpdir(), 'next-protected-path-'));
  home = join(root, 'home');
  workspace = join(root, 'work');
  writeTree(root, {
    'home/.config': null,
    tmp: null,
    'work/nested': null,
    [`policy/${MARKER}`]: '{}',
    'policy/nested': null,
    link: { symlink: join(root, 'policy') },
    'dangling-link': { symlink: join(root, 'nowhere') },
  });
});

afterAll(() => {
  rmSync(root, { recursive: true, force: true });
});

describe('protected path scanner walk', () => {
  test('records the same segments, states and redirections as the shipped walk', () => {
    const sources = [...CD_SOURCES, ...SEGMENT_SOURCES];
    const recorded: [string, unknown][] = [];
    for (const source of sources) {
      for (const stop of [null, 'rm', MARKER]) {
        recorded.push([`${source} (stop=${stop})`, walkPair(source, workspace, stop)]);
      }
    }
    expectRecordedDigest('guards-protected-path/walk-table', recorded, root);
  });

  test('the fixed table moves the tracked cwd and returns targets', () => {
    const trackedCwds = new Set(
      CD_SOURCES.flatMap((source) =>
        completedWalk(walkPair(source, workspace, null)).observations.flatMap(
          (observation) => observation.match(/cwd=(\S+)/)?.[1] ?? [],
        ),
      ),
    );
    // The walk canonicalizes a `cd` target's existing prefix, so the tracked cwd spells the real
    // path of the fixture (`work/policy` itself does not exist).
    expect(trackedCwds).toContain(join(realpathSync(workspace), 'policy'));
    expect(trackedCwds).toContain(realpathSync(home));
    expect(trackedCwds).toContain(realpathSync(root));
    // A `cd` through a symlink is canonicalized, so the guard sees one spelling of the target.
    expect(
      completedWalk(
        walkPair(`cd ${join(root, 'link')} && rm -rf x`, workspace, null),
      ).observations.some((observation) => observation.includes(`cwd=${join(root, 'policy')}`)),
    ).toBeTrue();
    expect(
      SEGMENT_SOURCES.map(
        (source) => completedWalk(walkPair(source, workspace, MARKER)).result,
      ).filter((result) => result !== null).length,
    ).toBeGreaterThan(5);
  });

  test('matches the shipped walk over the corpus and the seeded fuzz', () => {
    const recorded: [string, unknown][] = [];
    for (const source of [
      ...corpusCommands(),
      ...FIXED_COMMANDS,
      ...fuzzShellSources(FUZZ_SAMPLE_COUNT, FUZZ_SEED),
    ]) {
      recorded.push([source, walkPair(source, workspace, 'rm')]);
    }
    expectRecordedDigest('guards-protected-path/corpus-fuzz', recorded, root);
  });

  test('a structural-limit projection throws on both sides, an incomplete one is malformed', () => {
    const observations: Observation[] = [];
    const facts = {
      status: 'structural-limit',
      source: MARKER,
      entries: [],
      assignmentFallbacks: [],
    } as const;
    expect(() =>
      findProtectedPathMutationInCommand(
        facts,
        workspace,
        pairedEnvironments({}, home),
        createBudget(),
        { ...observing(observations, null), normalizeCwd: normalizeProtectedPathCandidate },
      ),
    ).toThrow('Structural command analysis limit exceeded.');
    expect(observations).toStrictEqual([]);

    const next = walkPair(`echo "unclosed ${MARKER}`, workspace, null);
    expect(completedWalk(next).observations[0]).toStartWith('malformed ');
    expectRecordedDigest('guards-protected-path/malformed', [['unclosed quote', next]], root);
  });
});

const VARIABLE_TABLE: readonly (readonly [string, readonly [string, string][]])[] = [
  ['$A/$B', [['A', '/one']]],
  ['${A}/${B}', [['A', '/one']]],
  ['${A:-fallback}', []],
  ['${A:-fallback}', [['A', '']]],
  ['${A-fallback}', [['A', '']]],
  ['${A:+set}', [['A', 'value']]],
  ['${A+set}', [['A', '']]],
  ['${A:-$B}', [['B', 'nested']]],
  ['${A:-${B}}', [['B', 'nested']]],
  ['$A$A$A', [['A', 'x']]],
  ['$AB', [['A', 'x']]],
  ['${AB}', [['A', 'x']]],
  ['$1 $@ $? $$', [['1', 'positional']]],
  ['no variables here', [['A', 'x']]],
  ['', [['A', 'x']]],
  ['${unclosed', [['unclosed', 'x']]],
  ['$A/${A:-$A}', [['A', 'recursive']]],
];

describe('tracked shell variable expansion', () => {
  test('expands the fixed table and the corpus words identically', () => {
    const recorded: [string, unknown][] = [];
    for (const [text, entries] of VARIABLE_TABLE) {
      const variables = new Map(entries);
      recorded.push([
        `${text} ${JSON.stringify(entries)}`,
        expandTrackedShellVariables(text, variables),
      ]);
    }
    const variables = new Map([
      ['HOME', home],
      ['A', '/a'],
      ['DIR', join(root, 'policy')],
      ['EMPTY', ''],
    ]);
    for (const word of [...corpusCommands(), ...FIXED_COMMANDS].flatMap((command) =>
      command.split(/\s+/),
    )) {
      recorded.push([`word ${word}`, expandTrackedShellVariables(word, variables)]);
    }
    expectRecordedDigest('guards-protected-path/variable-expansion', recorded, root);
  });

  test('an unset name is left as written and a set one is substituted', () => {
    expect(expandTrackedShellVariables('$A', new Map())).toBe('$A');
    expect(expandTrackedShellVariables('$A', new Map([['A', 'x']]))).toBe('x');
  });
});

const SEGMENT_TABLE: readonly (readonly string[])[] = [
  [],
  [''],
  ['A=1'],
  ['A=1', 'B=2'],
  ['A='],
  ['A=1', 'echo'],
  ['echo', 'A=1'],
  ['1A=1'],
  ['_A=1'],
  ['A-B=1'],
  ['A=1=2'],
  ['A'],
  ['=1'],
  ['A=$B'],
];

const MV_TABLE: readonly (readonly string[])[] = [
  [],
  ['a', 'b'],
  ['a'],
  ['-t', '/dest', 'a', 'b'],
  ['--target-directory', '/dest', 'a'],
  ['--target-directory=/dest', 'a'],
  ['-t/dest', 'a'],
  ['-t'],
  ['-S', '.bak', 'a', 'b'],
  ['--suffix', '.bak', 'a', 'b'],
  ['--suffix=.bak', 'a', 'b'],
  ['--backup=numbered', 'a', 'b'],
  ['-f', '-v', 'a', 'b'],
  ['--', '-a', '-b'],
  ['--', '-t', '/dest'],
  ['-n', '--', 'a', '-t', 'b'],
  ['a', '--', 'b'],
  ['-t', '/dest', '--', 'a'],
  ['-'],
  ['--target-directory='],
];

describe('segment and mv operand parsing', () => {
  test('classifies assignment-only segments identically', () => {
    const recorded: [string, unknown][] = [];
    for (const segment of SEGMENT_TABLE) {
      recorded.push([JSON.stringify(segment), isAssignmentOnlySegment(segment)]);
    }
    expectRecordedDigest('guards-protected-path/assignment-segments', recorded);
    expect(isAssignmentOnlySegment(['A=1'])).toBeTrue();
    expect(isAssignmentOnlySegment(['echo'])).toBeFalse();
  });

  test('extracts the same mv sources and destination', () => {
    const recorded: [string, unknown][] = [];
    for (const args of MV_TABLE) {
      recorded.push([JSON.stringify(args), extractMvOperandPaths(args)]);
    }
    expectRecordedDigest('guards-protected-path/mv-operands', recorded);
    expect(extractMvOperandPaths(['a', 'b', 'c'])).toStrictEqual({
      sources: ['a', 'b'],
      destination: 'c',
    });
  });
});

const CANDIDATE_TABLE: readonly string[] = [
  '',
  ' ',
  '.',
  './policy',
  'policy',
  `policy/${MARKER}`,
  '~',
  '~/',
  '~/.config',
  '$HOME',
  '$HOME/.config',
  '${HOME}/.config',
  '$TMPDIR/x',
  '${UNSET_NAME:-policy}',
  'link',
  `link/${MARKER}`,
  'dangling-link',
  'dangling-link/deeper',
  'nested/../policy',
  '/absolute/missing/deeper',
  'policy\\nested',
  'C:/policy',
  '$XDG_CONFIG_HOME/x',
];

const BASENAME_PREDICATES: readonly (readonly [string, (name: string) => boolean])[] = [
  ['always', () => true],
  ['never', () => false],
  ['marker', (name: string) => name === MARKER],
  ['json', (name: string) => name.endsWith('.json')],
];

describe('protected candidate canonicalization', () => {
  test('normalizes path candidates like the shipped guard', () => {
    const environments = pairedEnvironments(
      { HOME: home, TMPDIR: join(root, 'tmp'), XDG_CONFIG_HOME: join(home, '.config') },
      home,
    );
    const budget = createBudget();
    const recorded: [string, unknown][] = [];
    for (const cwd of [workspace, join(root, 'policy'), join(root, 'missing')]) {
      for (const candidate of CANDIDATE_TABLE) {
        recorded.push([
          `${candidate} @ ${cwd}`,
          normalizeProtectedPathCandidate(candidate, cwd, environments, budget),
        ]);
      }
    }
    expectRecordedDigest('guards-protected-path/path-candidates', recorded, root);
  });

  test('normalizes file candidates like the shipped guard, per basename predicate', () => {
    const environments = pairedEnvironments({ HOME: home, TMPDIR: join(root, 'tmp') }, home);
    const recorded: [string, unknown][] = [];
    for (const [label, isPlausibleBasename] of BASENAME_PREDICATES) {
      const budget: Budget = createBudget();
      for (const candidate of CANDIDATE_TABLE) {
        recorded.push([
          `${candidate} (${label})`,
          normalizeProtectedFileCandidate(
            candidate,
            workspace,
            environments,
            budget,
            isPlausibleBasename,
          ),
        ]);
      }
    }
    expectRecordedDigest('guards-protected-path/file-candidates', recorded, root);
  });

  test('the file candidate skips the ancestor walk only for implausible basenames', () => {
    const environments = pairedEnvironments({ HOME: home }, home);
    const missing = join(root, 'missing', 'deeper.json');
    // The existing prefix is canonicalized, so the answer spells the fixture's real path.
    expect(
      normalizeProtectedFileCandidate(missing, workspace, environments, createBudget(), () => true),
    ).toBe(join(realpathSync(root), 'missing', 'deeper.json'));
    expect(
      normalizeProtectedFileCandidate(
        missing,
        workspace,
        environments,
        createBudget(),
        () => false,
      ),
    ).toBeNull();
    expect(
      normalizeProtectedFileCandidate(
        join(root, 'link'),
        workspace,
        environments,
        createBudget(),
        () => false,
      ),
    ).toBe(join(root, 'policy'));
  });
});

/** A budget is threaded, not created per call: a shared one keeps counting across candidates. */
test('the walk charges one shared budget', () => {
  const budget = createBudget();
  const environment = pairedEnvironments({ HOME: home }, home);
  const observations: Observation[] = [];
  findProtectedPathMutationInCommand(
    projectShellSyntax('cd policy && cd nested', parseCommand('cd policy && cd nested', 'posix')),
    workspace,
    environment,
    budget,
    { ...observing(observations, null), normalizeCwd: normalizeProtectedPathCandidate },
  );
  expect(budget.counters.get('realpathAttempts')).toBeGreaterThan(0);
});
