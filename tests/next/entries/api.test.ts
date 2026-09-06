import { afterAll, expect, test } from 'bun:test';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { REASON_SAFETY_NET_FAILED_CLOSED } from '@next/core/budget';
import { type CheckCommandResult, checkCommand as portedCheckCommand } from '@next/entries/api';
import { checkCommand as shippedCheckCommand } from '@/api';
import { withEnv } from '../../helpers';
import { createHookFixture, hostEnv } from '../helpers/hook-hosts';
import { describeDifferential } from '../helpers/in-process';

/**
 * The library API (contract W5) called twice over one input: the shipped `checkCommand` and the
 * ported one read the same policy, home and working directory, and either return the same result
 * or throw the same `TypeError`. Every row also pins what that agreed outcome is, because a
 * surface that answered `{ kind: 'allow' }` to everything would still be a differential match.
 * The rows the caller cannot type-check (a null, a string, a missing command) are the boundary
 * the API re-checks for untyped callers, so they are passed through an unchecked signature.
 */

type Outcome = { returned: CheckCommandResult } | { thrown: string };

type Row = { name: string; input: unknown; expected: Outcome };

const fixture = createHookFixture('next-api-');
const scope = hostEnv(fixture, join(fixture.home, 'audit'));

afterAll(() => {
  fixture.remove();
});

const failedClosed: Outcome = {
  returned: { kind: 'deny', reason: REASON_SAFETY_NET_FAILED_CLOSED },
};
const allowed: Outcome = { returned: { kind: 'allow' } };

// The three rule-driven reasons are spelled out rather than imported, because they are the bytes
// a caller reads back and two of them have no exported constant to import.
const ROWS: readonly Row[] = [
  {
    name: 'a null input',
    input: null,
    expected: { thrown: 'TypeError: checkCommand requires an input object with command and cwd' },
  },
  {
    name: 'an input that is a string',
    input: 'x',
    expected: { thrown: 'TypeError: checkCommand requires an input object with command and cwd' },
  },
  {
    name: 'an input with no command at all',
    input: {},
    expected: { thrown: 'TypeError: command must be a non-empty string' },
  },
  {
    name: 'a blank command',
    input: { command: '', cwd: fixture.project },
    expected: { thrown: 'TypeError: command must be a non-empty string' },
  },
  {
    name: 'a relative cwd',
    input: { command: 'ls', cwd: 'relative' },
    expected: { thrown: 'TypeError: cwd must be an absolute directory path' },
  },
  {
    name: 'an empty cwd',
    input: { command: 'ls', cwd: '' },
    expected: { thrown: 'TypeError: cwd must be an absolute directory path' },
  },
  {
    name: 'a cwd that is a regular file',
    input: { command: 'ls', cwd: fixture.file },
    expected: failedClosed,
  },
  {
    name: 'a cwd that does not exist',
    input: { command: 'ls', cwd: join(fixture.root, 'missing') },
    expected: failedClosed,
  },
  {
    name: 'an allowed command',
    input: { command: 'git status', cwd: fixture.project },
    expected: allowed,
  },
  {
    name: 'a delete that reaches the protected policy config',
    input: { command: 'rm -rf /', cwd: fixture.project },
    expected: {
      returned: {
        kind: 'deny',
        reason:
          'This path contains the protected policy config and you must not modify or delete it.',
      },
    },
  },
  {
    name: 'a read of a private key',
    input: { command: 'cat ~/.ssh/id_rsa', cwd: fixture.project },
    expected: {
      returned: {
        kind: 'deny',
        reason: 'Access to a sensitive path is not allowed.',
        ruleId: 'secret.home.ssh',
      },
    },
  },
  {
    name: 'a recursive delete from a directory the walk cannot follow',
    input: { command: 'cd .. && rm -rf build', cwd: fixture.project },
    expected: {
      returned: {
        kind: 'deny',
        reason:
          'rm -rf outside cwd is blocked. Retry deleting only explicit paths inside the current directory; escalate for anything outside it.',
        ruleId: 'rm.recursive-force-outside-cwd',
      },
    },
  },
  {
    name: 'a cwd with a trailing separator',
    input: { command: 'git status', cwd: `${fixture.project}/` },
    expected: allowed,
  },
  {
    name: 'a cwd with a redundant segment',
    input: { command: 'git status', cwd: `${fixture.root}/./project` },
    expected: allowed,
  },
];

describeDifferential(
  'the library API answers one input the same way on both implementations',
  ROWS,
  async (row, side) =>
    withEnv(scope, () => {
      // Untyped callers reach this surface, so the rows keep their declared shape all the way in.
      const check = (side === 'shipped' ? shippedCheckCommand : portedCheckCommand) as (
        input: unknown,
      ) => CheckCommandResult;
      try {
        return { returned: check(row.input) } satisfies Outcome;
      } catch (error) {
        return {
          thrown: `${(error as Error).name}: ${(error as Error).message}`,
        } satisfies Outcome;
      }
    }),
  (row, agreed) => {
    expect(agreed).toStrictEqual(row.expected);
  },
  () => fixture.root,
);

// W5: the library check writes no audit. Every row above ran with the audit home inside the
// fixture, so an accidental write on either side would have left a logs tree behind.
test('neither implementation wrote an audit log', () => {
  expect(existsSync(join(fixture.home, 'audit', '.cc-safety-net', 'logs'))).toBe(false);
});
