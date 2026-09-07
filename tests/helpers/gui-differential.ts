import { expect } from 'bun:test';
import { mkdirSync, realpathSync } from 'node:fs';
import { connect } from 'node:net';
import { join } from 'node:path';
import { createPolicyGuiServer as createPortedServer } from '@/gui/index';
import { snapshotTree, type TreeSpec, writeTree } from './fixture-tree';
import { normalizePage } from './gui-page';
import { createTempRoot, environmentFor, isolationEnv, normalize, recordPorted } from './temp-home';

/**
 * One seed, one loopback server, reading its home off an `Environment` built from the seed's
 * values. It answers a request sequence, so a row records the bytes it sent and the files it left
 * behind rather than what it claims.
 */

/**
 * Every variable that would move the effective safety level, the debug output or the audit scope
 * away from what the seed spells, so a developer's shell cannot decide what a preview reports.
 */
const BLANKED_ENV_NAMES = [
  'CC_SAFETY_NET_LEVEL',
  'CC_SAFETY_NET_STRICT',
  'CC_SAFETY_NET_PARANOID',
  'CC_SAFETY_NET_PARANOID_RM',
  'CC_SAFETY_NET_PARANOID_INTERPRETERS',
  'CC_SAFETY_NET_WORKTREE',
  'CC_SAFETY_NET_DEBUG',
  'CC_SAFETY_NET_AUDIT_SCOPE',
  'SAFETY_NET_STRICT',
  'SAFETY_NET_PARANOID',
  'SAFETY_NET_PARANOID_RM',
  'SAFETY_NET_PARANOID_INTERPRETERS',
  'SAFETY_NET_WORKTREE',
  'CLAUDE_SETTINGS_PATH',
];

/** One side's fixture: a temp root holding the home the server reads and the project it serves. */
export type GuiSide = {
  root: string;
  home: string;
  project: string;
  values: Record<string, string | undefined>;
};

/**
 * How a request carries the session token. `header` and `none` withhold the query token every
 * request needs; `wrong-query` and `wrong-header` corrupt one of the two a POST needs.
 */
export type GuiRequest = {
  method?: 'GET' | 'POST';
  path: string;
  token?: 'query' | 'header' | 'both' | 'none' | 'wrong-query' | 'wrong-header';
  body?: unknown;
  /** Sent verbatim, for the bodies no JSON encoder would produce. */
  raw?: string;
  /**
   * Send this request's headers now and its body only once the requests after it have been
   * answered, so its handler sits inside its body await while they run.
   */
  hold?: true;
};

export type GuiResponse = {
  status: number;
  contentType: string | null;
  cacheControl: string | null;
  body: unknown;
};

/** The hooks a row injects, so no request spawns a dialog, `gh`, an installer or a browser. */
export type GuiHookOptions = Omit<
  NonNullable<Parameters<typeof createPortedServer>[1]>,
  'cwd' | 'userConfigDir' | 'userConfigPath' | 'projectConfigPath'
>;

function seedSide(prefix: string, seed: TreeSpec): GuiSide {
  const root = createTempRoot(prefix);
  const home = join(root, 'home');
  mkdirSync(join(root, 'project'), { recursive: true });
  mkdirSync(home, { recursive: true });
  writeTree(root, seed);
  return {
    root,
    home,
    project: join(root, 'project'),
    values: isolationEnv(
      home,
      Object.fromEntries(BLANKED_ENV_NAMES.map((name) => [name, undefined])),
    ),
  };
}

/** Where a request is sent and what token it carries there, for the mode it names. */
function addressed(origin: string, token: string, request: GuiRequest) {
  const mode = request.token ?? (request.method === 'POST' ? 'both' : 'query');
  // The token this session did not mint, built from the one it did so no literal here is
  // token-shaped.
  const wrong = `${token.slice(1)}x`;
  const url = new URL(`${origin}${request.path}`);
  if (mode === 'query' || mode === 'both' || mode === 'wrong-header') {
    url.searchParams.set('token', token);
  }
  if (mode === 'wrong-query') url.searchParams.set('token', wrong);
  return {
    url,
    headerToken:
      mode === 'wrong-header' ? wrong : mode === 'none' || mode === 'query' ? null : token,
  };
}

/** The body as a row compares it: JSON parsed, the page normalized, anything else verbatim. */
const observeBody = (contentType: string | null, text: string, token: string): unknown =>
  contentType?.startsWith('application/json')
    ? (JSON.parse(text) as unknown)
    : contentType?.startsWith('text/html')
      ? normalizePage(text, token)
      : text;

async function send(origin: string, token: string, request: GuiRequest): Promise<GuiResponse> {
  const sent = addressed(origin, token, request);
  const response = await fetch(sent.url, {
    method: request.method ?? 'GET',
    headers: sent.headerToken === null ? {} : { 'x-cc-safety-net-token': sent.headerToken },
    ...(request.raw === undefined && request.body === undefined
      ? {}
      : { body: request.raw ?? JSON.stringify(request.body) }),
  });
  const contentType = response.headers.get('content-type');
  return {
    status: response.status,
    contentType,
    cacheControl: response.headers.get('cache-control'),
    body: observeBody(contentType, await response.text(), token),
  };
}

/**
 * The same request in two pieces: the headers now, the body once `gate` resolves. It goes over a
 * socket rather than `fetch` because `fetch` buffers a body before it dials, so a request sent
 * after one can still reach the server first. This resolves only once the kernel has the headers,
 * so the requests that follow are dialled strictly after this one's handler was handed its head —
 * which is what an interleave inside a single handler needs.
 */
async function openHeld(
  origin: string,
  token: string,
  request: GuiRequest,
  gate: Promise<void>,
): Promise<{ response: Promise<GuiResponse> }> {
  const sent = addressed(origin, token, request);
  const payload = request.raw ?? JSON.stringify(request.body);
  const socket = connect(Number(sent.url.port), sent.url.hostname);
  const chunks: Buffer[] = [];
  const replied = new Promise<string>((resolve) => {
    socket.on('data', (chunk: Buffer) => chunks.push(chunk));
    socket.on('end', () => resolve(Buffer.concat(chunks).toString('utf-8')));
  });
  await new Promise<void>((resolve) => socket.once('connect', () => resolve()));
  await new Promise<void>((resolve) =>
    socket.write(
      [
        `${request.method ?? 'GET'} ${sent.url.pathname}${sent.url.search} HTTP/1.1`,
        `host: ${sent.url.host}`,
        ...(sent.headerToken === null ? [] : [`x-cc-safety-net-token: ${sent.headerToken}`]),
        `content-length: ${Buffer.byteLength(payload)}`,
        'connection: close',
        '',
        '',
      ].join('\r\n'),
      () => resolve(),
    ),
  );
  return {
    response: gate.then(async () => {
      socket.write(payload);
      const reply = await replied;
      socket.destroy();
      const split = reply.indexOf('\r\n\r\n');
      const head = reply.slice(0, split).split('\r\n');
      const headerOf = (name: string) =>
        head
          .find((line) => line.toLowerCase().startsWith(`${name}:`))
          ?.slice(name.length + 1)
          .trim() ?? null;
      const contentType = headerOf('content-type');
      // Some Bun versions answer a held request with a content-length and others with chunked
      // framing, whose sizes are the even lines of the body and whose bytes are the odd ones.
      const framed = reply.slice(split + 4);
      return {
        status: Number(head[0]?.split(' ')[1]),
        contentType,
        cacheControl: headerOf('cache-control'),
        body: observeBody(
          contentType,
          headerOf('transfer-encoding') === 'chunked'
            ? framed
                .split('\r\n')
                .filter((_, index) => index % 2 === 1)
                .join('')
            : framed,
          token,
        ),
      };
    }),
  };
}

async function drive(
  server: { origin: string; token: string },
  requests: readonly GuiRequest[],
): Promise<GuiResponse[]> {
  // Released once every request has been sent: a held one finishes its body after the rest ran.
  const gate = Promise.withResolvers<void>();
  const responses: Promise<GuiResponse>[] = [];
  for (const request of requests) {
    if (request.hold) {
      responses.push((await openHeld(server.origin, server.token, request, gate.promise)).response);
      continue;
    }
    const response = send(server.origin, server.token, request);
    responses.push(response);
    await response;
  }
  gate.resolve();
  return Promise.all(responses);
}

/** Spelled one way: the side's own root, and the path it resolves to, are both `<root>`. */
function observe(side: GuiSide, responses: readonly GuiResponse[]) {
  return normalize({ responses, tree: snapshotTree(side.root) }, [
    [realpathSync(side.root), '<root>'],
    [side.root, '<root>'],
  ]);
}

export async function runGuiRow(row: {
  seed: TreeSpec;
  options?: (side: GuiSide) => GuiHookOptions;
  requests: readonly GuiRequest[];
}) {
  const portedSide = seedSide('gui-ported-', row.seed);

  const portedServer = await createPortedServer(
    environmentFor(portedSide.home, portedSide.values),
    { cwd: portedSide.project, ...row.options?.(portedSide) },
  );
  const portedResponses = await drive(portedServer, row.requests).finally(portedServer.close);

  const ported = observe(portedSide, portedResponses);
  recordPorted(ported);
  // An atomic write that failed halfway leaves its scratch file behind, which no row spells.
  expect(ported.tree.filter((entry) => /\.[0-9a-f]{16}\.tmp$/.test(entry.path))).toStrictEqual([]);
  // The home is handed back unrecorded, for the rows whose contract is a file's mode.
  return { ...ported, home: portedSide.home };
}
