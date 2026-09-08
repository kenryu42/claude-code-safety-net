import { afterAll, expect, test } from 'bun:test';
import { createProcessEnvironment } from '@/core/environment';
import { evaluateGuard, type GuardEvaluation } from '@/gate/pipeline';
import { bashCall, createGateTree } from '../helpers/gate-differential';
import { policySnapshot } from '../helpers/policy';

/**
 * The secret matcher on the shared guard walk. The protected-path guards have always tracked `cd`
 * and simple assignments; the matcher walked segments without them, so `cd ~ && cat .ssh/config`
 * read a home key while `cat ~/.ssh/config` was denied. Every row below states what the walk
 * resolves, and the rows marked `closedByWalk` are the ones that gap used to let through — closing
 * them is the point of the change, not an accident of it.
 *
 * The walk's scope is deliberately the scanner's and nothing wider: only `cd` moves the cwd,
 * `pushd`/`popd` are untracked, a subshell's `cd` counts as if it leaked (the projection flattens
 * the group), and an interpreter body is scanned as text rather than walked. Widening any of those
 * would change what the policy and git-metadata guards see, so each is pinned here as documented
 * scope rather than left to drift.
 */

const tree = createGateTree('secret-walk-');
const environment = createProcessEnvironment();

afterAll(() => {
  tree.remove();
});

const SNAPSHOTS = {
  standard: policySnapshot(),
  strict: policySnapshot({ safety: { level: 'strict' } }),
};

/** Either an allow, or the rule the matcher reports together with the operand it shows as evidence. */
type Expectation = 'allow' | { readonly ruleId: string; readonly segment: string };

const ROWS: readonly {
  readonly name: string;
  readonly command: string;
  readonly standard: Expectation;
  /** Asserted only where the row's point is that the level does not change the answer. */
  readonly strict?: Expectation;
  /** The gap the walk closed: this command used to be allowed, and the walk is why it is denied. */
  readonly closedByWalk?: boolean;
  /** A command the same row must still see allowed, so its denial is not read as a blanket ban. */
  readonly alsoAllows?: string;
}[] = [
  {
    name: 'a cd into home makes a later relative read of the SSH config a denial',
    command: 'cd ~ && cat .ssh/config',
    standard: { ruleId: 'secret.home.ssh', segment: '.ssh/config' },
    strict: { ruleId: 'secret.home.ssh', segment: '.ssh/config' },
    closedByWalk: true,
  },
  {
    name: 'the cd operand itself is still the first candidate the matcher sees',
    command: 'cd ~/.ssh && cat id_rsa',
    standard: { ruleId: 'secret.home.ssh', segment: '~/.ssh' },
  },
  {
    name: 'cd - leaves the tracked cwd where the previous cd put it',
    command: 'cd ~ && cd - && cat .ssh/config',
    standard: { ruleId: 'secret.home.ssh', segment: '.ssh/config' },
    closedByWalk: true,
  },
  {
    name: 'pushd does not move the tracked cwd',
    command: 'pushd ~ && cat .ssh/config',
    standard: 'allow',
  },
  {
    name: 'a cd inside a subshell group is tracked as if it leaked',
    command: '(cd ~) && cat .ssh/config',
    standard: { ruleId: 'secret.home.ssh', segment: '.ssh/config' },
    closedByWalk: true,
  },
  {
    name: 'a read before the cd resolves against the directory it actually runs in',
    command: 'cat .ssh/config && cd ~',
    standard: 'allow',
  },
  {
    name: 'an assignment holding a directory moves the cwd when the cd dereferences it',
    command: 'd=~; cd "$d" && cat .ssh/config',
    standard: { ruleId: 'secret.home.ssh', segment: '.ssh/config' },
    closedByWalk: true,
  },
  {
    name: 'a cd to an unset variable leaves later relative operands unresolvable',
    command: 'cd "$UNSET_DIR_XYZ" && cat .ssh/config',
    standard: 'allow',
    strict: 'allow',
  },
  {
    name: 'a cd to a command substitution leaves later relative operands unresolvable',
    command: 'cd $(mktemp -d) && cat .ssh/config',
    standard: 'allow',
    strict: 'allow',
  },
  {
    name: 'an operand inside an interpreter body resolves against its segment cwd',
    command: "cd ~ && sh -c 'cat .ssh/config'",
    standard: { ruleId: 'secret.home.ssh', segment: '.ssh/config' },
    closedByWalk: true,
  },
  {
    name: 'a cd inside an interpreter body is scanned as text, not walked',
    command: "sh -c 'cd ~ && cat .ssh/config'",
    standard: 'allow',
  },
  {
    name: 'the producer of a pipe resolves against the tracked cwd',
    command: 'cd ~ && cat .ssh/config | grep Host',
    standard: { ruleId: 'secret.home.ssh', segment: '.ssh/config' },
    closedByWalk: true,
  },
  {
    name: 'a write redirection target resolves against the tracked cwd',
    command: 'cd ~ && cat > .ssh/config',
    standard: { ruleId: 'secret.home.ssh', segment: '.ssh/config' },
    closedByWalk: true,
  },
  {
    name: 'the metadata-only relaxation stays standalone-only after a cd',
    command: 'cd ~ && ls .ssh',
    standard: { ruleId: 'secret.home.ssh', segment: '.ssh' },
    closedByWalk: true,
    alsoAllows: 'ls ~/.ssh',
  },
  {
    name: 'a cd to a directory that does not exist puts later operands under it',
    command: 'cd /nonexistent-dir-zz && cat .ssh/config',
    standard: 'allow',
  },
];

function evaluate(command: string, snapshot: ReturnType<typeof policySnapshot>): GuardEvaluation {
  return evaluateGuard(bashCall(command, tree.workspace), {
    environment,
    dependencies: { loadPolicySnapshot: () => snapshot, resolveGitMetadata: () => null },
  });
}

/** An allow, or everything a denial row states: the stage that decided, the intent, the rule, the evidence. */
function decided(evaluation: GuardEvaluation) {
  const decision = evaluation.decision;
  if (decision.kind !== 'deny') return 'allow';
  return {
    stage: evaluation.stage,
    intent: decision.intent,
    ruleId: decision.ruleId,
    segment: decision.evidence.find((item) => item.kind === 'command')?.segment,
  };
}

function expected(expectation: Expectation) {
  return expectation === 'allow'
    ? 'allow'
    : ({ stage: 'secret-protection', intent: 'hard_stop', ...expectation } as const);
}

for (const row of ROWS) {
  test(row.name, () => {
    expect(decided(evaluate(row.command, SNAPSHOTS.standard)), row.command).toStrictEqual(
      expected(row.standard),
    );
    if (row.strict !== undefined) {
      expect(decided(evaluate(row.command, SNAPSHOTS.strict)), row.command).toStrictEqual(
        expected(row.strict),
      );
    }
    if (row.alsoAllows !== undefined) {
      expect(decided(evaluate(row.alsoAllows, SNAPSHOTS.standard)), row.alsoAllows).toBe('allow');
    }
  });
}

test('the table proves both directions: it closes commands and it leaves commands alone', () => {
  expect(ROWS.filter((row) => row.closedByWalk === true).length).toBeGreaterThan(7);
  expect(ROWS.filter((row) => row.standard === 'allow').length).toBeGreaterThan(4);
});
