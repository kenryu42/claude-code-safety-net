/**
 * Output formatting utilities for the doctor command.
 */

import type {
  ActivitySummary,
  ConfigSourceInfo,
  DoctorReport,
  EffectiveRule,
  EnvVarInfo,
  HookStatus,
  SystemInfo,
  UpdateInfo,
} from '@/bin/doctor/types';
import { colors } from '@/bin/utils/colors';

const PLATFORM_NAMES: Record<string, string> = {
  'claude-code': 'Claude Code',
  opencode: 'OpenCode',
  'gemini-cli': 'Gemini CLI',
};

/**
 * Format the hooks section as a table with failure details below.
 */
export function formatHooksSection(hooks: HookStatus[]): string {
  const lines: string[] = [];

  lines.push('Hook Integration');
  lines.push(formatHooksTable(hooks));

  // Collect failures and errors
  const failures: Array<{
    platform: string;
    result: { description: string; expected: string; actual: string };
  }> = [];
  const warnings: Array<{ platform: string; message: string }> = [];
  const errors: Array<{ platform: string; message: string }> = [];

  for (const hook of hooks) {
    const platformName = PLATFORM_NAMES[hook.platform] ?? hook.platform;

    if (hook.selfTest) {
      for (const result of hook.selfTest.results) {
        if (!result.passed) {
          failures.push({ platform: platformName, result });
        }
      }
    }

    if (hook.errors && hook.errors.length > 0) {
      for (const err of hook.errors) {
        if (hook.status === 'configured') {
          warnings.push({ platform: platformName, message: err });
        } else {
          errors.push({ platform: platformName, message: err });
        }
      }
    }
  }

  // Show failures in red
  if (failures.length > 0) {
    lines.push('');
    lines.push(colors.red('   Failures:'));
    for (const f of failures) {
      lines.push(colors.red(`   • ${f.platform}: ${f.result.description}`));
      lines.push(colors.red(`     expected ${f.result.expected}, got ${f.result.actual}`));
    }
  }

  // Show warnings
  for (const w of warnings) {
    lines.push(`   Warning (${w.platform}): ${w.message}`);
  }

  // Show errors
  for (const e of errors) {
    lines.push(`   Error (${e.platform}): ${e.message}`);
  }

  return lines.join('\n');
}

/**
 * Format hooks as an ASCII table with colored status.
 */
function formatHooksTable(hooks: HookStatus[]): string {
  const headers = ['Platform', 'Status', 'Tests'];

  // Helper to get status display text and color
  const getStatusDisplay = (h: HookStatus): { text: string; colored: string } => {
    switch (h.status) {
      case 'configured':
        return { text: 'Configured', colored: colors.green('Configured') };
      case 'disabled':
        return { text: 'Disabled', colored: colors.yellow('Disabled') };
      case 'n/a':
        return { text: 'N/A', colored: colors.dim('N/A') };
    }
  };

  // Build rows with both colored and raw text
  const rowData = hooks.map((h) => {
    const platformName = PLATFORM_NAMES[h.platform] ?? h.platform;
    const statusDisplay = getStatusDisplay(h);
    let testsText = '-';
    if (h.status === 'configured' && h.selfTest) {
      const label = h.selfTest.failed > 0 ? 'FAIL' : 'OK';
      testsText = `${h.selfTest.passed}/${h.selfTest.total} ${label}`;
    }
    return {
      colored: [platformName, statusDisplay.colored, testsText],
      raw: [platformName, statusDisplay.text, testsText],
    };
  });

  const rows = rowData.map((r) => r.colored);
  const rawRows = rowData.map((r) => r.raw);

  // Calculate column widths (using raw text without ANSI codes for width calc)
  const colWidths = headers.map((h, i) => {
    const maxDataWidth = Math.max(...rawRows.map((r) => r[i]?.length ?? 0));
    return Math.max(h.length, maxDataWidth);
  });

  const pad = (s: string, w: number, raw: string) => s + ' '.repeat(Math.max(0, w - raw.length));

  const line = (char: string, corners: [string, string, string]) =>
    corners[0] + colWidths.map((w) => char.repeat(w + 2)).join(corners[1]) + corners[2];

  const formatRow = (cells: string[], rawCells: string[]) =>
    `│ ${cells.map((c, i) => pad(c, colWidths[i] ?? 0, rawCells[i] ?? '')).join(' │ ')} │`;

  const tableLines = [
    `   ${line('─', ['┌', '┬', '┐'])}`,
    `   ${formatRow(headers, headers)}`,
    `   ${line('─', ['├', '┼', '┤'])}`,
    ...rows.map((r, i) => `   ${formatRow(r, rawRows[i] ?? [])}`),
    `   ${line('─', ['└', '┴', '┘'])}`,
  ];

  return tableLines.join('\n');
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

  // Calculate column widths
  const colWidths = headers.map((h, i) => {
    const maxDataWidth = Math.max(...rows.map((r) => r[i]?.length ?? 0));
    return Math.max(h.length, maxDataWidth);
  });

  const pad = (s: string, w: number) => s.padEnd(w);

  const line = (char: string, corners: [string, string, string]) =>
    corners[0] + colWidths.map((w) => char.repeat(w + 2)).join(corners[1]) + corners[2];

  const formatRow = (cells: string[]) =>
    `│ ${cells.map((c, i) => pad(c, colWidths[i] ?? 0)).join(' │ ')} │`;

  const tableLines = [
    `   ${line('─', ['┌', '┬', '┐'])}`,
    `   ${formatRow(headers)}`,
    `   ${line('─', ['├', '┼', '┤'])}`,
    ...rows.map((r) => `   ${formatRow(r)}`),
    `   ${line('─', ['└', '┴', '┘'])}`,
  ];

  return tableLines.join('\n');
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

  const getStatusDisplay = (config: ConfigSourceInfo): { text: string; colored: string } => {
    if (!config.exists) {
      return { text: 'N/A', colored: colors.dim('N/A') };
    }
    if (!config.valid) {
      const errMsg = config.errors?.[0] ?? 'unknown error';
      const text = `Invalid (${errMsg})`;
      return { text, colored: colors.red(text) };
    }
    return { text: 'Configured', colored: colors.green('Configured') };
  };

  const userStatus = getStatusDisplay(userConfig);
  const projectStatus = getStatusDisplay(projectConfig);

  const rows = [
    ['User', userStatus.colored],
    ['Project', projectStatus.colored],
  ];
  const rawRows = [
    ['User', userStatus.text],
    ['Project', projectStatus.text],
  ];

  // Calculate column widths (using raw text without ANSI codes for width calc)
  const colWidths = headers.map((h, i) => {
    const maxDataWidth = Math.max(...rawRows.map((r) => r[i]?.length ?? 0));
    return Math.max(h.length, maxDataWidth);
  });

  const pad = (s: string, w: number, raw: string) => s + ' '.repeat(Math.max(0, w - raw.length));

  const line = (char: string, corners: [string, string, string]) =>
    corners[0] + colWidths.map((w) => char.repeat(w + 2)).join(corners[1]) + corners[2];

  const formatRow = (cells: string[], rawCells: string[]) =>
    `│ ${cells.map((c, i) => pad(c, colWidths[i] ?? 0, rawCells[i] ?? '')).join(' │ ')} │`;

  const tableLines = [
    `   ${line('─', ['┌', '┬', '┐'])}`,
    `   ${formatRow(headers, headers)}`,
    `   ${line('─', ['├', '┼', '┤'])}`,
    ...rows.map((r, i) => `   ${formatRow(r, rawRows[i] ?? [])}`),
    `   ${line('─', ['└', '┴', '┘'])}`,
  ];

  return tableLines.join('\n');
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

/**
 * Format environment variables as an ASCII table with ✓/✗ icons.
 */
function formatEnvironmentTable(envVars: EnvVarInfo[]): string {
  const headers = ['Variable', 'Status'];
  const rows = envVars.map((v) => {
    const statusIcon = v.isSet ? colors.green('✓') : colors.dim('✗');
    return [v.name, statusIcon];
  });

  // Calculate column widths (using raw text without ANSI codes for width calc)
  const rawRows = envVars.map((v) => [v.name, v.isSet ? '✓' : '✗']);
  const colWidths = headers.map((h, i) => {
    const maxDataWidth = Math.max(...rawRows.map((r) => r[i]?.length ?? 0));
    return Math.max(h.length, maxDataWidth);
  });

  const pad = (s: string, w: number, raw: string) => s + ' '.repeat(Math.max(0, w - raw.length));

  const line = (char: string, corners: [string, string, string]) =>
    corners[0] + colWidths.map((w) => char.repeat(w + 2)).join(corners[1]) + corners[2];

  const formatRow = (cells: string[], rawCells: string[]) =>
    `│ ${cells.map((c, i) => pad(c, colWidths[i] ?? 0, rawCells[i] ?? '')).join(' │ ')} │`;

  const tableLines = [
    `   ${line('─', ['┌', '┬', '┐'])}`,
    `   ${formatRow(headers, headers)}`,
    `   ${line('─', ['├', '┼', '┤'])}`,
    ...rows.map((r, i) => `   ${formatRow(r, rawRows[i] ?? [])}`),
    `   ${line('─', ['└', '┴', '┘'])}`,
  ];

  return tableLines.join('\n');
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
      `Recent Activity (${activity.totalBlocked} blocked / ${activity.sessionCount} sessions)`,
    );
    lines.push(formatActivityTable(activity.recentEntries));
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
    const cmd = e.command.length > 40 ? `${e.command.slice(0, 37)}...` : e.command;
    return [e.relativeTime, cmd];
  });

  // Calculate column widths
  const colWidths = headers.map((h, i) => {
    const maxDataWidth = Math.max(...rows.map((r) => r[i]?.length ?? 0));
    return Math.max(h.length, maxDataWidth);
  });

  const pad = (s: string, w: number) => s.padEnd(w);

  const line = (char: string, corners: [string, string, string]) =>
    corners[0] + colWidths.map((w) => char.repeat(w + 2)).join(corners[1]) + corners[2];

  const formatRow = (cells: string[]) =>
    `│ ${cells.map((c, i) => pad(c, colWidths[i] ?? 0)).join(' │ ')} │`;

  const tableLines = [
    `   ${line('─', ['┌', '┬', '┐'])}`,
    `   ${formatRow(headers)}`,
    `   ${line('─', ['├', '┼', '┤'])}`,
    ...rows.map((r) => `   ${formatRow(r)}`),
    `   ${line('─', ['└', '┴', '┘'])}`,
  ];

  return tableLines.join('\n');
}

/**
 * Format the update section as a table.
 */
export function formatUpdateSection(update: UpdateInfo): string {
  const lines: string[] = [];
  lines.push('Update Check');

  // Build table rows based on state
  const rowData: Array<{ label: string; value: string; rawValue: string }> = [];

  // Check if update check was skipped (latestVersion is null and no error)
  if (update.latestVersion === null && !update.error) {
    rowData.push({
      label: 'Status',
      value: colors.dim('Skipped'),
      rawValue: 'Skipped',
    });
    rowData.push({
      label: 'Installed',
      value: update.currentVersion,
      rawValue: update.currentVersion,
    });
    lines.push(formatUpdateTable(rowData));
    return lines.join('\n');
  }

  // Check if there was an error
  if (update.error) {
    rowData.push({
      label: 'Status',
      value: `${colors.yellow('⚠')} Error`,
      rawValue: '⚠ Error',
    });
    rowData.push({
      label: 'Installed',
      value: update.currentVersion,
      rawValue: update.currentVersion,
    });
    rowData.push({
      label: 'Error',
      value: colors.dim(update.error),
      rawValue: update.error,
    });
    lines.push(formatUpdateTable(rowData));
    return lines.join('\n');
  }

  // Check if update is available
  if (update.updateAvailable) {
    rowData.push({
      label: 'Status',
      value: `${colors.yellow('⚠')} Update Available`,
      rawValue: '⚠ Update Available',
    });
    rowData.push({
      label: 'Current',
      value: update.currentVersion,
      rawValue: update.currentVersion,
    });
    rowData.push({
      label: 'Latest',
      value: colors.green(update.latestVersion ?? ''),
      rawValue: update.latestVersion ?? '',
    });
    lines.push(formatUpdateTable(rowData));
    lines.push('');
    lines.push('   Run: bunx cc-safety-net@latest doctor');
    lines.push('   Or:  npx cc-safety-net@latest doctor');
    return lines.join('\n');
  }

  // Up to date
  rowData.push({
    label: 'Status',
    value: `${colors.green('✓')} Up to date`,
    rawValue: '✓ Up to date',
  });
  rowData.push({
    label: 'Version',
    value: update.currentVersion,
    rawValue: update.currentVersion,
  });
  lines.push(formatUpdateTable(rowData));
  return lines.join('\n');
}

/**
 * Format update info as an ASCII table.
 */
function formatUpdateTable(
  rowData: Array<{ label: string; value: string; rawValue: string }>,
): string {
  const rows = rowData.map((r) => [r.label, r.value]);
  const rawRows = rowData.map((r) => [r.label, r.rawValue]);

  // Calculate column widths (using raw text without ANSI codes for width calc)
  const colWidths = [0, 1].map((i) => {
    return Math.max(...rawRows.map((r) => r[i]?.length ?? 0));
  });

  const pad = (s: string, w: number, raw: string) => s + ' '.repeat(Math.max(0, w - raw.length));

  const line = (char: string, corners: [string, string, string]) =>
    corners[0] + colWidths.map((w) => char.repeat(w + 2)).join(corners[1]) + corners[2];

  const formatRow = (cells: string[], rawCells: string[]) =>
    `│ ${cells.map((c, i) => pad(c, colWidths[i] ?? 0, rawCells[i] ?? '')).join(' │ ')} │`;

  const tableLines = [
    `   ${line('─', ['┌', '┬', '┐'])}`,
    ...rows.map((r, i) => `   ${formatRow(r, rawRows[i] ?? [])}`),
    `   ${line('─', ['└', '┴', '┘'])}`,
  ];

  return tableLines.join('\n');
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

  const rawValue = (value: string | null): string => {
    return value ?? 'not found';
  };

  const rowData = [
    { label: 'cc-safety-net', value: system.version },
    { label: 'Claude Code', value: system.claudeCodeVersion },
    { label: 'OpenCode', value: system.openCodeVersion },
    { label: 'Gemini CLI', value: system.geminiCliVersion },
    { label: 'Node.js', value: system.nodeVersion },
    { label: 'npm', value: system.npmVersion },
    { label: 'Bun', value: system.bunVersion },
    { label: 'Platform', value: system.platform },
  ];

  const rows = rowData.map((r) => [r.label, formatValue(r.value)]);
  const rawRows = rowData.map((r) => [r.label, rawValue(r.value)]);

  // Calculate column widths (using raw text without ANSI codes for width calc)
  const colWidths = headers.map((h, i) => {
    const maxDataWidth = Math.max(...rawRows.map((r) => r[i]?.length ?? 0));
    return Math.max(h.length, maxDataWidth);
  });

  const pad = (s: string, w: number, raw: string) => s + ' '.repeat(Math.max(0, w - raw.length));

  const line = (char: string, corners: [string, string, string]) =>
    corners[0] + colWidths.map((w) => char.repeat(w + 2)).join(corners[1]) + corners[2];

  const formatRow = (cells: string[], rawCells: string[]) =>
    `│ ${cells.map((c, i) => pad(c, colWidths[i] ?? 0, rawCells[i] ?? '')).join(' │ ')} │`;

  const tableLines = [
    `   ${line('─', ['┌', '┬', '┐'])}`,
    `   ${formatRow(headers, headers)}`,
    `   ${line('─', ['├', '┼', '┤'])}`,
    ...rows.map((r, i) => `   ${formatRow(r, rawRows[i] ?? [])}`),
    `   ${line('─', ['└', '┴', '┘'])}`,
  ];

  return tableLines.join('\n');
}

/**
 * Format the summary line.
 */
export function formatSummary(report: DoctorReport): string {
  const hooksFailed = report.hooks.every((h) => h.status !== 'configured');
  const selfTestFailed = report.hooks.some((h) => h.selfTest && h.selfTest.failed > 0);
  const configFailed =
    (report.userConfig.errors?.length ?? 0) > 0 || (report.projectConfig.errors?.length ?? 0) > 0;

  const failures = [hooksFailed, selfTestFailed, configFailed].filter(Boolean).length;

  // Count warnings
  let warnings = 0;
  if (report.update.updateAvailable) warnings++;
  if (report.activity.totalBlocked === 0) warnings++;
  warnings += report.shadowedRules.length;

  if (failures > 0) {
    return colors.red(`\n${failures} check(s) failed.`);
  }

  if (warnings > 0) {
    return colors.yellow(`\nAll checks passed with ${warnings} warning(s).`);
  }

  return colors.green('\nAll checks passed.');
}
