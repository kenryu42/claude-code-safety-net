/**
 * Main entry point for the doctor command.
 */

import { getActivitySummary } from '@/cli/doctor/activity';
import { getConfigInfo } from '@/cli/doctor/config';
import { getEnvironmentInfo } from '@/cli/doctor/environment';
import { deriveDoctorFindings } from '@/cli/doctor/findings';
import {
  formatActivitySection,
  formatConfigSection,
  formatEffectiveSafetySection,
  formatEngineSelfTestSection,
  formatEnvironmentSection,
  formatFindingsSection,
  formatHooksSection,
  formatSummary,
  formatSystemInfoSection,
  formatUpdateSection,
} from '@/cli/doctor/format';
import { getDoctorPosture } from '@/cli/doctor/posture';
import { checkForUpdates } from '@/cli/doctor/updates';
import { printInstallBanner } from '@/cli/install/banner';
import { findRuleV2Leftovers } from '@/cli/rule/sync-migrate';
import { resolveAfterOptionalBanner } from '@/cli/startup/banner';
import type { Environment } from '@/core/environment';
import { resolveEffectiveDestructiveCommandRules } from '@/core/policy/effective-rules';
import { getCCSafetyNetEnvModes } from '@/core/policy/env';
import { describeConfigState, loadPolicySnapshot } from '@/core/policy/snapshot';
import { detectAllHooks } from '@/hosts/detect/index';
import type { DoctorOptions, DoctorReport } from '@/hosts/doctor-types';
import { runIntegrationSelfTest } from '@/hosts/self-test';
import { getPackageVersion, getSystemInfo } from '@/hosts/system-info';

export { parseDoctorFlags } from '@/cli/doctor/flags';

export async function runDoctor(
  environment: Environment,
  options: DoctorOptions = {},
): Promise<number> {
  const report = await resolveAfterOptionalBanner(
    !options.json,
    () => {
      const reportPromise = collectDoctorReport(environment, options);
      return {
        ready: reportPromise,
        finish: () => reportPromise,
      };
    },
    () => printInstallBanner(),
    { loadingMessage: 'Checking system status…' },
  );

  if (options.json) {
    console.log(JSON.stringify(report, null, 2));
  } else {
    printReport(report);
  }

  // Findings own the failure contract so a rendered error can never exit 0;
  // the self-test stays a fact check because it has no finding rule.
  return report.engineSelfTest.failed > 0 ||
    report.findings.some((finding) => finding.severity === 'error')
    ? 1
    : 0;
}

async function collectDoctorReport(
  environment: Environment,
  options: DoctorOptions,
): Promise<DoctorReport> {
  const cwd = options.cwd ?? process.cwd();

  const system = await getSystemInfo();
  const hooks = detectAllHooks(environment, cwd, {
    ampPluginListOutput: system.ampPluginListOutput,
    codexPluginListOutput: system.codexPluginListOutput,
    copilotCliVersion: system.versions['copilot-cli'],
  });
  const configInfo = getConfigInfo(environment, cwd);
  const environmentInfo = getEnvironmentInfo(environment);
  const snapshot = loadPolicySnapshot(environment, { cwd });
  const policy = snapshot.policy;
  const modes = getCCSafetyNetEnvModes(policy, environment.env);
  const ruleStates = resolveEffectiveDestructiveCommandRules(policy, modes.capabilities);
  const activity = getActivitySummary(environment, 7);
  const v2Leftovers = findRuleV2Leftovers(environment, cwd);
  const update = options.skipUpdateCheck
    ? {
        currentVersion: getPackageVersion(),
        latestVersion: null,
        updateAvailable: false,
      }
    : await checkForUpdates();

  const report: Omit<DoctorReport, 'findings'> = {
    hooks,
    engineSelfTest: runIntegrationSelfTest(environment),
    userConfig: configInfo.userConfig,
    projectConfig: configInfo.projectConfig,
    configState: describeConfigState(snapshot),
    effectiveRules: configInfo.effectiveRules,
    shadowedRules: configInfo.shadowedRules,
    environment: environmentInfo,
    effectiveSafety: {
      selectedPreset: policy.safety.level ?? 'standard',
      level: modes.effectiveLevel,
      capabilities: modes.capabilities,
      ruleOverrides: policy.destructiveCommandRuleOverrides,
      weakenedRuleOverrides: Object.entries(ruleStates)
        .filter(
          ([, state]) =>
            state.source === 'rule_override' &&
            state.override === 'off' &&
            state.inheritedEnabled &&
            state.changesInherited,
        )
        .map(([id]) => id),
      ruleCounts: {
        stored: Object.keys(policy.destructiveCommandRuleOverrides).length,
        effective: Object.values(ruleStates).filter((state) => state.changesInherited).length,
      },
      ...(snapshot.policyScopes ? { policyScopes: snapshot.policyScopes } : {}),
    },
    ...(v2Leftovers.length > 0 ? { v2Leftovers } : {}),
    posture: getDoctorPosture(environment, configInfo.userConfig.path),
    activity,
    update,
    system,
  };
  return { ...report, findings: deriveDoctorFindings(report) };
}

function printReport(report: DoctorReport): void {
  // 1. Hook integration
  console.log();
  console.log(formatHooksSection(report.hooks));
  console.log();

  // 2. Shared guard engine verification
  console.log(formatEngineSelfTestSection(report.engineSelfTest));
  console.log();

  // 3. Configuration with Rules Table
  console.log(formatConfigSection(report));
  console.log();

  // 4. Environment
  console.log(formatEnvironmentSection(report.environment));
  console.log();

  // 5. Effective safety
  console.log(formatEffectiveSafetySection(report));
  console.log();

  // 6. Findings
  console.log(formatFindingsSection(report.findings));
  console.log();

  // 7. Activity
  console.log(formatActivitySection(report.activity));
  console.log();

  // 8. System Info
  console.log(formatSystemInfoSection(report.system));
  console.log();

  // 9. Update Check
  console.log(formatUpdateSection(report.update));

  // Summary
  console.log(formatSummary(report));
}
