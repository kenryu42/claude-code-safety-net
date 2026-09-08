import { spawn } from 'node:child_process';
import { getSpawnCommand } from '@/hosts/system-info';

export type NativeCommand = readonly [string, ...string[]];

function formatNativeCommand(command: NativeCommand) {
  return command.join(' ');
}

function formatCommandFailure(command: NativeCommand, status: number | null, output: string) {
  return [
    `Failed to run ${formatNativeCommand(command)}${status === null ? '' : ` (exit ${status})`}.`,
    output.trim(),
  ]
    .filter(Boolean)
    .join('\n');
}

/** Accumulates a spawned child's decoded stdout and stderr; read them once the child closes. */
export function captureOutputStreams(child: {
  stdout: NodeJS.ReadableStream;
  stderr: NodeJS.ReadableStream;
}) {
  const captured = { stdout: '', stderr: '' };
  child.stdout.setEncoding('utf-8');
  child.stderr.setEncoding('utf-8');
  child.stdout.on('data', (chunk: string) => {
    captured.stdout += chunk;
  });
  child.stderr.on('data', (chunk: string) => {
    captured.stderr += chunk;
  });
  return captured;
}

/**
 * Run a command, returning stdout and stderr merged so a caller showing human output sees all of
 * it. `stdoutOnly` narrows the success value to stdout for callers that parse it: a tool writing
 * its machine-readable report to stdout keeps it parseable however much trace or warning text
 * lands on stderr. Failures always report both streams.
 *
 * Asynchronous so a loading spinner keeps animating while a slow host CLI runs.
 */
export function runNativeCommand(
  command: NativeCommand,
  options?: { stdoutOnly?: boolean; timeoutMs?: number },
): Promise<string> {
  return new Promise((resolve, reject) => {
    const spawnCommand = getSpawnCommand([...command], process.env);
    const child = spawn(spawnCommand.cmd, spawnCommand.args, {
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    const captured = captureOutputStreams(child);
    const merged = () => [captured.stdout, captured.stderr].filter(Boolean).join('\n');
    const timeoutMs = options?.timeoutMs ?? 120_000;
    // A stalled host CLI must not hang the install forever.
    const timer = setTimeout(() => {
      child.kill();
      reject(
        new Error(
          formatCommandFailure(
            command,
            null,
            `Timed out after ${timeoutMs}ms.\n${merged()}`.trim(),
          ),
        ),
      );
    }, timeoutMs);
    child.on('error', (error) => {
      clearTimeout(timer);
      reject(
        new Error(formatCommandFailure(command, null, `${error.message}\n${merged()}`.trim())),
      );
    });
    child.on('close', (status) => {
      clearTimeout(timer);
      if (status !== 0) {
        reject(new Error(formatCommandFailure(command, status, merged())));
        return;
      }
      resolve(options?.stdoutOnly ? captured.stdout : merged());
    });
  });
}

export async function runNativeCommands(commands: readonly NativeCommand[]): Promise<void> {
  for (const command of commands) await runNativeCommand(command);
}

/**
 * Best-effort cleanup of state the host CLI may have already dropped on its own (e.g. a legacy
 * plugin removed by a marketplace rename migration): a failure is reported, never thrown, so it
 * cannot fail the install that precedes it.
 */
export async function runNativeCleanupCommands(commands: readonly NativeCommand[]): Promise<void> {
  for (const command of commands) {
    try {
      await runNativeCommand(command);
    } catch (error) {
      console.warn(error instanceof Error ? error.message : String(error));
    }
  }
}
