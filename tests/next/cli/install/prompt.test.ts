import { describe, expect, test } from 'bun:test';
import {
  canPromptInstallTargets as portedCanPrompt,
  promptInstallTargets as portedPromptInstallTargets,
  promptKimiInstallMethod as portedPromptKimi,
  renderInstallSelection as portedRenderInstallSelection,
} from '@next/cli/install/prompt';
import type { InstallTargetChoice } from '@next/hosts/install/choices';
import type { InstallAction, InstallTarget } from '@next/hosts/install/targets';
import {
  canPromptInstallTargets as shippedCanPrompt,
  promptInstallTargets as shippedPromptInstallTargets,
  promptKimiInstallMethod as shippedPromptKimi,
  renderInstallSelection as shippedRenderInstallSelection,
} from '@/cli/install/prompt';
import { createFakeInput, createFakeOutput, withStdoutTTY } from '../../helpers/fake-tty';
import { withProcessEnv } from '../../helpers/temp-home';

/**
 * The picker is the only surface where a user's keystrokes decide what gets written to their host
 * configs, so the differential drives the keyboard: the frames, the selection it returns and the
 * terminal state it leaves behind all have to match, key for key.
 */

const CHOICES: readonly InstallTargetChoice[] = [
  {
    target: 'claude-code',
    flag: '--claude-code',
    label: 'Claude Code',
    available: false,
    unavailableReason: 'CLI not found',
  },
  { target: 'codex', flag: '--codex', label: 'Codex CLI', available: false },
  { target: 'cursor', flag: '--cursor', label: 'Cursor', available: true },
  { target: 'gemini-cli', flag: '--gemini-cli', label: 'Gemini CLI', available: true },
];

const NOTHING_AVAILABLE: readonly InstallTargetChoice[] = CHOICES.map((choice) => ({
  ...choice,
  available: false,
  unavailableReason: undefined,
}));

const STATES: readonly { cursor: number; selected: readonly InstallTarget[] }[] = [
  { cursor: 2, selected: [] },
  { cursor: 3, selected: ['cursor'] },
  { cursor: 0, selected: ['cursor', 'gemini-cli'] },
];

const ACTIONS: readonly InstallAction[] = ['install', 'uninstall'];

function renderEvery(renderInstallSelection: typeof shippedRenderInstallSelection, color: boolean) {
  return ACTIONS.flatMap((action) =>
    [CHOICES, NOTHING_AVAILABLE].flatMap((choices) =>
      STATES.map((state) => renderInstallSelection(action, choices, state, { color })),
    ),
  );
}

type KeyPress = { name: string; value?: string; ctrl?: boolean };

const KEY = {
  down: { name: 'down' },
  enter: { name: 'return', value: '\r' },
  interrupt: { name: 'c', value: '\x03', ctrl: true },
  quit: { name: 'q', value: 'q' },
  space: { name: 'space', value: ' ' },
  update: { name: 'u', value: 'u' },
} satisfies Record<string, KeyPress>;

type PromptFakes = {
  input: NodeJS.ReadStream;
  output: NodeJS.WriteStream;
  onInterrupt: () => void;
};

function runPrompt<T>(start: (fakes: PromptFakes) => Promise<T>, keys: readonly KeyPress[]) {
  const input = createFakeInput({});
  const output = createFakeOutput({ isTTY: true });
  const interrupts: string[] = [];
  const settled = start({
    input: input as unknown as NodeJS.ReadStream,
    onInterrupt: () => interrupts.push('interrupt'),
    output: output as unknown as NodeJS.WriteStream,
  });
  for (const key of keys) input.press(key.name, key.value, key.ctrl);
  return settled.then((result) => ({
    chunks: output.chunks,
    interrupts,
    rawModeCalls: input.rawModeCalls,
    result,
  }));
}

function pickTargets(
  promptInstallTargets: typeof shippedPromptInstallTargets,
  action: InstallAction,
  choices: readonly InstallTargetChoice[],
  keys: readonly KeyPress[],
) {
  return runPrompt((fakes) => promptInstallTargets(action, choices, fakes), keys);
}

function pickKimiMethod(
  promptKimiInstallMethod: typeof shippedPromptKimi,
  globalHookInstalled: boolean,
  keys: readonly KeyPress[],
) {
  return runPrompt((fakes) => promptKimiInstallMethod({ ...fakes, globalHookInstalled }), keys);
}

/** The frames a run drew: the prompt writes each one as a single chunk that opens with a blank line. */
const framesOf = (chunks: readonly string[]) => chunks.filter((chunk) => chunk.startsWith('\n'));

describe('cli/install/prompt', () => {
  test('every row state renders identically on both implementations', () => {
    const plain = renderEvery(portedRenderInstallSelection, false);
    expect(plain).toEqual(renderEvery(shippedRenderInstallSelection, false));
    expect(plain).toMatchSnapshot();
    expect(plain[0]?.split('\n')).toEqual([
      '',
      'Install CC Safety Net into:',
      '',
      '  ◯ Claude Code (CLI not found)',
      '  ◯ Codex CLI (not installed)',
      '> ◯ Cursor',
      '  ◯ Gemini CLI',
      '',
      'Space: select  Enter: confirm  u: update installed  Up/Down: move  q/Esc: cancel',
    ]);
    expect(plain[2]?.split('\n').slice(3, 7)).toEqual([
      '> ◯ Claude Code (CLI not found)',
      '  ◯ Codex CLI (not installed)',
      '  ◉ Cursor',
      '  ◉ Gemini CLI',
    ]);
    expect(plain[6]?.split('\n').at(-1)).toBe(
      'Space: select  Enter: confirm  Up/Down: move  q/Esc: cancel',
    );
    expect(plain[9]?.split('\n').at(-1)).toBe(
      'No selectable integrations found for uninstall. q/Esc: close',
    );
  });

  // `colors` re-reads the terminal on every call, so the row has to hold one open or it compares
  // plain text against plain text and the role-to-color mapping goes unchecked.
  test('the colored rows render identically on both implementations', () => {
    withStdoutTTY(true, () =>
      withProcessEnv({ NO_COLOR: undefined }, () => {
        const colored = renderEvery(portedRenderInstallSelection, true);
        expect(colored).toEqual(renderEvery(shippedRenderInstallSelection, true));
        expect(colored).toMatchSnapshot();
        expect(colored[0]?.split('\n').slice(3, 7)).toEqual([
          '  \x1b[2m◯ Claude Code (CLI not found)\x1b[0m',
          '  \x1b[2m◯ Codex CLI (not installed)\x1b[0m',
          '> \x1b[1m◯ Cursor\x1b[0m',
          '  ◯ Gemini CLI',
        ]);
        expect(colored[2]?.split('\n').slice(5, 7)).toEqual([
          '  \x1b[32m◉ Cursor\x1b[0m',
          '  \x1b[32m◉ Gemini CLI\x1b[0m',
        ]);
      }),
    );
  });

  test('selection is returned in choice order on both implementations', async () => {
    const keys = [KEY.down, KEY.space, KEY.down, KEY.space, KEY.enter];
    const ported = await pickTargets(portedPromptInstallTargets, 'install', CHOICES, keys);
    expect(ported).toEqual(
      await pickTargets(shippedPromptInstallTargets, 'install', CHOICES, keys),
    );
    expect(ported).toMatchSnapshot();
    expect(ported.result).toEqual(['cursor', 'gemini-cli']);
    expect(ported.chunks.at(-1)).toBe('Installing selected integrations...\n');
    expect(ported.rawModeCalls).toEqual([true, false]);
  });

  test('q cancels on both implementations', async () => {
    const ported = await pickTargets(portedPromptInstallTargets, 'install', CHOICES, [KEY.quit]);
    expect(ported).toEqual(
      await pickTargets(shippedPromptInstallTargets, 'install', CHOICES, [KEY.quit]),
    );
    expect(ported).toMatchSnapshot();
    expect(ported.result).toBeNull();
    expect(framesOf(ported.chunks)).toHaveLength(1);
  });

  test('u updates on install and is ignored on uninstall on both implementations', async () => {
    const update = await pickTargets(portedPromptInstallTargets, 'install', CHOICES, [KEY.update]);
    expect(update).toEqual(
      await pickTargets(shippedPromptInstallTargets, 'install', CHOICES, [KEY.update]),
    );
    expect(update).toMatchSnapshot();
    expect(update.result).toBe('update');

    const ignored = await pickTargets(portedPromptInstallTargets, 'uninstall', CHOICES, [
      KEY.update,
      KEY.quit,
    ]);
    expect(ignored).toEqual(
      await pickTargets(shippedPromptInstallTargets, 'uninstall', CHOICES, [KEY.update, KEY.quit]),
    );
    expect(ignored).toMatchSnapshot();
    expect(ignored.result).toBeNull();
    const quitOnly = await pickTargets(portedPromptInstallTargets, 'uninstall', CHOICES, [
      KEY.quit,
    ]);
    expect(ignored.chunks).toEqual(quitOnly.chunks);
  });

  test('confirming nothing beeps and redraws on both implementations', async () => {
    const keys = [KEY.enter, KEY.quit];
    const ported = await pickTargets(portedPromptInstallTargets, 'install', CHOICES, keys);
    expect(ported).toEqual(
      await pickTargets(shippedPromptInstallTargets, 'install', CHOICES, keys),
    );
    expect(ported.chunks).toContain('\x07');
    expect(framesOf(ported.chunks)).toHaveLength(2);
    expect(ported.result).toBeNull();
    expect(ported).toMatchSnapshot();
  });

  test('Ctrl-C reaches the caller and cancels on both implementations', async () => {
    const ported = await pickTargets(portedPromptInstallTargets, 'install', CHOICES, [
      KEY.interrupt,
    ]);
    expect(ported).toEqual(
      await pickTargets(shippedPromptInstallTargets, 'install', CHOICES, [KEY.interrupt]),
    );
    expect(ported).toMatchSnapshot();
    expect(ported.interrupts).toEqual(['interrupt']);
    expect(ported.result).toBeNull();
    expect(ported.rawModeCalls).toEqual([true, false]);
  });

  test('a list with no selectable row keeps the cursor put on both implementations', async () => {
    const keys = [KEY.down, KEY.quit];
    const ported = await pickTargets(
      portedPromptInstallTargets,
      'uninstall',
      NOTHING_AVAILABLE,
      keys,
    );
    expect(ported).toEqual(
      await pickTargets(shippedPromptInstallTargets, 'uninstall', NOTHING_AVAILABLE, keys),
    );
    expect(ported).toMatchSnapshot();
    const frames = framesOf(ported.chunks);
    expect(frames).toHaveLength(2);
    expect(frames[1]).toBe(frames[0]);
    expect(frames[0]).toContain('No selectable integrations found for uninstall. q/Esc: close');
    expect(ported.result).toBeNull();
  });

  test('the Kimi method picker answers the same keys on both implementations', async () => {
    const globalHook = await pickKimiMethod(portedPromptKimi, false, [KEY.enter]);
    expect(globalHook).toEqual(await pickKimiMethod(shippedPromptKimi, false, [KEY.enter]));
    expect(globalHook).toMatchSnapshot();
    expect(globalHook.result).toBe('global-hook');

    const plugin = await pickKimiMethod(portedPromptKimi, false, [KEY.down, KEY.enter]);
    expect(plugin).toEqual(await pickKimiMethod(shippedPromptKimi, false, [KEY.down, KEY.enter]));
    expect(plugin).toMatchSnapshot();
    expect(plugin.result).toBe('plugin');

    const cancelled = await pickKimiMethod(portedPromptKimi, false, [KEY.quit]);
    expect(cancelled).toEqual(await pickKimiMethod(shippedPromptKimi, false, [KEY.quit]));
    expect(cancelled).toMatchSnapshot();
    expect(cancelled.result).toBeNull();
  });

  test('an installed global hook relabels the first Kimi row on both implementations', async () => {
    const installed = await pickKimiMethod(portedPromptKimi, true, [KEY.quit]);
    expect(installed).toEqual(await pickKimiMethod(shippedPromptKimi, true, [KEY.quit]));
    expect(installed).toMatchSnapshot();
    expect(framesOf(installed.chunks)[0]).toContain(
      'Global hook — already installed; selecting it reports the current state',
    );
    const fresh = await pickKimiMethod(portedPromptKimi, false, [KEY.quit]);
    expect(framesOf(fresh.chunks)[0]).toContain(
      'Global hook — write the hook into ~/.kimi-code/config.toml now',
    );
  });

  test('the prompt is offered only to a full TTY on both implementations', () => {
    const combinations = [
      [true, true],
      [true, false],
      [false, true],
      [false, false],
    ] as const;
    const answers = (canPromptInstallTargets: typeof shippedCanPrompt) =>
      combinations.map(([inputTTY, outputTTY]) =>
        canPromptInstallTargets(
          createFakeInput({ isTTY: inputTTY }) as unknown as NodeJS.ReadStream,
          createFakeOutput({ isTTY: outputTTY }) as unknown as NodeJS.WriteStream,
        ),
      );
    expect(answers(portedCanPrompt)).toEqual(answers(shippedCanPrompt));
    expect(answers(portedCanPrompt)).toEqual([true, false, false, false]);
  });
});
