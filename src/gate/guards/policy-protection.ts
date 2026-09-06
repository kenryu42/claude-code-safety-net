import { dirname } from 'node:path';
import { type Budget, createBudget } from '@/core/budget';
import {
  normalizeProtectedFileCandidate,
  normalizeProtectedPathCandidate,
} from '@/core/paths/canonicalization';
import { getProjectPolicyPath, getUserPolicyPath, POLICY_FILE } from '@/core/policy/paths';
import type { ShellSyntaxFacts } from '@/core/shell/projection';
import { getBasename } from '@/core/shell/tokens';
import { isReadOnlyTool } from '@/core/tool-input';
import type { EnvironmentContext } from '@/gate/analysis';
import { textCommandWords } from '@/gate/analyzer/command-words';
import {
  findExecRmDeletesFoundPaths,
  findHasDelete,
  getFindStartingPoints,
} from '@/gate/analyzer/find';
import { stripWrappersForPathScan } from '@/gate/analyzer/wrapper-prelude';
import type { SemanticFacts } from '@/gate/facts';
import { createToolInvocation, type ToolCallContext, type ToolRoute } from '@/gate/invocation';
import {
  expandTrackedShellVariables,
  extractMvOperandPaths,
  findProtectedPathMutationInCommand,
  isAssignmentOnlySegment,
  type ProtectedPathShellState,
} from './protected-path-scanner';
import { createSemanticFacts, getCommandSyntaxFact } from './semantic-facts';

export const REASON_POLICY_CONFIG_PROTECTION =
  'This path contains the protected policy config and you must not modify or delete it.';

const READ_ONLY_COMMANDS = new Set([
  '[',
  'cat',
  'file',
  'grep',
  'head',
  'jq',
  'less',
  'ls',
  'more',
  'rg',
  'sed',
  'stat',
  'tail',
  'test',
  'wc',
]);
type PolicyConfigTarget = {
  readonly target: string;
};

type PolicyPathIdentity = {
  readonly files: ReadonlySet<string>;
  readonly directoriesAndAncestors: ReadonlySet<string>;
};

/** @internal */
export function findPolicyConfigMutationTargetInToolInput(
  toolName: string,
  input: unknown,
  route: ToolRoute,
  context: ToolCallContext,
  environment: EnvironmentContext,
): PolicyConfigTarget | null {
  return findPolicyConfigMutationTargetInSemanticFacts(
    createSemanticFacts(createToolInvocation(toolName, input, route, context, null)),
    environment,
    createBudget(),
  );
}

export function findPolicyConfigMutationTargetInSemanticFacts(
  facts: SemanticFacts,
  environment: EnvironmentContext,
  budget: Budget,
): PolicyConfigTarget | null {
  const identity = createPolicyPathIdentity(facts.invocation.context, environment, budget);
  if (facts.invocation.route.kind === 'patch') {
    return findPolicyConfigMutationTargetInPaths(
      facts.paths,
      false,
      facts.invocation.context.executionCwd,
      identity,
      environment,
      budget,
    );
  }

  const command = getCommandSyntaxFact(facts, 'input-candidate');
  if (facts.invocation.route.kind === 'command') {
    return command
      ? findPolicyConfigMutationTargetInCommand(
          command.shell,
          facts.invocation.context.executionCwd,
          identity,
          environment,
          budget,
        )
      : null;
  }
  if (facts.invocation.route.kind === 'unknown' && command) {
    const target = findPolicyConfigMutationTargetInCommand(
      command.shell,
      facts.invocation.context.executionCwd,
      identity,
      environment,
      budget,
    );
    if (target) return target;
  }

  return findPolicyConfigMutationTargetInPaths(
    facts.paths,
    facts.invocation.route.kind === 'grep' ||
      facts.invocation.route.kind === 'glob' ||
      isReadOnlyTool(facts.invocation.toolName),
    facts.invocation.context.executionCwd,
    identity,
    environment,
    budget,
  );
}

function findPolicyConfigMutationTargetInPaths(
  paths: readonly string[],
  readOnly: boolean,
  cwd: string,
  identity: PolicyPathIdentity,
  environment: EnvironmentContext,
  budget: Budget,
): PolicyConfigTarget | null {
  if (readOnly) return null;
  const target = paths.find((path) => isPolicyFile(path, cwd, identity, environment, budget));
  return target ? { target } : null;
}

function findPolicyConfigMutationTargetInCommand(
  syntax: ShellSyntaxFacts,
  cwd: string,
  identity: PolicyPathIdentity,
  environment: EnvironmentContext,
  budget: Budget,
): PolicyConfigTarget | null {
  const target = findProtectedPathMutationInCommand(syntax, cwd, environment, budget, {
    findSegmentTarget: (segment, state) =>
      findPolicyConfigMutationTargetInSegment(segment, state, identity, environment, budget)
        ?.target ?? null,
    isRedirectionTarget: (target, state) =>
      isPolicyFile(target, state.cwd, identity, environment, budget),
    findMalformedTarget: (source) =>
      findPolicyConfigTargetInMalformedText(source, cwd, identity, environment, budget)?.target ??
      null,
    normalizeCwd: normalizeProtectedPathCandidate,
  });
  return target ? { target } : null;
}

function findPolicyConfigMutationTargetInSegment(
  segment: readonly string[],
  state: ProtectedPathShellState,
  identity: PolicyPathIdentity,
  environment: EnvironmentContext,
  budget: Budget,
): PolicyConfigTarget | null {
  if (isAssignmentOnlySegment(segment)) return null;
  const stripped = stripWrappersForPathScan([...segment], environment);
  const command = getBasename(stripped[0] ?? '').toLowerCase();
  const args = stripped.slice(1);

  if (command === 'rm' && hasRecursiveRmOption(args)) {
    const target = extractRmOperands(args).find((operand) =>
      isPolicyDirectoryOrAncestor(
        expandTrackedShellVariables(operand, state.variables),
        state.cwd,
        identity,
        environment,
        budget,
      ),
    );
    if (target) return { target };
  }

  if (command === 'find') {
    const deletesDirectly = findHasDelete(stripped, 1);
    if (deletesDirectly || findExecRmDeletesFoundPaths(stripped, environment)) {
      const target = (
        getFindStartingPoints(textCommandWords(stripped)) ?? textCommandWords(['.'])
      ).find((startingPoint) => {
        const expanded = expandTrackedShellVariables(startingPoint.text, state.variables);
        return (
          isPolicyFile(expanded, state.cwd, identity, environment, budget) ||
          isPolicyDirectoryOrAncestor(expanded, state.cwd, identity, environment, budget)
        );
      })?.text;
      if (target) return { target };
    }
  }

  if (command === 'mv') {
    const target = extractMvOperandPaths(args).sources.find((source) =>
      isPolicyFileOrDirectorySource(
        expandTrackedShellVariables(source, state.variables),
        state.cwd,
        identity,
        environment,
        budget,
      ),
    );
    if (target) return { target };
  }

  if (isReadOnlySegment(segment, environment)) return null;
  // `env -S` words join the scan so a mutation hidden in the split string is still matched.
  for (const token of [...segment, ...stripped]) {
    for (const candidate of extractDirectPathCandidates(token)) {
      if (
        isPolicyFile(
          expandTrackedShellVariables(candidate, state.variables),
          state.cwd,
          identity,
          environment,
          budget,
        )
      ) {
        return { target: candidate };
      }
    }
  }
  return null;
}

function hasRecursiveRmOption(args: readonly string[]): boolean {
  return args.some(
    (arg) =>
      arg === '--recursive' ||
      (arg.startsWith('-') && !arg.startsWith('--') && /[rR]/.test(arg.slice(1))),
  );
}

function extractRmOperands(args: readonly string[]): readonly string[] {
  const separator = args.indexOf('--');
  if (separator !== -1) {
    return [
      ...args.slice(0, separator).filter((arg) => !arg.startsWith('-')),
      ...args.slice(separator + 1),
    ];
  }
  return args.filter((arg) => !arg.startsWith('-'));
}

function isReadOnlySegment(tokens: readonly string[], environment: EnvironmentContext): boolean {
  const stripped = stripWrappersForPathScan([...tokens], environment);
  if (stripped.length === 0) return false;
  const command = getBasename(stripped[0] ?? '').toLowerCase();
  if (!READ_ONLY_COMMANDS.has(command)) return false;
  if (command !== 'sed') return true;
  return !stripped
    .slice(1)
    .some(
      (token) =>
        token.startsWith('-i') || token === '--in-place' || token.startsWith('--in-place='),
    );
}

function findPolicyConfigTargetInMalformedText(
  text: string,
  cwd: string,
  identity: PolicyPathIdentity,
  environment: EnvironmentContext,
  budget: Budget,
): PolicyConfigTarget | null {
  for (const token of text.split(/\s+/)) {
    for (const candidate of extractDirectPathCandidates(token)) {
      if (isPolicyFile(candidate, cwd, identity, environment, budget)) return { target: candidate };
    }
  }
  return null;
}

function extractDirectPathCandidates(value: string): readonly string[] {
  const cleaned = value.trim().replace(/^['"]|['"]$/g, '');
  const separator = cleaned.indexOf('=');
  return separator === -1 || separator === cleaned.length - 1
    ? [cleaned]
    : [cleaned, cleaned.slice(separator + 1)];
}

/** Both scopes are protected unconditionally: an unguarded project file the agent can
 *  create is exactly the two-tool-call bypass the user-scope guard already closes.
 *  The project chain stops at its own `.cc-safety-net` directory. Walking further up
 *  would claim the cwd and every ancestor, which is the target surface of the
 *  destructive-command rules; this guard runs first, so that would permanently replace
 *  their specific reasons (`rm -rf .`, `find . -delete`) with this generic one. */
function createPolicyPathIdentity(
  toolContext: ToolCallContext,
  environment: EnvironmentContext,
  budget: Budget,
): PolicyPathIdentity {
  const normalize = (path: string) =>
    comparePath(
      normalizeProtectedPathCandidate(path, toolContext.executionCwd, environment, budget),
    );
  const userFile = normalize(getUserPolicyPath(environment));
  const projectFiles = [
    normalize(getProjectPolicyPath(toolContext.executionCwd)),
    normalize(getProjectPolicyPath(toolContext.configCwd)),
  ];
  const directoriesAndAncestors = new Set(projectFiles.map((file) => dirname(file)));
  for (let current = dirname(userFile); ; current = dirname(current)) {
    directoriesAndAncestors.add(current);
    if (dirname(current) === current) break;
  }
  return { files: new Set([userFile, ...projectFiles]), directoriesAndAncestors };
}

function isPolicyFile(
  target: string,
  cwd: string,
  identity: PolicyPathIdentity,
  environment: EnvironmentContext,
  budget: Budget,
): boolean {
  const resolved = normalizeProtectedFileCandidate(
    target,
    cwd,
    environment,
    budget,
    (name) => comparePath(name) === POLICY_FILE,
  );
  return resolved !== null && identity.files.has(comparePath(resolved));
}

function isPolicyDirectoryOrAncestor(
  target: string,
  cwd: string,
  identity: PolicyPathIdentity,
  environment: EnvironmentContext,
  budget: Budget,
): boolean {
  return identity.directoriesAndAncestors.has(
    comparePath(normalizeProtectedPathCandidate(target, cwd, environment, budget)),
  );
}

function isPolicyFileOrDirectorySource(
  target: string,
  cwd: string,
  identity: PolicyPathIdentity,
  environment: EnvironmentContext,
  budget: Budget,
): boolean {
  const normalized = comparePath(normalizeProtectedPathCandidate(target, cwd, environment, budget));
  return identity.files.has(normalized) || identity.directoriesAndAncestors.has(normalized);
}

function comparePath(path: string): string {
  return process.platform === 'win32' ? path.toLowerCase() : path;
}
