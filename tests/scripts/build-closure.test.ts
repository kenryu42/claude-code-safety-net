import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { chmodSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve, sep } from 'node:path';
import { buildAmpArtifactHeader } from '@/hosts/amp/artifact';
import { buildOpenClawArtifactHeader } from '@/hosts/openclaw/artifact';
import pkg from '../../package.json';
import {
  buildAmpBundle,
  buildOpenClawBundle,
  buildRuntimeBundles,
} from '../../scripts/build-runtime';
import { verifyBuildArtifacts } from '../../scripts/verify-build';

// zod names its error class with a string literal minification cannot rewrite, so the
// marker is present exactly where zod itself was bundled.
const ZOD_MARKER = 'ZodError';
const STATIC_SPECIFIER = /\b(?:from|import)\s*["']([^"']+)["']/g;
const DYNAMIC_SPECIFIER = /\bimport\s*\(\s*["']([^"']+)["']\s*\)/g;

function readSpecifiers(source: string, pattern: RegExp): string[] {
  return [...source.matchAll(pattern)]
    .map((match) => match[1])
    .filter((specifier): specifier is string => specifier !== undefined);
}

// The sources reachable from one output without crossing a dynamic import. Minified
// string literals can look like a bare specifier, so only relative ones are followed.
function readStaticClosure(start: string): string[] {
  const visited = new Set<string>();
  const pending = [start];
  while (pending.length > 0) {
    const path = pending.shift();
    if (path === undefined || visited.has(path)) continue;
    visited.add(path);
    pending.push(
      ...readSpecifiers(readFileSync(path, 'utf8'), STATIC_SPECIFIER)
        .filter((specifier) => specifier.startsWith('.'))
        .map((specifier) => resolve(dirname(path), specifier)),
    );
  }
  return [...visited].map((path) => readFileSync(path, 'utf8'));
}

describe('the build', () => {
  // Named here but created in `beforeAll`, so a run whose tests are all filtered out leaves no
  // directory behind: `afterAll` never fires for a describe that contributed no test.
  const root = join(
    process.env.CC_SAFETY_NET_TEST_TMPDIR ?? tmpdir(),
    `build-closure-${process.pid}`,
  );
  const outdir = join(root, 'dist');
  const bin = join(outdir, 'bin', 'cc-safety-net.js');
  const originalCwd = process.cwd();
  const listOutputs = (pattern: string) =>
    [...new Bun.Glob(pattern).scanSync({ cwd: outdir, onlyFiles: true })]
      .map((path) => path.replaceAll(sep, '/'))
      .sort();

  beforeAll(async () => {
    mkdirSync(outdir, { recursive: true });
    for (const build of [buildRuntimeBundles, buildAmpBundle, buildOpenClawBundle]) {
      expect((await build(outdir)).success).toBeTrue();
    }
    // verifyBuildArtifacts only checks that the two public declarations exist, and no
    // assertion below reads their bytes, so tsc would cost seconds for nothing.
    for (const declaration of ['index.d.ts', 'api.d.ts']) {
      writeFileSync(join(outdir, declaration), 'export {};\n');
    }
    chmodSync(bin, 0o755);
  }, 60_000);

  afterAll(() => {
    process.chdir(originalCwd);
    rmSync(root, { recursive: true, force: true });
  });

  test('emits exactly the pinned published paths', () => {
    // A wrong Bun root or a missed move-back leaves bin.js and pi.js at the outdir root,
    // and a stale allowlist would let dist/entries/*.d.ts survive.
    expect(listOutputs('**/*').filter((path) => !path.startsWith('chunks/'))).toEqual([
      'amp/cc-safety-net/index.ts',
      'api.d.ts',
      'api.js',
      'bin/cc-safety-net.js',
      'index.d.ts',
      'index.js',
      'openclaw/cc-safety-net/index.js',
      'openclaw/cc-safety-net/openclaw.plugin.json',
      'openclaw/cc-safety-net/package.json',
      'pi/index.js',
    ]);
    expect(listOutputs('chunks/*.js').length).toBeGreaterThan(0);
  });

  test('starts the bin with the Node shebang', () => {
    // npm links the bin as an executable, so the interpreter line is what runs it.
    expect(readFileSync(bin, 'utf8').startsWith('#!/usr/bin/env node\n')).toBeTrue();
  });

  test('reaches zod only through the CLI chunk the bin imports dynamically', () => {
    // A static import of the CLI or of the policy schema from the bin puts zod on the
    // hook path; a build that stopped bundling zod would leave the CLI chunk without it.
    const dynamic = readSpecifiers(readFileSync(bin, 'utf8'), DYNAMIC_SPECIFIER);

    expect(readStaticClosure(bin).some((source) => source.includes(ZOD_MARKER))).toBeFalse();
    expect(dynamic).toEqual([expect.stringMatching(/^\.\.\/chunks\/[A-Za-z0-9_-]+\.js$/)]);
    expect(
      dynamic
        .flatMap((specifier) => readStaticClosure(resolve(dirname(bin), specifier)))
        .some((source) => source.includes(ZOD_MARKER)),
    ).toBeTrue();
  });

  test('replaces the version define and keeps the internal sync field out', () => {
    // Without the define the published CLI reports `__PKG_VERSION__` as its version, and
    // the rule synchronization field must never reach a published bundle.
    const sources = listOutputs('**/*.{js,ts}').map(
      (path) => [path, readFileSync(join(outdir, path), 'utf8')] as const,
    );

    expect(
      sources.filter(([, source]) => source.includes('__PKG_VERSION__')).map(([path]) => path),
    ).toEqual([]);
    expect(
      sources.filter(([, source]) => source.includes('_operation')).map(([path]) => path),
    ).toEqual([]);
    expect(
      readStaticClosure(bin).some((source) => source.includes(JSON.stringify(pkg.version))),
    ).toBeTrue();
  });

  test('stamps both plugin artifacts with their managed header', () => {
    // The installers and doctor identify a managed plugin by this exact first line.
    expect(
      readFileSync(join(outdir, 'amp', 'cc-safety-net', 'index.ts'), 'utf8').startsWith(
        buildAmpArtifactHeader(pkg.version),
      ),
    ).toBeTrue();
    expect(
      readFileSync(join(outdir, 'openclaw', 'cc-safety-net', 'index.js'), 'utf8').startsWith(
        buildOpenClawArtifactHeader(pkg.version),
      ),
    ).toBeTrue();
  });

  test('passes build verification', async () => {
    // verifyBuildArtifacts reports paths relative to the working directory, so the
    // outdir has to be verified from the root that holds it.
    process.chdir(root);

    expect(await verifyBuildArtifacts()).toContain('dist/bin/cc-safety-net.js');
  });
});
