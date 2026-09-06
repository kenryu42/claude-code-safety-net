export {
  REASON_COMMAND_ANALYSIS_LIMIT,
  REASON_RECURSION_LIMIT,
  REASON_SAFETY_NET_FAILED_CLOSED,
} from '@/core/budget';

export const REASON_STRICT_UNPARSEABLE =
  'Command could not be safely analyzed (strict mode). Simplify the command and retry, or ask the user to verify.';

export const REASON_STRUCTURAL_COMMAND_VALIDATION_LIMIT =
  'CC Safety Net could not validate the command because its structure exceeds safe analysis limits.';
