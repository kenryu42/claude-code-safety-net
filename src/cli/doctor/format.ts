/**
 * Output formatting utilities for the doctor command.
 */

import { colors } from '@/cli/utils/colors';
import { renderTerminalText } from '@/cli/utils/terminal';
import { describePolicyScope } from '@/core/policy/types';
import { doctorIntegrationOrder, getIntegrationDisplayName } from '@/hosts/catalog';
import type {
  ActivitySummary,
  ConfigSourceInfo,
  DoctorFinding,
  DoctorReport,
  EffectiveRule,
  EnvVarInfo,
  HookStatus,
  SystemInfo,
  UpdateInfo,
} from '@/hosts/doctor-types';
import type { SelfTestSummary } from '@/hosts/self-test';

interface TableOptions {
  headers?: string[];
  rows: string[][];
}

// Colour codes occupy no columns, so every width is measured on the stripped cell.
// The escape byte lives in a constant because a regex literal may not contain one.
const ANSI_STYLE = new RegExp(`${'\x1b'}\\[[0-9;]*m`, 'g');
const visibleWidth = (cell: string) => cell.replace(ANSI_STYLE, '').length;

function formatAsciiTable(options: TableOptions): string {
  const colWidths = (options.headers ?? options.rows[0] ?? []).map((h, i) => {
    const maxDataWidth = Math.max(...options.rows.map((r) => visibleWidth(r[i] ?? '')));
    // A headerless table measures its first data row here, which may be coloured.
    return Math.max(visibleWidth(h), maxDataWidth);
  });
  const pad = (s: string, w: number) => s + ' '.repeat(Math.max(0, w - visibleWidth(s)));
  const line = (char: string, corners: [string, string, string]) =>
    corners[0] + colWidths.map((w) => char.repeat(w + 2)).join(corners[1]) + corners[2];
  const formatRow = (cells: string[]) =>
    `│ ${cells.map((c, i) => pad(c, colWidths[i] ?? 0)).join(' │ ')} │`;

  const headerLines = options.headers
    ? [`   ${formatRow(options.headers)}`, `   ${line('─', ['├', '┼', '┤'])}`]
    : [];

  return [
    `   ${line('─', ['┌', '┬', '┐'])}`,
    ...headerLines,
    ...options.rows.map((r) => `   ${formatRow(r)}`),
    `   ${line('─', ['└', '┴', '┘'])}`,
  ].join('\n');
}

/**
 * Format integration discovery and configuration inspection.
 */
export function formatHooksSection(hooks: HookStatus[]): string {
  const lines: string[] = [];

  lines.push('Hook Integration');
  lines.push(formatHooksTable(hooks));

  const warnings: Array<{ platform: string; message: string }> = [];
  const errors: Array<{ platform: string; message: string }> = [];

  for (const hook of hooks) {
    const platformName = getIntegrationDisplayName(hook.platform);

    if (hook.errors && hook.errors.length > 0) {
      for (const err of hook.errors) {
        if (hook.configured) {
          warnings.push({ platform: platformName, message: err });
        } else {
          errors.push({ platform: platformName, message: err });
        }
      }
    }
  }

  // Show warnings
  for (const w of warnings) {
    lines.push(`   Warning (${w.platform}): ${w.message}`);
  }

  // Show errors
  for (const e of errors) {
    lines.push(colors.red(`   Error (${e.platform}): ${e.message}`));
  }

  return lines.join('\n');
}

/**
 * Format hooks as an ASCII table with colored status.
 */
function formatHooksTable(hooks: HookStatus[]): string {
  const headers = ['Platform', 'Discovery', 'Configuration', 'Inspection'];

  const rowData = hooks.map((h) => {
    const platformName = getIntegrationDisplayName(h.platform);
    if (h.inspectionStatus === 'not-inspected') {
      const notInspected = colors.dim('Not inspected');
      return [platformName, notInspected, notInspected, notInspected];
    }
    const discovery = h.detected
      ? colors.green('Detected')
      : h.inspectionStatus === 'failed'
        ? colors.red('Unknown')
        : colors.dim('Not detected');
    const configuration = h.configured
      ? colors.green('Configured')
      : h.detected
        ? colors.yellow('Not configured')
        : h.inspectionStatus === 'failed'
          ? colors.red('Unknown')
          : colors.dim('Not applicable');
    const inspection =
      h.inspectionStatus === 'verified'
        ? colors.green('Verified')
        : h.inspectionStatus === 'failed'
          ? colors.red('Failed')
          : colors.dim('Not applicable');
    return [platformName, discovery, configuration, inspection];
  });

  return formatAsciiTable({ headers, rows: rowData });
}

/** Format the shared guard-engine synthetic self-test. */
export function formatEngineSelfTestSection(selfTest: SelfTestSummary): string {
  const status =
    selfTest.failed > 0
      ? colors.red(`${selfTest.passed}/${selfTest.total} FAIL`)
      : colors.green(`${selfTest.passed}/${selfTest.total} passed`);
  const lines = ['Guard Engine Verification', `   Synthetic self-test: ${status}`];
  const failures = selfTest.results.filter((result) => !result.passed);

  if (failures.length > 0) {
    lines.push('');
    lines.push(colors.red('   Failures:'));
    for (const failure of failures) {
      lines.push(colors.red(`   • ${failure.description}`));
      lines.push(colors.red(`     expected ${failure.expected}, got ${failure.actual}`));
    }
  }

  return lines.join('\n');
}

/**
 * @internal Exported for testing
 * Format effective rules as an ASCII table.
 */
export function formatRulesTable(rules: EffectiveRule[]): string {
  if (rules.length === 0) {
    return '   (no custom rules)';
  }

  const headers = ['Source', 'Name', 'Command', 'Block Args'];
  const rows = rules.map((r) => [
    r.source,
    r.name,
    r.subcommand ? `${r.command} ${r.subcommand}` : r.command,
    r.blockArgs.join(', '),
  ]);

  return formatAsciiTable({ headers, rows });
}

/**
 * Format the config section with tables.
 */
export function formatConfigSection(report: DoctorReport): string {
  const lines: string[] = [];

  lines.push('Configuration');
  lines.push(formatConfigTable(report.userConfig, report.projectConfig));

  lines.push('');

  // Effective rules table
  if (report.effectiveRules.length > 0) {
    lines.push(`   Effective rules (${report.effectiveRules.length} total):`);
    lines.push(formatRulesTable(report.effectiveRules));
  } else {
    lines.push('   Effective rules: (none - using built-in rules only)');
  }

  // Shadow warnings
  for (const shadow of report.shadowedRules) {
    lines.push('');
    lines.push(`   Note: Project rule "${shadow.name}" shadows user rule with same name`);
  }

  return lines.join('\n');
}

/**
 * Format config sources as an ASCII table with colored status.
 */
function formatConfigTable(userConfig: ConfigSourceInfo, projectConfig: ConfigSourceInfo): string {
  const headers = ['Scope', 'Status'];

  const getStatusDisplay = (config: ConfigSourceInfo): string => {
    if (!config.exists) return colors.dim('N/A');
    if (!config.valid) return colors.red(`Invalid (${config.errors?.[0] ?? 'unknown error'})`);
    return colors.green('Configured');
  };

  const rows = [
    ['User', getStatusDisplay(userConfig)],
    ['Project', getStatusDisplay(projectConfig)],
  ];

  return formatAsciiTable({ headers, rows });
}

/**
 * Format the environment section as a table with status icons.
 */
export function formatEnvironmentSection(envVars: EnvVarInfo[]): string {
  const lines: string[] = [];
  lines.push('Environment');
  lines.push(formatEnvironmentTable(envVars));

  return lines.join('\n');
}

export function formatEffectiveSafetySection(report: DoctorReport): string {
  const scopes = report.effectiveSafety.policyScopes;
  const lines = [
    `Effective Safety`,
    `   Selected preset: ${report.effectiveSafety.selectedPreset}${scopes ? ` (${describePolicyScope(scopes.levelScope)})` : ''}`,
    `   Effective: ${report.effectiveSafety.level}`,
  ];
  const capabilityLabels = [
    ['fail_closed', 'fail_closed'],
    ['paranoid_rm', 'paranoid_rm'],
    ['paranoid_interpreters', 'paranoid_interpreters'],
  ] as const;

  for (const [key, label] of capabilityLabels) {
    const capability = report.effectiveSafety.capabilities[key];
    const state = capability.enabled ? colors.green('ON') : colors.dim('OFF');
    const sources = capability.sources.length > 0 ? ` (${capability.sources.join(', ')})` : '';
    lines.push(`   ${label}: ${state} via ${capability.source}${sources}`);
  }

  // Display, not a gate: the project scope is honored as written, so these lines
  // report the merge result instead of becoming findings.
  if (scopes && scopes.weakenings.length > 0) {
    lines.push('   Project policy deltas:');
    for (const weakening of scopes.weakenings) lines.push(`      ${weakening}`);
  }

  lines.push(`   Stored rule customizations: ${report.effectiveSafety.ruleCounts.stored}`);
  lines.push(`   Effective rule customizations: ${report.effectiveSafety.ruleCounts.effective}`);
  for (const [id, override] of Object.entries(report.effectiveSafety.ruleOverrides)) {
    lines.push(`   ${id}: ${override}`);
  }

  return lines.join('\n');
}

export function formatFindingsSection(findings: DoctorFinding[]): string {
  const lines = ['Findings'];
  if (findings.length === 0) {
    lines.push('   No findings from inspected doctor facts.');
    return lines.join('\n');
  }

  for (const finding of findings) {
    const label = `[${finding.severity.toUpperCase()}] ${finding.checkId}: ${renderTerminalText(finding.title)}`;
    const color =
      finding.severity === 'error'
        ? colors.red
        : finding.severity === 'warning'
          ? colors.yellow
          : colors.blue;
    lines.push(`   ${color(label)}`);
    lines.push(`      ${renderTerminalText(finding.detail)}`);
    if (finding.path) lines.push(`      Path: ${renderTerminalText(finding.path)}`);
    if (finding.fixHint) lines.push(`      Fix: ${renderTerminalText(finding.fixHint)}`);
  }

  return lines.join('\n');
}

/**
 * Format environment variables as an ASCII table with ✓/✗ icons.
 */
function formatEnvironmentTable(envVars: EnvVarInfo[]): string {
  const headers = ['Variable', 'Status', 'Legacy'];
  const rows = envVars.map((v) => {
    const statusIcon = v.isSet ? colors.green('✓') : colors.dim('✗');
    const legacyStatus =
      v.legacyName && v.legacyIsSet ? `${v.legacyName} ${colors.green('✓')}` : (v.legacyName ?? '');
    return [v.name, statusIcon, legacyStatus];
  });

  return formatAsciiTable({ headers, rows });
}

/**
 * Format the activity section as a table.
 */
export function formatActivitySection(activity: ActivitySummary): string {
  const lines: string[] = [];

  // Header with summary
  if (activity.totalBlocked === 0) {
    lines.push('Recent Activity');
    lines.push('   No blocked commands in the last 7 days');
    lines.push('   Tip: This is normal for new installations');
  } else {
    lines.push(
      `Recent Activity · last 7 days (${activity.totalBlocked} blocked / ${activity.sessionCount} sessions)`,
    );
    lines.push(formatActivityTable(activity.recentEntries));
  }

  if (activity.unreadable > 0) {
    lines.push(
      `   Warning: ${activity.unreadable} audit log ${activity.unreadable === 1 ? 'source' : 'sources'} could not be read; this summary is incomplete`,
    );
  }

  return lines.join('\n');
}

/**
 * Format recent activity entries as an ASCII table.
 */
function formatActivityTable(entries: Array<{ relativeTime: string; command: string }>): string {
  const headers = ['Time', 'Command'];

  // Build rows - truncate long commands
  const rows = entries.map((e) => {
    const command = renderTerminalText(e.command.replace(/\r\n|\r|\n/g, ' ↵ ').replace(/\t/g, ' '));
    const cmd = command.length > 40 ? `${command.slice(0, 37)}...` : command;
    return [e.relativeTime, cmd];
  });

  return formatAsciiTable({ headers, rows });
}

/**
 * Format the update section as a table.
 */
export function formatUpdateSection(update: UpdateInfo): string {
  const lines: string[] = [];
  lines.push('Update Check');

  // Check if update check was skipped (latestVersion is null and no error)
  if (update.latestVersion === null && !update.error) {
    lines.push(
      formatUpdateTable([
        ['Status', colors.dim('Skipped')],
        ['Installed', update.currentVersion],
      ]),
    );
    return lines.join('\n');
  }

  // Check if there was an error
  if (update.error) {
    lines.push(
      formatUpdateTable([
        ['Status', `${colors.yellow('\u26a0')} Error`],
        ['Installed', update.currentVersion],
        ['Error', colors.dim(update.error)],
      ]),
    );
    return lines.join('\n');
  }

  // Check if update is available
  if (update.updateAvailable) {
    lines.push(
      formatUpdateTable([
        ['Status', `${colors.yellow('\u26a0')} Update Available`],
        ['Current', update.currentVersion],
        ['Latest', colors.green(update.latestVersion ?? '')],
      ]),
    );
    lines.push('');
    lines.push('   Run: bunx cc-safety-net@latest doctor');
    lines.push('   Or:  npx cc-safety-net@latest doctor');
    return lines.join('\n');
  }

  // Up to date
  lines.push(
    formatUpdateTable([
      ['Status', `${colors.green('\u2713')} Up to date`],
      ['Version', update.currentVersion],
    ]),
  );
  return lines.join('\n');
}

/**
 * Format update info as an ASCII table.
 */
function formatUpdateTable(rows: string[][]): string {
  return formatAsciiTable({ rows });
}

/**
 * Format the system info section as a table.
 */
export function formatSystemInfoSection(system: SystemInfo): string {
  const lines: string[] = [];
  lines.push('System Info');
  lines.push(formatSystemInfoTable(system));

  return lines.join('\n');
}

/**
 * Format system info as an ASCII table.
 */
function formatSystemInfoTable(system: SystemInfo): string {
  const headers = ['Component', 'Version'];

  const formatValue = (value: string | null): string => {
    if (value === null) return colors.dim('not found');
    return value;
  };

  const rowData = [
    { label: 'cc-safety-net', value: system.version },
    ...doctorIntegrationOrder.map((id) => ({
      label: getIntegrationDisplayName(id),
      value: system.versions[id] ?? null,
    })),
    { label: 'Node.js', value: system.nodeVersion },
    { label: 'npm', value: system.npmVersion },
    { label: 'Bun', value: system.bunVersion },
    { label: 'Platform', value: system.platform },
  ];

  const rows = rowData.map((r) => [r.label, formatValue(r.value)]);

  return formatAsciiTable({ headers, rows });
}

/**
 * Format the summary line.
 */
export function formatSummary(report: DoctorReport): string {
  if (report.findings.length === 0) {
    return colors.green('\nNo findings from inspected doctor facts.');
  }

  const counts = {
    error: report.findings.filter((finding) => finding.severity === 'error').length,
    warning: report.findings.filter((finding) => finding.severity === 'warning').length,
    info: report.findings.filter((finding) => finding.severity === 'info').length,
  };
  const parts = (['error', 'warning', 'info'] as const)
    .filter((severity) => counts[severity] > 0)
    .map((severity) => `${counts[severity]} ${severity}`);
  const label = report.findings.length === 1 ? 'finding' : 'findings';
  const message = `\n${report.findings.length} ${label}: ${parts.join(', ')}.`;
  if (counts.error > 0) return colors.red(message);
  if (counts.warning > 0) return colors.yellow(message);
  return colors.blue(message);
}
