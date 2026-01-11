#!/usr/bin/env bun

import { $ } from 'bun';
import { formatReleaseNotes, generateChangelog, getContributors } from './generate-changelog';

const PACKAGE_NAME = 'cc-safety-net';

const bump = process.env.BUMP as 'major' | 'minor' | 'patch' | undefined;
const versionOverride = process.env.VERSION;

console.log('=== Publishing cc-safety-net ===\n');

async function fetchPreviousVersion(): Promise<string> {
  try {
    const res = await fetch(`https://registry.npmjs.org/${PACKAGE_NAME}/latest`);
    if (!res.ok) throw new Error(`Failed to fetch: ${res.statusText}`);
    const data = (await res.json()) as { version: string };
    console.log(`Previous version: ${data.version}`);
    return data.version;
  } catch {
    console.log('No previous version found, starting from 0.0.0');
    return '0.0.0';
  }
}

function bumpVersion(version: string, type: 'major' | 'minor' | 'patch'): string {
  const parts = version.split('.').map((part) => Number(part));
  const major = parts[0] ?? 0;
  const minor = parts[1] ?? 0;
  const patch = parts[2] ?? 0;
  switch (type) {
    case 'major':
      return `${major + 1}.0.0`;
    case 'minor':
      return `${major}.${minor + 1}.0`;
    case 'patch':
      return `${major}.${minor}.${patch + 1}`;
  }
}

async function updatePackageVersion(newVersion: string): Promise<void> {
  const pkgPath = new URL('../package.json', import.meta.url).pathname;
  let pkg = await Bun.file(pkgPath).text();
  pkg = pkg.replace(/"version": "[^"]+"/, `"version": "${newVersion}"`);
  await Bun.write(pkgPath, pkg);
  console.log(`Updated: ${pkgPath}`);
}

async function updatePluginVersion(newVersion: string): Promise<void> {
  const pluginPath = new URL('../.claude-plugin/plugin.json', import.meta.url).pathname;
  let plugin = await Bun.file(pluginPath).text();
  plugin = plugin.replace(/"version": "[^"]+"/, `"version": "${newVersion}"`);
  await Bun.write(pluginPath, plugin);
  console.log(`Updated: ${pluginPath}`);
}

async function updateBinVersion(newVersion: string): Promise<void> {
  const binPath = new URL('../src/bin/cc-safety-net.ts', import.meta.url).pathname;
  let bin = await Bun.file(binPath).text();
  bin = bin.replace(/const VERSION = "[^"]+"/, `const VERSION = "${newVersion}"`);
  await Bun.write(binPath, bin);
  console.log(`Updated: ${binPath}`);
}

async function buildAndPublish(): Promise<void> {
  console.log('\nPublishing to npm...');
  // --ignore-scripts: workflow already built, skip prepublishOnly
  if (process.env.CI) {
    await $`npm publish --access public --provenance --ignore-scripts`;
  } else {
    await $`npm publish --access public --ignore-scripts`;
  }
}

async function gitTagAndRelease(newVersion: string, notes: string[]): Promise<void> {
  if (!process.env.CI) return;

  console.log('\nCommitting and tagging...');
  await $`git config user.email "github-actions[bot]@users.noreply.github.com"`;
  await $`git config user.name "github-actions[bot]"`;
  await $`git add package.json .claude-plugin/plugin.json assets/cc-safety-net.schema.json src/bin/cc-safety-net.ts`;

  const hasStagedChanges = await $`git diff --cached --quiet`.nothrow();
  if (hasStagedChanges.exitCode !== 0) {
    await $`git commit -m "release: v${newVersion}"`;
  } else {
    console.log('No changes to commit (version already updated)');
  }

  const tagExists = await $`git rev-parse v${newVersion}`.nothrow();
  if (tagExists.exitCode !== 0) {
    await $`git tag v${newVersion}`;
  } else {
    console.log(`Tag v${newVersion} already exists`);
  }

  await $`git push origin HEAD --tags`;

  console.log('\nCreating GitHub release...');
  const releaseNotes = notes.length > 0 ? notes.join('\n') : 'No notable changes';
  const releaseExists = await $`gh release view v${newVersion}`.nothrow();
  if (releaseExists.exitCode !== 0) {
    await $`gh release create v${newVersion} --title "v${newVersion}" --notes ${releaseNotes}`;
  } else {
    console.log(`Release v${newVersion} already exists`);
  }
}

async function checkVersionExists(version: string): Promise<boolean> {
  try {
    const res = await fetch(`https://registry.npmjs.org/${PACKAGE_NAME}/${version}`);
    return res.ok;
  } catch {
    return false;
  }
}

async function main(): Promise<void> {
  const previous = await fetchPreviousVersion();
  const newVersion =
    versionOverride || (bump ? bumpVersion(previous, bump) : bumpVersion(previous, 'patch'));
  console.log(`New version: ${newVersion}\n`);

  if (await checkVersionExists(newVersion)) {
    console.log(`Version ${newVersion} already exists on npm. Skipping publish.`);
    process.exit(0);
  }

  await updatePackageVersion(newVersion);
  await updatePluginVersion(newVersion);
  await updateBinVersion(newVersion);
  const changelog = await generateChangelog(`v${previous}`);
  const contributors = await getContributors(`v${previous}`);
  const notes = formatReleaseNotes(changelog, contributors);

  await buildAndPublish();
  await gitTagAndRelease(newVersion, notes);

  console.log(`\n=== Successfully published ${PACKAGE_NAME}@${newVersion} ===`);
}

main();
