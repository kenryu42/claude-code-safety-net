import { chmodSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

export function writeFakeCommands(homeDir: string, bodies: Readonly<Record<string, string>>) {
  const binDir = join(homeDir, 'bin');
  mkdirSync(binDir, { recursive: true });
  Object.entries(bodies).forEach(([command, body]) => {
    const commandPath = join(binDir, command);
    const bodyPath = `${commandPath}.ts`;
    writeFileSync(
      bodyPath,
      `import { appendFileSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const args = process.argv.slice(2);
const commandLine = args.join(' ');
const commandPath = join(import.meta.dir, ${JSON.stringify(command)});

${body}
`,
    );
    writeFileSync(
      commandPath,
      `#!/bin/sh
exec '${process.execPath.replaceAll("'", "'\"'\"'")}' '${bodyPath.replaceAll("'", "'\"'\"'")}' "$@"
`,
    );
    chmodSync(commandPath, 0o755);
    writeFileSync(
      `${commandPath}.cmd`,
      `@echo off\r\n"${process.execPath}" "%~dp0${command}.ts" %*\r\n`,
    );
  });
  return binDir;
}
