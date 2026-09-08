import { PYTHON_INTERPRETER_PATTERN } from '@/core/rules/constants';
import { getBasename } from '@/core/shell/tokens';
import { hasLinearDangerousText, hasLinearInterpreterDanger } from './linear-danger-scanner';
import { chargeNativeLinearPass } from './text-scanner';

export const REASON_INTERPRETER_DANGEROUS =
  'Interpreter code contains a dangerous command. Run the underlying command directly so it can be analyzed, or use the safer alternative for that command.';
export const REASON_INTERPRETER_BLOCKED =
  'Interpreter one-liners are blocked by the active safety policy. Write the code to a script file and run it, or run the equivalent shell command directly.';

const CODE_FLAGS = new Map([
  ['python', new Set(['-c'])],
  ['node', new Set(['-e', '--eval'])],
  ['ruby', new Set(['-e'])],
  ['perl', new Set(['-e', '-E'])],
]);

const NODE_PRINT_FLAGS = new Set(['-p', '--print']);

const CLUSTERED_CODE_FLAGS = new Map([
  ['python', new Set(['c'])],
  ['node', new Set(['e'])],
  ['ruby', new Set(['e'])],
  ['perl', new Set(['e', 'E'])],
]);

const SHORT_VALUE_FLAGS = new Map([
  ['python', new Set(['W', 'X'])],
  ['node', new Set(['C', 'r'])],
  ['ruby', new Set(['C', 'E', 'F', 'I', 'r'])],
  ['perl', new Set(['F', 'I', 'M', 'm'])],
]);

const ATTACHED_VALUE_FLAGS = new Map([
  ['ruby', new Set(['0', 'K', 'W', 'x'])],
  ['perl', new Set(['0', 'C', 'D', 'V', 'd', 'i', 'l', 'x'])],
]);

const PROGRAM_FLAGS = new Map([['python', new Set(['m'])]]);

const LONG_VALUE_FLAGS = new Map([
  [
    'node',
    new Set([
      '--allow-fs-read',
      '--allow-fs-write',
      '--conditions',
      '--cpu-prof-dir',
      '--cpu-prof-interval',
      '--cpu-prof-name',
      '--debug-port',
      '--diagnostic-dir',
      '--disable-proto',
      '--disable-warning',
      '--dns-result-order',
      '--env-file',
      '--env-file-if-exists',
      '--experimental-package-map',
      '--experimental-test-isolation',
      '--experimental-test-tag-filter',
      '--heap-prof-dir',
      '--heap-prof-interval',
      '--heap-prof-name',
      '--heapsnapshot-near-heap-limit',
      '--heapsnapshot-signal',
      '--icu-data-dir',
      '--input-type',
      '--inspect-port',
      '--inspect-publish-uid',
      '--localstorage-file',
      '--max-http-header-size',
      '--max-old-space-size-percentage',
      '--network-family-autoselection-attempt-timeout',
      '--openssl-config',
      '--redirect-warnings',
      '--report-dir',
      '--report-directory',
      '--report-filename',
      '--report-signal',
      '--secure-heap',
      '--secure-heap-min',
      '--test-concurrency',
      '--test-coverage-branches',
      '--test-coverage-exclude',
      '--test-coverage-functions',
      '--test-coverage-include',
      '--test-coverage-lines',
      '--test-global-setup',
      '--test-isolation',
      '--test-name-pattern',
      '--test-random-seed',
      '--test-reporter',
      '--test-reporter-destination',
      '--test-rerun-failures',
      '--test-shard',
      '--test-skip-pattern',
      '--test-timeout',
      '--title',
      '--tls-cipher-list',
      '--tls-keylog',
      '--trace-event-categories',
      '--trace-event-file-pattern',
      '--trace-require-module',
      '--unhandled-rejections',
      '--use-largepages',
      '--v8-pool-size',
      '--watch-kill-signal',
    ]),
  ],
  ['python', new Set(['--check-hash-based-pycs'])],
  [
    'ruby',
    new Set([
      '--backtrace-limit',
      '--crash-report',
      '--disable',
      '--enable',
      '--encoding',
      '--external-encoding',
      '--internal-encoding',
      '--parser',
    ]),
  ],
]);

const PYTHON_HASH_PYC_MODES = new Set(['always', 'default', 'never']);
const RUBY_DASH_VALUE_FLAGS = new Set([
  '--backtrace-limit',
  '--crash-report',
  '--disable',
  '--enable',
]);
const INTERPRETER_SHELL_CONTINUATION = /\\\r?\n/g;

/** @internal */
export type InterpreterExecutableSourceKind = 'inline-code' | 'main-script' | 'module-file';

export interface InterpreterExecutableSource {
  readonly tokenIndex: number;
  readonly kind: InterpreterExecutableSourceKind;
  readonly value: string;
}

/** @internal */
export type ExecutableSourceSelectorValueForm =
  | 'attached-only'
  | 'attached-or-separate'
  | 'equals-or-separate'
  | 'separate-only';

export interface InterpreterExecutableSourceSelector {
  readonly selector: string;
  readonly kind: InterpreterExecutableSourceKind;
  readonly valueForm: ExecutableSourceSelectorValueForm;
}

export interface InterpreterArgvMetadata {
  readonly code: string | null;
  readonly sources: readonly InterpreterExecutableSource[];
  readonly optionsOpen: boolean;
}

const INTERPRETER_EXECUTABLE_SOURCE_SELECTORS = new Map<
  string,
  readonly InterpreterExecutableSourceSelector[]
>([
  [
    'python',
    [
      { selector: '-c', kind: 'inline-code', valueForm: 'attached-or-separate' },
      { selector: '-m', kind: 'module-file', valueForm: 'attached-or-separate' },
    ],
  ],
  [
    'node',
    [
      { selector: '-e', kind: 'inline-code', valueForm: 'separate-only' },
      { selector: '--eval', kind: 'inline-code', valueForm: 'equals-or-separate' },
      { selector: '-p', kind: 'inline-code', valueForm: 'separate-only' },
      { selector: '--print', kind: 'inline-code', valueForm: 'separate-only' },
      { selector: '-r', kind: 'module-file', valueForm: 'separate-only' },
      { selector: '--require', kind: 'module-file', valueForm: 'equals-or-separate' },
      { selector: '--import', kind: 'module-file', valueForm: 'equals-or-separate' },
      { selector: '--loader', kind: 'module-file', valueForm: 'equals-or-separate' },
      {
        selector: '--experimental-loader',
        kind: 'module-file',
        valueForm: 'equals-or-separate',
      },
    ],
  ],
  [
    'ruby',
    [
      { selector: '-e', kind: 'inline-code', valueForm: 'attached-or-separate' },
      { selector: '-r', kind: 'module-file', valueForm: 'attached-or-separate' },
    ],
  ],
  [
    'perl',
    [
      { selector: '-e', kind: 'inline-code', valueForm: 'attached-or-separate' },
      { selector: '-E', kind: 'inline-code', valueForm: 'attached-or-separate' },
      { selector: '-M', kind: 'module-file', valueForm: 'attached-only' },
      { selector: '-m', kind: 'module-file', valueForm: 'attached-only' },
    ],
  ],
]);

export function extractInterpreterCodeArg(tokens: readonly string[]): string | null {
  return parseInterpreterArgv(tokens).code;
}

export function extractInterpreterExecutableSources(
  tokens: readonly string[],
): readonly InterpreterExecutableSource[] {
  return parseInterpreterArgv(tokens).sources;
}

export function getInterpreterExecutableSourceSelectors(
  command: string,
): readonly InterpreterExecutableSourceSelector[] {
  return INTERPRETER_EXECUTABLE_SOURCE_SELECTORS.get(normalizeInterpreter(command)) ?? [];
}

export function parseInterpreterArgv(tokens: readonly string[]): InterpreterArgvMetadata {
  const interpreter = normalizeInterpreter(tokens[0] ?? '');

  if (!CODE_FLAGS.has(interpreter)) return { code: null, sources: [], optionsOpen: false };

  const codeArgs: { tokenIndex: number; value: string }[] = [];
  const sources: InterpreterExecutableSource[] = [];
  let executableSourcesValid = true;

  for (let i = 1; i < tokens.length; i++) {
    const token = tokens[i];
    if (token === undefined) break;
    if (token === '--') {
      return finishInterpreterArgv(
        interpreter,
        codeArgs,
        sources,
        executableSourcesValid,
        tokens[i + 1] === undefined ? undefined : i + 1,
        tokens[i + 1],
      );
    }
    if (token === '' || token === '-' || !token.startsWith('-')) {
      return finishInterpreterArgv(
        interpreter,
        codeArgs,
        sources,
        executableSourcesValid,
        i,
        token,
      );
    }

    if (interpreter === 'node' && NODE_PRINT_FLAGS.has(token)) {
      const code = tokens[i + 1];
      if (code === undefined) {
        return finishInterpreterArgv(interpreter, codeArgs, sources, executableSourcesValid);
      }
      if (code.startsWith('-')) continue;
      codeArgs.push({ tokenIndex: i + 1, value: code });
      sources.push({ tokenIndex: i + 1, kind: 'inline-code', value: code });
      i++;
      continue;
    }

    if (isInterpreterCodeFlag(interpreter, token)) {
      const code = tokens[i + 1];
      if (code === undefined) {
        return finishInterpreterArgv(interpreter, codeArgs, sources, executableSourcesValid);
      }
      codeArgs.push({ tokenIndex: i + 1, value: code });
      sources.push({ tokenIndex: i + 1, kind: 'inline-code', value: code });
      if (interpreter === 'python') {
        return finishInterpreterArgv(interpreter, codeArgs, sources, executableSourcesValid);
      }
      i++;
      continue;
    }

    const inlineEval = /^--eval=(.*)$/s.exec(token);
    if (supportsInlineEval(interpreter) && inlineEval) {
      const code = inlineEval[1] ?? '';
      codeArgs.push({ tokenIndex: i, value: code });
      sources.push({ tokenIndex: i, kind: 'inline-code', value: code });
      continue;
    }

    if (interpreter === 'node') {
      const loader = extractNodeLongLoader(token);
      if (loader) {
        if (loader.attached) {
          executableSourcesValid &&= loader.value !== '';
          if (loader.value !== '') {
            sources.push({ tokenIndex: i, kind: 'module-file', value: loader.value });
          }
          continue;
        }
        const value = tokens[i + 1];
        if (value === undefined || value.startsWith('-')) {
          executableSourcesValid = false;
          return finishInterpreterArgv(interpreter, codeArgs, sources, executableSourcesValid);
        }
        sources.push({ tokenIndex: i + 1, kind: 'module-file', value });
        i++;
        continue;
      }
    }

    if (
      (interpreter === 'python' && token.startsWith('--check-hash-based-pycs=')) ||
      (interpreter === 'node' &&
        (token === '--conditions=' || token === '--diagnostic-dir=' || token === '--title=')) ||
      (interpreter === 'ruby' && (token === '--disable=' || token === '--enable='))
    ) {
      return finishInterpreterArgv(interpreter, codeArgs, sources, executableSourcesValid);
    }

    if (LONG_VALUE_FLAGS.get(interpreter)?.has(token)) {
      const value = tokens[i + 1];
      if (
        value === undefined ||
        (value.startsWith('-') && !(interpreter === 'ruby' && RUBY_DASH_VALUE_FLAGS.has(token))) ||
        (interpreter === 'python' && !PYTHON_HASH_PYC_MODES.has(value))
      ) {
        return finishInterpreterArgv(interpreter, codeArgs, sources, executableSourcesValid);
      }
      i++;
      continue;
    }
    if (token.startsWith('--')) continue;

    let codeArg: string | undefined;
    let consumesNext = false;
    for (let optionIndex = 1; optionIndex < token.length; optionIndex++) {
      const option = token[optionIndex];
      if (option === undefined) break;
      if (PROGRAM_FLAGS.get(interpreter)?.has(option)) {
        const attached = token.slice(optionIndex + 1);
        const value = attached || tokens[i + 1];
        if (value !== undefined) {
          sources.push({
            tokenIndex: attached ? i : i + 1,
            kind: 'module-file',
            value,
          });
        }
        return finishInterpreterArgv(interpreter, codeArgs, sources, executableSourcesValid);
      }
      if (CLUSTERED_CODE_FLAGS.get(interpreter)?.has(option)) {
        // For node/python/ruby/perl, everything after the code flag in the same token is code.
        codeArg = token.slice(optionIndex + 1) || tokens[i + 1];
        consumesNext = optionIndex + 1 === token.length;
        break;
      }
      if (interpreter === 'node' && option === 'r') {
        executableSourcesValid &&= token === '-r';
        if (token === '-r') {
          const value = tokens[i + 1];
          executableSourcesValid &&= value !== undefined && !value.startsWith('-');
          if (executableSourcesValid && value !== undefined) {
            sources.push({ tokenIndex: i + 1, kind: 'module-file', value });
          }
          i++;
        }
        break;
      }
      if (interpreter === 'ruby' && option === 'r') {
        const attached = token.slice(optionIndex + 1);
        const value = attached || tokens[i + 1];
        executableSourcesValid &&= value !== undefined;
        if (value !== undefined) {
          sources.push({
            tokenIndex: attached ? i : i + 1,
            kind: 'module-file',
            value,
          });
        }
        if (!attached) i++;
        break;
      }
      if (interpreter === 'perl' && (option === 'M' || option === 'm')) {
        const value = token.slice(optionIndex + 1);
        if (!value) {
          executableSourcesValid = false;
          if (optionIndex + 1 === token.length) i++;
          break;
        }
        sources.push({ tokenIndex: i, kind: 'module-file', value });
        break;
      }
      if (SHORT_VALUE_FLAGS.get(interpreter)?.has(option)) {
        if (optionIndex + 1 === token.length) i++;
        break;
      }
      if (ATTACHED_VALUE_FLAGS.get(interpreter)?.has(option) && optionIndex + 1 < token.length) {
        break;
      }
    }
    if (codeArg === undefined) continue;
    const tokenIndex = consumesNext ? i + 1 : i;
    codeArgs.push({ tokenIndex, value: codeArg });
    sources.push({ tokenIndex, kind: 'inline-code', value: codeArg });
    if (interpreter === 'python') {
      return finishInterpreterArgv(interpreter, codeArgs, sources, executableSourcesValid);
    }
    if (consumesNext) i++;
  }
  return finishInterpreterArgv(
    interpreter,
    codeArgs,
    sources,
    executableSourcesValid,
    undefined,
    undefined,
    true,
  );
}

function finishInterpreterArgv(
  interpreter: string,
  codeArgs: readonly { tokenIndex: number; value: string }[],
  sources: readonly InterpreterExecutableSource[],
  executableSourcesValid: boolean,
  mainScriptIndex?: number,
  mainScript?: string,
  optionsOpen = false,
): InterpreterArgvMetadata {
  const effectiveCodeArgs = interpreter === 'node' ? codeArgs.slice(-1) : codeArgs;
  const effectiveCodeIndexes = new Set(effectiveCodeArgs.map((codeArg) => codeArg.tokenIndex));
  const executableSources = sources.filter(
    (source) => source.kind !== 'inline-code' || effectiveCodeIndexes.has(source.tokenIndex),
  );
  if (
    executableSourcesValid &&
    codeArgs.length === 0 &&
    mainScriptIndex !== undefined &&
    mainScript !== undefined
  ) {
    executableSources.push({
      tokenIndex: mainScriptIndex,
      kind: 'main-script',
      value: mainScript,
    });
  }
  return {
    code:
      (interpreter === 'node'
        ? effectiveCodeArgs[0]?.value
        : effectiveCodeArgs.map((codeArg) => codeArg.value).join('\n')) || null,
    sources: executableSourcesValid ? executableSources : [],
    optionsOpen: executableSourcesValid && optionsOpen,
  };
}

function extractNodeLongLoader(token: string): { attached: boolean; value: string } | undefined {
  for (const option of ['--import', '--loader', '--experimental-loader', '--require'] as const) {
    if (token === option) return { attached: false, value: '' };
    if (token.startsWith(`${option}=`)) {
      return { attached: true, value: token.slice(option.length + 1) };
    }
  }
  return undefined;
}

export function isInterpreterDisplayOnly(command: string, code: string): boolean {
  return (
    normalizeInterpreter(command) === 'node' &&
    /^\s*console\.(?:log|info|warn|error)\(\s*(?:"(?:\\.|[^"\\\r\n])*"|'(?:\\.|[^'\\\r\n])*')\s*\)\s*;?\s*$/.test(
      code,
    )
  );
}

function normalizeInterpreter(command: string): string {
  const interpreter = getBasename(command).toLowerCase();
  return PYTHON_INTERPRETER_PATTERN.test(interpreter) ? 'python' : interpreter;
}

function isInterpreterCodeFlag(interpreter: string, token: string): boolean {
  return CODE_FLAGS.get(interpreter)?.has(token) ?? false;
}

function supportsInlineEval(interpreter: string): boolean {
  return CODE_FLAGS.get(interpreter)?.has('--eval') ?? false;
}

export function containsDangerousCode(code: string, scanWork?: { units: number }): boolean {
  const executableCode = collapseInterpreterShellContinuations(code, scanWork);
  if (!interpreterCodeHasDangerousText(executableCode, scanWork)) return false;
  // A match confined to string literals is inert data unless the code can hand
  // it to a shell: rescan with literals stripped, then look for an exec sink.
  chargeNativeLinearPass(scanWork, executableCode);
  const strippedCode = stripStringLiterals(executableCode);
  if (interpreterCodeHasDangerousText(strippedCode, scanWork)) return true;
  chargeNativeLinearPass(scanWork, strippedCode);
  return INTERPRETER_EXEC_SINK.test(strippedCode);
}

const INTERPRETER_EXEC_SINK =
  /`|%x|\b(?:system|exec|spawn|popen|subprocess|child_process|open3|eval|fork|qx)/i;

function stripStringLiterals(code: string): string {
  const parts: string[] = [];
  let plainStart = 0;
  let i = 0;
  while (i < code.length) {
    const quote = code[i];
    if (quote !== "'" && quote !== '"') {
      i++;
      continue;
    }
    const delimiter = code.startsWith(quote.repeat(3), i) ? quote.repeat(3) : quote;
    let end = i + delimiter.length;
    while (end < code.length && !code.startsWith(delimiter, end)) {
      end += code[end] === '\\' ? 2 : 1;
    }
    // Unterminated literal: keep the tail so the conservative scan still sees it.
    if (end >= code.length) break;
    parts.push(code.slice(plainStart, i), ' ');
    i = end + delimiter.length;
    plainStart = i;
  }
  parts.push(code.slice(plainStart));
  return parts.join('');
}

function interpreterCodeHasDangerousText(
  executableCode: string,
  scanWork?: { units: number },
): boolean {
  if (hasLinearInterpreterDanger(executableCode, 'rm', scanWork)) return true;
  for (const pattern of [
    /\bgit[^\S\n]+checkout[^\S\n]+--[^\S\n]/,
    /\bgit[^\S\n]+stash[^\S\n]+(drop|clear)\b/,
  ]) {
    chargeNativeLinearPass(scanWork, executableCode);
    if (pattern.test(executableCode)) {
      return true;
    }
  }
  if (hasLinearInterpreterDanger(executableCode, 'dd', scanWork)) return true;
  for (const pattern of [/\bmkfs(?:\.[A-Za-z0-9_-]+)?\s+\/dev\/[^\s'"]+/, /\bshred\b\s+/]) {
    chargeNativeLinearPass(scanWork, executableCode);
    if (pattern.test(executableCode)) return true;
  }
  if (hasLinearInterpreterDanger(executableCode, 'find', scanWork)) return true;

  const lines = executableCode.split(/[\n\r\u2028\u2029]/);
  return (
    [
      'reset-hard',
      'reset-merge',
      'clean',
      'checkout',
      'push-force',
      'push-refspec',
      'push-delete',
      'branch',
      'tag',
      'restore',
    ] as const
  ).some((kind) => {
    chargeNativeLinearPass(scanWork, executableCode);
    return lines.some((line) => hasLinearDangerousText(line, kind));
  });
}

function collapseInterpreterShellContinuations(code: string, scanWork?: { units: number }): string {
  chargeNativeLinearPass(scanWork, code);
  return code.replace(INTERPRETER_SHELL_CONTINUATION, '');
}
