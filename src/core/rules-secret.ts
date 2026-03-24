import { getBasename } from '@/core/shell';

const REASON_GIT_ADD_ENV =
  'git add .env stages secret files for commit. Add .env to .gitignore instead.';
const REASON_GIT_ADD_CREDENTIAL =
  'git add credential/key file stages secrets for commit. Add to .gitignore instead.';
const REASON_GIT_ADD_ALL_WITH_ENV =
  'git add . or git add -A with .env present would stage secrets. Add specific files instead.';

const SECRET_FILE_PATTERNS = [
  /\.env$/,
  /\.env\..+$/,
  /credentials\.json$/,
  /\.pem$/,
  /\.key$/,
  /\.p12$/,
  /\.pfx$/,
  /id_rsa$/,
  /id_ed25519$/,
  /id_ecdsa$/,
  /id_dsa$/,
  /\.keystore$/,
  /\.jks$/,
];

export interface SecretRuleResult {
  blocked: boolean;
  reason: string;
}

/**
 * Check if a git add command would stage secret files.
 *
 * @param tokens - Parsed command tokens (after stripping wrappers/env)
 * @returns SecretRuleResult with blocked flag and reason
 */
export function checkGitAddSecrets(tokens: string[]): SecretRuleResult {
  if (tokens.length < 2) {
    return { blocked: false, reason: '' };
  }

  const command = tokens[0]?.toLowerCase();
  if (command !== 'git') {
    return { blocked: false, reason: '' };
  }

  const subcommand = tokens[1]?.toLowerCase();
  if (subcommand !== 'add') {
    return { blocked: false, reason: '' };
  }

  // Check remaining args for secret file patterns
  const args = tokens.slice(2);

  for (const arg of args) {
    if (arg.startsWith('-')) continue; // Skip flags

    const basename = getBasename(arg);

    // Direct .env file staging
    if (/^\.env($|\..+$)/.test(basename)) {
      return { blocked: true, reason: REASON_GIT_ADD_ENV };
    }

    // Credential/key files
    for (const pattern of SECRET_FILE_PATTERNS) {
      if (pattern.test(basename)) {
        return { blocked: true, reason: REASON_GIT_ADD_CREDENTIAL };
      }
    }
  }

  // git add . or git add -A (stages everything including .env)
  for (const arg of args) {
    if (arg === '.' || arg === '-A' || arg === '--all') {
      // This is a warning, not a hard block — the user might have .gitignore configured
      return { blocked: false, reason: REASON_GIT_ADD_ALL_WITH_ENV };
    }
  }

  return { blocked: false, reason: '' };
}

/**
 * Check if a command would expose secrets via environment variables.
 * Detects patterns like: export API_KEY="sk-..."
 *
 * @param tokens - Parsed command tokens
 * @returns SecretRuleResult
 */
export function checkHardcodedSecrets(tokens: string[]): SecretRuleResult {
  const command = tokens[0]?.toLowerCase();
  if (command !== 'export' && command !== 'set') {
    return { blocked: false, reason: '' };
  }

  for (const arg of tokens.slice(1)) {
    // Check for common API key patterns
    if (/=(sk-|ghp_|glpat-|gho_|github_pat_|xoxb-|xoxp-|AKIA)/i.test(arg)) {
      return {
        blocked: true,
        reason: `Hardcoded API key detected in ${command} command. Use a .env file or secret manager instead.`,
      };
    }
  }

  return { blocked: false, reason: '' };
}
