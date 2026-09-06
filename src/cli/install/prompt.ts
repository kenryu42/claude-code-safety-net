/**
 * The interactive install target picker: a small raw-mode readline loop that owns
 * keypress mapping, cursor movement, selection state, and frame redraws.
 */

import * as readline from 'node:readline';
import { colors } from '@/cli/utils/colors';
import type { InstallTargetChoice } from '@/hosts/install/choices';
import type { InstallAction, InstallTarget } from '@/hosts/install/targets';

type InstallPromptOptions = {
  input?: NodeJS.ReadStream;
  output?: NodeJS.WriteStream;
  /** Test seam for Ctrl-C, which otherwise raises SIGINT on this process. */
  onInterrupt?: () => void;
};

type InstallSelectionState = {
  cursor: number;
  selected: readonly InstallTarget[];
};

type InstallSelectionKey = 'up' | 'down' | 'toggle' | 'confirm' | 'update' | 'abort' | 'interrupt';

type KeyPress = {
  name?: string;
  ctrl?: boolean;
};

function titleCaseAction(action: InstallAction): string {
  return action === 'install' ? 'Install' : 'Uninstall';
}

function activeVerb(action: InstallAction): string {
  return action === 'install' ? 'Installing' : 'Uninstalling';
}

function targetPreposition(action: InstallAction): string {
  return action === 'install' ? 'into' : 'from';
}

function isAvailable(choice: InstallTargetChoice | undefined): choice is InstallTargetChoice {
  return choice?.available === true;
}

function selectedInChoiceOrder(
  choices: readonly InstallTargetChoice[],
  selected: readonly InstallTarget[],
): InstallTarget[] {
  const selectedTargets = new Set(selected);
  return choices
    .filter((choice) => selectedTargets.has(choice.target))
    .map((choice) => choice.target);
}

function nextSelectableCursor(
  choices: readonly InstallTargetChoice[],
  cursor: number,
  direction: -1 | 1,
): number {
  if (choices.length === 0 || choices.every((choice) => !choice.available)) return cursor;

  return Array.from({ length: choices.length }, (_, index) => index + 1)
    .map((offset) => (cursor + offset * direction + choices.length) % choices.length)
    .find((index) => isAvailable(choices[index])) as number;
}

function mapKeyPress(
  action: InstallAction,
  input: string,
  key: KeyPress,
): InstallSelectionKey | null {
  if (key.ctrl && key.name === 'c') return 'interrupt';
  if (key.name === 'escape' || input === 'q') return 'abort';
  if (action === 'install' && (input === 'u' || input === 'U')) return 'update';
  if (key.name === 'up' || input === 'k') return 'up';
  if (key.name === 'down' || input === 'j') return 'down';
  if (key.name === 'space' || input === ' ') return 'toggle';
  if (key.name === 'return' || key.name === 'enter') return 'confirm';
  return null;
}

function createInstallSelectionState(
  choices: readonly InstallTargetChoice[],
): InstallSelectionState {
  return {
    cursor: choices.findIndex((choice) => choice.available),
    selected: [],
  };
}

function reduceInstallSelectionState(
  state: InstallSelectionState,
  choices: readonly InstallTargetChoice[],
  key: InstallSelectionKey,
): { state: InstallSelectionState; done?: 'confirm' | 'update' | 'abort' | 'interrupt' } {
  if (key === 'confirm' || key === 'update' || key === 'abort' || key === 'interrupt')
    return { state, done: key };

  if (key === 'up') {
    return { state: { ...state, cursor: nextSelectableCursor(choices, state.cursor, -1) } };
  }

  if (key === 'down') {
    return { state: { ...state, cursor: nextSelectableCursor(choices, state.cursor, 1) } };
  }

  const choice = choices[state.cursor];
  if (!isAvailable(choice)) return { state };

  const selected = state.selected.includes(choice.target)
    ? state.selected.filter((target) => target !== choice.target)
    : selectedInChoiceOrder(choices, [...state.selected, choice.target]);

  return { state: { ...state, selected } };
}

const CHECKBOX_ON = '◉';
const CHECKBOX_OFF = '◯';
const CURSOR_ON = '>';
const CURSOR_OFF = ' ';

/** @internal */
export function renderInstallSelection(
  action: InstallAction,
  choices: readonly InstallTargetChoice[],
  state: InstallSelectionState,
  options: { color?: boolean } = {},
): string {
  const useColor = options.color !== false;
  const formatDim = useColor ? colors.dim : (value: string) => value;
  const formatCheckboxOn = useColor ? colors.green : (value: string) => value;
  const formatFocus = useColor ? colors.bold : (value: string) => value;

  return [
    '',
    `${titleCaseAction(action)} CC Safety Net ${targetPreposition(action)}:`,
    '',
    ...choices.map((choice, index) => {
      const selected = state.selected.includes(choice.target);
      const focused = index === state.cursor;
      const marker = selected ? CHECKBOX_ON : CHECKBOX_OFF;
      const cursor = focused ? CURSOR_ON : CURSOR_OFF;
      const suffix = choice.available ? '' : ` (${choice.unavailableReason ?? 'not installed'})`;
      const rowBody = `${marker} ${choice.label}${suffix}`;
      const formatted = !choice.available
        ? formatDim(rowBody)
        : selected
          ? formatCheckboxOn(rowBody)
          : focused
            ? formatFocus(rowBody)
            : rowBody;
      return `${cursor} ${formatted}`;
    }),
    '',
    action === 'install'
      ? 'Space: select  Enter: confirm  u: update installed  Up/Down: move  q/Esc: cancel'
      : choices.some((choice) => choice.available)
        ? 'Space: select  Enter: confirm  Up/Down: move  q/Esc: cancel'
        : `No selectable integrations found for ${action}. q/Esc: close`,
  ].join('\n');
}

export type KimiInstallMethod = 'global-hook' | 'plugin';

const KIMI_METHODS: readonly KimiInstallMethod[] = ['global-hook', 'plugin'];

function renderKimiMethodSelection(
  cursor: number,
  globalHookInstalled: boolean,
  options: { color?: boolean } = {},
): string {
  const formatFocus = options.color !== false ? colors.bold : (value: string) => value;
  const rows = [
    `Global hook — ${
      globalHookInstalled
        ? 'already installed; selecting it reports the current state'
        : 'write the hook into ~/.kimi-code/config.toml now'
    }`,
    'Native Kimi plugin — print the steps to run inside Kimi Code',
  ];

  return [
    '',
    'Install the Kimi Code integration as:',
    '',
    ...rows.map((row, index) => {
      const focused = index === cursor;
      const rowBody = `${focused ? CHECKBOX_ON : CHECKBOX_OFF} ${row}`;
      return `${focused ? CURSOR_ON : CURSOR_OFF} ${focused ? formatFocus(rowBody) : rowBody}`;
    }),
    '',
    'Enter: confirm  Up/Down: move  q/Esc: cancel',
  ].join('\n');
}

type PromptFrameControls<T> = {
  finish: (value: T) => void;
  draw: () => void;
};

/** Runs a raw-mode keypress prompt that owns frame redraws and terminal state restoration. */
function promptFramedSelection<T>(config: {
  input: NodeJS.ReadStream;
  output: NodeJS.WriteStream;
  render: () => string;
  onKey: (inputValue: string, key: KeyPress, controls: PromptFrameControls<T>) => void;
}): Promise<T> {
  const input = config.input;
  const output = config.output;

  readline.emitKeypressEvents(input);
  const wasRaw = input.isRaw === true;
  input.setRawMode(true);
  input.resume();

  let renderedLines = 0;

  const clearFrame = () => {
    if (renderedLines === 0) return;
    readline.moveCursor(output, 0, -renderedLines);
    readline.cursorTo(output, 0);
    readline.clearScreenDown(output);
  };

  const draw = () => {
    clearFrame();
    const frame = config.render();
    output.write(`${frame}\n`);
    renderedLines = frame.split('\n').length;
  };

  return new Promise((resolve) => {
    const finish = (value: T) => {
      input.off('keypress', onKeyPress);
      input.setRawMode(wasRaw);
      input.pause();
      clearFrame();
      resolve(value);
    };

    function onKeyPress(inputValue: string, key: KeyPress) {
      config.onKey(inputValue, key, { finish, draw });
    }

    input.on('keypress', onKeyPress);
    draw();
  });
}

/** Asks which Kimi Code install method to use; resolves null when the user cancels. */
export function promptKimiInstallMethod(
  options: InstallPromptOptions & { globalHookInstalled?: boolean } = {},
): Promise<KimiInstallMethod | null> {
  let cursor = 0;

  return promptFramedSelection<KimiInstallMethod | null>({
    input: options.input ?? process.stdin,
    output: options.output ?? process.stdout,
    render: () => renderKimiMethodSelection(cursor, options.globalHookInstalled === true),
    onKey: (inputValue, key, controls) => {
      if (key.ctrl && key.name === 'c') {
        // Ctrl-C keeps the signal convention, matching the target picker: restore first, then raise.
        controls.finish(null);
        (options.onInterrupt ?? (() => process.kill(process.pid, 'SIGINT')))();
        return;
      }
      if (key.name === 'escape' || inputValue === 'q') return controls.finish(null);
      if (key.name === 'return' || key.name === 'enter') {
        return controls.finish(KIMI_METHODS[cursor] as KimiInstallMethod);
      }
      if (key.name === 'up' || key.name === 'down' || inputValue === 'k' || inputValue === 'j') {
        // With two rows, any move flips the cursor, so up from the top wraps to the bottom.
        cursor = (cursor + 1) % KIMI_METHODS.length;
        controls.draw();
      }
    },
  });
}

export function canPromptInstallTargets(
  input: NodeJS.ReadStream = process.stdin,
  output: NodeJS.WriteStream = process.stdout,
): boolean {
  return Boolean(input.isTTY && output.isTTY && typeof input.setRawMode === 'function');
}

export function promptInstallTargets(
  action: InstallAction,
  choices: readonly InstallTargetChoice[],
  options: InstallPromptOptions = {},
): Promise<InstallTarget[] | null | 'update'> {
  const output = options.output ?? process.stdout;
  let state = createInstallSelectionState(choices);

  return promptFramedSelection<InstallTarget[] | null | 'update'>({
    input: options.input ?? process.stdin,
    output,
    render: () => renderInstallSelection(action, choices, state),
    onKey: (inputValue, key, controls) => {
      const mappedKey = mapKeyPress(action, inputValue, key);
      if (!mappedKey) return;

      const next = reduceInstallSelectionState(state, choices, mappedKey);
      state = next.state;

      if (next.done === 'interrupt') {
        // Ctrl-C keeps the signal convention, matching the startup banner: restore first, then raise.
        controls.finish(null);
        (options.onInterrupt ?? (() => process.kill(process.pid, 'SIGINT')))();
        return;
      }

      if (next.done === 'abort') return controls.finish(null);
      if (next.done === 'update') return controls.finish('update');

      if (next.done === 'confirm') {
        if (state.selected.length === 0) {
          output.write('\x07');
          controls.draw();
          return;
        }
        controls.finish([...state.selected]);
        output.write(`${activeVerb(action)} selected integrations...\n`);
        return;
      }

      controls.draw();
    },
  });
}
