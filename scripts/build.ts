#!/usr/bin/env bun
/**
 * Build script that injects __PKG_VERSION__ at compile time
 * to avoid embedding the full package.json in the bundle.
 */

import pkg from '../package.json';

const result = await Bun.build({
  entrypoints: ['src/index.ts', 'src/bin/cc-safety-net.ts'],
  outdir: 'dist',
  target: 'node',
  define: {
    __PKG_VERSION__: JSON.stringify(pkg.version),
  },
});

if (!result.success) {
  console.error('Build failed:');
  for (const log of result.logs) {
    console.error(log);
  }
  process.exit(1);
}

const indexOutput = result.outputs.find((o) => o.path.endsWith('index.js'));
const binOutput = result.outputs.find((o) => o.path.endsWith('cc-safety-net.js'));
if (indexOutput) {
  console.log(`  dist/index.js              ${(indexOutput.size / 1024).toFixed(2)} KB`);
}
if (binOutput) {
  console.log(`  dist/bin/cc-safety-net.js  ${(binOutput.size / 1024).toFixed(2)} KB`);
}

// Run build:types and build:schema
const typesResult = Bun.spawnSync(['bun', 'run', 'build:types']);
if (typesResult.exitCode !== 0) {
  console.error('build:types failed');
  process.exit(1);
}

const schemaResult = Bun.spawnSync(['bun', 'run', 'build:schema']);
if (schemaResult.exitCode !== 0) {
  console.error('build:schema failed');
  process.exit(1);
}
