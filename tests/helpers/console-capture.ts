import { spyOn } from 'bun:test';

/**
 * What a rule command wrote, kept per channel. Every rule subcommand reports on stdout and
 * diagnoses on stderr, and a line that crosses between them is a contract change no comparison of
 * one merged list would notice, so the two are captured apart.
 */
export async function captureConsole<T>(run: () => T | Promise<T>) {
  const log: string[] = [];
  const error: string[] = [];
  const spies = [
    spyOn(console, 'log').mockImplementation((...parts: unknown[]) => {
      log.push(parts.map(String).join(' '));
    }),
    spyOn(console, 'error').mockImplementation((...parts: unknown[]) => {
      error.push(parts.map(String).join(' '));
    }),
  ];
  try {
    return { returned: await run(), log, error };
  } finally {
    for (const spy of spies) spy.mockRestore();
  }
}
