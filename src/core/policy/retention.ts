import type { Environment } from '@/core/environment';
import { getUserPolicyPath, type UserScopeOptions } from './paths';
import { normalizeGuiPolicy, readPolicyFile } from './store';

/**
 * Read the configured retention window straight from the policy file rather
 * than threading it through the audit write path, which reaches prune from six
 * adapters that hold no policy. The sweep calls this only after its once-per-UTC
 * -day throttle passes, so the read costs one file per audit root per day.
 *
 * It is the same salvaged read the snapshot performs, projected onto the one
 * field: a policy that fails validation elsewhere still has to prune, and every
 * unusable value — missing, empty, malformed, out of range — clamps to the
 * default window.
 */
export function readRetentionDays(
  environment: Environment,
  options: UserScopeOptions = {},
): number {
  return normalizeGuiPolicy(
    readPolicyFile(getUserPolicyPath(environment, options), environment.home).parsed,
    environment.home,
  ).audit.retention_days;
}
