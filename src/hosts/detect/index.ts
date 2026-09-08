/**
 * Hook discovery for the doctor command: one detector per catalog integration, composed in
 * doctor order.
 */

import type { Environment } from '@/core/environment';
import { detect as detectAmp } from '@/hosts/amp/detect';
import { detect as detectAntigravityCli } from '@/hosts/antigravity-cli/detect';
import { doctorIntegrationOrder, type IntegrationId } from '@/hosts/catalog';
import { detect as detectClaudeCode } from '@/hosts/claude-code/detect';
import { detect as detectCodex } from '@/hosts/codex/detect';
import { detect as detectCopilotCli } from '@/hosts/copilot-cli/detect';
import { detect as detectCursor } from '@/hosts/cursor/detect';
import type { DetectContext, HookDetection } from '@/hosts/detect/context';
import type { HookStatus } from '@/hosts/doctor-types';
import { detect as detectGeminiCli } from '@/hosts/gemini-cli/detect';
import { detect as detectGrokBuild } from '@/hosts/grok-build/detect';
import { detect as detectHermesAgent } from '@/hosts/hermes-agent/detect';
import { detect as detectKimiCode } from '@/hosts/kimi-code/detect';
import { detect as detectOpenClaw } from '@/hosts/openclaw/detect';
import { detect as detectOpenCode } from '@/hosts/opencode/detect';
import { detect as detectPi } from '@/hosts/pi/detect';

/** A catalog entry without a detector fails typecheck here. */
const detectors = {
  amp: detectAmp,
  'antigravity-cli': detectAntigravityCli,
  'claude-code': detectClaudeCode,
  codex: detectCodex,
  'copilot-cli': detectCopilotCli,
  cursor: detectCursor,
  'gemini-cli': detectGeminiCli,
  'grok-build': detectGrokBuild,
  'hermes-agent': detectHermesAgent,
  'kimi-code': detectKimiCode,
  openclaw: detectOpenClaw,
  opencode: detectOpenCode,
  pi: detectPi,
} satisfies Record<IntegrationId, (context: DetectContext) => HookDetection>;

/**
 * Detect all hooks and inspect their configuration.
 */
export function detectAllHooks(
  environment: Environment,
  cwd: string,
  options?: Omit<DetectContext, 'cwd' | 'environment'>,
): HookStatus[] {
  const context = { ...options, cwd, environment };
  return doctorIntegrationOrder.map((platform) => toHookStatus(detectors[platform](context)));
}

function toHookStatus(detection: HookDetection): HookStatus {
  if (detection.status === 'not-inspected') {
    return {
      platform: detection.platform,
      detected: false,
      configured: false,
      inspectionStatus: 'not-inspected',
    };
  }

  return {
    platform: detection.platform,
    detected: detection.status !== 'n/a',
    configured: detection.status === 'configured',
    inspectionStatus:
      detection.status !== 'n/a'
        ? 'verified'
        : detection.errors && detection.errors.length > 0
          ? 'failed'
          : 'not-applicable',
    method: detection.method,
    configPath: detection.configPath,
    configPaths: detection.configPaths,
    errors: detection.errors,
  };
}
