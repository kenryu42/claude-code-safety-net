import { expect, test } from 'bun:test';
import { join } from 'node:path';
import pkg from '../../package.json';

const launcher = join(import.meta.dir, '../../scripts/project-bun.ts');
const PINNED = pkg.packageManager.slice(4);

/**
 * Only on the pinned runtime. The launcher spawns it directly there, so the blanked PATH this row
 * hands it proves what it means to prove: the launcher puts its own directory back. On any other
 * Bun the launcher first delegates to `bun x --package bun@<pinned>`, which has to fetch that
 * package before anything runs, and a fetch cannot happen under a blanked PATH — its postinstall
 * looks for `node` there. The nested spawn is the same either way; only the precondition differs.
 */
test.skipIf(Bun.version !== PINNED)(
  'project Bun reaches nested commands without relying on the caller PATH',
  () => {
    const pathKey = Object.keys(process.env).find((key) => key.toLowerCase() === 'path') ?? 'PATH';
    const result = Bun.spawnSync(
      [
        process.execPath,
        launcher,
        '-e',
        'console.log(Bun.version); const child = Bun.spawnSync(["bun", "--version"]); process.stdout.write(child.stdout); process.exit(child.exitCode);',
      ],
      { env: { ...process.env, [pathKey]: '' }, stdout: 'pipe', stderr: 'pipe' },
    );
    expect(result.stderr.toString()).toBe('');
    expect(result.exitCode).toBe(0);
    expect(result.stdout.toString().trim().split(/\r?\n/)).toEqual([PINNED, PINNED]);
  },
);

test('project Bun preserves arguments, stdin, output, and unsuccessful exit status', () => {
  const result = Bun.spawnSync(
    [
      process.execPath,
      launcher,
      '-e',
      'console.log(JSON.stringify(process.argv.slice(1))); console.log(await Bun.stdin.text()); console.error("child error"); process.exit(23);',
      'argument with spaces',
      '$literal;',
    ],
    { stdin: Buffer.from('input text'), stdout: 'pipe', stderr: 'pipe' },
  );
  expect(result.exitCode).toBe(23);
  expect(result.stdout.toString().replaceAll('\r\n', '\n')).toBe(
    '["argument with spaces","$literal;"]\ninput text\n',
  );
  expect(result.stderr.toString().trim()).toBe('child error');
});
