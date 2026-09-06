import type { ServerResponse } from 'node:http';
import { startLoopbackServer } from './loopback-server';

/**
 * The GitHub the rulebook manager is allowed to see: a scripted repository catalogue served over
 * loopback, plus the faults a real host can produce (a redirect, a server error, a body that
 * overruns its cap or never ends, a response held open). Every row points the manager at the same
 * origin through `resolveUrl`, so no test needs the network and every run answers to the same
 * bytes.
 */

export type ScriptedRepository = {
  owner: string;
  repo: string;
  defaultBranch: string;
  /** Ref name to the commit sha it points at. */
  refs: Record<string, string>;
  /** Commit sha to the rulebook bodies that commit publishes, keyed by rulebook name. */
  trees: Record<string, Record<string, string>>;
};

export type Fault =
  | {
      kind: 'response';
      status?: number;
      headers?: Record<string, string>;
      body?: string | Buffer;
      /** Byte offsets to split the body at, so a multibyte sequence can straddle two writes. */
      chunkBoundaries?: number[];
      /** Write the body and never end the message, so only the caller's timeout stops it. */
      endless?: boolean;
    }
  | { kind: 'defer' };

export type FakeGitHub = {
  origin: string;
  /** Point a real GitHub URL at this server; the only seam a fetch row needs. */
  resolveUrl(url: string): string;
  /** `${method} ${pathname}${search}` in arrival order. */
  requests: string[];
  /** Replaces the scripted answer for one pathname. */
  faults: Map<string, Fault>;
  /** Answer every request parked by a `defer` fault. */
  release(): void;
  /** The largest number of requests that were open at the same time. */
  maxInFlight(): number;
  reset(): void;
  /** Mutable, so a row can move a ref to a new sha or replace a body between two operations. */
  repositories: ScriptedRepository[];
  close(): Promise<void>;
};

const RULES_PATH = '.cc-safety-net/rules';
const API_REPOSITORY_RE = /^\/api\/repos\/([^/]+)\/([^/]+)$/;
const API_COMMIT_RE = /^\/api\/repos\/([^/]+)\/([^/]+)\/commits\/(.+)$/;
const API_TREE_RE = /^\/api\/repos\/([^/]+)\/([^/]+)\/git\/trees\/([^/]+)$/;
const RAW_RE = new RegExp(`^/raw/([^/]+)/([^/]+)/([^/]+)/${RULES_PATH}/([^/]+)/rulebook\\.json$`);
const MAX_WRITE_BYTES = 64 * 1024;
const NOT_FOUND = { status: 404, body: JSON.stringify({ message: 'Not Found' }) };

export async function startFakeGitHub(repositories: ScriptedRepository[]): Promise<FakeGitHub> {
  const requests: string[] = [];
  const faults = new Map<string, Fault>();
  const parked: (() => void)[] = [];
  let inFlight = 0;
  let peak = 0;

  const server = await startLoopbackServer((request, response) => {
    const url = new URL(request.url ?? '/', 'http://127.0.0.1');
    requests.push(`${request.method} ${url.pathname}${url.search}`);
    inFlight += 1;
    peak = Math.max(peak, inFlight);
    response.once('close', () => {
      inFlight -= 1;
    });
    const fault = faults.get(url.pathname);
    if (fault?.kind === 'defer') {
      parked.push(() => sendScripted(repositories, url.pathname, response));
      return;
    }
    if (fault) {
      void sendFault(response, fault);
      return;
    }
    sendScripted(repositories, url.pathname, response);
  });

  return {
    origin: server.origin,
    resolveUrl: (url) =>
      url
        .replace('https://api.github.com', `${server.origin}/api`)
        .replace('https://raw.githubusercontent.com', `${server.origin}/raw`),
    requests,
    faults,
    release: () => {
      for (const send of parked.splice(0)) send();
    },
    maxInFlight: () => peak,
    reset: () => {
      requests.length = 0;
      faults.clear();
      peak = 0;
    },
    repositories,
    close: server.close,
  };
}

function sendScripted(
  repositories: readonly ScriptedRepository[],
  pathname: string,
  response: ServerResponse,
): void {
  const answer = scriptedAnswer(repositories, pathname);
  response.writeHead(answer.status, { 'content-type': 'application/json' });
  response.end(answer.body);
}

function scriptedAnswer(repositories: readonly ScriptedRepository[], pathname: string) {
  const metadata = pathname.match(API_REPOSITORY_RE);
  if (metadata) {
    const repository = findRepository(repositories, metadata[1], metadata[2]);
    return repository ? ok({ default_branch: repository.defaultBranch }) : NOT_FOUND;
  }
  const commit = pathname.match(API_COMMIT_RE);
  if (commit) {
    const sha = findRepository(repositories, commit[1], commit[2])?.refs[
      decodeURIComponent(commit[3] ?? '')
    ];
    return sha ? ok({ sha }) : NOT_FOUND;
  }
  const tree = pathname.match(API_TREE_RE);
  if (tree) {
    const files = findRepository(repositories, tree[1], tree[2])?.trees[tree[3] ?? ''];
    return files ? ok(treeListing(Object.keys(files))) : NOT_FOUND;
  }
  const raw = pathname.match(RAW_RE);
  if (raw) {
    const body = findRepository(repositories, raw[1], raw[2])?.trees[raw[3] ?? '']?.[raw[4] ?? ''];
    return body === undefined ? NOT_FOUND : { status: 200, body };
  }
  return NOT_FOUND;
}

/** A blob per rulebook, one directory entry and one blob outside the rules path, so a listing
 *  that stops filtering by type or by path shows up as an extra discovered name. */
function treeListing(names: readonly string[]) {
  return {
    tree: [
      { path: RULES_PATH, type: 'tree' },
      { path: 'README.md', type: 'blob' },
      ...names.map((name) => ({ path: `${RULES_PATH}/${name}/rulebook.json`, type: 'blob' })),
    ],
  };
}

function findRepository(
  repositories: readonly ScriptedRepository[],
  owner: string | undefined,
  repo: string | undefined,
) {
  return repositories.find((entry) => entry.owner === owner && entry.repo === repo);
}

function ok(value: unknown) {
  return { status: 200, body: JSON.stringify(value) };
}

async function sendFault(
  response: ServerResponse,
  fault: Extract<Fault, { kind: 'response' }>,
): Promise<void> {
  response.writeHead(fault.status ?? 200, fault.headers ?? {});
  for (const chunk of bodyChunks(fault.body ?? '', fault.chunkBoundaries)) {
    if (response.destroyed) return;
    if (!response.write(chunk)) await drained(response);
  }
  if (fault.endless || response.destroyed) return;
  response.end();
}

/** The body split at the requested boundaries, then into writes of at most 64 KiB. */
function bodyChunks(body: string | Buffer, boundaries: readonly number[] = []): Buffer[] {
  const buffer = Buffer.isBuffer(body) ? body : Buffer.from(body);
  const cuts = [...new Set([...boundaries, buffer.byteLength])]
    .filter((cut) => cut > 0 && cut <= buffer.byteLength)
    .sort((left, right) => left - right);
  return cuts.flatMap((cut, index) => {
    const start = index === 0 ? 0 : (cuts[index - 1] ?? 0);
    return Array.from({ length: Math.ceil((cut - start) / MAX_WRITE_BYTES) }, (_unused, piece) =>
      buffer.subarray(
        start + piece * MAX_WRITE_BYTES,
        Math.min(start + (piece + 1) * MAX_WRITE_BYTES, cut),
      ),
    );
  });
}

/** Resolves when the socket drains, or when the client gave up on the response. */
function drained(response: ServerResponse): Promise<void> {
  return new Promise((resolve) => {
    const settle = () => {
      response.off('drain', settle);
      response.off('close', settle);
      resolve();
    };
    response.once('drain', settle);
    response.once('close', settle);
  });
}
