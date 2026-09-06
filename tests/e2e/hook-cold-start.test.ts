import { afterAll, beforeAll, expect, test } from 'bun:test';
import { spawnSync } from 'node:child_process';
import { mkdirSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { buildRuntimeBundles } from '../../scripts/build-runtime';
import { createTempRoot, isolatedSpawnEnv, removeTempRoots } from '../helpers/temp-home';

/**
 * The two halves of the Phase 11 hook budget, measured over the runtime bundle a published install
 * actually ships. The static half is deterministic: the bytes Node has to read and parse
 * before the hook can answer, which is the bin plus every chunk it reaches without crossing its one
 * dynamic import. The dynamic half is measured: seven runs of the built hook against seven runs of
 * `node -e 0`, interleaved so a machine that slows down mid-file slows both, compared as medians so
 * one descheduled run cannot decide the budget.
 *
 * The two halves are not equally sharp. The byte cap is the falsifiable one: it fails the moment a
 * chunk joins the hook's static closure. The 150 ms allowance is a coarse ceiling sized to absorb a
 * slow runner — it catches a hook that hangs, waits on the network or loads a heavy dependency, not
 * a change that doubles a cold start already measured in tens of milliseconds. Read it as a
 * ceiling, not as a guard against a regression of any particular size.
 */

const NODE = Bun.which('node');
// The published bins run under Node, so the budget is Node's start plus the hook, not bun's.
if (NODE === null) throw new Error('Node.js is required to measure the hook cold start');

// Named here but created in `beforeAll`, so a run whose tests are all filtered out leaves no
// directory behind: `afterAll` never fires for a file that contributed no test.
const outdir = join(
  process.env.CC_SAFETY_NET_TEST_TMPDIR ?? tmpdir(),
  `hook-cold-start-${process.pid}`,
);
const bin = join(outdir, 'bin', 'cc-safety-net.js');

beforeAll(async () => {
  mkdirSync(outdir, { recursive: true });
  expect((await buildRuntimeBundles(outdir)).success).toBeTrue();
}, 120_000);

afterAll(() => {
  rmSync(outdir, { recursive: true, force: true });
  removeTempRoots();
});

const STATIC_SPECIFIER = /\b(?:from|import)\s*["']([^"']+)["']/g;

// The quote has to follow `from` or `import` directly, so `import(` never matches and the walk
// never crosses the bin's one dynamic import into the CLI chunk. Only relative specifiers are
// followed: a minified string literal can look like a bare one.
function staticClosure(path: string, seen = new Set<string>()): string[] {
  if (seen.has(path)) return [];
  seen.add(path);
  return [
    path,
    ...[...readFileSync(path, 'utf8').matchAll(STATIC_SPECIFIER)]
      .map((match) => match[1] ?? '')
      .filter((specifier) => specifier.startsWith('.'))
      .flatMap((specifier) => staticClosure(resolve(dirname(path), specifier), seen)),
  ];
}

test('the hook closure stays under 400,000 bytes', () => {
  const files = staticClosure(bin);
  const bytes = files.reduce((total, file) => total + Buffer.byteLength(readFileSync(file)), 0);
  console.log(`hook closure: ${bytes} bytes over ${files.length} files`);

  // A walk that resolved no chunk at all would pass the byte budget on the 7 KB bin alone.
  expect(files.length).toBeGreaterThan(1);
  expect(bytes).toBeLessThanOrEqual(400_000);
});

test('the hook cold start stays within 150 ms of node itself', () => {
  const root = createTempRoot('hook-cold-start-');
  const home = join(root, 'home');
  const project = join(root, 'project');
  // PATH holds one empty directory, so a probe that reaches for another CLI fails with ENOENT
  // rather than paying for whatever happens to sit beside `node` on this machine.
  const emptyBin = join(root, 'bin');
  for (const directory of [home, project, emptyBin]) mkdirSync(directory, { recursive: true });
  const env = isolatedSpawnEnv(home, { PATH: emptyBin, TZ: 'UTC' });
  // The command string is analyzer input: node runs nothing but the built bin.
  const payload = JSON.stringify({
    hook_event_name: 'PreToolUse',
    session_id: 'cold-start',
    transcript_path: join(home, 'transcript.jsonl'),
    cwd: project,
    tool_name: 'Bash',
    tool_input: { command: 'ls' },
  });
  const run = (args: string[], input: string) =>
    spawnSync(NODE, args, { cwd: project, input, env, encoding: 'utf-8' });

  // Untimed, so the first run's page faults land outside the samples, and asserted, so a hook that
  // crashed on startup could not be timed as a fast one: an allowed command prints nothing.
  const proof = run([bin, 'hook', '--claude-code'], payload);
  expect({ status: proof.status, stdout: proof.stdout }).toStrictEqual({ status: 0, stdout: '' });

  const elapsed = (args: string[], input: string) => {
    const started = performance.now();
    expect(run(args, input).status).toBe(0);
    return performance.now() - started;
  };
  const samples = Array.from({ length: 7 }, () => ({
    node: elapsed(['-e', '0'], ''),
    hook: elapsed([bin, 'hook', '--claude-code'], payload),
  }));
  const median = (values: number[]) => [...values].sort((a, b) => a - b)[3] ?? Number.NaN;
  const nodeMedian = median(samples.map((sample) => sample.node));
  const hookMedian = median(samples.map((sample) => sample.hook));
  console.log(
    `cold start medians: node ${nodeMedian.toFixed(1)} ms, hook ${hookMedian.toFixed(1)} ms`,
  );

  expect(hookMedian).toBeLessThanOrEqual(nodeMedian + 150);
}, 60_000);
