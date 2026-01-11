import type { KnipConfig } from 'knip';

const config: KnipConfig = {
  entry: ['src/index.ts', 'src/bin/cc-safety-net.ts', 'scripts/**/*.ts'],
  project: ['src/**/*.ts!', 'scripts/**/*.ts!'],
};

export default config;
