/**
 * The managed OpenClaw plugin directory built into `dist/openclaw/cc-safety-net/`.
 *
 * OpenClaw discovers a native plugin from an `openclaw.plugin.json` manifest it can validate
 * without executing plugin code, plus a `package.json` whose `openclaw.extensions` points at the
 * runtime entry (`src/plugins/manifest-metadata-scan.ts`, `docs/plugins/manifest.md`). Both are
 * generated here so the version stamp, id, and entry path cannot drift apart.
 */

/** Canonical plugin id: the `plugins.entries` key, the install directory name, and the CLI id. */
export const OPENCLAW_PLUGIN_ID = 'cc-safety-net';

/** File OpenClaw imports as the plugin runtime, named by `openclaw.extensions`. */
export const OPENCLAW_PLUGIN_ENTRY_FILE = 'index.js';

/** Manifest OpenClaw reads before loading plugin code. */
export const OPENCLAW_PLUGIN_MANIFEST_FILE = 'openclaw.plugin.json';

/** Package manifest whose `openclaw.extensions` names the runtime entry OpenClaw imports. */
export const OPENCLAW_PLUGIN_PACKAGE_FILE = 'package.json';

const OPENCLAW_PLUGIN_NAME = 'CC Safety Net';
const OPENCLAW_PLUGIN_DESCRIPTION =
  'Block destructive commands and secret-file access before OpenClaw runs a tool.';

/**
 * First line of the built runtime artifact. The installer's packaged directory and doctor
 * detect a CC Safety Net managed plugin by this exact marker.
 */
export const OPENCLAW_MANAGED_HEADER =
  '// cc-safety-net managed OpenClaw plugin. Do not edit. Reinstall with: npx -y cc-safety-net install --openclaw';

/** Build-time artifact header: the stable marker plus the version doctor compares against. */
export function buildOpenClawArtifactHeader(version: string): string {
  return `${OPENCLAW_MANAGED_HEADER}\n// version: ${version}\n`;
}

/** Identity the manifest and the runtime entry must agree on for OpenClaw to load the plugin. */
export const OPENCLAW_PLUGIN_ENTRY = {
  id: OPENCLAW_PLUGIN_ID,
  name: OPENCLAW_PLUGIN_NAME,
  description: OPENCLAW_PLUGIN_DESCRIPTION,
};

/** The metadata files written beside the built runtime entry. */
export function buildOpenClawPluginManifests(
  version: string,
): readonly { name: string; content: string }[] {
  return [
    {
      name: OPENCLAW_PLUGIN_MANIFEST_FILE,
      content: `${JSON.stringify(
        {
          ...OPENCLAW_PLUGIN_ENTRY,
          version,
          // Without startup activation OpenClaw never imports the plugin, so the
          // before_tool_call hook is never registered and nothing is blocked.
          activation: { onStartup: true },
          configSchema: { type: 'object', additionalProperties: false, properties: {} },
        },
        null,
        2,
      )}\n`,
    },
    {
      name: OPENCLAW_PLUGIN_PACKAGE_FILE,
      content: `${JSON.stringify(
        {
          name: OPENCLAW_PLUGIN_ID,
          version,
          description: OPENCLAW_PLUGIN_DESCRIPTION,
          type: 'module',
          openclaw: { extensions: [`./${OPENCLAW_PLUGIN_ENTRY_FILE}`] },
        },
        null,
        2,
      )}\n`,
    },
  ];
}
