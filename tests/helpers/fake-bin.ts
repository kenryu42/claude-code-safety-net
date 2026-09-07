import { existsSync, mkdirSync, readFileSync, realpathSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * A directory of fake host CLIs to put in front of `PATH`. Every installer that spawns reaches
 * these instead of a real `claude`, `npx` or `git`, and the script decides what each call prints,
 * how long it takes, what it writes and what it exits with.
 */

export type FakeScriptEntry = {
  command: string;
  /** Matched as a prefix of the call's arguments; absent matches every call of the command. */
  args?: string[];
  stdout?: string;
  stderr?: string;
  exit?: number;
  delayMs?: number;
  /** Copied over `seedInto` (default: the call's last argument) before anything is printed. */
  seedDir?: string;
  seedInto?: string;
  /** Where to copy the working directory the call ran in, so a commit's input stays inspectable. */
  snapshotTo?: string;
};

const FAKE_COMMAND = join(import.meta.dir, 'fake-command.ts');

export function createFakeBin(
  root: string,
  script: readonly FakeScriptEntry[],
  extraCommands: readonly string[] = [],
) {
  const binDir = join(root, 'bin');
  const scriptPath = join(root, 'fake-script.json');
  const logPath = join(root, 'fake-log.txt');
  mkdirSync(binDir, { recursive: true });
  writeFileSync(scriptPath, JSON.stringify(script));
  for (const command of new Set([...script.map((entry) => entry.command), ...extraCommands])) {
    writeFileSync(
      join(binDir, command),
      `#!/bin/sh\nexec "${process.execPath}" "${FAKE_COMMAND}" "${command}" "$@"\n`,
      { mode: 0o755 },
    );
    // Windows cannot run a shell script from PATH; the `.cmd` shim is what a spawn there finds.
    if (process.platform === 'win32')
      writeFileSync(
        join(binDir, `${command}.cmd`),
        `@echo off\r\n"${process.execPath}" "${FAKE_COMMAND}" ${command} %*\r\n`,
      );
  }
  return {
    binDir,
    logPath,
    env: {
      // The fake bin alone: a command a script forgot to provide fails with ENOENT instead of
      // falling through to a real host CLI behind it.
      PATH: binDir,
      CC_SAFETY_NET_FAKE_LOG: logPath,
      CC_SAFETY_NET_FAKE_SCRIPT: scriptPath,
    },
    /**
     * One line per call, `<command> <args>` and the working directory, with `root` as `<root>` in
     * either spelling: the command logs the directory it actually ran in, which is the real path.
     */
    readLog: (): string[] =>
      (existsSync(logPath) ? readFileSync(logPath, 'utf-8') : '')
        .split('\n')
        .filter(Boolean)
        .map((line) =>
          line.replace(`\t${realpathSync(root)}`, '\t<root>').replace(`\t${root}`, '\t<root>'),
        ),
  };
}
