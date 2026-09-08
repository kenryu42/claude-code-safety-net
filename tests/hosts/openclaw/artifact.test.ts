import { describe, expect, test } from 'bun:test';
import {
  buildOpenClawArtifactHeader,
  buildOpenClawPluginManifests,
  OPENCLAW_MANAGED_HEADER,
  OPENCLAW_PLUGIN_ENTRY,
  OPENCLAW_PLUGIN_ENTRY_FILE,
  OPENCLAW_PLUGIN_ID,
  OPENCLAW_PLUGIN_MANIFEST_FILE,
  OPENCLAW_PLUGIN_PACKAGE_FILE,
} from '@/hosts/openclaw/artifact';

/**
 * OpenClaw validates the manifest before it imports a single line of plugin code, and doctor
 * compares an install against the packaged copy byte for byte. Both make these bytes contract:
 * the id, the entry path and the version stamp have to survive the port unchanged.
 */

const DESCRIPTION =
  'Block destructive commands and secret-file access before OpenClaw runs a tool.';

describe('the OpenClaw plugin artifact', () => {
  test.each(['dev', '1.2.3'])('builds the shipped metadata files at version %s', (version) => {
    const manifests = buildOpenClawPluginManifests(version);

    expect(manifests.map((manifest) => manifest.name)).toEqual([
      'openclaw.plugin.json',
      'package.json',
    ]);
    expect(manifests.map((manifest) => JSON.parse(manifest.content))).toEqual([
      {
        id: 'cc-safety-net',
        name: 'CC Safety Net',
        description: DESCRIPTION,
        version,
        // The gate has to be in place before the first tool call, so the plugin loads on startup
        // and takes no configuration of its own.
        activation: { onStartup: true },
        configSchema: { type: 'object', additionalProperties: false, properties: {} },
      },
      {
        name: 'cc-safety-net',
        version,
        description: DESCRIPTION,
        type: 'module',
        openclaw: { extensions: [`./${OPENCLAW_PLUGIN_ENTRY_FILE}`] },
      },
    ]);
    // Both files are written the way the packaged copy is, so doctor's byte comparison holds.
    for (const manifest of manifests) {
      expect(manifest.content).toBe(`${JSON.stringify(JSON.parse(manifest.content), null, 2)}\n`);
    }
  });

  test('stamps the runtime entry the way the build does', () => {
    expect(buildOpenClawArtifactHeader('1.2.3')).toBe(
      `${OPENCLAW_MANAGED_HEADER}\n// version: 1.2.3\n`,
    );
  });

  test('names the same plugin OpenClaw was told to load', () => {
    expect(OPENCLAW_PLUGIN_ID).toBe('cc-safety-net');
    expect(OPENCLAW_PLUGIN_ENTRY_FILE).toBe('index.js');
    expect(OPENCLAW_PLUGIN_MANIFEST_FILE).toBe('openclaw.plugin.json');
    expect(OPENCLAW_PLUGIN_PACKAGE_FILE).toBe('package.json');
    expect(OPENCLAW_MANAGED_HEADER).toBe(
      '// cc-safety-net managed OpenClaw plugin. Do not edit. Reinstall with: npx -y cc-safety-net install --openclaw',
    );
    // The entry the host imports declares the same three fields the manifest does.
    expect(OPENCLAW_PLUGIN_ENTRY).toEqual({
      id: 'cc-safety-net',
      name: 'CC Safety Net',
      description: DESCRIPTION,
    });
  });
});
