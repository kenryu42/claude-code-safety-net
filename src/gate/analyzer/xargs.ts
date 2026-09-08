import { filterDestructiveCommandMatch } from '@/core/policy/effective-rules';
import { isInterpreterCommand } from '@/core/policy/transparent-wrappers';
import { AWK_INTERPRETERS, SHELL_WRAPPERS } from '@/core/rules/constants';
import { checkPolicyRuleMatch } from '@/core/rules/custom';
import { destructiveCommandMatch } from '@/core/rules/destructive';
import type { DestructiveCommandRuleMatch, PolicyRule } from '@/core/rules/types';
import type { CommandWord } from '@/core/shell/model';
import type { AnalyzeNestedOverrides, EnvironmentContext } from '@/gate/analysis';
import { AWK_EXECUTABLE_SOURCE_SELECTORS, parseAwkArgv } from './awk';
import { analyzeChildCommandMatch } from './child-analyzer';
import { type NestedCommandAnalyzeContext, normalizeChildCommands } from './child-command';
import { analysisWordText, textCommandWords } from './command-words';
import { dangerousInTextMatch } from './dangerous-text';
import { getFindExecCommand, getFindPrimaryArity, isFindExecPrimary } from './find';
import { extractGitSubcommandAndRest } from './git/parse';
import { GIT_RULE_SUBCOMMANDS } from './git/rules';
import { getInterpreterExecutableSourceSelectors, parseInterpreterArgv } from './interpreters';
import {
  extractEvalSource,
  extractShellScriptOperandSource,
  shellSourceHasDynamicExecutionCarrier,
} from './shell-execution';
import { extractDashCArg, isShellSyntaxCheck, parseShellArgv } from './shell-wrappers';

export const REASON_XARGS_RM =
  'xargs rm -rf with dynamic input is dangerous. Use explicit file list instead.';
export const REASON_XARGS_SHELL =
  'xargs dynamic input can supply arbitrary executable command source. Use an explicit child command and arguments instead.';
const XARGS_APPENDED_INPUT = '__CC_SAFETY_NET_XARGS_INPUT__';
const XARGS_INTERPRETER_INPUT = '__CC_SAFETY_NET_XARGS_INTERPRETER_INPUT__';
const XARGS_DYNAMIC_WRAPPER_CHILD = 'rm';
const EXECUTED_SHELL_EXPANSION_RE =
  /(?:^|[;&|]\s*|\b(?:eval|source)\s+|\b(?:ba|da|z|k)?sh\s+-c\s+)\s*["']?\$(?:([0-9]+|[@*]|[A-Za-z_][A-Za-z0-9_]*)|\{!?([0-9]+|[@*]|[A-Za-z_][A-Za-z0-9_]*)(?:[^}]*)\})/g;
const EVAL_SHELL_SOURCE_RE =
  /(?:^|[;&|]\s*)\s*eval\b((?:\\.|"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|[^\\'";&|\r\n])*)/g;
const SHELL_EXPANSION_RE =
  /\$(?:([0-9]+|[@*]|[A-Za-z_][A-Za-z0-9_]*)|\{!?([0-9]+|[@*]|[A-Za-z_][A-Za-z0-9_]*)(?:[^}]*)\})/g;
const POSITIONAL_SHELL_PARAMETER_RE = /^(?:[0-9]+|[@*])$/;

export interface XargsAnalyzeContext extends NestedCommandAnalyzeContext {
  analyzeNested: (
    command: string,
    overrides?: AnalyzeNestedOverrides,
  ) => DestructiveCommandRuleMatch | null;
}

export function analyzeXargs(
  words: readonly CommandWord[],
  context: XargsAnalyzeContext,
): DestructiveCommandRuleMatch | null {
  // xargs options, the replacement token and the child command all match on text only.
  const tokens = words.map(analysisWordText);
  const { childStart, replacementToken } = extractXargsChildCommandWithInfo(tokens);
  const rawChildTokens = tokens.slice(childStart);
  const shellDynamicMatch = destructiveCommandMatch('xargs.shell-dynamic', REASON_XARGS_SHELL);
  if (
    xargsInputCanSupplyWrapperChild(rawChildTokens, replacementToken, context) &&
    filterDestructiveCommandMatch(shellDynamicMatch, context.policy)
  ) {
    return filterDestructiveCommandMatch(shellDynamicMatch, context.policy);
  }

  for (const childCommand of normalizeChildCommands(rawChildTokens, context)) {
    const childTokens = childCommand.tokens;
    const dynamicExecutableResult =
      replacementToken !== null &&
      childTokens[0] !== rawChildTokens[0] &&
      (childTokens[0]?.includes(replacementToken) ?? false)
        ? filterDestructiveCommandMatch(shellDynamicMatch, context.policy)
        : null;
    if (dynamicExecutableResult) return dynamicExecutableResult;

    const dynamicInput = xargsInputIsDynamic(
      childTokens,
      replacementToken,
      childCommand.wrapperEnvAssignments,
    );
    const dynamicRmInput =
      childCommand.head === 'rm' &&
      replacementToken !== null &&
      replacementCanChangeRmOptions(childTokens, replacementToken);
    const childResult = analyzeChildCommandMatch(
      childTokens,
      {
        ...context,
        cwd: childCommand.cwd,
        envAssignments: childCommand.envAssignments,
      },
      {
        dynamicInput,
        dynamicSourceInput:
          dynamicRmInput ||
          xargsInputCanChangeExecutedSource(
            childTokens,
            childCommand.head,
            replacementToken,
            childCommand.wrapperEnvAssignments,
            dynamicInput,
            context.scanWork,
            context.environment,
          ),
        dynamicRmInput,
        shellDynamicMatch,
        dynamicSourceMatch: shellDynamicMatch,
        rmDynamicMatch: destructiveCommandMatch(
          'xargs.rm-recursive-force-dynamic',
          REASON_XARGS_RM,
        ),
      },
    );
    if (childResult) return childResult;

    const dynamicCustomResult = matchDynamicPolicyRule(
      childTokens,
      replacementToken,
      context.policy?.rules ?? [],
    );
    if (dynamicCustomResult) return dynamicCustomResult;

    if (childCommand.head === 'git') {
      const gitTokens =
        replacementToken === null ? [...childTokens, XARGS_APPENDED_INPUT] : childTokens;
      const hasDynamicReplacement =
        replacementToken !== null &&
        (childTokens.some((token) => token.includes(replacementToken)) ||
          Array.from(childCommand.envAssignments.values()).some((value) =>
            value.includes(replacementToken),
          ));
      const gitResult = analyzeChildCommandMatch(gitTokens, {
        ...context,
        cwd: childCommand.cwd,
        envAssignments: childCommand.envAssignments,
        worktreeMode:
          replacementToken === null || hasDynamicReplacement ? false : context.worktreeMode,
      });
      if (gitResult) return gitResult;
    }

    const customResult = checkPolicyRuleMatch(childTokens, context.policy?.rules ?? []);
    if (customResult) return customResult;
  }

  return null;
}

function matchDynamicPolicyRule(
  tokens: readonly string[],
  replacementToken: string | null,
  rules: readonly PolicyRule[],
): DestructiveCommandRuleMatch | null {
  if (rules.length === 0) return null;
  if (replacementToken === null) {
    for (const rule of rules) {
      const result = checkPolicyRuleMatch(
        [...tokens, ...(rule.subcommand ? [rule.subcommand] : []), ...rule.block_args],
        rules,
      );
      if (result) return result;
    }
    return null;
  }

  const values = new Set(
    rules.flatMap((rule) =>
      [rule.subcommand, ...rule.block_args].flatMap((target) =>
        target
          ? tokens.flatMap((token) => replacementValuesThatProduce(token, replacementToken, target))
          : [],
      ),
    ),
  );
  for (const value of values) {
    const result = checkPolicyRuleMatch(
      tokens.map((token) => token.replaceAll(replacementToken, value)),
      rules,
    );
    if (result) return result;
  }
  return null;
}

function replacementValuesThatProduce(
  token: string,
  replacementToken: string,
  target: string,
): string[] {
  const first = token.indexOf(replacementToken);
  if (first === -1 || token.indexOf(replacementToken, first + replacementToken.length) !== -1) {
    return [];
  }
  const prefix = token.slice(0, first);
  const suffix = token.slice(first + replacementToken.length);
  return target.startsWith(prefix) && target.endsWith(suffix)
    ? [target.slice(prefix.length, target.length - suffix.length)]
    : [];
}

function xargsInputCanChangeExecutedSource(
  childTokens: readonly string[],
  childHead: string,
  replacementToken: string | null,
  wrapperEnvAssignments: ReadonlyMap<string, string>,
  dynamicInput: boolean,
  scanWork: { units: number } | undefined,
  environment: EnvironmentContext,
): boolean {
  if (SHELL_WRAPPERS.has(childHead)) {
    if (isShellSyntaxCheck(childTokens)) return false;
    if (
      replacementToken !== null &&
      shellArgvTokensCanSelectExecutableSource(childTokens, replacementToken)
    ) {
      return true;
    }
    const source = extractDashCArg(childTokens);
    if (!source) {
      const scriptSource = extractShellScriptOperandSource(textCommandWords(childTokens));
      if (scriptSource.kind === 'literal') {
        return replacementToken !== null && scriptSource.source.includes(replacementToken);
      }
      return scriptSource.kind === 'none' && dynamicInput;
    }
    if (replacementToken !== null && source.includes(replacementToken)) return true;
    if (dangerousInTextMatch(source, scanWork)) return true;
    return shellSourceExecutesDynamicInput(source, replacementToken, wrapperEnvAssignments);
  }

  if (isInterpreterCommand(childHead)) {
    return executableSourceInputCanChange(
      childTokens,
      replacementToken,
      parseInterpreterArgv,
      getInterpreterExecutableSourceSelectors(childHead),
    );
  }

  if (AWK_INTERPRETERS.has(childHead)) {
    return executableSourceInputCanChange(
      childTokens,
      replacementToken,
      parseAwkArgv,
      AWK_EXECUTABLE_SOURCE_SELECTORS,
    );
  }

  if (childHead === 'eval') {
    const source = extractEvalSource(textCommandWords(childTokens));
    if (source.kind === 'dynamic') return true;
    if (replacementToken !== null) {
      return source.kind === 'literal' && source.source.includes(replacementToken);
    }
    return dynamicInput;
  }

  if (childHead === 'find') {
    return findInputCanChangeExecutedSource(childTokens, replacementToken, scanWork, environment);
  }

  if (childHead === 'git') {
    const parsed = extractGitSubcommandAndRest(childTokens);
    return replacementToken === null
      ? parsed.subcommand === null
      : (parsed.subcommand?.includes(replacementToken) ?? false) ||
          (parsed.subcommand !== null &&
            GIT_RULE_SUBCOMMANDS.has(parsed.subcommand.toLowerCase()) &&
            tokensBeforeStableOptionTerminator(parsed.rest, replacementToken).some((token) =>
              token.includes(replacementToken),
            ));
  }

  return false;
}

function executableSourceInputCanChange<
  T extends {
    sources: readonly { kind: string; tokenIndex: number; value: string }[];
    optionsOpen: boolean;
  },
>(
  tokens: readonly string[],
  replacementToken: string | null,
  parse: (tokens: readonly string[]) => T,
  selectors: readonly {
    selector: string;
    valueForm: 'attached-only' | 'attached-or-separate' | 'equals-or-separate' | 'separate-only';
  }[],
): boolean {
  const parsed = parse(tokens);
  if (replacementToken === null) {
    return (
      parsed.optionsOpen ||
      parse([...tokens, XARGS_INTERPRETER_INPUT]).sources.some(
        (source) => source.value === XARGS_INTERPRETER_INPUT,
      )
    );
  }
  if (parsed.sources.some((source) => source.value.includes(replacementToken))) return true;

  const existingSources = new Set(
    parsed.sources.map((source) => `${source.tokenIndex}\0${source.kind}\0${source.value}`),
  );
  const targets = selectors.flatMap((source) => [
    source.selector,
    ...(source.valueForm === 'attached-only' || source.valueForm === 'attached-or-separate'
      ? [`${source.selector}${XARGS_INTERPRETER_INPUT}`]
      : []),
    ...(source.valueForm === 'equals-or-separate'
      ? [`${source.selector}=${XARGS_INTERPRETER_INPUT}`]
      : []),
  ]);
  const candidates = new Set(
    targets.flatMap((target) =>
      tokens.flatMap((token) => replacementValuesThatProduce(token, replacementToken, target)),
    ),
  );
  return Array.from(candidates).some((candidate) =>
    parse(tokens.map((token) => token.replaceAll(replacementToken, candidate))).sources.some(
      (source) => !existingSources.has(`${source.tokenIndex}\0${source.kind}\0${source.value}`),
    ),
  );
}

function xargsInputCanSupplyWrapperChild(
  tokens: readonly string[],
  replacementToken: string | null,
  context: XargsAnalyzeContext,
): boolean {
  if (tokens.length === 0 || (tokens[0] ?? '').toLowerCase() === 'command') return false;
  const originalHeads = new Set(
    Array.from(normalizeChildCommands(tokens, context), (child) => child.head),
  );
  const candidateTokens =
    replacementToken === null
      ? [...tokens, XARGS_DYNAMIC_WRAPPER_CHILD]
      : tokens.map((token, index) =>
          index === 0 ? token : token.replaceAll(replacementToken, XARGS_DYNAMIC_WRAPPER_CHILD),
        );
  return Array.from(normalizeChildCommands(candidateTokens, context)).some(
    (child) =>
      child.head === XARGS_DYNAMIC_WRAPPER_CHILD && !originalHeads.has(XARGS_DYNAMIC_WRAPPER_CHILD),
  );
}

function replacementCanChangeRmOptions(
  tokens: readonly string[],
  replacementToken: string,
): boolean {
  return tokensBeforeStableOptionTerminator(tokens.slice(1), replacementToken).some(
    (token) =>
      token.includes(replacementToken) &&
      (token.startsWith('-') || token.startsWith(replacementToken)),
  );
}

function tokensBeforeStableOptionTerminator(
  tokens: readonly string[],
  replacementToken: string,
): readonly string[] {
  const index = tokens.findIndex((token) => token === '--' && !token.includes(replacementToken));
  return index === -1 ? tokens : tokens.slice(0, index);
}

function xargsInputIsDynamic(
  childTokens: readonly string[],
  replacementToken: string | null,
  wrapperEnvAssignments: ReadonlyMap<string, string>,
): boolean {
  if (replacementToken === null) return true;
  return (
    childTokens.some((token) => token.includes(replacementToken)) ||
    Array.from(wrapperEnvAssignments.values()).some((value) => value.includes(replacementToken))
  );
}

function shellArgvTokensCanSelectExecutableSource(
  tokens: readonly string[],
  replacementToken: string,
): boolean {
  const baseline = parseShellArgv(tokens);
  if (
    (baseline.commandIndex !== null &&
      (tokens[baseline.commandIndex] ?? '').includes(replacementToken)) ||
    (baseline.scriptIndex !== null &&
      (tokens[baseline.scriptIndex] ?? '').includes(replacementToken))
  ) {
    return true;
  }

  const targets = ['-c', '-nc', '-cn', `--${replacementToken}`, replacementToken];
  return targets.some((target) =>
    tokens.some((token, tokenIndex) => {
      if (tokenIndex === 0 || !token.includes(replacementToken)) return false;
      const candidates = replacementValuesThatProduce(token, replacementToken, target);
      return candidates.some((candidate) => {
        const replaced = tokens.map((value, index) =>
          index === tokenIndex ? value.replaceAll(replacementToken, candidate) : value,
        );
        const parsed = parseShellArgv(replaced);
        if (parsed.commandIndex === null && parsed.scriptIndex === null) return false;
        if (baseline.commandIndex === null && parsed.commandIndex !== null) return true;
        if (baseline.scriptIndex === null && parsed.scriptIndex !== null) return true;
        if (
          parsed.commandIndex !== null &&
          (replaced[parsed.commandIndex] ?? '').includes(candidate)
        ) {
          return true;
        }
        return (
          parsed.scriptIndex !== null && (replaced[parsed.scriptIndex] ?? '').includes(candidate)
        );
      });
    }),
  );
}

function shellSourceExecutesDynamicInput(
  source: string,
  replacementToken: string | null,
  wrapperEnvAssignments: ReadonlyMap<string, string>,
): boolean {
  const dynamicEnvNames = new Set(
    replacementToken === null
      ? []
      : Array.from(wrapperEnvAssignments)
          .filter(([, value]) => value.includes(replacementToken))
          .map(([name]) => name),
  );

  for (const match of source.matchAll(EXECUTED_SHELL_EXPANSION_RE)) {
    if (isDynamicShellParameter(match, dynamicEnvNames)) return true;
  }
  for (const evalMatch of source.matchAll(EVAL_SHELL_SOURCE_RE)) {
    for (const match of (evalMatch[1] ?? '').matchAll(SHELL_EXPANSION_RE)) {
      if (isDynamicShellParameter(match, dynamicEnvNames)) return true;
    }
  }
  return shellSourceHasDynamicExecutionCarrier(source, dynamicEnvNames);
}

function isDynamicShellParameter(
  match: RegExpMatchArray,
  dynamicEnvNames: ReadonlySet<string>,
): boolean {
  const parameter = match[1] ?? match[2];
  return (
    parameter !== undefined &&
    (POSITIONAL_SHELL_PARAMETER_RE.test(parameter) || dynamicEnvNames.has(parameter))
  );
}

function findInputCanChangeExecutedSource(
  childTokens: readonly string[],
  replacementToken: string | null,
  scanWork: { units: number } | undefined,
  environment: EnvironmentContext,
): boolean {
  // Appended stdin can always extend a find expression (-delete, -exec, etc.).
  if (replacementToken === null) return true;

  let inExpression = false;
  let expressionDataArgs = 0;

  for (let index = 1; index < childTokens.length; index++) {
    const token = childTokens[index] ?? '';
    if (!inExpression && !token.startsWith('-') && token !== '!' && token !== '(') {
      if (token.indexOf(replacementToken) === 0) {
        return true;
      }
      continue;
    }
    inExpression = true;

    if (expressionDataArgs > 0) {
      expressionDataArgs--;
      continue;
    }

    if (isFindExecPrimary(token)) {
      const execCommand = getFindExecCommand(childTokens, index);
      index = execCommand.nextIndex - 1;
      for (const childCommand of normalizeChildCommands(execCommand.tokens, {
        environment,
        cwd: undefined,
      })) {
        const dynamicInput = xargsInputIsDynamic(
          childCommand.tokens,
          replacementToken,
          childCommand.wrapperEnvAssignments,
        );
        if (
          (childCommand.head === 'rm' &&
            replacementCanChangeRmOptions(childCommand.tokens, replacementToken)) ||
          xargsInputCanChangeExecutedSource(
            childCommand.tokens,
            childCommand.head,
            replacementToken,
            childCommand.wrapperEnvAssignments,
            dynamicInput,
            scanWork,
            environment,
          )
        ) {
          return true;
        }
      }
      continue;
    }

    const arity = getFindPrimaryArity(token);
    if (arity > 0) {
      expressionDataArgs = arity;
      if (token.includes(replacementToken)) return true;
      continue;
    }

    if (token.includes(replacementToken)) return true;
  }

  return false;
}

interface XargsParseResult {
  /** Index the child command starts at, so word-based callers can slice the same position. */
  childStart: number;
  replacementToken: string | null;
}

export function extractXargsChildCommandWithInfo(tokens: readonly string[]): XargsParseResult {
  // Options that take a value as the next token
  const xargsOptsWithValue = new Set([
    '-L',
    '-n',
    '-P',
    '-s',
    '-a',
    '-E',
    '-R',
    '-S',
    '-e',
    '-d',
    '-J',
    '--max-args',
    '--max-procs',
    '--max-chars',
    '--arg-file',
    '--eof',
    '--delimiter',
    '--max-lines',
    '--process-slot-var',
  ]);

  let replacementToken: string | null = null;
  let i = 1;

  while (i < tokens.length) {
    const token = tokens[i];
    if (!token) break;

    if (token === '--') {
      return { childStart: i + 1, replacementToken };
    }

    if (!token.startsWith('-')) {
      return { childStart: i, replacementToken };
    }

    // Handle -I (replacement option)
    if (token === '-I') {
      // -I TOKEN - next arg is the token
      replacementToken = (tokens[i + 1] as string | undefined) ?? '{}';
      i += 2;
      continue;
    }
    if (token.startsWith('-I') && token.length > 2) {
      // -ITOKEN - token is attached
      replacementToken = token.slice(2);
      i++;
      continue;
    }

    // Handle --replace option
    // In GNU xargs, --replace takes an optional argument via =
    // --replace alone uses {}, --replace=FOO uses FOO
    if (token === '--replace') {
      // --replace (defaults to {})
      replacementToken = '{}';
      i++;
      continue;
    }
    if (token.startsWith('--replace=')) {
      // --replace=TOKEN or --replace= (empty defaults to {})
      const value = token.slice('--replace='.length);
      replacementToken = value === '' ? '{}' : value;
      i++;
      continue;
    }

    // Handle -J (macOS xargs replacement, consumes value)
    if (token === '-J') {
      replacementToken = (tokens[i + 1] as string | undefined) ?? '{}';
      i += 2;
      continue;
    }

    // Attached-value options like -n5 or --opt=v and unknown options occupy one token.
    i += xargsOptsWithValue.has(token) ? 2 : 1;
  }

  // No child command: the scan ran out of tokens, or stopped on an empty one.
  return { childStart: tokens.length, replacementToken };
}
