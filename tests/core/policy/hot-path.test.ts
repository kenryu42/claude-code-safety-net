import { describe, expect, test } from 'bun:test';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';

/**
 * Design section 8 takes the schema validator off the hook's path: the loader reports the
 * sections it dropped and the schema library is loaded only by diagnostic surfaces. The
 * architecture test forbids the import textually; these two check the whole graph, and then
 * check the running process, so an indirect path or a lazy require cannot slip through.
 */

const NEXT = join(import.meta.dir, '..', '..', '..', 'src');
const SNAPSHOT = join(NEXT, 'core', 'policy', 'snapshot.ts');
const SCHEMA = join(NEXT, 'core', 'policy', 'schema.ts');
const PROBE = join(import.meta.dir, 'hot-path-probe.ts');

// `createRequire` is how the schema module reaches its validator, so the walk
// counts a required package as an edge too: a lazy require inside a function body never
// shows up as an import and the probe below never executes one.
const SPECIFIER =
  /from\s*['"]([^'"]+)['"]|import\s*\(\s*['"]([^'"]+)['"]\s*\)|\w*[rR]equire\s*\((?:[^()'"]*\)\s*\()?\s*['"]([^'"]+)['"]\s*\)/g;

function specifiersOf(file: string): string[] {
  return [...readFileSync(file, 'utf-8').matchAll(SPECIFIER)].flatMap((found) => {
    const specifier = found[1] ?? found[2] ?? found[3];
    return specifier === undefined ? [] : [specifier];
  });
}

function moduleFileFor(specifier: string, importer: string): string | null {
  if (specifier.startsWith('node:') || specifier === 'bun') return null;
  const base = specifier.startsWith('@/')
    ? join(NEXT, specifier.slice('@/'.length))
    : specifier.startsWith('.')
      ? join(dirname(importer), specifier)
      : null;
  if (base === null) return null;
  return [base, `${base}.ts`, join(base, 'index.ts')].find((candidate) => existsSync(candidate)) as
    | string
    | null;
}

/** Every module the entry reaches statically, with the bare specifiers each one names. */
function importGraph(entry: string) {
  const files = new Set<string>();
  const bare = new Set<string>();
  const queue = [entry];
  while (queue.length > 0) {
    const file = queue.shift() as string;
    if (files.has(file)) continue;
    files.add(file);
    for (const specifier of specifiersOf(file)) {
      const resolved = moduleFileFor(specifier, file);
      if (resolved === null) bare.add(specifier);
      if (resolved !== null && !files.has(resolved)) queue.push(resolved);
    }
  }
  return { files, bare };
}

describe('the policy snapshot never pulls the schema library onto the hook path', () => {
  const graph = importGraph(SNAPSHOT);

  test('the entry reaches the loader it is supposed to reach', () => {
    const reached = [...graph.files].map((file) => relative(NEXT, file)).sort();
    expect(reached).toContain('core/policy/store.ts');
    expect(reached).toContain('core/policy/validate.ts');
    expect(reached).toContain('core/policy/scope-policy.ts');
  });

  test('no statically reachable module is the schema validator or the schema library', () => {
    expect([...graph.files].filter((file) => file === SCHEMA)).toEqual([]);
    expect([...graph.bare].filter((specifier) => specifier === 'zod')).toEqual([]);
  });

  test('loading the snapshot in a fresh process loads no module of the schema library', () => {
    const probe = Bun.spawnSync([process.execPath, PROBE, SNAPSHOT, SCHEMA], { env: process.env });
    expect(probe.exitCode === 0 ? '' : probe.stderr.toString()).toBe('');
    const counts = probe.stdout.toString().trim().split('\n').map(Number);
    expect(counts[0]).toBe(0);
    expect(counts[1]).toBeGreaterThan(0);
  });
});
