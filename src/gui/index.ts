import { spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { existsSync } from 'node:fs';
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import { Writable } from 'node:stream';
import { parseCommandArgs } from '@/cli/args';
import { getActivitySummary } from '@/cli/doctor/activity';
import { checkForUpdates } from '@/cli/doctor/updates';
import { type RunInstallCommandOptions, runInstallCommand } from '@/cli/install/index';
import { createProcessEnvironment, type Environment } from '@/core/environment';
import {
  bindPolicyFilesystemScope,
  getPolicyFilesystemTargetForPath,
  writePolicyFileAtomic,
} from '@/core/io/safe-read';
import {
  buildProjectPolicyFileValue,
  diffPolicyRows,
  readPolicyJson,
  readRuntimeUserBaseline,
} from '@/core/policy/diff';
import { mergeProjectPolicy } from '@/core/policy/merge';
import { getProjectPolicyPath, type RulesPolicyOptions } from '@/core/policy/paths';
import { readRetentionDays } from '@/core/policy/retention';
import { loadRulesPolicy } from '@/core/policy/scope-policy';
import {
  createPolicySnapshot,
  describeConfigState,
  loadPolicySnapshot,
} from '@/core/policy/snapshot';
import {
  createPolicyPreview,
  DEFAULT_GUI_POLICY,
  normalizeGuiPolicy,
  normalizeSafety,
  previewUserPolicyForGui,
  projectPolicyProjection,
  readUserPolicyForGui,
  repairUserPolicyForGui,
  resolveSecretDisabledRules,
  writeUserPolicyFromGui,
} from '@/core/policy/store';
import { getUserPolicyDiagnostics } from '@/core/policy/validate';
import { DESTRUCTIVE_COMMAND_RULE_METADATA } from '@/core/rules/destructive';
import { SECRET_PROTECTION_RULE_METADATA } from '@/core/rules/secret';
import { type ExplainResult, explainCommand } from '@/gate/explain';
import { getIntegrationDisplayName, installIntegrationMetadata } from '@/hosts/catalog';
import { detectAllHooks } from '@/hosts/detect/index';
import type { SystemInfo, UpdateInfo } from '@/hosts/doctor-types';
import { INSTALL_TARGETS, type InstallAction, type InstallTarget } from '@/hosts/install/targets';
import { getPackageVersion, getSystemInfo, type VersionFetcher } from '@/hosts/system-info';
import { getActivityFeed } from './activity';
import {
  type ChooseDirectoryResult,
  chooseDirectory,
  isDirectoryPickerAvailable,
} from './choose-directory';
import { renderPolicyGuiHtml } from './page';

const REPO = 'kenryu42/cc-safety-net';
const REPO_URL = `https://github.com/${REPO}`;
const STAR_TIMEOUT_MS = 10_000;
const DEFAULT_ACTIVITY_DAYS = 7;
type StarCountFetch = (input: string | URL | Request, init?: RequestInit) => Promise<Response>;

/** @internal */
export interface StarContext {
  starred: boolean | null;
  starCount: number | null;
  blockedTotal: number;
}

interface IntegrationsStatus {
  targets: {
    target: InstallTarget;
    label: string;
    version: string | null;
    status: 'active' | 'disabled' | 'not-installed' | 'not-inspected';
  }[];
  system: { version: string; nodeVersion: string | null; platform: string };
}

interface HealthStatus {
  hooks: { platform: string; label: string; configured: boolean }[];
  update: { currentVersion: string; latestVersion: string | null; updateAvailable: boolean };
}

/** @internal */
export interface PolicyGuiServer {
  origin: string;
  token: string;
  url: string;
  close: () => Promise<void>;
}

/**
 * The project draft a GUI session is editing: the directory it targets (null is
 * the launch cwd) and an opaque counter bumped whenever that directory changes.
 * The counter binds a diff to the apply that follows it, so a second tab moving
 * the directory invalidates the confirmation the first tab is holding.
 */
interface ProjectDraftSession {
  dir: string | null;
  revision: number;
}

const STALE_DRAFT_REVISION =
  'The project draft directory changed; reload the draft before applying.';

const PROJECT_AUDIT_REJECTION =
  'audit settings are user scope only; remove the audit section from a project proposal';

interface PolicyGuiServerOptions extends Partial<RulesPolicyOptions> {
  chooseDirectory?: () => Promise<ChooseDirectoryResult>;
  starRepo?: () => Promise<{ ok: boolean }>;
  fetchStarContext?: () => Promise<StarContext>;
  fetchIntegrations?: () => Promise<IntegrationsStatus>;
  fetchHealth?: () => Promise<HealthStatus>;
  runIntegration?: (
    action: InstallAction,
    target: InstallTarget,
  ) => Promise<{ ok: boolean; output: string }>;
  activityLogsDir?: string;
}

interface RunGuiCommandOptions extends Partial<RulesPolicyOptions> {
  openBrowser?: (url: string) => Promise<void> | void;
  keepAlive?: boolean;
  log?: (message: string) => void;
  error?: (message: string) => void;
}

export async function runGuiCommand(
  args: readonly string[],
  options: RunGuiCommandOptions = {},
): Promise<number> {
  const parsed = parseCommandArgs({ label: 'gui', booleans: { noOpen: ['--no-open'] } }, args);
  const log = options.log ?? console.log;
  const error = options.error ?? console.error;
  if (parsed.errors.length > 0) {
    for (const message of parsed.errors) error(message);
    error('Usage: cc-safety-net gui [--no-open]');
    return 1;
  }

  const server = await createPolicyGuiServer(createProcessEnvironment(), options);
  log(`CC Safety Net policy GUI: ${server.url}`);

  if (!parsed.flags.noOpen) {
    try {
      await (options.openBrowser ?? openBrowser)(server.url);
    } catch (openError) {
      error(
        `Failed to open browser: ${openError instanceof Error ? openError.message : String(openError)}`,
      );
      error(`Open this URL manually: ${server.url}`);
    }
  }

  if (options.keepAlive === false) {
    await server.close();
    return 0;
  }

  await waitForShutdown(server);
  return 0;
}

/** @internal */
export async function createPolicyGuiServer(
  environment: Environment,
  options: PolicyGuiServerOptions = {},
): Promise<PolicyGuiServer> {
  const token = randomBytes(24).toString('base64url');
  // Per session rather than per module: the draft directory belongs to the one
  // GUI this server serves, and a second server must not inherit its target.
  const session: ProjectDraftSession = { dir: null, revision: 0 };
  const server = createServer((request, response) => {
    void handleRequest(environment, request, response, token, options, session);
  });

  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      server.off('error', reject);
      resolve();
    });
  });

  const address = server.address() as { port: number };
  const origin = `http://127.0.0.1:${address.port}`;
  return {
    origin,
    token,
    url: `${origin}/?token=${encodeURIComponent(token)}`,
    close: () => closeServer(server),
  };
}

async function handleRequest(
  environment: Environment,
  request: IncomingMessage,
  response: ServerResponse,
  token: string,
  options: PolicyGuiServerOptions,
  session: ProjectDraftSession,
): Promise<void> {
  const url = new URL(request.url ?? '/', 'http://127.0.0.1');
  if (request.method === 'GET' && url.pathname === '/favicon.ico') {
    response.writeHead(204, { 'cache-control': 'no-store' });
    response.end();
    return;
  }

  if (!requestHasValidToken(request, url, token)) {
    sendJson(response, 403, { error: 'Forbidden' });
    return;
  }

  if (request.method === 'GET' && url.pathname === '/') {
    sendHtml(response, renderPolicyGuiHtml(token));
    return;
  }

  if (request.method === 'GET' && url.pathname === '/api/policy') {
    const result = readUserPolicyForGui(environment, options);
    const snapshot = loadPolicySnapshot(environment, loaderOptions(options));
    sendJson(response, 200, {
      ...result,
      configState: describeConfigState(snapshot),
      // Display only: the editor writes the user file, so a project policy in
      // force is reported beside it rather than made editable here.
      ...(snapshot.policyScopes
        ? {
            projectPolicy: {
              path: getProjectPolicyPath(options.cwd ?? process.cwd()),
              weakenings: snapshot.policyScopes.weakenings,
            },
          }
        : {}),
      destructiveCommandRules: DESTRUCTIVE_COMMAND_RULE_METADATA,
      secretPatterns: SECRET_PROTECTION_RULE_METADATA,
      version: getPackageVersion(),
      preview:
        result.errors.length > 0 ? null : createPolicyPreview(result.policy, environment.env),
    });
    return;
  }

  if (request.method === 'POST' && url.pathname === '/api/policy/preview') {
    const body = await readJsonBody(request);
    if (!body.ok) {
      sendJson(response, body.status, { errors: [body.error] });
      return;
    }
    const result = previewUserPolicyForGui(environment, body.value);
    sendJson(response, result.errors.length > 0 ? 400 : 200, result);
    return;
  }

  if (request.method === 'POST' && url.pathname === '/api/policy/explain') {
    const body = await readJsonBody(request);
    if (!body.ok) {
      sendJson(response, body.status, { errors: [body.error] });
      return;
    }
    const payload = body.value as { command?: unknown; policy?: unknown } | null;
    if (payload === null || typeof payload.command !== 'string') {
      sendJson(response, 400, { errors: ['command must be a string'] });
      return;
    }
    const errors = getUserPolicyDiagnostics(payload.policy, environment.home);
    if (errors.length > 0) {
      sendJson(response, 400, { errors });
      return;
    }
    sendJson(
      response,
      200,
      explainDraftCommand(environment, payload.command, payload.policy, options),
    );
    return;
  }

  if (request.method === 'POST' && url.pathname === '/api/policy') {
    const body = await readJsonBody(request);
    if (!body.ok) {
      sendJson(response, body.status, { errors: [body.error] });
      return;
    }
    const result = writeUserPolicyFromGui(environment, body.value, options);
    sendJson(response, result.errors.length > 0 ? 400 : 200, result);
    return;
  }

  if (request.method === 'POST' && url.pathname === '/api/reset') {
    sendJson(response, 200, writeUserPolicyFromGui(environment, DEFAULT_GUI_POLICY, options));
    return;
  }

  if (request.method === 'POST' && url.pathname === '/api/repair') {
    sendJson(response, 200, repairUserPolicyForGui(environment, options));
    return;
  }

  if (request.method === 'POST' && url.pathname === '/api/policy/project/choose-directory') {
    // Takes no path from the client: the dialog is the only input, so there is
    // nothing here to point at a directory of the caller's choosing.
    const picked = await (options.chooseDirectory ?? chooseDirectory)();
    if ('path' in picked) {
      session.dir = picked.path;
      session.revision += 1;
    }
    sendJson(response, 200, {
      cancelled: 'cancelled' in picked,
      ...('error' in picked ? { error: picked.error } : {}),
    });
    return;
  }

  if (request.method === 'GET' && url.pathname === '/api/policy/project') {
    const dir = resolveDraftProjectDir(session, options);
    const current = readProjectPolicyFile(dir, environment.home);
    // Both halves come from one read: the draft refuses to inherit from the
    // protective defaults an unreadable user policy degrades to, and a second
    // read could report defaults with the diagnostics that explain them gone.
    const user = readRuntimeUserBaseline(environment, options);
    sendJson(response, 200, {
      dir,
      // Named by the server rather than joined in the browser: the confirm
      // dialog and the JSON preview both state where the write lands, and a
      // path assembled client-side would print the wrong separator on Windows.
      path: getProjectPolicyPath(dir),
      revision: session.revision,
      baseline: user.baseline,
      userPolicyDiagnostics: user.diagnostics,
      projection: current.projection,
      projectionDiagnostics: current.diagnostics,
      canPickDirectory: isDirectoryPickerAvailable(process.platform, process.env),
    });
    return;
  }

  if (request.method === 'POST' && url.pathname === '/api/policy/project/diff') {
    const draft = await readProjectDraft(environment, request, response, session, options);
    if (!draft) return;
    const current = readProjectPolicyFile(draft.dir, environment.home);
    const baseline = readRuntimeUserBaseline(environment, options).baseline;
    // The weakenings come from the same merge as the proposed policy, so the
    // warnings describe exactly the proposal the rows below them show.
    const proposed = mergeProjectPolicy(
      baseline,
      projectPolicyProjection(draft.proposal, environment.home).policy,
    );
    sendJson(response, 200, {
      rows: diffPolicyRows(
        mergeProjectPolicy(baseline, current.projection).policy,
        proposed.policy,
        false,
      ),
      weakenings: proposed.weakenings,
      existingFileDiagnostics: current.diagnostics,
      errors: [],
    });
    return;
  }

  if (request.method === 'POST' && url.pathname === '/api/policy/project/apply') {
    const draft = await readProjectDraft(environment, request, response, session, options);
    if (!draft) return;
    const written = writeProjectPolicy(draft.dir, draft.proposal, environment.home);
    sendJson(response, written.errors.length > 0 ? 500 : 200, written);
    return;
  }

  if (request.method === 'GET' && url.pathname === '/api/activity') {
    const retentionDays = readRetentionDays(environment, options);
    const days = parseActivityDays(url.searchParams.get('days'), retentionDays);
    if (days === null) {
      sendJson(response, 400, {
        error: `days must be an integer between 1 and ${retentionDays}`,
      });
      return;
    }
    sendJson(response, 200, getActivityFeed(environment, days, options.activityLogsDir));
    return;
  }

  if (request.method === 'POST' && url.pathname === '/api/rules/choose-directory') {
    // Takes no path from the client: the dialog is the only input, so there is
    // nothing here to point at a directory of the caller's choosing.
    sendJson(response, 200, await chooseDirectory());
    return;
  }

  if (request.method === 'GET' && url.pathname === '/api/rules') {
    const policy = loadRulesPolicy(environment, loaderOptions(options));
    const enforcedByName = new Map(policy.rules.map((rule) => [rule.name, rule]));
    sendJson(response, 200, {
      projectPath: options.cwd ?? process.cwd(),
      canPickDirectory: isDirectoryPickerAvailable(process.platform, process.env),
      rulebooks: policy.rulebooks.map((rulebook) => ({
        source: rulebook.source,
        spec: rulebook.spec,
        name: rulebook.name,
        version: rulebook.version,
        // A rule disabled by an override stays listed here but leaves policy.rules.
        rules: rulebook.rules.flatMap((ruleName) => {
          const rule = enforcedByName.get(ruleName);
          if (!rule) return [];
          return [
            {
              name: rule.name,
              command: rule.command,
              subcommand: rule.subcommand,
              block_args: rule.block_args,
              reason: rule.reason,
            },
          ];
        }),
      })),
      errors: policy.errors,
      warnings: policy.warnings,
    });
    return;
  }

  if (request.method === 'GET' && url.pathname === '/api/star/context') {
    sendJson(
      response,
      200,
      await (
        options.fetchStarContext ??
        (() => fetchStarContext(environment, { logsDir: options.activityLogsDir }))
      )(),
    );
    return;
  }

  if (request.method === 'POST' && url.pathname === '/api/star') {
    const result = await (options.starRepo ?? starRepo)();
    sendJson(response, 200, result.ok ? { ok: true } : { ok: false, fallbackUrl: REPO_URL });
    return;
  }

  if (request.method === 'GET' && url.pathname === '/api/integrations') {
    sendJson(
      response,
      200,
      await (options.fetchIntegrations ?? (() => fetchIntegrations(environment)))(),
    );
    return;
  }

  if (request.method === 'GET' && url.pathname === '/api/health') {
    sendJson(response, 200, await (options.fetchHealth ?? (() => fetchHealth(environment)))());
    return;
  }

  if (
    request.method === 'POST' &&
    (url.pathname === '/api/install' || url.pathname === '/api/uninstall')
  ) {
    const body = await readJsonBody(request);
    if (!body.ok) {
      sendJson(response, body.status, { errors: [body.error] });
      return;
    }
    const target = (body.value as { target?: unknown } | null)?.target;
    if (typeof target !== 'string' || !INSTALL_TARGETS.some((entry) => entry.target === target)) {
      sendJson(response, 400, { error: 'unknown target' });
      return;
    }
    const action = url.pathname === '/api/install' ? 'install' : 'uninstall';
    sendJson(
      response,
      200,
      await (options.runIntegration ?? runIntegration)(action, target as InstallTarget),
    );
    return;
  }

  sendJson(response, 404, { error: 'Not found' });
}

/** The loaders take a resolved project directory; the server's is optional as in the CLI. */
function loaderOptions(options: PolicyGuiServerOptions): RulesPolicyOptions {
  return { ...options, cwd: options.cwd ?? process.cwd() };
}

function resolveDraftProjectDir(
  session: ProjectDraftSession,
  options: PolicyGuiServerOptions,
): string {
  return session.dir ?? options.cwd ?? process.cwd();
}

/**
 * The project policy file as it stands, with the diagnostics an unreadable or
 * invalid one produces. A malformed file projects to nothing so the draft starts
 * empty and says why, rather than pretending the team policy loaded.
 */
function readProjectPolicyFile(dir: string, home: string) {
  const path = getProjectPolicyPath(dir);
  const file = existsSync(path) ? readPolicyJson(path) : { value: undefined, errors: [] };
  const projection = projectPolicyProjection(file.value, home);
  return {
    projection: projection.policy,
    diagnostics: [...file.errors, ...projection.diagnostics],
  };
}

/**
 * The gate both project-draft writes pass: the session directory and revision
 * read **synchronously at entry, before the body await**, a proposal still bound
 * to the revision the caller read, and the validation the CLI runs before a
 * project apply. Capturing here rather than after the await is what makes the
 * cross-tab interleave unreachable: the directory returned is the one whose
 * revision matched, which is the one whose diff the user confirmed. A rejected
 * body is answered here, so a caller handles only the accepted case.
 */
async function readProjectDraft(
  environment: Environment,
  request: IncomingMessage,
  response: ServerResponse,
  session: ProjectDraftSession,
  options: PolicyGuiServerOptions,
): Promise<{ dir: string; proposal: unknown } | null> {
  const dir = resolveDraftProjectDir(session, options);
  const revision = session.revision;
  const body = await readJsonBody(request);
  if (!body.ok) {
    sendJson(response, body.status, { errors: [body.error] });
    return null;
  }
  const payload = body.value as { proposal?: unknown; revision?: unknown } | null;
  // A body with no revision is malformed input, not a directory that moved: it
  // must not reach the client as the "reload the draft" story a stale one tells.
  if (typeof payload?.revision !== 'number') {
    sendJson(response, 400, { errors: ['revision must be a number'] });
    return null;
  }
  if (payload.revision !== revision) {
    sendJson(response, 409, { errors: [STALE_DRAFT_REVISION] });
    return null;
  }
  const errors = getProjectProposalErrors(payload.proposal, environment.home);
  if (errors.length > 0) {
    sendJson(response, 400, { errors });
    return null;
  }
  return { dir, proposal: payload.proposal };
}

/**
 * A project proposal is a user policy minus the audit section, which has no
 * project scope: accepting one would report a setting the loader then ignores.
 * The same two checks the CLI runs before a project `policy apply`.
 */
function getProjectProposalErrors(proposal: unknown, home: string): string[] {
  const errors = getUserPolicyDiagnostics(proposal, home);
  if (errors.length > 0) return errors;
  return (proposal as { audit?: unknown } | null)?.audit === undefined
    ? []
    : [PROJECT_AUDIT_REJECTION];
}

/**
 * The write goes through the project-policy containment capability rather than a
 * joined path: `.cc-safety-net` in a checkout the user did not write can be a
 * symlink, and following it would redirect the write out of the project — onto
 * the user's own policy file, for instance.
 */
function writeProjectPolicy(
  dir: string,
  proposal: unknown,
  home: string,
): { path: string; errors: string[] } {
  const path = getProjectPolicyPath(dir);
  const value = buildProjectPolicyFileValue(proposal, normalizeGuiPolicy(proposal, home));
  try {
    writePolicyFileAtomic(
      getPolicyFilesystemTargetForPath(bindPolicyFilesystemScope(dir, 'project policy'), path),
      `${JSON.stringify(value, null, 2)}\n`,
    );
    return { path, errors: [] };
  } catch (error) {
    // The containment machinery reports an escaping or symlinked target by
    // throwing; the response has to carry that instead of the request hanging.
    return { path, errors: [error instanceof Error ? error.message : String(error)] };
  }
}

function explainDraftCommand(
  environment: Environment,
  command: string,
  policy: unknown,
  options: PolicyGuiServerOptions,
): ExplainResult {
  const draft = normalizeGuiPolicy(policy, environment.home);
  const diskSnapshot = loadPolicySnapshot(environment, loaderOptions(options));
  const snapshot = createPolicySnapshot({
    rules: diskSnapshot.policy.rules,
    transparentWrappers: diskSnapshot.policy.transparentWrappers,
    safety: normalizeSafety(draft.safety),
    worktreeMode: draft.workflow.worktree_mode,
    destructiveCommandProtectionEnabled: draft.destructive_command_protection.enabled,
    destructiveCommandRuleOverrides: draft.destructive_command_protection.overrides,
    destructiveCommandAllowPaths: draft.destructive_command_protection.allow_paths,
    secretProtection: {
      enabled: draft.secret_protection.enabled,
      disabledRules: resolveSecretDisabledRules(draft.secret_protection.overrides),
      denyPaths: draft.secret_protection.deny_paths,
      allowPaths: draft.secret_protection.allow_paths,
    },
  });
  return explainCommand(
    command,
    {
      policySnapshot: snapshot,
      cwd: options.cwd,
      userConfigDir: options.userConfigDir,
    },
    environment,
  );
}

function parseActivityDays(raw: string | null, retentionDays: number): number | null {
  // The default window cannot outrun a retention set below it.
  if (raw === null) return Math.min(DEFAULT_ACTIVITY_DAYS, retentionDays);
  const days = Number(raw);
  if (!Number.isInteger(days) || days < 1 || days > retentionDays) return null;
  return days;
}

function requestHasValidToken(request: IncomingMessage, url: URL, token: string): boolean {
  if (url.searchParams.get('token') !== token) return false;
  if (request.method !== 'POST') return true;
  return request.headers['x-cc-safety-net-token'] === token;
}

/** The whole body sits in memory before parsing, so one oversized local
 *  request must stop at this cap instead of growing the process unbounded. */
const MAX_JSON_BODY_BYTES = 1_048_576;

async function readJsonBody(
  request: IncomingMessage,
): Promise<{ ok: true; value: unknown } | { ok: false; status: 400 | 413; error: string }> {
  const chunks: Buffer[] = [];
  let bytes = 0;
  for await (const chunk of request) {
    const buffer = chunk as Buffer;
    bytes += buffer.byteLength;
    if (bytes > MAX_JSON_BODY_BYTES) {
      return { ok: false, status: 413, error: 'Request body is too large' };
    }
    chunks.push(buffer);
  }
  try {
    return { ok: true, value: JSON.parse(Buffer.concat(chunks).toString('utf-8') || '{}') };
  } catch (error) {
    return {
      ok: false,
      status: 400,
      error: `Invalid JSON: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
}

function sendHtml(response: ServerResponse, html: string): void {
  response.writeHead(200, {
    'content-type': 'text/html; charset=utf-8',
    'cache-control': 'no-store',
  });
  response.end(html);
}

function sendJson(response: ServerResponse, status: number, body: unknown): void {
  response.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
  });
  response.end(JSON.stringify(body));
}

function closeServer(server: Server): Promise<void> {
  return new Promise((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
  });
}

function waitForShutdown(server: PolicyGuiServer): Promise<void> {
  return new Promise((resolve) => {
    const cleanup = () => {
      process.off('SIGINT', shutdown);
      process.off('SIGTERM', shutdown);
    };
    const shutdown = () => {
      cleanup();
      void server.close().then(resolve);
    };
    process.once('SIGINT', shutdown);
    process.once('SIGTERM', shutdown);
  });
}

function openBrowser(url: string): Promise<void> {
  const command =
    process.platform === 'darwin' ? 'open' : process.platform === 'win32' ? 'cmd' : 'xdg-open';
  const args = process.platform === 'win32' ? ['/c', 'start', '', url] : [url];
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { detached: true, stdio: 'ignore' });
    const handleError = (error: Error) => {
      child.off('spawn', handleSpawn);
      reject(error);
    };
    const handleSpawn = () => {
      child.off('error', handleError);
      child.unref();
      resolve();
    };
    child.once('error', handleError);
    child.once('spawn', handleSpawn);
  });
}

/** @internal */
export async function starRepo(
  command = 'gh',
  timeoutMs = STAR_TIMEOUT_MS,
): Promise<{ ok: boolean }> {
  return {
    ok:
      (await runGhCommand(command, ['api', '-X', 'PUT', `/user/starred/${REPO}`], timeoutMs)) === 0,
  };
}

/** @internal */
export async function fetchIntegrations(
  environment: Environment,
  probe: { fetcher?: VersionFetcher } = {},
): Promise<IntegrationsStatus> {
  const systemInfo = await getSystemInfo(probe.fetcher);
  const hookStatuses = detectHooksFromSystemInfo(environment, systemInfo);
  return {
    targets: installIntegrationMetadata.map((meta) => {
      const hook = hookStatuses.find((status) => status.platform === meta.id);
      return {
        target: meta.id,
        label: getIntegrationDisplayName(meta.id),
        version: systemInfo.versions[meta.id] ?? null,
        status: hook?.configured
          ? 'active'
          : hook?.detected
            ? 'disabled'
            : hook?.inspectionStatus === 'not-inspected'
              ? 'not-inspected'
              : 'not-installed',
      } as const;
    }),
    system: {
      version: systemInfo.version,
      nodeVersion: systemInfo.nodeVersion,
      platform: systemInfo.platform,
    },
  };
}

function detectHooksFromSystemInfo(environment: Environment, systemInfo: SystemInfo) {
  return detectAllHooks(environment, process.cwd(), {
    ampPluginListOutput: systemInfo.ampPluginListOutput,
    codexPluginListOutput: systemInfo.codexPluginListOutput,
    copilotCliVersion: systemInfo.versions['copilot-cli'],
  });
}

/**
 * Health for the Overview strip, from the same getSystemInfo batch the Integrations tab
 * uses. Runtimes whose hook state can only be read by writing into their config directory
 * are reported as not inspected, so they are absent from this list rather than listed as
 * inactive; the Integrations tab shows that state per runtime.
 * @internal
 */
export async function fetchHealth(
  environment: Environment,
  probe: {
    fetcher?: VersionFetcher;
    checkUpdates?: () => Promise<UpdateInfo>;
  } = {},
): Promise<HealthStatus> {
  const [systemInfo, update] = await Promise.all([
    getSystemInfo(probe.fetcher),
    (probe.checkUpdates ?? checkForUpdates)(),
  ]);
  return {
    hooks: detectHooksFromSystemInfo(environment, systemInfo)
      .filter((hook) => hook.detected)
      .map((hook) => ({
        platform: hook.platform,
        label: getIntegrationDisplayName(hook.platform),
        configured: hook.configured,
      })),
    update: {
      currentVersion: update.currentVersion,
      latestVersion: update.latestVersion ?? null,
      updateAvailable: update.updateAvailable,
    },
  };
}

let integrationActionQueue: Promise<unknown> = Promise.resolve();

/** @internal */
export function runIntegration(
  action: InstallAction,
  target: InstallTarget,
  overrides: RunInstallCommandOptions = {},
): Promise<{ ok: boolean; output: string }> {
  const run = async () => {
    const lines: string[] = [];
    const originalLog = console.log;
    const originalError = console.error;
    console.log = (...args: unknown[]) => lines.push(args.map(String).join(' '));
    console.error = console.log;
    try {
      const exitCode = await runInstallCommand(action, [], {
        selectTargets: async () => [target],
        output: new Writable({
          // The install report goes to `output`, not the console, so the status box would
          // render empty unless these chunks land in the same capture.
          write(chunk, _encoding, callback) {
            lines.push(String(chunk).replace(/\n$/, ''));
            callback();
          },
        }) as unknown as NodeJS.WriteStream,
        ...overrides,
      });
      return { ok: exitCode === 0, output: lines.join('\n') };
    } finally {
      console.log = originalLog;
      console.error = originalError;
    }
  };
  const result = integrationActionQueue.then(run);
  integrationActionQueue = result.then(
    () => undefined,
    () => undefined,
  );
  return result;
}

/** @internal */
export async function fetchStarContext(
  environment: Environment,
  options: { command?: string; logsDir?: string; fetchRepo?: StarCountFetch } = {},
): Promise<StarContext> {
  const [starred, starCount, blockedTotal] = await Promise.all([
    userHasStarredRepo(options.command),
    fetchStarCount(options.fetchRepo),
    Promise.resolve(
      getActivitySummary(environment, readRetentionDays(environment), options.logsDir).totalBlocked,
    ),
  ]);
  return { starred, starCount, blockedTotal };
}

/** @internal */
export async function userHasStarredRepo(
  command = 'gh',
  timeoutMs = STAR_TIMEOUT_MS,
): Promise<boolean | null> {
  if ((await runGhCommand(command, ['auth', 'status'], timeoutMs)) !== 0) return null;
  const starredExitCode = await runGhCommand(command, ['api', `/user/starred/${REPO}`], timeoutMs);
  if (starredExitCode === 0) return true;
  if (starredExitCode === null) return null;
  return false;
}

function runGhCommand(
  command: string,
  args: readonly string[],
  timeoutMs: number,
): Promise<number | null> {
  return new Promise((resolve) => {
    const child = spawn(command, args, {
      stdio: 'ignore',
      windowsHide: true,
    });
    let settled = false;
    let timeout: ReturnType<typeof setTimeout> | undefined;
    const finish = (code: number | null) => {
      if (settled) return;
      settled = true;
      if (timeout) clearTimeout(timeout);
      resolve(code);
    };
    child.once('error', () => finish(null));
    child.once('close', finish);
    timeout = setTimeout(() => {
      child.kill();
      finish(null);
    }, timeoutMs);
  });
}

async function fetchStarCount(fetchRepo: StarCountFetch = fetch): Promise<number | null> {
  try {
    const response = await fetchRepo(`https://api.github.com/repos/${REPO}`, {
      headers: { accept: 'application/vnd.github+json' },
      signal: AbortSignal.timeout(STAR_TIMEOUT_MS),
    });
    if (!response.ok) return null;
    const body = (await response.json()) as { stargazers_count?: unknown };
    return typeof body.stargazers_count === 'number' ? body.stargazers_count : null;
  } catch {
    return null;
  }
}
