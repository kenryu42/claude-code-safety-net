import { describe, expect, test } from 'bun:test';
import {
  buildHermesAgentPluginFiles,
  HERMES_AGENT_MANAGED_HEADER,
  HERMES_AGENT_PLUGIN_NAME,
} from '@/hosts/hermes-agent/artifact';

/**
 * Hermes discovers the plugin from the manifest and then imports the shim beside it, so the
 * manifest is the format it reads and the version stamp is what doctor compares an install
 * against. Both files carry the ownership marker the installer refuses to overwrite without.
 */

describe('the Hermes Agent plugin artifact', () => {
  test.each(['dev', '9.9.9'])('builds the shipped files at version %s', (version) => {
    const files = buildHermesAgentPluginFiles(version);
    const stamp = `${HERMES_AGENT_MANAGED_HEADER}\n# version: ${version}\n`;

    expect(files.map((file) => file.name)).toEqual(['__init__.py', 'plugin.yaml']);
    for (const file of files) expect(file.content, file.name).toStartWith(stamp);
    // The manifest is the whole format Hermes discovers the plugin through.
    expect(files[1]?.content).toBe(
      `${stamp}name: cc-safety-net
version: "${version}"
description: "Block destructive commands and secret-file access before Hermes runs a tool."
author: "cc-safety-net"
provides_hooks:
  - pre_tool_call
`,
    );
  });

  test('keeps the ownership marker and the directory name the installer writes to', () => {
    expect(HERMES_AGENT_MANAGED_HEADER).toBe(
      '# cc-safety-net managed Hermes Agent plugin. Do not edit. Reinstall with: npx -y cc-safety-net install --hermes-agent',
    );
    expect(HERMES_AGENT_PLUGIN_NAME).toBe('cc-safety-net');
  });

  test('spawns the analyzer through the argv the Hermes adapter answers on', () => {
    const shim = buildHermesAgentPluginFiles('dev')[0];

    expect(shim?.name).toBe('__init__.py');
    expect(shim?.content.split('\n')).toContain(
      'ANALYZER = ["npx", "-y", "cc-safety-net", "hook", "--hermes-agent"]',
    );
    // The shim guards the four tools the adapter has a payload mapping for, and registers on the
    // one hook that runs before the call.
    expect(shim?.content.split('\n')).toContain('HOOK_EVENT = "pre_tool_call"');
    expect(shim?.content.split('\n')).toContain(
      'SUPPORTED_TOOLS = ("patch", "read_file", "terminal", "write_file")',
    );
    expect(shim?.content).toEndWith('ctx.register_hook("pre_tool_call", _pre_tool_call)\n');
  });
});
