import type { KnipConfig } from 'knip';

const config: KnipConfig = {
  entry: [
    'src/entries/bin.ts!',
    'src/entries/index.ts!',
    'src/entries/api.ts!',
    'src/entries/pi.ts!',
    'src/entries/amp.ts!',
    'src/entries/openclaw.ts!',
    // Built for the browser by src/gui/assets.ts, so no module imports it.
    'src/gui/frontend/main.ts!',
    // scripts invoked directly by package.json scripts or GitHub workflows
    'scripts/build.ts!',
    'scripts/project-bun.ts!',
    'scripts/build-schema.ts!',
    'scripts/prepare-release-files.ts!',
    'scripts/release-assets.ts!',
    'scripts/release-transaction.ts!',
    'scripts/verify-coverage.ts!',
    'scripts/verify-package.ts!',
    'scripts/verify-repository-plugin.ts!',
  ],
  project: ['src/**/*.ts!', 'scripts/**/*.ts!'],
  // Workflow-invoked scripts are declared in `entry` above; the plugin would
  // re-claim them as dev-only entries and hide their imports from --production.
  'github-actions': false,
  ignoreBinaries: ['gh', 'tsc'],
  ignoreDependencies: ['@opencode-ai/plugin'],
};

export default config;
