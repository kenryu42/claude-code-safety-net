import { afterEach, describe, expect, test } from 'bun:test';
import { mkdirSync, realpathSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { runPolicyCommand as runPortedPolicy } from '@/cli/policy/index';
import { DEFAULT_GUI_POLICY } from '@/core/policy/store';
import { captureConsole } from '../helpers/console-capture';
import { type TreeSpec, writeTree } from '../helpers/fixture-tree';
import { type GuiRequest, runGuiRow } from '../helpers/gui-differential';
import { json } from '../helpers/rulebook-seeds';
import {
  createTempRoot,
  environmentFor,
  isolationEnv,
  normalize,
  removeTempRoots,
} from '../helpers/temp-home';

/**
 * The project draft: the directory the picker moves, the revision that binds a diff to the apply
 * that follows it, and the containment the write goes through. Every row drives the server over a
 * seeded home, so a body, a status or a file that moved is the failure; the pins behind each row
 * say what the row is for.
 */

const USER_POLICY_FILE = 'home/.cc-safety-net/policy.json';
const PROJECT_POLICY_FILE = 'project/.cc-safety-net/policy.json';

/** A user policy the drafts inherit from, strict enough that a project proposal can weaken it. */
const strictUser = json({ ...DEFAULT_GUI_POLICY, safety: { level: 'strict', overrides: {} } });

const S1: TreeSpec = { [USER_POLICY_FILE]: strictUser, picked: null };
const S5: TreeSpec = {
  [USER_POLICY_FILE]: strictUser,
  [PROJECT_POLICY_FILE]: json({ version: 1, safety: { level: 'standard' } }),
};

/** The two user-file states whose diagnostics have to reach the draft rather than be swallowed. */
const MALFORMED_USER: TreeSpec = { [USER_POLICY_FILE]: '{ not json' };
const INVALID_USER: TreeSpec = {
  [USER_POLICY_FILE]: json({ version: 1, safety: { level: 'bogus' } }),
};

const PARANOID = { version: 1, safety: { level: 'paranoid' } };

type ProjectBody = {
  dir: string;
  path: string;
  revision: number;
  baseline: { safety: { level: string } };
  userPolicyDiagnostics: string[];
  projection: Record<string, unknown>;
  projectionDiagnostics: string[];
  canPickDirectory: boolean;
};

type DiffBody = {
  rows: { field: string; before?: string; after?: string }[];
  weakenings: string[];
  existingFileDiagnostics: string[];
  errors: string[];
};

const READ_DRAFT: GuiRequest = { path: '/api/policy/project' };
const PICK: GuiRequest = { method: 'POST', path: '/api/policy/project/choose-directory' };

const draftWrite = (path: string, body: unknown): GuiRequest => ({ method: 'POST', path, body });

/** The same write, held open across the requests that follow it. */
const draftHold = (path: string, body: unknown): GuiRequest => ({
  ...draftWrite(path, body),
  hold: true,
});

/** The picker every row that moves the draft injects: a directory seeded beside the project. */
const picksPicked = (side: { root: string }) => ({
  chooseDirectory: async () => ({ path: join(side.root, 'picked') }),
});

const errorsOf = (body: unknown) => (body as { errors: string[] }).errors;

describe('the GUI project draft', () => {
  afterEach(removeTempRoots);

  test('follows the directory the picker chose and binds each write to its revision', async () => {
    const row = await runGuiRow({
      seed: S1,
      options: picksPicked,
      requests: [
        READ_DRAFT,
        PICK,
        READ_DRAFT,
        draftWrite('/api/policy/project/diff', { revision: 0, proposal: PARANOID }),
        draftWrite('/api/policy/project/diff', { revision: 1, proposal: PARANOID }),
        draftWrite('/api/policy/project/apply', {
          revision: 1,
          proposal: PARANOID,
          // Ignored by construction: the target is the session's, not the caller's.
          dir: '/elsewhere',
        }),
      ],
    });
    const [before, , after] = row.responses.map((response) => response.body as ProjectBody);

    expect(before).toMatchObject({
      dir: join('<root>', 'project'),
      path: join('<root>', PROJECT_POLICY_FILE),
      revision: 0,
      baseline: { safety: { level: 'strict' } },
      userPolicyDiagnostics: [],
      projection: {},
      projectionDiagnostics: [],
    });
    expect(before?.canPickDirectory).toBeBoolean();
    expect(row.responses[1]?.body).toStrictEqual({ cancelled: false });
    expect(after).toMatchObject({ dir: join('<root>', 'picked'), revision: 1 });
    // The diff the first tab is holding names a revision the picker has moved past.
    expect(row.responses[3]).toMatchObject({
      status: 409,
      body: { errors: ['The project draft directory changed; reload the draft before applying.'] },
    });
    const diff = row.responses[4]?.body as DiffBody;
    expect(row.responses[4]?.status).toBe(200);
    expect(diff.rows.length).toBeGreaterThan(0);
    expect(diff).toMatchObject({ weakenings: [], existingFileDiagnostics: [], errors: [] });
    expect(row.responses[5]).toMatchObject({
      status: 200,
      body: { path: join('<root>', 'picked/.cc-safety-net/policy.json'), errors: [] },
    });
    // Only the fields the proposal set, so everything else keeps inheriting from user scope.
    expect(
      row.tree.find((entry) => entry.path === 'picked/.cc-safety-net/policy.json'),
    ).toMatchObject({ content: json(PARANOID) });
    expect(row.tree.filter((entry) => entry.path.startsWith('project/'))).toStrictEqual([]);
  });

  test('binds an apply to the revision it read at entry, not the one the pick left behind', async () => {
    const row = await runGuiRow({
      seed: S1,
      options: picksPicked,
      requests: [
        // Sent first and answered last: its body lands only after the pick has moved the session,
        // so the revision it is checked against is the one its handler read on the way in.
        draftHold('/api/policy/project/apply', { revision: 0, proposal: PARANOID }),
        PICK,
      ],
    });

    expect(row.responses[1]?.body).toStrictEqual({ cancelled: false });
    // The directory whose revision matched is the directory the write landed in.
    expect(row.responses[0]).toMatchObject({
      status: 200,
      body: { path: join('<root>', PROJECT_POLICY_FILE), errors: [] },
    });
    expect(row.tree.find((entry) => entry.path === PROJECT_POLICY_FILE)).toMatchObject({
      content: json(PARANOID),
    });
    expect(row.tree.filter((entry) => entry.path.startsWith('picked/'))).toStrictEqual([]);
  });

  test('leaves the draft where it was when the dialog cancels or fails', async () => {
    const cancelled = await runGuiRow({
      seed: S1,
      options: () => ({ chooseDirectory: async () => ({ cancelled: true as const }) }),
      requests: [PICK, READ_DRAFT],
    });
    const failed = await runGuiRow({
      seed: S1,
      options: () => ({ chooseDirectory: async () => ({ error: 'boom' }) }),
      requests: [PICK, READ_DRAFT],
    });

    expect(cancelled.responses[0]?.body).toStrictEqual({ cancelled: true });
    expect(failed.responses[0]?.body).toStrictEqual({ cancelled: false, error: 'boom' });
    for (const row of [cancelled, failed]) {
      expect(row.responses[1]?.body).toMatchObject({ dir: join('<root>', 'project'), revision: 0 });
    }
  });

  test('refuses a body with no revision, an audit section or a level the schema rejects', async () => {
    const row = await runGuiRow({
      seed: S1,
      requests: [
        draftWrite('/api/policy/project/apply', { proposal: PARANOID }),
        draftWrite('/api/policy/project/apply', {
          revision: 0,
          proposal: { ...PARANOID, audit: { retention_days: 5 } },
        }),
        draftWrite('/api/policy/project/apply', {
          revision: 0,
          proposal: { version: 1, safety: { level: 'bogus' } },
        }),
      ],
    });

    expect(row.responses.map((response) => response.status)).toStrictEqual([400, 400, 400]);
    expect(errorsOf(row.responses[0]?.body)).toStrictEqual(['revision must be a number']);
    expect(errorsOf(row.responses[1]?.body)).toStrictEqual([
      'audit settings are user scope only; remove the audit section from a project proposal',
    ]);
    expect(errorsOf(row.responses[2]?.body).length).toBeGreaterThan(0);
    // Nothing reached the project directory, so no refusal left a half-written file behind.
    expect(row.tree.filter((entry) => entry.path.startsWith('project/'))).toStrictEqual([]);
  });

  test('starts the draft empty over a project file it cannot read, then replaces it', async () => {
    const row = await runGuiRow({
      seed: { ...S1, [PROJECT_POLICY_FILE]: 'nope' },
      requests: [
        READ_DRAFT,
        draftWrite('/api/policy/project/diff', { revision: 0, proposal: PARANOID }),
        draftWrite('/api/policy/project/apply', { revision: 0, proposal: PARANOID }),
      ],
    });
    const read = row.responses[0]?.body as ProjectBody;

    // The unreadable file is reported rather than pretended to have loaded.
    expect(read.projectionDiagnostics.length).toBeGreaterThan(0);
    expect(read.projection).toStrictEqual({});
    expect((row.responses[1]?.body as DiffBody).existingFileDiagnostics.length).toBeGreaterThan(0);
    expect(row.responses[2]?.status).toBe(200);
    expect(row.tree.find((entry) => entry.path === PROJECT_POLICY_FILE)?.content).toBe(
      json(PARANOID),
    );
  });

  test('refuses to follow a .cc-safety-net symlink out of the project', async () => {
    const row = await runGuiRow({
      seed: { ...S1, 'project/.cc-safety-net': { symlink: '../outside' }, outside: null },
      requests: [draftWrite('/api/policy/project/apply', { revision: 0, proposal: PARANOID })],
    });

    expect(row.responses[0]?.status).toBe(500);
    expect(errorsOf(row.responses[0]?.body)).toHaveLength(1);
    expect(errorsOf(row.responses[0]?.body)[0]).toBeString();
    // The escape hatch stayed shut: nothing was written through the link.
    expect(row.tree.filter((entry) => entry.path.startsWith('outside/'))).toStrictEqual([]);
  });

  test.each([
    ['cannot be parsed', MALFORMED_USER],
    ['the schema refuses', INVALID_USER],
  ])('carries the diagnostics of a user policy that %s onto the draft', async (_label, seed) => {
    const row = await runGuiRow({ seed, requests: [READ_DRAFT] });
    const read = row.responses[0]?.body as ProjectBody;

    expect(read.userPolicyDiagnostics.length).toBeGreaterThan(0);
    // The draft still has a baseline to inherit from: the protective defaults, not nothing.
    expect(read.baseline.safety.level).toBeString();
  });

  test('shows the rows `policy check` prints for the same proposal', async () => {
    const proposal = {
      version: 1,
      safety: { level: 'standard' },
      workflow: { worktree_mode: true },
    };
    const api = await runGuiRow({
      seed: S5,
      requests: [draftWrite('/api/policy/project/diff', { revision: 0, proposal })],
    });
    const diff = api.responses[0]?.body as DiffBody;

    const root = createTempRoot('gui-check-ported-');
    const home = join(root, 'home');
    mkdirSync(join(root, 'project'), { recursive: true });
    writeTree(root, S5);
    const file = join(root, 'proposal.json');
    writeFileSync(file, json(proposal));
    const checked = normalize(
      await captureConsole(() =>
        runPortedPolicy(environmentFor(home, isolationEnv(home)), ['check', file], {
          cwd: join(root, 'project'),
        }),
      ),
      [
        [realpathSync(root), '<root>'],
        [root, '<root>'],
      ],
    );

    expect(checked.returned).toBe(0);
    expect(diff.rows.length).toBeGreaterThan(0);
    for (const row of diff.rows) {
      expect(checked.log).toContain(
        `  ${row.field}: ${row.before ?? '(unset)'} -> ${row.after ?? '(unset)'}`,
      );
    }
    // `policy check` renders the rows only, so the weakening half of the parity is pinned here.
    expect(diff.weakenings).toStrictEqual([
      'project policy lowers level: strict -> standard',
      'project policy enables worktree mode relaxations',
    ]);
  });
});
