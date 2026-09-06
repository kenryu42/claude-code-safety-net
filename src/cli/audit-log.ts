import { readdirSync, statSync, unlinkSync } from 'node:fs';
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { findSuspectEntries, listAuditLogFiles, readAuditLogEntries } from '@/audit/reader';
import { pruneExpiredAuditLogs } from '@/audit/retention';
import { getAuditLogsDir } from '@/audit/writer';
import { parseCommandArgs, reportCommandArgErrors } from '@/cli/args';
import { renderTerminalText } from '@/cli/utils/terminal';
import type { AuditLogEntry } from '@/core/audit';
import type { Environment } from '@/core/environment';
import { readRetentionDays } from '@/core/policy/retention';

type LogsFlags = {
  limit: number;
  limitExplicit: boolean;
  since: number;
  sinceExplicit: boolean;
  all: boolean;
  json: boolean;
  suspect: boolean;
  pruneLegacy: boolean;
  dryRun: boolean;
  id?: string;
  agent?: string;
  rule?: string;
  session?: string;
  project?: string;
};

type SourcedAuditLogEntry = {
  entry: AuditLogEntry;
  file: string;
};

function parseLogsFlags(environment: Environment, args: string[]): LogsFlags | null {
  // Retained history is the only history, so neither the `--since` ceiling nor
  // the default window can reach past it.
  const retentionDays = readRetentionDays(environment);
  const parsed = parseCommandArgs(
    {
      label: 'logs',
      booleans: {
        all: ['--all'],
        suspect: ['--suspect'],
        json: ['--json'],
        pruneLegacy: ['--prune-legacy'],
        dryRun: ['--dry-run'],
      },
      values: {
        id: ['--id'],
        limit: ['--limit'],
        since: ['--since'],
        agent: ['--agent'],
        rule: ['--rule'],
        session: ['--session'],
        project: ['--project'],
      },
    },
    args,
  );
  if (reportCommandArgErrors(parsed.errors)) return null;

  if (parsed.values.id !== undefined && !/^[a-f0-9]{16}$/.test(parsed.values.id)) {
    console.error('--id must be 16 hexadecimal characters');
    return null;
  }
  const limit = parsed.values.limit === undefined ? 20 : parsePositiveNumber(parsed.values.limit);
  if (limit === null) {
    console.error('--limit must be a positive number');
    return null;
  }
  const since =
    parsed.values.since === undefined
      ? Math.min(30, retentionDays)
      : parsePositiveNumber(parsed.values.since);
  if (since === null || since > retentionDays) {
    console.error(`--since must be a positive number of days no greater than ${retentionDays}`);
    return null;
  }

  const flags: LogsFlags = {
    limit,
    limitExplicit: parsed.values.limit !== undefined,
    since,
    sinceExplicit: parsed.values.since !== undefined,
    all: parsed.flags.all,
    json: parsed.flags.json,
    suspect: parsed.flags.suspect,
    pruneLegacy: parsed.flags.pruneLegacy,
    dryRun: parsed.flags.dryRun,
    id: parsed.values.id,
    agent: parsed.values.agent,
    rule: parsed.values.rule,
    session: parsed.values.session,
    project: parsed.values.project === undefined ? undefined : resolve(parsed.values.project),
  };

  if (
    flags.id &&
    (flags.agent !== undefined ||
      flags.rule !== undefined ||
      flags.session !== undefined ||
      flags.project !== undefined ||
      flags.suspect ||
      flags.sinceExplicit ||
      flags.limitExplicit)
  ) {
    console.error(
      '--id cannot be combined with --agent, --rule, --session, --project, --suspect, --since, or --limit',
    );
    return null;
  }

  if (
    flags.pruneLegacy &&
    (flags.id !== undefined ||
      flags.agent !== undefined ||
      flags.rule !== undefined ||
      flags.session !== undefined ||
      flags.project !== undefined ||
      flags.suspect ||
      flags.all ||
      flags.sinceExplicit ||
      flags.limitExplicit)
  ) {
    console.error(
      '--prune-legacy cannot be combined with --id, --agent, --rule, --session, --project, --suspect, --all, --since, or --limit',
    );
    return null;
  }

  if (flags.dryRun && !flags.pruneLegacy) {
    console.error('--dry-run requires --prune-legacy');
    return null;
  }

  return flags;
}

export async function runLogsCommand(
  environment: Environment,
  args: string[],
  options: { logsDir?: string; timeZone?: string } = {},
): Promise<number> {
  const flags = parseLogsFlags(environment, args);
  if (!flags) return 1;

  const logsDir = options.logsDir ?? getAuditLogsDir(environment);
  if (flags.pruneLegacy) return pruneLegacyAuditLogs(logsDir, flags.json, flags.dryRun);
  if (!logsDir) {
    console.log(
      flags.json
        ? '[]'
        : flags.id
          ? `No retained audit log entry found for id ${renderTerminalText(flags.id)}.`
          : 'No audit log entries found.',
    );
    return 0;
  }
  pruneExpiredAuditLogs(environment, logsDir);
  // An unreadable file or a malformed record makes every answer below a partial
  // one, including "nothing found". Say so once on stderr, name no paths, and
  // leave stdout and the exit code untouched.
  const skips = { count: 0 };
  const allEntries = listAuditLogFiles(logsDir, skips).flatMap((file) =>
    readAuditLogEntries(file, skips).map((entry) => ({ entry, file })),
  );
  if (skips.count > 0) {
    console.error(
      `warning: ${skips.count} audit log ${skips.count === 1 ? 'source' : 'sources'} could not be read; these results are incomplete`,
    );
  }
  if (flags.id) return outputIdLookup(allEntries, flags, options.timeZone);

  const cutoff = Date.now() - flags.since * 24 * 60 * 60 * 1000;
  const matched = allEntries.filter((item) => matchesLogsFlags(item, flags, logsDir, cutoff));
  // Repeats are counted across the whole matched window before --limit truncates
  // it; counting after the slice would lose the retries the signal is built on.
  const suspects = flags.suspect ? findSuspectEntries(matched.map((item) => item.entry)) : null;
  const entries = (suspects ? matched.filter((item) => suspects.has(item.entry)) : matched)
    .sort((left, right) => Date.parse(right.entry.ts) - Date.parse(left.entry.ts))
    .slice(0, flags.limit);

  if (flags.json) {
    console.log(
      JSON.stringify(
        entries.map((item) => item.entry),
        null,
        2,
      ),
    );
    return 0;
  }

  if (entries.length === 0) {
    console.log('No audit log entries found.');
    return 0;
  }

  for (const item of entries) {
    console.log(formatLogEntry(item.entry, options.timeZone));
  }
  return 0;
}

/**
 * Delete every regular `*.jsonl` file sitting directly in the audit root. That
 * layout is only ever produced by the legacy writer, so membership is decided
 * by position alone: entry age, schema, and malformed lines are irrelevant
 * because the user asked for all of it to go. Nested project directories are
 * never entered, and symlinks are not regular files, so neither can be a target.
 *
 * `dryRun` reports exactly that set and deletes nothing.
 */
function pruneLegacyAuditLogs(logsDir: string | null, json: boolean, dryRun: boolean): number {
  const files = logsDir ? listLegacyLogFiles(logsDir).map((name) => join(logsDir, name)) : [];
  if (dryRun) return previewLegacyAuditLogs(files, json);
  const failures: string[] = [];
  let removedFiles = 0;
  let removedBytes = 0;

  for (const file of files) {
    const bytes = statSync(file, { throwIfNoEntry: false })?.size ?? 0;
    const error = unlinkLegacyLogFile(file);
    if (error) {
      failures.push(`${basename(file)}: ${error}`);
      continue;
    }
    removedFiles++;
    removedBytes += bytes;
  }

  if (json) {
    console.log(JSON.stringify({ removedFiles, removedBytes, failedFiles: failures.length }));
    return failures.length === 0 ? 0 : 1;
  }

  console.log(
    removedFiles === 0 && failures.length === 0
      ? 'No legacy audit log files found.'
      : `Removed ${removedFiles} legacy audit log ${removedFiles === 1 ? 'file' : 'files'} (${formatBytes(removedBytes)}).`,
  );
  for (const failure of failures) {
    console.error(`Could not remove ${renderTerminalText(failure)}`);
  }
  console.log('Nested v2 audit logs were not changed.');
  if (removedFiles > 0) console.log('This deletion cannot be undone.');
  return failures.length === 0 ? 0 : 1;
}

function previewLegacyAuditLogs(files: string[], json: boolean): number {
  const bytes = files.reduce(
    (total, file) => total + (statSync(file, { throwIfNoEntry: false })?.size ?? 0),
    0,
  );
  if (json) {
    console.log(JSON.stringify({ dryRun: true, files: files.length, bytes }));
    return 0;
  }
  console.log(
    files.length === 0
      ? 'No legacy audit log files found.'
      : `Would remove ${files.length} legacy audit log ${files.length === 1 ? 'file' : 'files'} (${formatBytes(bytes)}).`,
  );
  console.log('Nested v2 audit logs are not included.');
  if (files.length > 0) console.log('Run the same command without --dry-run to delete them.');
  return 0;
}

function listLegacyLogFiles(logsDir: string): string[] {
  try {
    return readdirSync(logsDir, { withFileTypes: true })
      .filter((entry) => entry.isFile() && entry.name.endsWith('.jsonl'))
      .map((entry) => entry.name);
  } catch {
    return [];
  }
}

function unlinkLegacyLogFile(file: string): string | null {
  try {
    unlinkSync(file);
    return null;
  } catch (error) {
    return error instanceof Error ? error.message : String(error);
  }
}

function formatBytes(bytes: number): string {
  const units = ['B', 'KiB', 'MiB', 'GiB'];
  const unit = Math.min(Math.floor(Math.log2(Math.max(bytes, 1)) / 10), units.length - 1);
  return `${Math.round((bytes / 1024 ** unit) * 10) / 10} ${units[unit]}`;
}

function outputIdLookup(
  entries: SourcedAuditLogEntry[],
  flags: LogsFlags,
  timeZone?: string,
): number {
  const matches = entries.filter((item) => item.entry.id === flags.id);
  if (matches.length > 1) {
    console.error(`Multiple audit log entries found for id ${renderTerminalText(flags.id ?? '')}.`);
    return 1;
  }
  if (flags.json) {
    console.log(
      JSON.stringify(
        matches.map((item) => item.entry),
        null,
        2,
      ),
    );
    return 0;
  }
  const match = matches[0];
  if (!match) {
    console.log(`No retained audit log entry found for id ${renderTerminalText(flags.id ?? '')}.`);
    return 0;
  }
  console.log(formatLogEntryDetail(match.entry, timeZone));
  return 0;
}

function matchesLogsFlags(
  item: SourcedAuditLogEntry,
  flags: LogsFlags,
  logsDir: string,
  cutoff: number,
): boolean {
  if (!flags.all && item.entry.decision === 'allow') return false;
  if (Date.parse(item.entry.ts) < cutoff) return false;
  if (flags.agent !== undefined && item.entry.agent !== flags.agent) return false;
  if (flags.rule !== undefined && item.entry.ruleId !== flags.rule) return false;
  if (flags.session !== undefined && !matchesSession(item, logsDir, flags.session)) return false;
  if (flags.project !== undefined && !matchesProject(item.entry.cwd, flags.project)) return false;
  return true;
}

function matchesSession(item: SourcedAuditLogEntry, logsDir: string, session: string): boolean {
  if (item.entry.sessionId === session) return true;
  return dirname(item.file) === logsDir && basename(item.file, '.jsonl') === session;
}

function matchesProject(cwd: string | null | undefined, project: string): boolean {
  if (!cwd) return false;
  const nested = relative(project, cwd);
  return nested !== '..' && !nested.startsWith(`..${sep}`) && !isAbsolute(nested);
}

function formatLogEntry(entry: AuditLogEntry, timeZone?: string): string {
  const id = renderTerminalText(entry.id ?? '-');
  const decision = renderTerminalText(entry.decision ?? 'deny');
  const cwd = entry.cwd ? `  [${renderTerminalText(entry.cwd)}]` : '';
  const segment = entry.segment || entry.command;
  const marker = segment === entry.command ? '' : '↳ ';
  const command = segment.length > 50 ? `${segment.slice(0, 50)}…` : segment;
  return `${id.padEnd(16)}  ${renderTerminalText(formatHumanTimestamp(entry.ts, timeZone))}  ${decision.padEnd(5)}  ${renderTerminalText(entry.agent ?? '-').padEnd(15)}  ${renderTerminalText(entry.ruleId ?? '-').padEnd(20)}  ${marker}${renderTerminalText(command)}${cwd}`;
}

function formatLogEntryDetail(entry: AuditLogEntry, timeZone?: string): string {
  const value = (input: string | null | undefined): string =>
    renderTerminalText(input === undefined || input === null || input === '' ? '-' : input);
  const agent = entry.shape
    ? `${entry.agent ?? '-'} (shape: ${entry.shape})`
    : (entry.agent ?? '-');
  return [
    `id:        ${value(entry.id)}`,
    `ts:        ${value(formatHumanTimestamp(entry.ts, timeZone))}`,
    `decision:  ${value(entry.decision)}`,
    `agent:     ${value(agent)}`,
    `level:     ${value(entry.level)}`,
    `tool:      ${value(entry.toolName)}`,
    `rule:      ${value(entry.ruleId)}`,
    `intent:    ${value(entry.intent)}`,
    `stage:     ${value(entry.failureStage)}`,
    `error:     ${value(entry.errorCode)}`,
    `session:   ${value(entry.sessionId)}`,
    `cwd:       ${value(entry.cwd)}`,
    `version:   ${value(entry.v)}`,
    `truncated: ${value(entry.truncated === true ? 'yes' : undefined)}`,
    `reason:    ${value(entry.reason)}`,
    `command:   ${value(entry.command)}`,
    `segment:   ${value(entry.segment)}`,
  ].join('\n');
}

function formatHumanTimestamp(timestamp: string, timeZone?: string): string {
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) return timestamp;
  return new Intl.DateTimeFormat('sv-SE', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
    timeZone,
  }).format(date);
}

function parsePositiveNumber(value: string): number | null {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}
