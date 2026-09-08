import { dirname } from 'node:path';
import {
  bindPolicyFilesystemScope,
  getPolicyFilesystemTargetForPath,
  type PolicyFilesystemScope,
  readPolicyFile,
} from '@/core/io/safe-read';
import { getLocalRulebookPath } from '@/core/policy/paths';
import { assertValidRulebook, type Rulebook } from '@/core/policy/rulebook';
import {
  assertBareRulebookName,
  GITHUB_RULEBOOK_PATH_RE,
  isGitHubRef,
  isGitHubRepositorySource,
  isGitHubRulebookSource,
  parseGitHubSource,
  RULES_DIR,
} from '@/core/policy/source-syntax';
import { evaluateRulebookFixtures } from '@/gate/rulebook-fixtures';
import {
  createRuleSyncOperation,
  createRuleSyncResourceBudget,
  type RuleSyncOperation,
  type RuleSyncResourceBudget,
  reserveGitHubRequest,
  reserveGitHubResponseBytes,
} from './resource-limits';

export interface ResolvedRulebook {
  spec: string;
  rulebook: Rulebook;
  content: string;
}

export interface DiscoveredGitHubRepository {
  source: string;
  owner: string;
  repo: string;
  ref: string;
  commit: string;
  names: string[];
}

type GitHubResourceKind = 'metadata' | 'commit' | 'tree' | 'raw';

/** @internal Generous byte and time limits for untrusted GitHub rulebook responses. */
export const GITHUB_FETCH_LIMITS = Object.freeze({
  timeoutMs: 15_000,
  metadataBytes: 512 * 1024,
  commitBytes: 256 * 1024,
  treeBytes: 16 * 1024 * 1024,
  rawBytes: 4 * 1024 * 1024,
});

/** @internal */
export async function resolveRulebookSource(
  spec: string,
  configDir: string,
  filesystemScope: PolicyFilesystemScope = bindPolicyFilesystemScope(
    dirname(dirname(configDir)),
    'rules policy',
  ),
  operation: RuleSyncOperation = createRuleSyncOperation(),
): Promise<ResolvedRulebook> {
  if (isGitHubRulebookSource(spec)) {
    return resolveGitHubRulebook(spec, operation);
  }
  return resolveLocalRulebook(spec, configDir, filesystemScope);
}

/**
 * Fetching is deliberate: a remote source is re-fetched only when the caller asks for it
 * (`rule update`) or when nothing is vendored yet. Every other run reads the vendored file, so
 * no machine other than the one that ran `add` or `update` ever touches the network.
 * In non-refresh runs the nothing-vendored fallback covers unselected sources on purpose: the
 * post-sync runtime verification requires the whole scope to load cleanly, so skipping a
 * missing sibling would fail unrelated commands instead of healing them. A selective
 * `rule update <source>` is the exception — its unselected siblings must stay off the
 * network entirely, so a missing one is reported rather than fetched.
 */
export async function resolveRulebookSourceForSync(
  spec: string,
  configDir: string,
  filesystemScope: PolicyFilesystemScope | undefined,
  operation: RuleSyncOperation,
  refetch: boolean,
  fetchWhenMissing: boolean,
): Promise<ResolvedRulebook> {
  if (!isGitHubRulebookSource(spec)) {
    return resolveRulebookSource(spec, configDir, filesystemScope, operation);
  }
  const vendored = refetch ? null : readVendoredRulebook(spec, configDir, filesystemScope);
  if (vendored) return vendored;
  if (!refetch && !fetchWhenMissing) {
    throw new Error(`${spec} is not vendored; run rule update ${spec} to vendor it`);
  }
  return resolveRulebookSource(spec, configDir, filesystemScope, operation);
}

function readVendoredRulebook(
  spec: string,
  configDir: string,
  filesystemScope: PolicyFilesystemScope = bindPolicyFilesystemScope(
    dirname(dirname(configDir)),
    'rules policy',
  ),
): ResolvedRulebook | null {
  const parsed = parseGitHubSource(spec);
  const path = getLocalRulebookPath(configDir, parsed.name);
  const content = readPolicyFile(getPolicyFilesystemTargetForPath(filesystemScope, path));
  if (content === null) return null;
  const rulebook = assertValidRulebook(parseRulebookJson(content, `Invalid rulebook ${path}.`));
  if (rulebook.name !== parsed.name) {
    throw new Error(`rulebook name "${rulebook.name}" in ${path} must match "${parsed.name}"`);
  }
  return { spec, rulebook, content };
}

export async function discoverGitHubRepositoryRulebooks(
  source: string,
  options: { ref?: string; operation?: RuleSyncOperation } = {},
): Promise<DiscoveredGitHubRepository> {
  if (!isGitHubRepositorySource(source)) {
    throw new Error(`Invalid GitHub repository source: ${source}`);
  }
  const [owner, repo] = source.split('/');
  if (!owner || !repo) {
    throw new Error(`Invalid GitHub repository source: ${source}`);
  }
  if (options.ref !== undefined && !isGitHubRef(options.ref)) {
    throw new Error(`GitHub rulebook refs must use valid path segments: ${options.ref}`);
  }
  const operation = options.operation ?? createRuleSyncOperation();
  const ref = options.ref ?? (await getGitHubDefaultBranch(owner, repo, source, operation));
  const commit = await resolveGitHubCommit(owner, repo, ref, source, operation);
  const treeResource = await fetchRuleSyncResource(
    `https://api.github.com/repos/${owner}/${repo}/git/trees/${commit}?recursive=1`,
    'tree',
    operation,
  );
  const treeResponse = treeResource.response;
  if (!treeResponse.ok) {
    throw new Error(`Failed to inspect ${source}: GitHub tree returned ${treeResponse.status}`);
  }
  const treeJson = JSON.parse(treeResource.content) as { tree?: unknown } | null;
  if (!Array.isArray(treeJson?.tree)) {
    throw new Error(`Failed to inspect ${source}: unexpected GitHub tree response`);
  }
  const entries: unknown[] = treeJson.tree;
  const names = [
    ...new Set(
      entries.flatMap((entry) => {
        if (!entry || typeof entry !== 'object') return [];
        const record = entry as { path?: unknown; type?: unknown };
        if (record.type !== 'blob' || typeof record.path !== 'string') return [];
        const match = record.path.match(GITHUB_RULEBOOK_PATH_RE);
        return match?.[1] ? [match[1]] : [];
      }),
    ),
  ].sort();
  if (names.length === 0) {
    throw new Error(`No rulebooks found in ${source} under ${RULES_DIR}/`);
  }
  return { source, owner, repo, ref, commit, names };
}

async function getGitHubDefaultBranch(
  owner: string,
  repo: string,
  source: string,
  operation: RuleSyncOperation,
): Promise<string> {
  const metadataResource = await fetchRuleSyncResource(
    `https://api.github.com/repos/${owner}/${repo}`,
    'metadata',
    operation,
  );
  const metadataResponse = metadataResource.response;
  if (!metadataResponse.ok) {
    throw new Error(`Failed to inspect ${source}: GitHub returned ${metadataResponse.status}`);
  }
  const metadata = JSON.parse(metadataResource.content) as {
    default_branch?: unknown;
  } | null;
  const defaultBranch = metadata?.default_branch;
  if (typeof defaultBranch !== 'string' || defaultBranch === '') {
    throw new Error(`Failed to inspect ${source}: missing default branch`);
  }
  if (!isGitHubRef(defaultBranch)) {
    throw new Error(`GitHub returned an invalid default branch: ${defaultBranch}`);
  }
  return defaultBranch;
}

function resolveLocalRulebook(
  spec: string,
  configDir: string,
  filesystemScope: PolicyFilesystemScope,
): ResolvedRulebook {
  assertBareRulebookName(spec);
  const path = getLocalRulebookPath(configDir, spec);
  const content = readPolicyFile(getPolicyFilesystemTargetForPath(filesystemScope, path));
  if (content === null) throw new Error(`Rulebook source not found: ${spec}`);
  const rulebook = assertValidSyncedRulebook(
    parseRulebookJson(content, 'Invalid local rulebook source.'),
  );
  if (rulebook.name !== spec) {
    throw new Error(`rulebook name "${rulebook.name}" must match local source "${spec}"`);
  }
  return { spec, rulebook, content };
}

async function resolveGitHubRulebook(
  spec: string,
  operation: RuleSyncOperation,
): Promise<ResolvedRulebook> {
  const parsed = parseGitHubSource(spec);
  const commit = await resolveGitHubCommit(parsed.owner, parsed.repo, parsed.ref, spec, operation);
  const rawResource = await fetchRuleSyncResource(
    `https://raw.githubusercontent.com/${parsed.owner}/${parsed.repo}/${commit}/${parsed.path}`,
    'raw',
    operation,
  );
  const rawResponse = rawResource.response;
  if (!rawResponse.ok) {
    throw new Error(`Failed to fetch ${spec}: GitHub raw returned ${rawResponse.status}`);
  }
  const content = rawResource.content;
  const rulebook = assertValidSyncedRulebook(
    parseRulebookJson(content, 'Invalid GitHub rulebook response.'),
  );
  if (rulebook.name !== parsed.name) {
    throw new Error(`rulebook name "${rulebook.name}" must match GitHub source "${parsed.name}"`);
  }
  return { spec, rulebook, content };
}

/**
 * Validation for freshly fetched or authored content. Fixtures run here only: a rulebook already
 * vendored on disk was fixture-checked when it was fetched, so reading it never re-evaluates them.
 */
function assertValidSyncedRulebook(value: unknown): Rulebook {
  const rulebook = assertValidRulebook(value);
  const failures = evaluateRulebookFixtures(rulebook);
  if (failures.length > 0) {
    throw new Error(failures.join('; '));
  }
  return rulebook;
}

function parseRulebookJson(content: string, errorMessage: string): unknown {
  try {
    return JSON.parse(content) as unknown;
  } catch {
    throw new Error(errorMessage);
  }
}

async function resolveGitHubCommit(
  owner: string,
  repo: string,
  ref: string,
  source: string,
  operation: RuleSyncOperation,
): Promise<string> {
  const commitResource = await fetchRuleSyncResource(
    `https://api.github.com/repos/${owner}/${repo}/commits/${encodeURIComponent(ref)}`,
    'commit',
    operation,
  );
  const commitResponse = commitResource.response;
  if (!commitResponse.ok) {
    throw new Error(`Failed to resolve ${source}: GitHub returned ${commitResponse.status}`);
  }
  const commitJson = JSON.parse(commitResource.content) as {
    sha?: unknown;
  } | null;
  if (typeof commitJson?.sha !== 'string' || commitJson.sha === '') {
    throw new Error(`Failed to resolve commit for ${source}`);
  }
  return commitJson.sha;
}

/** @internal Fetches and consumes a bounded body under one mandatory timeout. */
export async function fetchGitHubResource(
  url: string,
  kind: GitHubResourceKind,
  options: {
    fetch?: typeof fetch;
    timeoutMs?: number;
    budget?: RuleSyncResourceBudget;
    signal?: AbortSignal;
  } = {},
): Promise<{ response: Response; content: string }> {
  if (options.signal?.aborted) throw options.signal.reason;
  const budget = options.budget ?? createRuleSyncResourceBudget();
  const controller = new AbortController();
  const forwardAbort = () => controller.abort(options.signal?.reason);
  options.signal?.addEventListener('abort', forwardAbort, { once: true });
  let timedOut = false;
  const timeout = setTimeout(() => {
    if (controller.signal.aborted) return;
    timedOut = true;
    controller.abort();
  }, options.timeoutMs ?? GITHUB_FETCH_LIMITS.timeoutMs);
  try {
    if (options.signal?.aborted) throw options.signal.reason;
    reserveGitHubRequest(budget);
    const response = await (options.fetch ?? fetch)(url, {
      signal: controller.signal,
      redirect: 'error',
    });
    if (!response.ok) {
      cancelGitHubResponseBody(response);
      return { response, content: '' };
    }
    return {
      response,
      content: await readGitHubResponseText(response, kind, budget, () => controller.abort()),
    };
  } catch (error) {
    if (timedOut) throw new Error('GitHub request timed out', { cause: error });
    if (options.signal?.aborted) throw options.signal.reason;
    throw error;
  } finally {
    clearTimeout(timeout);
    options.signal?.removeEventListener('abort', forwardAbort);
  }
}

function fetchRuleSyncResource(
  url: string,
  kind: GitHubResourceKind,
  operation: RuleSyncOperation,
): Promise<{ response: Response; content: string }> {
  return fetchGitHubResource(operation.resolveUrl?.(url) ?? url, kind, {
    budget: operation.budget,
    signal: operation.controller.signal,
  });
}

/** @internal Reads a response body without trusting Content-Length or buffering past its cap. */
export async function readGitHubResponseText(
  response: Response,
  kind: GitHubResourceKind,
  budget: RuleSyncResourceBudget = createRuleSyncResourceBudget(),
  abortRequest?: () => void,
): Promise<string> {
  const limit = GITHUB_FETCH_LIMITS[`${kind}Bytes`];
  const declaredLength = Number(response.headers.get('content-length'));
  if (Number.isFinite(declaredLength) && declaredLength > limit) {
    cancelGitHubResponseBody(response);
    throw new Error(`GitHub ${kind} response exceeds ${limit} bytes`);
  }
  if (!response.body) return '';

  const reader = response.body.getReader();
  const chunks: Buffer[] = [];
  let bytes = 0;
  while (true) {
    const chunk = await reader.read();
    if (chunk.done) break;
    try {
      reserveGitHubResponseBytes(budget, chunk.value.byteLength);
    } catch (error) {
      abortRequest?.();
      cancelGitHubResponseReader(reader);
      throw error;
    }
    bytes += chunk.value.byteLength;
    if (bytes > limit) {
      abortRequest?.();
      cancelGitHubResponseReader(reader);
      throw new Error(`GitHub ${kind} response exceeds ${limit} bytes`);
    }
    chunks.push(Buffer.from(chunk.value));
  }
  return Buffer.concat(chunks, bytes).toString('utf-8');
}

function cancelGitHubResponseBody(response: Response): void {
  if (!response.body) return;
  safelyCancelGitHubResponse(() => response.body?.cancel());
}

function cancelGitHubResponseReader(reader: { cancel(): Promise<void> }): void {
  safelyCancelGitHubResponse(() => reader.cancel());
}

function safelyCancelGitHubResponse(cancel: () => unknown): void {
  try {
    Promise.resolve(cancel()).catch(() => {});
  } catch {}
}
