import { describe, test } from 'bun:test';
import { copyFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { withTempDir } from '../helpers';
import { expectTypeScriptProjectCompiles } from '../helpers/typescript';

const CONSUMER_TSCONFIG = JSON.stringify({
  compilerOptions: {
    module: 'ESNext',
    moduleResolution: 'Bundler',
    noEmit: true,
    strict: true,
    target: 'ES2022',
  },
  files: ['consumer.ts'],
});

const PACKAGE_MANIFEST = JSON.stringify({
  name: 'cc-safety-net',
  type: 'module',
  exports: {
    '.': { types: './dist/index.d.ts', import: './dist/index.js' },
    './api': { types: './dist/api.d.ts', import: './dist/api.js' },
    './package.json': './package.json',
  },
});

function writeInstalledPackage(dir: string) {
  const packageDir = join(dir, 'node_modules', 'cc-safety-net');
  mkdirSync(join(packageDir, 'dist'), { recursive: true });
  copyFileSync('dist/index.d.ts', join(packageDir, 'dist', 'index.d.ts'));
  copyFileSync('dist/api.d.ts', join(packageDir, 'dist', 'api.d.ts'));
  writeFileSync(join(packageDir, 'package.json'), PACKAGE_MANIFEST);
}

describe('package public API', () => {
  test('types expose only the root OpenCode plugin and reject deep imports', async () => {
    await withTempDir('cc-safety-net-public-api-', (dir) => {
      const peerDir = join(dir, 'node_modules', '@opencode-ai', 'plugin');
      writeInstalledPackage(dir);
      mkdirSync(peerDir, { recursive: true });
      writeFileSync(
        join(peerDir, 'package.json'),
        JSON.stringify({ name: '@opencode-ai/plugin', types: './index.d.ts' }),
      );
      writeFileSync(
        join(peerDir, 'index.d.ts'),
        `export interface PluginInput { directory: string; homeDir?: string }
export type Plugin = (input: PluginInput) => Promise<Record<string, unknown>>;
`,
      );
      writeFileSync(
        join(dir, 'consumer.ts'),
        `import { CCSafetyNetPlugin } from 'cc-safety-net';
void CCSafetyNetPlugin;
// @ts-expect-error Root helper exports were intentionally removed.
import { resolveOpenCodeShellRoute } from 'cc-safety-net';
// @ts-expect-error The library function lives on the api subpath, not the root.
import { checkCommand as rootCheckCommand } from 'cc-safety-net';
// @ts-expect-error Deep imports are intentionally rejected by package exports.
import { analyzeCommand } from 'cc-safety-net/dist/core/analyze/index.js';
void resolveOpenCodeShellRoute;
void rootCheckCommand;
void analyzeCommand;
`,
      );
      writeFileSync(join(dir, 'tsconfig.json'), CONSUMER_TSCONFIG);

      expectTypeScriptProjectCompiles(join(dir, 'tsconfig.json'));
    });
  });

  test('api subpath types narrow by kind and need no OpenCode peer', async () => {
    await withTempDir('cc-safety-net-public-api-library-', (dir) => {
      // No @opencode-ai/plugin fixture: a library-only consumer must compile
      // the api subpath without the optional peer's types installed.
      writeInstalledPackage(dir);
      writeFileSync(
        join(dir, 'consumer.ts'),
        `import { checkCommand, type CheckCommandInput, type CheckCommandResult } from 'cc-safety-net/api';
const input: CheckCommandInput = { command: 'git status', cwd: '/tmp' };
const result: CheckCommandResult = checkCommand(input);
if (result.kind === 'deny') {
  const reason: string = result.reason;
  const ruleId: string | undefined = result.ruleId;
  void reason;
  void ruleId;
}
`,
      );
      writeFileSync(join(dir, 'tsconfig.json'), CONSUMER_TSCONFIG);

      expectTypeScriptProjectCompiles(join(dir, 'tsconfig.json'));
    });
  });
});
