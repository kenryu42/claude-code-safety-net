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
} from '@next/hosts/openclaw/artifact';
import {
  OPENCLAW_PLUGIN_ENTRY as SHIPPED_ENTRY,
  OPENCLAW_PLUGIN_ENTRY_FILE as SHIPPED_ENTRY_FILE,
  OPENCLAW_PLUGIN_ID as SHIPPED_ID,
  OPENCLAW_MANAGED_HEADER as SHIPPED_MANAGED_HEADER,
  OPENCLAW_PLUGIN_MANIFEST_FILE as SHIPPED_MANIFEST_FILE,
  OPENCLAW_PLUGIN_PACKAGE_FILE as SHIPPED_PACKAGE_FILE,
  buildOpenClawArtifactHeader as shippedHeader,
  buildOpenClawPluginManifests as shippedManifests,
} from '@/integrations/openclaw/artifact';

/**
 * OpenClaw validates the manifest before it imports a single line of plugin code, and doctor
 * compares an install against the packaged copy byte for byte. Both make these bytes contract:
 * the id, the entry path and the version stamp have to survive the port unchanged.
 */

describe('the OpenClaw plugin artifact', () => {
  test.each(['dev', '1.2.3'])('builds the shipped metadata files at version %s', (version) => {
    const manifests = buildOpenClawPluginManifests(version);

    expect(manifests).toEqual(shippedManifests(version));
    expect(manifests).toMatchSnapshot();
  });

  test('stamps the runtime entry the way the build does', () => {
    expect(buildOpenClawArtifactHeader('1.2.3')).toBe(shippedHeader('1.2.3'));
    expect(buildOpenClawArtifactHeader('1.2.3')).toBe(
      `${OPENCLAW_MANAGED_HEADER}\n// version: 1.2.3\n`,
    );
  });

  test('names the same plugin OpenClaw was told to load', () => {
    const named = {
      id: OPENCLAW_PLUGIN_ID,
      entryFile: OPENCLAW_PLUGIN_ENTRY_FILE,
      manifestFile: OPENCLAW_PLUGIN_MANIFEST_FILE,
      packageFile: OPENCLAW_PLUGIN_PACKAGE_FILE,
      header: OPENCLAW_MANAGED_HEADER,
      entry: OPENCLAW_PLUGIN_ENTRY,
    };

    expect(named).toEqual({
      id: SHIPPED_ID,
      entryFile: SHIPPED_ENTRY_FILE,
      manifestFile: SHIPPED_MANIFEST_FILE,
      packageFile: SHIPPED_PACKAGE_FILE,
      header: SHIPPED_MANAGED_HEADER,
      entry: SHIPPED_ENTRY,
    });
    expect(named).toMatchSnapshot();
  });
});
