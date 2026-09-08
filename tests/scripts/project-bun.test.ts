import { expect, test } from 'bun:test';
import { join } from 'node:path';

const launcher = join(import.meta.dir, '../../scripts/project-bun.ts');

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
