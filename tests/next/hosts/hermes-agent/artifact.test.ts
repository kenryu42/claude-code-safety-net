import { describe, expect, test } from 'bun:test';
import {
  buildHermesAgentPluginFiles,
  HERMES_AGENT_MANAGED_HEADER,
  HERMES_AGENT_PLUGIN_NAME,
} from '@next/hosts/hermes-agent/artifact';
import {
  HERMES_AGENT_MANAGED_HEADER as SHIPPED_HEADER,
  HERMES_AGENT_PLUGIN_NAME as SHIPPED_NAME,
  buildHermesAgentPluginFiles as shippedBuildFiles,
} from '@/integrations/hermes-agent/artifact';

/**
 * Hermes imports whatever bytes sit in the plugin directory, so the shim is contract down to its
 * docstring and its Windows kill branch. The port derives only the analyzer argv from the catalog;
 * everything else has to come out of the builder byte for byte at every version it is asked for.
 */

describe('the Hermes Agent plugin artifact', () => {
  test.each(['dev', '9.9.9'])('builds the shipped bytes at version %s', (version) => {
    const files = buildHermesAgentPluginFiles(version);

    expect(files).toEqual(shippedBuildFiles(version));
    expect(files).toMatchSnapshot();
  });

  test('keeps the ownership marker and the directory name the installer writes to', () => {
    const markers = { header: HERMES_AGENT_MANAGED_HEADER, name: HERMES_AGENT_PLUGIN_NAME };

    expect(markers).toEqual({ header: SHIPPED_HEADER, name: SHIPPED_NAME });
    expect(markers).toMatchSnapshot();
  });

  test('spawns the analyzer through the argv the Hermes adapter answers on', () => {
    const shim = buildHermesAgentPluginFiles('dev')[0];

    expect(shim?.name).toBe('__init__.py');
    expect(shim?.content).toStartWith(`${HERMES_AGENT_MANAGED_HEADER}\n# version: dev\n`);
    expect(shim?.content.split('\n')).toContain(
      'ANALYZER = ["npx", "-y", "cc-safety-net", "hook", "--hermes-agent"]',
    );
  });
});
