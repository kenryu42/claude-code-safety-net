import { afterEach, describe, expect, test } from 'bun:test';
import { lstatSync } from 'node:fs';
import { join, posix } from 'node:path';
import { DEFAULT_GUI_POLICY } from '@/core/policy/store';
import { DESTRUCTIVE_COMMAND_RULE_METADATA } from '@/core/rules/destructive';
import type { TreeEntry, TreeSpec } from '../helpers/fixture-tree';
import { type GuiRequest, runGuiRow } from '../helpers/gui-differential';
import { json, rulesConfig, v1Rulebook } from '../helpers/rulebook-seeds';
import { removeTempRoots } from '../helpers/temp-home';

/**
 * The guard, the page and the user-policy endpoints, driven against the server over a seeded home.
 * Every row records what came back; the assertions below pin what each row is for, so a row that
 * starts answering the wrong thing still fails.
 */

const USER_POLICY_FILE = 'home/.cc-safety-net/policy.json';
const PROJECT_POLICY_FILE = 'project/.cc-safety-net/policy.json';
const USER_POLICY_PATH = posix.join('<root>', USER_POLICY_FILE);

/** The canonical document the writer produces, seeded with a level and a window of its own. */
const USER_POLICY = {
  ...DEFAULT_GUI_POLICY,
  safety: { level: 'strict', overrides: {} },
  audit: { retention_days: 10 },
};

/** A rule the draft can switch off, with the command its metadata offers as the example. */
const CONFIGURABLE_RULE = DESTRUCTIVE_COMMAND_RULE_METADATA.find((rule) => !rule.catastrophic);
if (!CONFIGURABLE_RULE) throw new Error('the destructive metadata carries no configurable rule');

const S0: TreeSpec = {};
const S1: TreeSpec = { [USER_POLICY_FILE]: json(USER_POLICY) };
const S2: TreeSpec = { [USER_POLICY_FILE]: '' };
const S3: TreeSpec = { [USER_POLICY_FILE]: '{ not json' };
const S4: TreeSpec = {
  [USER_POLICY_FILE]: json({
    version: 1,
    safety: { level: 'bogus' },
    audit: { retention_days: 5 },
    secret_protection: { enabled: 'yes' },
  }),
};
const S5: TreeSpec = {
  ...S1,
  [PROJECT_POLICY_FILE]: json({
    version: 1,
    safety: { level: 'standard' },
    destructive_command_protection: { overrides: { [CONFIGURABLE_RULE.id]: 'off' } },
  }),
};
const S6: TreeSpec = {
  ...S1,
  [PROJECT_POLICY_FILE]: json({ version: 1, safety: { level: 'paranoid' } }),
};
const S7: TreeSpec = {
  'home/.cc-safety-net/rules/rule.json': rulesConfig(['team-rules']),
  'home/.cc-safety-net/rules/team-rules/rulebook.json': v1Rulebook('team-rules'),
};

const JSON_HEADERS = { contentType: 'application/json; charset=utf-8', cacheControl: 'no-store' };

/** The `/api/policy` fields the rows pin; everything else on the body is compared, not named. */
type PolicyBody = {
  path: string;
  exists: boolean;
  raw: string;
  policy: { safety: { level: string }; audit: { retention_days: number } };
  errors: string[];
  configState: { state: string };
  projectPolicy?: { path: string; weakenings: string[] };
  destructiveCommandRules: unknown[];
  secretPatterns: unknown[];
  version: string;
  preview: { selectedPreset: string; counts: Record<string, number> } | null;
};

async function readPolicy(seed: TreeSpec) {
  const row = await runGuiRow({ seed, requests: [{ path: '/api/policy' }] });
  return row.responses[0]?.body as PolicyBody;
}

const errorsOf = (body: unknown) => (body as { errors: string[] }).errors;

const policyFile = (tree: readonly TreeEntry[]) =>
  tree.find((entry) => entry.path === USER_POLICY_FILE);

/** The user policy file's permission bits, or the owner-only bits on Windows, which has none. */
const policyFileMode = (home: string) =>
  process.platform === 'win32'
    ? 0o600
    : lstatSync(join(home, '.cc-safety-net', 'policy.json')).mode & 0o777;

const explainRequest = (command: unknown, policy: unknown): GuiRequest => ({
  method: 'POST',
  path: '/api/policy/explain',
  body: { command, policy },
});

const draft = { ...USER_POLICY, safety: { level: 'standard', overrides: {} } };

describe('the policy GUI server', () => {
  afterEach(removeTempRoots);

  test('answers the favicon before the token is checked', async () => {
    const row = await runGuiRow({ seed: S0, requests: [{ path: '/favicon.ico', token: 'none' }] });

    expect(row.responses[0]).toStrictEqual({
      status: 204,
      contentType: null,
      cacheControl: 'no-store',
      body: '',
    });
  });

  test('refuses a token that is missing, wrong, or supplied in only one of the two places', async () => {
    const preview = (token: GuiRequest['token']): GuiRequest => ({
      method: 'POST',
      path: '/api/policy/preview',
      token,
      body: USER_POLICY,
    });
    const row = await runGuiRow({
      seed: S1,
      requests: [
        { path: '/api/policy', token: 'none' },
        { path: '/api/policy', token: 'wrong-query' },
        { path: '/api/policy', token: 'query' },
        preview('none'),
        preview('wrong-query'),
        preview('header'),
        preview('wrong-header'),
        preview('both'),
      ],
    });

    expect(row.responses.map((response) => response.status)).toStrictEqual([
      403, 403, 200, 403, 403, 403, 403, 200,
    ]);
    expect(row.responses.filter((response) => response.status === 403)).toStrictEqual(
      Array.from({ length: 6 }, () => ({
        status: 403,
        ...JSON_HEADERS,
        body: { error: 'Forbidden' },
      })),
    );
  });

  test('stands the guard above every route, not just the ones the views open with', async () => {
    // Every route the page can reach, with the token that route needs withheld: a GET carries one
    // in the query, a POST that one and the header, so a query-only POST is the cross-site case.
    const reads = [
      '/',
      '/api/policy',
      '/api/policy/project',
      '/api/activity',
      '/api/rules',
      '/api/star/context',
      '/api/integrations',
      '/api/health',
    ];
    const writes = [
      '/api/policy',
      '/api/policy/preview',
      '/api/policy/explain',
      '/api/reset',
      '/api/repair',
      '/api/policy/project/choose-directory',
      '/api/policy/project/diff',
      '/api/policy/project/apply',
      '/api/rules/choose-directory',
      '/api/star',
      '/api/install',
      '/api/uninstall',
    ];
    // A correct guard reaches none of these hooks; a broken one reaches all of them, and the row
    // has to fail on the status rather than by starring the repo, opening a dialog, probing a host
    // CLI or calling out to the network. (`/api/rules/choose-directory` takes no hook on either
    // side, so it stays the one route a regression here would still drive for real.)
    const row = await runGuiRow({
      seed: S1,
      options: () => ({
        chooseDirectory: async () => ({ cancelled: true }),
        starRepo: async () => ({ ok: true }),
        fetchStarContext: async () => ({ starred: null, starCount: null, blockedTotal: 0 }),
        fetchIntegrations: async () => ({
          targets: [],
          system: { version: 'dev', nodeVersion: null, platform: 'linux' },
        }),
        fetchHealth: async () => ({
          hooks: [],
          update: { currentVersion: 'dev', latestVersion: null, updateAvailable: false },
        }),
        runIntegration: async () => ({ ok: true, output: '' }),
      }),
      requests: [
        ...reads.map((path): GuiRequest => ({ path, token: 'none' })),
        ...writes.map((path): GuiRequest => ({ method: 'POST', path, token: 'query' })),
      ],
    });

    expect(row.responses).toStrictEqual(
      [...reads, ...writes].map(() => ({
        status: 403,
        ...JSON_HEADERS,
        body: { error: 'Forbidden' },
      })),
    );
    // Nothing behind the guard ran: the seeded file is byte-for-byte what it was, and neither the
    // writer nor the picker left a project file anywhere.
    expect(policyFile(row.tree)?.content).toBe(json(USER_POLICY));
    expect(row.tree.filter((entry) => entry.path.startsWith('project/'))).toStrictEqual([]);
  });

  test('serves the page with the session token in the data tag', async () => {
    const row = await runGuiRow({ seed: S0, requests: [{ path: '/' }] });
    const page = row.responses[0]?.body as { head: string; modules: string[]; tail: string };

    expect(row.responses[0]).toMatchObject({
      status: 200,
      contentType: 'text/html; charset=utf-8',
      cacheControl: 'no-store',
    });
    expect(page.modules).toHaveLength(3);
    expect(page.head).toContain(
      '<script id="ccsn-data" type="application/json">{"token":"<token>"}</script>',
    );
  });

  test('reads the user policy file in every state it can be in', async () => {
    const missing = await readPolicy(S0);
    const valid = await readPolicy(S1);
    const empty = await readPolicy(S2);
    const malformed = await readPolicy(S3);
    const invalid = await readPolicy(S4);

    expect(missing).toMatchObject({ exists: false, raw: '', errors: [] });
    expect(missing.preview).not.toBeNull();
    expect(valid).toMatchObject({
      exists: true,
      raw: json(USER_POLICY),
      errors: [],
      policy: { safety: { level: 'strict' }, audit: { retention_days: 10 } },
    });
    // Display only: no project file, so nothing is reported beside the user one.
    expect(Object.keys(valid)).not.toContain('projectPolicy');
    expect(empty.errors).toStrictEqual(['Config file is empty']);
    expect(malformed.errors[0]).toStartWith('Invalid JSON:');
    expect(malformed.preview).toBeNull();
    // Parseable but refused: the recovery banner gets the errors and the salvaged retention stands.
    expect(invalid.errors.length).toBeGreaterThan(0);
    expect(invalid.preview).toBeNull();
    expect(invalid.policy.audit.retention_days).toBe(5);
    for (const body of [missing, valid, empty, malformed, invalid]) {
      expect(body.path).toBe(USER_POLICY_PATH);
      expect(body.configState.state).toBeString();
      expect(body.version).toBeString();
      expect(body.destructiveCommandRules.length).toBeGreaterThan(0);
      expect(body.secretPatterns.length).toBeGreaterThan(0);
    }
  });

  test('reports a project policy in force beside the user file', async () => {
    const weakened = await readPolicy(S5);
    const strengthened = await readPolicy(S6);

    expect(weakened.projectPolicy?.path).toBe(posix.join('<root>', PROJECT_POLICY_FILE));
    expect(weakened.projectPolicy?.weakenings.length).toBeGreaterThan(0);
    expect(strengthened.projectPolicy).toStrictEqual({
      path: posix.join('<root>', PROJECT_POLICY_FILE),
      weakenings: [],
    });
  });

  test('previews a draft policy and reports the diagnostics of one the schema refuses', async () => {
    const row = await runGuiRow({
      seed: S1,
      requests: [
        {
          method: 'POST',
          path: '/api/policy/preview',
          body: { ...USER_POLICY, safety: { level: 'paranoid', overrides: {} } },
        },
        {
          method: 'POST',
          path: '/api/policy/preview',
          body: { version: 1, safety: { level: 'bogus' } },
        },
      ],
    });

    expect(row.responses[0]).toMatchObject({
      status: 200,
      ...JSON_HEADERS,
      body: {
        errors: [],
        preview: {
          selectedPreset: 'paranoid',
          counts: {
            enabled: expect.any(Number),
            disabled: expect.any(Number),
            effectiveCustomizations: expect.any(Number),
          },
        },
      },
    });
    expect(row.responses[1]?.status).toBe(400);
    expect(errorsOf(row.responses[1]?.body).length).toBeGreaterThan(0);
  });

  test('explains a command against the draft in the request rather than the file on disk', async () => {
    const row = await runGuiRow({
      seed: S7,
      requests: [
        explainRequest('rm -rf ~', draft),
        explainRequest('git status', draft),
        explainRequest('docker system prune', draft),
        explainRequest(CONFIGURABLE_RULE.example, draft),
        explainRequest(CONFIGURABLE_RULE.example, {
          ...draft,
          destructive_command_protection: {
            enabled: true,
            overrides: { [CONFIGURABLE_RULE.id]: 'off' },
            allow_paths: [],
          },
        }),
        explainRequest('cat ~/.ssh/id_rsa', draft),
        explainRequest('cat ~/.ssh/id_rsa', {
          ...draft,
          secret_protection: { enabled: false, overrides: {}, deny_paths: [], allow_paths: [] },
        }),
        explainRequest(42, draft),
        explainRequest('ls', { version: 1, safety: { level: 'bogus' } }),
      ],
    });

    expect(row.responses.map((response) => response.status)).toStrictEqual([
      200, 200, 200, 200, 200, 200, 200, 400, 400,
    ]);
    expect(
      row.responses.slice(0, 7).map((response) => (response.body as { result: string }).result),
    ).toStrictEqual(['blocked', 'allowed', 'blocked', 'blocked', 'allowed', 'blocked', 'allowed']);
    // The seeded rulebook's rule, named as the draft's own policy would name it.
    expect(row.responses[2]?.body).toMatchObject({
      customRule: { id: 'team-rules/block-docker-system-prune' },
    });
    expect(errorsOf(row.responses[7]?.body)).toStrictEqual(['command must be a string']);
    expect(errorsOf(row.responses[8]?.body).length).toBeGreaterThan(0);
  });

  test('writes a valid policy and leaves the file alone for one it refuses', async () => {
    const written = await runGuiRow({
      seed: S0,
      requests: [{ method: 'POST', path: '/api/policy', body: USER_POLICY }],
    });
    const refused = await runGuiRow({
      seed: S1,
      requests: [
        { method: 'POST', path: '/api/policy', body: { version: 1, safety: { level: 'bogus' } } },
        { method: 'POST', path: '/api/policy', raw: '{ "version": ' },
      ],
    });

    expect(written.responses[0]).toMatchObject({ status: 200, body: { errors: [] } });
    expect(policyFile(written.tree)).toMatchObject({ content: json(USER_POLICY) });
    expect(policyFileMode(written.home)).toBe(0o600);
    expect(refused.responses.map((response) => response.status)).toStrictEqual([400, 400]);
    expect(errorsOf(refused.responses[0]?.body).length).toBeGreaterThan(0);
    expect(errorsOf(refused.responses[1]?.body)[0]).toStartWith('Invalid JSON:');
    // Neither refusal reached the file.
    expect(policyFile(refused.tree)?.content).toBe(json(USER_POLICY));
  });

  test('caps the body it will parse at the same size on both sides', async () => {
    const encoded = JSON.stringify(USER_POLICY);
    const row = await runGuiRow({
      seed: S0,
      requests: [
        { method: 'POST', path: '/api/policy', raw: encoded.padEnd(1_048_576, ' ') },
        { method: 'POST', path: '/api/policy', raw: encoded.padEnd(1_048_577, ' ') },
      ],
    });

    // A body exactly at the cap is still parsed and written.
    expect(row.responses[0]).toMatchObject({ status: 200, body: { errors: [] } });
    expect(policyFile(row.tree)?.content).toBe(json(USER_POLICY));
    // The oversized body is the differential itself: this bun build answers it identically on both
    // sides, which is the contract the port has to keep, so nothing about that status is pinned.
    expect(row.responses).toHaveLength(2);
  });

  test('resets to the defaults and repairs a file it can still read', async () => {
    const reset = await runGuiRow({ seed: S4, requests: [{ method: 'POST', path: '/api/reset' }] });
    const repairedInvalid = await runGuiRow({
      seed: S4,
      requests: [{ method: 'POST', path: '/api/repair' }],
    });
    const repairedMalformed = await runGuiRow({
      seed: S3,
      requests: [{ method: 'POST', path: '/api/repair' }],
    });

    expect(reset.responses[0]).toMatchObject({
      status: 200,
      ...JSON_HEADERS,
      body: { errors: [] },
    });
    expect(policyFile(reset.tree)).toMatchObject({ content: json(DEFAULT_GUI_POLICY) });
    expect(policyFileMode(reset.home)).toBe(0o600);
    // Repair keeps what parsed — the retention window — and drops what the schema refused.
    expect(repairedInvalid.responses[0]).toMatchObject({
      status: 200,
      body: { errors: [], policy: { safety: { level: 'standard' }, audit: { retention_days: 5 } } },
    });
    expect(policyFile(repairedInvalid.tree)?.content).toBe(
      json({ ...DEFAULT_GUI_POLICY, audit: { retention_days: 5 } }),
    );
    // Nothing parsed, so there is nothing to keep.
    expect(policyFile(repairedMalformed.tree)?.content).toBe(json(DEFAULT_GUI_POLICY));
  });
});
