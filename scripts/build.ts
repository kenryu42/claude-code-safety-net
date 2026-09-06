#!/usr/bin/env bun
/**
 * Build script that injects __PKG_VERSION__ at compile time
 * to avoid embedding the full package.json in the bundle.
 */

import { renameSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { AMP_PLUGIN_ENTRY } from '../src/hosts/amp/artifact';
import { getBundledOutputs, isPublicDeclarationOutput } from './build-output';
import { buildAmpBundle, buildOpenClawBundle, buildRuntimeBundles } from './build-runtime';
import { generateThirdPartyLicenses } from './generate-third-party-licenses';
import { formatSubprocessFailure } from './subprocess-output';
import { verifyBuildArtifacts } from './verify-build';

generateThirdPartyLicenses();
const result = await buildRuntimeBundles('dist');

if (!result.success) {
  console.error('Build failed:');
  for (const log of result.logs) {
    console.error(log);
  }
  process.exit(1);
}

const ampResult = await buildAmpBundle('dist');
if (!ampResult.success) {
  console.error('Amp bundle failed:');
  for (const log of ampResult.logs) {
    console.error(log);
  }
  process.exit(1);
}

const openClawResult = await buildOpenClawBundle('dist');
if (!openClawResult.success) {
  console.error('OpenClaw bundle failed:');
  for (const log of openClawResult.logs) {
    console.error(log);
  }
  process.exit(1);
}

// Run build:types and build:schema
const typesResult = Bun.spawnSync(['bun', 'run', 'build:types']);
if (typesResult.exitCode !== 0) {
  console.error(formatSubprocessFailure('build:types', typesResult));
  process.exit(1);
}

for await (const path of new Bun.Glob('dist/**/*.d.ts').scan('.')) {
  if (!isPublicDeclarationOutput(path)) await Bun.file(path).delete();
}
// tsc names a declaration after its source directory relative to rootDir, so an entry that
// lives in a subdirectory is emitted into one; the package exposes both at the outdir root.
for (const name of ['index', 'api']) {
  renameSync(join('dist', 'entries', `${name}.d.ts`), join('dist', `${name}.d.ts`));
}

const schemaResult = Bun.spawnSync(['bun', 'run', 'build:schema']);
if (schemaResult.exitCode !== 0) {
  console.error(formatSubprocessFailure('build:schema', schemaResult));
  process.exit(1);
}

await Bun.$`chmod 755 dist/bin/cc-safety-net.js`;
await verifyBuildArtifacts();
const { indexOutput, binOutput, piOutput } = getBundledOutputs(result.outputs);
if (!indexOutput || !binOutput || !piOutput) {
  console.error('Build verification failed: expected bundled outputs not found');
  process.exit(1);
}
console.log(
  `  dist/index.js              ${(statSync('dist/index.js').size / 1024).toFixed(2)} KB`,
);
console.log(
  `  dist/bin/cc-safety-net.js  ${(statSync('dist/bin/cc-safety-net.js').size / 1024).toFixed(2)} KB`,
);
console.log(
  `  dist/pi/index.js           ${(statSync('dist/pi/index.js').size / 1024).toFixed(2)} KB`,
);
console.log(
  `  dist/amp/${AMP_PLUGIN_ENTRY}  ${(statSync(`dist/amp/${AMP_PLUGIN_ENTRY}`).size / 1024).toFixed(2)} KB`,
);
console.log(
  `  dist/openclaw/cc-safety-net/index.js  ${(statSync('dist/openclaw/cc-safety-net/index.js').size / 1024).toFixed(2)} KB`,
);
console.log('  ✓ Build verification passed');
