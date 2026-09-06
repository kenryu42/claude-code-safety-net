import { destructiveCommandMatch } from '@/core/rules/destructive';
import type { DestructiveCommandRuleMatch } from '@/core/rules/types';

const REASON_DD_DEVICE_WRITE =
  'dd writing to a /dev device can destroy a disk or partition. Run device writes manually after confirming the target.';
const REASON_MKFS_DEVICE =
  'mkfs formatting a /dev device erases everything on it. Run the format manually after confirming the target.';
const REASON_SHRED_TARGET =
  'shred permanently destroys the given target. Use rm for ordinary deletes, or run shred manually.';

export function analyzeDeviceCommandMatch(
  head: string,
  tokens: readonly string[],
): DestructiveCommandRuleMatch | null {
  const operands = tokens.slice(1);
  if (head === 'dd' && operands.some((token) => /^of=\/dev\/.+/.test(token))) {
    return destructiveCommandMatch('dd.device-write', REASON_DD_DEVICE_WRITE);
  }
  if (
    (head === 'mkfs' || head.startsWith('mkfs.')) &&
    operands.some((token) => token.startsWith('/dev/'))
  ) {
    return destructiveCommandMatch('mkfs.device', REASON_MKFS_DEVICE);
  }
  if (head === 'shred' && operands.length > 0) {
    return destructiveCommandMatch('shred.target', REASON_SHRED_TARGET);
  }
  return null;
}
