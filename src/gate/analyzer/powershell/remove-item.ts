import type { Budget } from '@/core/budget';
import { isUnsupportedWindowsNamespacePath } from '@/core/paths/canonicalization';
import {
  type DestructiveCommandRulePolicy,
  destructiveCommandRuleIsEnabled,
} from '@/core/policy/effective-rules';
import type { EffectivePolicy } from '@/core/policy/types';
import { destructiveCommandMatch } from '@/core/rules/destructive';
import type { DestructiveCommandRuleMatch } from '@/core/rules/types';
import type { CommandView } from '@/core/shell/model';
import type { EnvironmentContext, ProtectedGitMetadata } from '@/gate/analysis';
import {
  isProtectedGitDeleteTarget,
  REASON_GIT_METADATA_PROTECTION,
} from '@/gate/guards/git-metadata-protection';
import {
  classifyRecursiveDeleteTarget,
  createRecursiveDeleteTargetContext,
  isDangerousRootOrHomeTarget,
  type RecursiveDeleteTargetClassification,
  type RecursiveDeleteTargetContext,
} from '../recursive-delete-targets';

type PowerShellToken = {
  kind: 'word';
  text: string;
  dynamic: boolean;
};

const REMOVE_ITEM_ALIASES = new Set(['remove-item', 'ri', 'del', 'erase', 'rd', 'rm', 'rmdir']);

const REASON_REMOVE_ITEM_RF =
  'PowerShell Remove-Item -Recurse -Force outside cwd is blocked. Retry deleting only explicit paths inside the current directory; escalate for anything outside it.';
const REASON_REMOVE_ITEM_RF_POLICY =
  'PowerShell Remove-Item -Recurse -Force for non-temporary paths is blocked by the active safety policy. Retry deleting only explicit paths inside the current directory; escalate for anything outside it.';
const REASON_REMOVE_ITEM_DYNAMIC_TARGET =
  'PowerShell Remove-Item target contains variables or pipeline input that cannot be verified safely. Use literal paths within cwd.';
const REASON_REMOVE_ITEM_ROOT_HOME =
  'PowerShell Remove-Item targeting root or home directory is extremely dangerous and always blocked.';
const REASON_REMOVE_ITEM_HOME_CWD =
  'PowerShell Remove-Item -Recurse -Force in home directory is dangerous. Change to a project directory first.';
const REASON_REMOVE_ITEM_PIPELINE =
  'PowerShell Remove-Item receives pipeline input that cannot be verified safely. Use explicit literal paths within cwd.';

interface AnalyzePowerShellRemoveItemOptions {
  environment: EnvironmentContext;
  budget?: Budget;
  cwd?: string;
  originalCwd?: string;
  strict?: boolean;
  paranoid?: boolean;
  allowTmpdirVar?: boolean;
  protectedGitMetadata: ProtectedGitMetadata | null;
  policy?: DestructiveCommandRulePolicy &
    Partial<Pick<EffectivePolicy, 'destructiveCommandAllowPaths'>>;
}

interface RemoveItemTarget {
  text: string;
  dynamic: boolean;
}

interface ParsedRemoveItem {
  targets: RemoveItemTarget[];
  recursive: boolean;
  force: boolean;
  whatIfProtected: boolean;
  hasDynamicTarget: boolean;
}

export function analyzePowerShellCommandViewMatch(
  command: CommandView,
  hasPipelineInput: boolean,
  options: AnalyzePowerShellRemoveItemOptions,
  ctx: RecursiveDeleteTargetContext = createRecursiveDeleteTargetContext({
    ...options,
    allowPaths: options.policy?.destructiveCommandAllowPaths,
  }),
): DestructiveCommandRuleMatch | null {
  return analyzePowerShellSegment(
    command.words.map((word) => ({
      kind: 'word',
      text: word.text,
      dynamic: word.provenance !== 'literal',
    })),
    hasPipelineInput,
    ctx,
    options.policy,
  );
}

function analyzePowerShellSegment(
  segment: PowerShellToken[],
  hasPipelineInput: boolean,
  ctx: RecursiveDeleteTargetContext,
  policy: AnalyzePowerShellRemoveItemOptions['policy'],
): DestructiveCommandRuleMatch | null {
  const words = segment.filter((token) => token.kind === 'word');
  const commandIndex = getCommandIndex(words);
  const command = words[commandIndex];
  if (!command || !REMOVE_ITEM_ALIASES.has(normalizeCommandName(command.text))) {
    return null;
  }

  const parsed = parseRemoveItem(words.slice(commandIndex + 1));
  if (parsed.whatIfProtected) {
    return null;
  }

  if (
    destructiveCommandRuleIsEnabled(
      policy,
      'powershell.remove-item-pipeline-dynamic-target',
      ctx.strict,
    ) &&
    hasPipelineInput &&
    (parsed.targets.length === 0 || parsed.recursive)
  ) {
    return destructiveCommandMatch(
      'powershell.remove-item-pipeline-dynamic-target',
      REASON_REMOVE_ITEM_PIPELINE,
    );
  }

  for (const target of parsed.targets) {
    if (
      !isUnsupportedWindowsNamespacePath(target.text) &&
      isDangerousRootOrHomeTarget(powerShellTargetForPolicy(target.text))
    ) {
      return destructiveCommandMatch(
        parsed.recursive && parsed.force
          ? 'powershell.remove-item-recursive-force-root-or-home'
          : 'powershell.remove-item-root-or-home',
        REASON_REMOVE_ITEM_ROOT_HOME,
      );
    }
  }

  for (const target of parsed.targets) {
    if (
      ctx.resolvedCwd &&
      isProtectedGitDeleteTarget(
        powerShellTargetForPolicy(target.text),
        ctx.resolvedCwd,
        ctx.protectedGitMetadata,
        parsed.recursive,
        ctx.environment,
        ctx.budget,
        true,
      )
    ) {
      return destructiveCommandMatch(
        'powershell.remove-item-git-metadata',
        REASON_GIT_METADATA_PROTECTION,
      );
    }
  }

  if (!parsed.recursive || !parsed.force) {
    return null;
  }

  if (
    destructiveCommandRuleIsEnabled(
      policy,
      'powershell.remove-item-recursive-force-dynamic-target',
      ctx.strict,
    ) &&
    (parsed.hasDynamicTarget || parsed.targets.length === 0)
  ) {
    return destructiveCommandMatch(
      'powershell.remove-item-recursive-force-dynamic-target',
      REASON_REMOVE_ITEM_DYNAMIC_TARGET,
    );
  }

  for (const target of parsed.targets) {
    const match = matchForClassification(
      classifyRecursiveDeleteTarget(powerShellTargetForPolicy(target.text), ctx),
      ctx,
      policy,
    );
    if (match) return match;
  }

  return null;
}

function parseRemoveItem(args: PowerShellToken[]): ParsedRemoveItem {
  const targets: RemoveItemTarget[] = [];
  let recursive = false;
  let force = false;
  let whatIfProtected = false;
  let hasDynamicTarget = false;
  let pastEndOfParameters = false;

  for (let i = 0; i < args.length; i++) {
    const token = args[i];
    if (!token || token.kind !== 'word') continue;
    if (isArraySeparator(token)) continue;

    if (pastEndOfParameters) {
      targets.push(targetFromToken(token));
      hasDynamicTarget = hasDynamicTarget || token.dynamic;
      continue;
    }

    if (token.text === '--') {
      pastEndOfParameters = true;
      continue;
    }

    const parameter = parseParameter(token.text);
    if (!parameter) {
      targets.push(targetFromToken(token));
      hasDynamicTarget = hasDynamicTarget || token.dynamic;
      continue;
    }

    if (isPathParameter(parameter.name)) {
      const value = parameter.value ? parameterValueToken(parameter.value, token) : args[++i];
      if (value?.kind === 'word') {
        targets.push(targetFromToken(value));
        hasDynamicTarget = hasDynamicTarget || value.dynamic;
        continue;
      }
      hasDynamicTarget = true;
      continue;
    }

    if (isRecurseParameter(parameter.name)) {
      recursive = true;
      continue;
    }

    if (isForceParameter(parameter.name)) {
      force = true;
      continue;
    }

    if (isWhatIfParameter(parameter.name)) {
      whatIfProtected = isProtectiveSwitchValue(parameter.value);
    }
  }

  return { targets, recursive, force, whatIfProtected, hasDynamicTarget };
}

function getCommandIndex(words: PowerShellToken[]): number {
  const first = words[0];
  if ((first?.kind === 'word' && first.text === '&') || first?.text === '.') {
    return words.length > 1 ? 1 : 0;
  }
  return 0;
}

function targetFromToken(token: PowerShellToken): RemoveItemTarget {
  return {
    text: token.kind === 'word' ? token.text : '',
    dynamic: token.kind === 'word' && token.dynamic,
  };
}

function isArraySeparator(token: PowerShellToken): boolean {
  return token.kind === 'word' && token.text === ',';
}

function powerShellTargetForPolicy(target: string): string {
  const normalized = target.replace(/\\/g, '/');
  const home = /^\$env:(?:userprofile|home)(?=$|\/)/i.exec(normalized);
  return home ? `$HOME${normalized.slice(home[0].length)}` : normalized;
}

function parameterValueToken(value: string, source: PowerShellToken): PowerShellToken {
  return {
    kind: 'word',
    text: value,
    dynamic: source.kind === 'word' && (source.dynamic || value.includes('$')),
  };
}

function parseParameter(text: string): { name: string; value?: string } | null {
  if (!text.startsWith('-') || text === '-') {
    return null;
  }

  const raw = text.slice(1);
  const colonIndex = raw.indexOf(':');
  if (colonIndex === -1) {
    return { name: raw.toLowerCase() };
  }

  return {
    name: raw.slice(0, colonIndex).toLowerCase(),
    value: raw.slice(colonIndex + 1),
  };
}

function isPathParameter(name: string): boolean {
  return 'path'.startsWith(name) || 'literalpath'.startsWith(name);
}

function isRecurseParameter(name: string): boolean {
  return 'recurse'.startsWith(name);
}

function isForceParameter(name: string): boolean {
  return name.length >= 2 && 'force'.startsWith(name);
}

function isWhatIfParameter(name: string): boolean {
  return name === 'wi' || 'whatif'.startsWith(name);
}

function isProtectiveSwitchValue(value: string | undefined): boolean {
  if (value === undefined || value === '') {
    return true;
  }
  const normalized = value.toLowerCase();
  return normalized === '$true' || normalized === 'true';
}

function normalizeCommandName(name: string): string {
  return name.toLowerCase();
}

function matchForClassification(
  classification: RecursiveDeleteTargetClassification,
  ctx: RecursiveDeleteTargetContext,
  policy: AnalyzePowerShellRemoveItemOptions['policy'],
): DestructiveCommandRuleMatch | null {
  switch (classification.kind) {
    case 'root_or_home_target':
      return destructiveCommandMatch(
        'powershell.remove-item-recursive-force-root-or-home',
        REASON_REMOVE_ITEM_ROOT_HOME,
      );
    case 'git_metadata_target':
      return destructiveCommandMatch(
        'powershell.remove-item-git-metadata',
        REASON_GIT_METADATA_PROTECTION,
      );
    case 'temp_target':
      return null;
    case 'dynamic_target':
      if (
        !destructiveCommandRuleIsEnabled(
          policy,
          'powershell.remove-item-recursive-force-dynamic-target',
          ctx.strict,
        )
      )
        return null;
      return destructiveCommandMatch(
        'powershell.remove-item-recursive-force-dynamic-target',
        REASON_REMOVE_ITEM_DYNAMIC_TARGET,
      );
    case 'home_cwd_target':
      return destructiveCommandMatch(
        'powershell.remove-item-recursive-force-home-cwd',
        REASON_REMOVE_ITEM_HOME_CWD,
      );
    case 'cwd_self_target':
      return destructiveCommandMatch(
        'powershell.remove-item-recursive-force-cwd-self',
        REASON_REMOVE_ITEM_RF,
      );
    case 'within_anchored_cwd':
      if (
        !destructiveCommandRuleIsEnabled(
          policy,
          'powershell.remove-item-recursive-force-paranoid',
          ctx.paranoid,
        )
      )
        return null;
      return destructiveCommandMatch(
        'powershell.remove-item-recursive-force-paranoid',
        REASON_REMOVE_ITEM_RF_POLICY,
      );
    case 'outside_anchored_cwd':
      return destructiveCommandMatch(
        'powershell.remove-item-recursive-force-outside-cwd',
        REASON_REMOVE_ITEM_RF,
      );
  }
}
