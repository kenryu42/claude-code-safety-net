import { EventEmitter } from 'node:events';

/**
 * The terminal the banner and prompt differentials run against. A real TTY would make the raw-mode
 * loops interactive and their frames machine-dependent; here the test presses the keys and reads
 * back the exact bytes each implementation wrote, so a divergence in frames, cursor handling or
 * terminal restoration shows up as a different recording instead of a hung test.
 */

export function createFakeInput({ isTTY = true }: { isTTY?: boolean } = {}) {
  const rawModeCalls: boolean[] = [];
  const streamCalls: string[] = [];
  const emitter = new EventEmitter();
  const input = Object.assign(emitter, {
    isTTY,
    isRaw: false,
    readableFlowing: null,
    rawModeCalls,
    streamCalls,
    setRawMode: (flag: boolean) => {
      rawModeCalls.push(flag);
      input.isRaw = flag;
      return input;
    },
    resume: () => {
      streamCalls.push('resume');
      return input;
    },
    pause: () => {
      streamCalls.push('pause');
      return input;
    },
    press: (name: string, value = '', ctrl = false) =>
      emitter.emit('keypress', value, { name, ctrl }),
  });
  return input;
}

export function createFakeOutput({ isTTY }: { isTTY: boolean }) {
  const chunks: string[] = [];
  return {
    isTTY,
    chunks,
    write: (chunk: string) => {
      chunks.push(chunk);
      return true;
    },
    text: () => chunks.join(''),
  };
}

/** A regular property swap models the terminal; the suite's own stdout is left as it was. */
export function withStdoutTTY<T>(isTTY: boolean, run: () => T): T {
  const previous = Object.getOwnPropertyDescriptor(process.stdout, 'isTTY');
  Object.defineProperty(process.stdout, 'isTTY', { value: isTTY, configurable: true });
  try {
    return run();
  } finally {
    if (previous) Object.defineProperty(process.stdout, 'isTTY', previous);
    else Reflect.deleteProperty(process.stdout, 'isTTY');
  }
}
