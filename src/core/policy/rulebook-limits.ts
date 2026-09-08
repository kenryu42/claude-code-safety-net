export const RULEBOOK_LIMIT_ERROR = "Rulebook exceeds CC Safety Net's safe validation limits.";
export const RULEBOOK_VALIDATION_TRUNCATED = 'Additional rulebook validation errors were omitted.';

export const RULEBOOK_LIMITS = Object.freeze({
  maxAllowedCommands: 1_024,
  maxRules: 1_024,
  maxTests: 2_048,
  maxBlockArgsPerRule: 1_024,
  maxTotalBlockArgs: 16_384,
  maxStringCodeUnits: 1_048_576,
  maxAggregateStringCodeUnits: 4_194_304,
  maxFixtureCommandCodeUnits: 131_072,
  maxValidationErrors: 64,
});

export function isRulebookWithinAcceptanceLimits(rulebook: Record<string, unknown>): boolean {
  if (
    exceedsArrayLimit(rulebook.allowed_commands, RULEBOOK_LIMITS.maxAllowedCommands) ||
    exceedsArrayLimit(rulebook.rules, RULEBOOK_LIMITS.maxRules) ||
    exceedsArrayLimit(rulebook.tests, RULEBOOK_LIMITS.maxTests)
  ) {
    return false;
  }

  let remainingStringCodeUnits = RULEBOOK_LIMITS.maxAggregateStringCodeUnits;
  let remainingBlockArgs = RULEBOOK_LIMITS.maxTotalBlockArgs;
  const acceptString = (value: unknown, fixtureCommand = false) => {
    if (typeof value !== 'string') return true;
    if (
      value.length > RULEBOOK_LIMITS.maxStringCodeUnits ||
      (fixtureCommand && value.length > RULEBOOK_LIMITS.maxFixtureCommandCodeUnits) ||
      value.length > remainingStringCodeUnits
    ) {
      return false;
    }
    remainingStringCodeUnits -= value.length;
    return true;
  };

  if (
    !acceptString(rulebook.name) ||
    !acceptString(rulebook.version) ||
    !acceptString(rulebook.description) ||
    !acceptString(rulebook.author) ||
    !acceptString(rulebook.migrated_from)
  ) {
    return false;
  }

  if (Array.isArray(rulebook.allowed_commands)) {
    for (const command of rulebook.allowed_commands) {
      if (!acceptString(command)) return false;
    }
  }

  if (Array.isArray(rulebook.rules)) {
    for (const rule of rulebook.rules) {
      if (!rule || typeof rule !== 'object') continue;
      const candidate = rule as Record<string, unknown>;
      if (
        !acceptString(candidate.name) ||
        !acceptString(candidate.command) ||
        !acceptString(candidate.subcommand) ||
        !acceptString(candidate.reason) ||
        !acceptString(candidate.intent)
      ) {
        return false;
      }
      // A version 2 rule spends the same budget on its match token lists.
      const match =
        candidate.match && typeof candidate.match === 'object'
          ? (candidate.match as Record<string, unknown>)
          : {};
      for (const tokens of [
        candidate.block_args,
        match.command_path,
        match.any_args,
        match.exclude_args,
      ]) {
        if (!Array.isArray(tokens)) continue;
        if (
          tokens.length > RULEBOOK_LIMITS.maxBlockArgsPerRule ||
          tokens.length > remainingBlockArgs
        ) {
          return false;
        }
        remainingBlockArgs -= tokens.length;
        for (const token of tokens) {
          if (!acceptString(token)) return false;
        }
      }
    }
  }

  if (Array.isArray(rulebook.tests)) {
    for (const fixture of rulebook.tests) {
      if (!fixture || typeof fixture !== 'object') continue;
      const candidate = fixture as Record<string, unknown>;
      if (
        !acceptString(candidate.command, true) ||
        !acceptString(candidate.expect) ||
        !acceptString(candidate.rule)
      ) {
        return false;
      }
    }
  }

  return true;
}

function exceedsArrayLimit(value: unknown, limit: number): boolean {
  return Array.isArray(value) && value.length > limit;
}
