/**
 * The single subprocess boundary of the Amp integration: the `amp` and `git` commands that
 * move the managed plugin in and out of the user's hosted Personal Plugins repository. Callers
 * take it as a default parameter so tests drive the whole transport without a network.
 */

import { spawn } from 'node:child_process';
import { captureOutputStreams } from '@/hosts/install/native';
import { getSpawnCommand } from '@/hosts/system-info';

type AmpCommandResult = {
  status: number | null;
  /** The spawn failure code (`ENOENT`, `ETIMEDOUT`, …) when the command never ran to completion. */
  errorCode?: string;
  stdout: string;
  stderr: string;
};
/**
 * `status` is null when the command could not be started at all (e.g. no `amp` on PATH).
 * Asynchronous so a loading spinner keeps animating during a hosted clone or push.
 */
export type AmpRunner = (
  command: readonly [string, ...string[]],
  cwd?: string,
) => AmpCommandResult | Promise<AmpCommandResult>;

export const runAmpCommand: AmpRunner = (command, cwd) => {
  // On Windows the npm-distributed amp CLI is only a `.cmd` shim, which spawn cannot start
  // without the COMSPEC wrapping this resolver applies.
  const spawnCommand = getSpawnCommand([...command], process.env);
  return new Promise((resolve) => {
    const child = spawn(spawnCommand.cmd, spawnCommand.args, {
      cwd,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    const captured = captureOutputStreams(child);
    let timedOut = false;
    // A hosted clone or push that stalls must not hang the install forever.
    const timer = setTimeout(() => {
      timedOut = true;
      child.kill();
    }, 120_000);
    child.on('error', (error) => {
      clearTimeout(timer);
      resolve({
        status: null,
        errorCode: (error as NodeJS.ErrnoException).code,
        stdout: captured.stdout,
        stderr: [error.message, captured.stderr].filter(Boolean).join('\n'),
      });
    });
    child.on('close', (status) => {
      clearTimeout(timer);
      resolve({
        status: timedOut ? null : status,
        errorCode: timedOut ? 'ETIMEDOUT' : undefined,
        stdout: captured.stdout,
        stderr: captured.stderr,
      });
    });
  });
};
