import { mkdirSync } from 'node:fs';
import { dirname, join, posix } from 'node:path';
import type { BunPlugin } from 'bun';
import pkg from '../package.json';
import { AMP_PLUGIN_ENTRY, buildAmpArtifactHeader } from '../src/hosts/amp/artifact';
import {
  buildOpenClawArtifactHeader,
  buildOpenClawPluginManifests,
  OPENCLAW_PLUGIN_ENTRY_FILE,
  OPENCLAW_PLUGIN_ID,
} from '../src/hosts/openclaw/artifact';
import { guiAssetsPlugin } from './gui-assets';

// zod modules the bundled copy replaces with a stub. Every one of them is
// reachable only through an entry point the guard runtime never calls, and each
// costs the CLI chunk that carries zod real bytes:
//   - locales/index.js is the `z.locales` barrel over ~40 translations. zod
//     imports `en` directly and installs it as the default error map, so a
//     translation is reachable only through `z.config(z.locales.xx())`.
//   - the JSON Schema converters back `z.toJSONSchema`, `z.fromJSONSchema`, and
//     the per-schema `.toJSONSchema()` method. Only scripts/build-schema.ts
//     converts schemas, and it imports zod from node_modules, not from a bundle.
// A stub that drops a name zod still imports by name fails the build, so a zod
// upgrade cannot silently turn one of these into dead weight or a bad reference.
const UNSUPPORTED_ZOD_EXPORT = 'JSON Schema conversion is not bundled into this plugin artifact';
const ZOD_MODULE_STUBS: readonly [RegExp, string][] = [
  [/zod[\\/]v4[\\/]locales[\\/]index\.js$/, 'export {};'],
  [
    /zod[\\/]v4[\\/]classic[\\/]from-json-schema\.js$/,
    `export const fromJSONSchema = () => { throw new Error(${JSON.stringify(UNSUPPORTED_ZOD_EXPORT)}); };`,
  ],
  [
    /zod[\\/]v4[\\/]core[\\/]to-json-schema\.js$/,
    `const unsupported = () => { throw new Error(${JSON.stringify(UNSUPPORTED_ZOD_EXPORT)}); };
     export const createToJSONSchemaMethod = () => unsupported;
     export const createStandardJSONSchemaMethod = () => unsupported;
     export const initializeContext = unsupported;
     export const process = unsupported;
     export const extractDefs = unsupported;
     export const finalize = unsupported;`,
  ],
];

// Bun.build normally resolves the tsconfig `@/*` alias itself, but inside `bun test`
// that implicit mapping is racy on Bun 1.4.0: the e2e-live beforeAll intermittently
// failed with `Could not resolve: "@/rules/constants"` (~1 in 3 under load) while the
// same build always succeeds in a standalone process. Resolving the alias explicitly
// removes the only environmental dependency that can produce that error.
const aliasPlugin: BunPlugin = {
  name: 'alias',
  setup(build) {
    build.onResolve({ filter: /^@\// }, (args) => ({
      path: Bun.resolveSync(args.path.replace(/^@\//, './src/'), join(import.meta.dir, '..')),
    }));
  },
};

const zodModuleStubs: BunPlugin = {
  name: 'zod-module-stubs',
  setup(build) {
    for (const [filter, contents] of ZOD_MODULE_STUBS) {
      build.onLoad({ filter }, () => ({ contents, loader: 'js' }));
    }
  },
};

// Shared chunks are always emitted at `<outdir>/chunks/`, so a moved entry imports them
// through the path from its new directory to that one.
const chunkSpecifier = (path: string) => {
  const specifier = posix.relative(posix.dirname(path), 'chunks');
  return `${specifier.startsWith('.') ? specifier : `./${specifier}`}/`;
};

export async function buildRuntimeBundles(outdir: string) {
  const result = await Bun.build({
    entrypoints: [
      'src/entries/index.ts',
      'src/entries/api.ts',
      'src/entries/bin.ts',
      'src/entries/pi.ts',
    ],
    outdir,
    target: 'node',
    splitting: true,
    naming: {
      entry: '[dir]/[name].[ext]',
      chunk: 'chunks/[name]-[hash].[ext]',
    },
    minify: true,
    define: {
      __PKG_VERSION__: JSON.stringify(pkg.version),
    },
    plugins: [aliasPlugin, await guiAssetsPlugin(), zodModuleStubs],
  });
  if (!result.success) return result;
  // Bun names a split entry after its path below the entries' common root, so
  // the CLI and Pi entries land at the outdir root as bin.js and pi.js. Their
  // published locations are fixed by package.json `bin`, package.json
  // `pi.extensions`, and hooks/hooks.json, so both are moved back. A move that changes an entry's
  // depth invalidates its relative shared-chunk specifiers; the rewrite is
  // anchored on the opening quote so `./chunks/` never matches inside
  // `../chunks/`, and it is a no-op for an entry that keeps its depth.
  const moves = [
    ['bin.js', 'bin/cc-safety-net.js'],
    ['pi.js', 'pi/index.js'],
  ] as const;
  await Promise.all(
    moves.map(async ([from, to]) => {
      const emitted = Bun.file(join(outdir, from));
      await Bun.write(
        join(outdir, to),
        (await emitted.text()).replaceAll(`"${chunkSpecifier(from)}`, `"${chunkSpecifier(to)}`),
      );
      await emitted.delete();
    }),
  );
  // Bun hoists the code the bin shares with the CLI it imports dynamically into the bin entry
  // itself, so the emitted chunk imports those symbols back from `../bin.js`; a move that
  // renames an entry leaves those references dangling and the published bin fails to load.
  await Promise.all(
    result.outputs
      .filter((output) => output.kind === 'chunk')
      .map(async (output) => {
        const source = await Bun.file(output.path).text();
        await Bun.write(
          output.path,
          moves.reduce(
            (current, [from, to]) => current.replaceAll(`"../${from}"`, `"../${to}"`),
            source,
          ),
        );
      }),
  );
  return result;
}

/**
 * Build the standalone Amp plugin artifact separately from the split Node bundles. The
 * `cc-safety-net/index.ts` directory layout is significant: Amp materializes global directory
 * plugins as a plugin tree, whereas a root file is base64-encoded into one process environment
 * entry and exceeds Linux's per-entry limit. Every runtime dependency remains bundled so the
 * directory still contains one self-contained file.
 */
export async function buildAmpBundle(outdir: string) {
  const result = await Bun.build({
    entrypoints: ['src/entries/amp.ts'],
    target: 'bun',
    splitting: false,
    minify: true,
    define: {
      __PKG_VERSION__: JSON.stringify(pkg.version),
    },
    plugins: [aliasPlugin, zodModuleStubs],
  });
  if (!result.success) return result;
  const artifact = result.outputs[0];
  if (!artifact) throw new Error('Amp bundle produced no output');
  const destination = join(outdir, 'amp', AMP_PLUGIN_ENTRY);
  mkdirSync(dirname(destination), { recursive: true });
  await Bun.write(destination, buildAmpArtifactHeader(pkg.version) + (await artifact.text()));
  return result;
}

/**
 * Build the complete OpenClaw plugin directory: the bundled runtime entry plus the manifest
 * and package metadata OpenClaw reads before it loads plugin code. Everything is inlined so a
 * local directory install, which gets no node_modules, still resolves at runtime.
 */
export async function buildOpenClawBundle(outdir: string) {
  const result = await Bun.build({
    entrypoints: ['src/entries/openclaw.ts'],
    target: 'node',
    splitting: false,
    minify: true,
    define: {
      __PKG_VERSION__: JSON.stringify(pkg.version),
    },
    plugins: [aliasPlugin, zodModuleStubs],
  });
  if (!result.success) return result;
  const artifact = result.outputs[0];
  if (!artifact) throw new Error('OpenClaw bundle produced no output');
  const directory = join(outdir, 'openclaw', OPENCLAW_PLUGIN_ID);
  mkdirSync(directory, { recursive: true });
  await Bun.write(
    join(directory, OPENCLAW_PLUGIN_ENTRY_FILE),
    buildOpenClawArtifactHeader(pkg.version) + (await artifact.text()),
  );
  await Promise.all(
    buildOpenClawPluginManifests(pkg.version).map((file) =>
      Bun.write(join(directory, file.name), file.content),
    ),
  );
  return result;
}
