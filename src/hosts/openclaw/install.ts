/**
 * OpenClaw install support.
 *
 * OpenClaw owns its plugin state in a managed SQLite index, so installation drives the native
 * `openclaw plugins` CLI with the packaged plugin directory instead of writing that state here.
 */

import { existsSync, lstatSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Environment } from '@/core/environment';
import { lstatOrUndefined, readRecord } from '@/hosts/detect/context';
import { type NativeCommand, runNativeCommand } from '@/hosts/install/native';
import {
  OPENCLAW_MANAGED_HEADER,
  OPENCLAW_PLUGIN_ENTRY_FILE,
  OPENCLAW_PLUGIN_ID,
  OPENCLAW_PLUGIN_MANIFEST_FILE,
  OPENCLAW_PLUGIN_PACKAGE_FILE,
} from '@/hosts/openclaw/artifact';

const OPENCLAW_ARTIFACT_RELATIVE = join('openclaw', OPENCLAW_PLUGIN_ID);

/**
 * Everything a real `openclaw plugins install` leaves in the extension directory: the three
 * packaged files and nothing of its own, verified against the installed CLI both right after the
 * install and after a gateway had loaded the plugin.
 */
const INSTALLED_PLUGIN_FILES = [
  OPENCLAW_PLUGIN_ENTRY_FILE,
  OPENCLAW_PLUGIN_MANIFEST_FILE,
  OPENCLAW_PLUGIN_PACKAGE_FILE,
];

/**
 * OpenClaw runs both env overrides through `resolveUserPath`, which expands a leading `~` (alone or
 * before a separator) against the resolved home. Using the literal value would point doctor and the
 * install guard at a `~/…` directory that does not exist while the gateway loads the expanded one.
 */
function expandTilde(value: string, homeDir: string): string {
  if (value === '~') return homeDir;
  if (value.startsWith('~/') || value.startsWith('~\\')) return join(homeDir, value.slice(2));
  return value;
}

/**
 * OpenClaw resolves its state directory as `OPENCLAW_STATE_DIR`, then the directory holding
 * `OPENCLAW_CONFIG_PATH`, then `~/.openclaw` (`resolveConfigDir` in OpenClaw's `src/utils.ts`).
 * Reading the same order keeps a relocated install visible instead of reported as absent.
 */
function getOpenClawStateDir(environment: Environment): string {
  const stateDir = environment.env.get('OPENCLAW_STATE_DIR')?.trim();
  if (stateDir) return expandTilde(stateDir, environment.home);

  const configPath = environment.env.get('OPENCLAW_CONFIG_PATH')?.trim();
  return configPath
    ? dirname(expandTilde(configPath, environment.home))
    : join(environment.home, '.openclaw');
}

/** OpenClaw's own config file: `OPENCLAW_CONFIG_PATH` when set, else `<state dir>/openclaw.json`. */
export function getOpenClawConfigPath(environment: Environment): string {
  const configPath = environment.env.get('OPENCLAW_CONFIG_PATH')?.trim();
  return configPath
    ? expandTilde(configPath, environment.home)
    : join(getOpenClawStateDir(environment), 'openclaw.json');
}

/** Where `openclaw plugins install <dir>` copies the plugin (`<state dir>/extensions/<id>`). */
export function getOpenClawPluginDir(environment: Environment): string {
  return join(getOpenClawStateDir(environment), 'extensions', OPENCLAW_PLUGIN_ID);
}

/**
 * Our own install, or the empty directory a removal left behind: nothing of the user's to lose.
 * Both `--force` commands act on the whole directory, so every entry has to be one of ours —
 * a managed entry file next to a file of the user's is still a directory we must not destroy.
 */
function holdsOnlyOurPlugin(dir: string): boolean {
  const entries = readdirSync(dir);
  if (entries.length === 0) return true;
  if (entries.some((name) => !INSTALLED_PLUGIN_FILES.includes(name))) return false;

  const entry = join(dir, OPENCLAW_PLUGIN_ENTRY_FILE);
  const info = lstatOrUndefined(entry);
  return (
    info !== undefined &&
    !info.isSymbolicLink() &&
    info.isFile() &&
    readFileSync(entry, 'utf-8').startsWith(OPENCLAW_MANAGED_HEADER)
  );
}

/**
 * `plugins install --force` overwrites, and `plugins uninstall --force` deletes, whatever holds
 * the `cc-safety-net` extension id — including a plugin of the user's own that happens to use it.
 * Neither runs until the target is provably ours.
 */
export function assertOpenClawPluginDirIsOurs(environment: Environment): void {
  const dir = getOpenClawPluginDir(environment);
  const info = lstatOrUndefined(dir);
  if (!info) return;
  if (!info.isSymbolicLink() && info.isDirectory() && holdsOnlyOurPlugin(dir)) return;

  throw new Error(
    `Refusing to modify ${dir}: it does not hold a cc-safety-net managed OpenClaw plugin. Move or remove it, then run the command again.`,
  );
}

/**
 * Candidate locations of the packaged plugin directory, resolved relative to the installed CLI
 * module (never the user's project): the bundled CLI and its chunks sit one directory under
 * `dist/`, while the dev entrypoint runs from `src/hosts/openclaw/`.
 */
function openClawArtifactCandidates(): string[] {
  const moduleDir = dirname(fileURLToPath(import.meta.url));
  return [
    join(moduleDir, '..', OPENCLAW_ARTIFACT_RELATIVE),
    join(moduleDir, '..', '..', '..', 'dist', OPENCLAW_ARTIFACT_RELATIVE),
  ];
}

/**
 * The packaged plugin directory, or `undefined` when there is none — a checkout that was never
 * built has nothing to install from and nothing for doctor to compare an install against.
 */
export function findOpenClawArtifactDir(
  candidates: readonly string[] = openClawArtifactCandidates(),
): string | undefined {
  return candidates.find((path) => existsSync(path) && lstatSync(path).isDirectory());
}

/** @internal */
export function resolveOpenClawArtifactDir(
  candidates: readonly string[] = openClawArtifactCandidates(),
): string {
  const found = findOpenClawArtifactDir(candidates);
  if (!found)
    throw new Error(
      'Packaged OpenClaw plugin directory not found. Reinstall cc-safety-net and try again.',
    );
  return found;
}

/**
 * `--force` confirms the local directory source and overwrites an existing install, which
 * OpenClaw otherwise refuses non-interactively. Enablement is a separate step: an installed
 * plugin stays inert until `plugins.entries.<id>.enabled` is set.
 */
export function getOpenClawInstallCommands(
  artifactDir: string = resolveOpenClawArtifactDir(),
): readonly NativeCommand[] {
  return [
    ['openclaw', 'plugins', 'install', artifactDir, '--force'],
    ['openclaw', 'plugins', 'enable', OPENCLAW_PLUGIN_ID],
  ];
}

function readOpenClawPluginStatus(inspectOutput: string): string | undefined {
  const report = (() => {
    try {
      return JSON.parse(inspectOutput);
    } catch {
      return undefined;
    }
  })();
  const status = readRecord(readRecord(report, 'plugin'), 'status');
  return typeof status === 'string' ? status : undefined;
}

/**
 * Prove the installed plugin actually loads. An enabled plugin whose runtime throws or whose
 * bundle is broken installs cleanly and then silently protects nothing, and OpenClaw's inspect
 * command reports that as a status instead of a non-zero exit. A report we cannot read proves
 * nothing either way, so only a `loaded` status ends the install successfully.
 *
 * Only stdout is parsed: OpenClaw keeps its `--json` report there and sends the plugin lifecycle
 * trace (`OPENCLAW_PLUGIN_LIFECYCLE_TRACE=1`) and any warning to stderr, so merged output would
 * read as an unparseable report and fail an install that in fact succeeded.
 */
export async function verifyOpenClawPluginRuntime(): Promise<void> {
  const status = readOpenClawPluginStatus(
    await runNativeCommand(
      ['openclaw', 'plugins', 'inspect', OPENCLAW_PLUGIN_ID, '--runtime', '--json'],
      {
        stdoutOnly: true,
      },
    ),
  );
  if (status === 'loaded') return;
  throw new Error(
    `${
      status === undefined
        ? `The ${OPENCLAW_PLUGIN_ID} plugin's load state could not be verified: OpenClaw's runtime inspect report was unreadable.`
        : `OpenClaw reports the ${OPENCLAW_PLUGIN_ID} plugin with status "${status}".`
    } Run \`openclaw plugins inspect ${OPENCLAW_PLUGIN_ID} --runtime\` for details.`,
  );
}
