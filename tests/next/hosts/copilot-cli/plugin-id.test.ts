import { describe, expect, test } from 'bun:test';
import {
  COPILOT_LEGACY_PLUGIN_DIR,
  COPILOT_PLUGIN_DIR,
  COPILOT_PLUGIN_ID,
  COPILOT_PRE_RENAME_PLUGIN_DIR,
  COPILOT_PRE_RENAME_PLUGIN_ID,
  hasCopilotLegacyPlugin,
  hasCopilotMarketplace,
  hasCopilotPreRenamePlugin,
  hasCopilotSafetyNetPlugin,
} from '@next/hosts/copilot-cli/plugin-id';
import {
  COPILOT_LEGACY_PLUGIN_DIR as SHIPPED_LEGACY_DIR,
  COPILOT_PLUGIN_DIR as SHIPPED_PLUGIN_DIR,
  COPILOT_PLUGIN_ID as SHIPPED_PLUGIN_ID,
  COPILOT_PRE_RENAME_PLUGIN_DIR as SHIPPED_PRE_RENAME_DIR,
  COPILOT_PRE_RENAME_PLUGIN_ID as SHIPPED_PRE_RENAME_ID,
  hasCopilotLegacyPlugin as shippedHasLegacy,
  hasCopilotMarketplace as shippedHasMarketplace,
  hasCopilotSafetyNetPlugin as shippedHasPlugin,
  hasCopilotPreRenamePlugin as shippedHasPreRename,
} from '@/integrations/copilot-cli/plugin-id';

/** `copilot plugin list` lines, including one the host painted green. */
const OUTPUTS: readonly (string | null)[] = [
  'cc-safety-net@cc-marketplace',
  'x cc-safety-net@cc-marketplace y',
  'copilot-safety-net',
  'safety-net@cc-marketplace',
  'cc-marketplace',
  'ccc-marketplace',
  null,
  '\u001b[32mcc-safety-net@cc-marketplace\u001b[0m',
];

const readAll = (
  predicates: readonly ((output: string | null) => boolean)[],
): readonly boolean[][] =>
  OUTPUTS.map((output) => predicates.map((predicate) => predicate(output)));

describe('the Copilot plugin identifiers', () => {
  test('read the same identity out of every `plugin list` line', () => {
    const read = readAll([
      hasCopilotSafetyNetPlugin,
      hasCopilotMarketplace,
      hasCopilotLegacyPlugin,
      hasCopilotPreRenamePlugin,
    ]);

    expect(read).toEqual(
      readAll([shippedHasPlugin, shippedHasMarketplace, shippedHasLegacy, shippedHasPreRename]),
    );
    expect(read).toMatchSnapshot();
  });

  test('match on a token boundary, so a longer identifier never counts as a hit', () => {
    // Columns: plugin, marketplace, legacy plugin, pre-rename plugin. The pre-rename id is a tail
    // of the current one, and `ccc-marketplace` a head-extension of the marketplace id.
    expect(
      readAll([
        hasCopilotSafetyNetPlugin,
        hasCopilotMarketplace,
        hasCopilotLegacyPlugin,
        hasCopilotPreRenamePlugin,
      ]),
    ).toEqual([
      [true, true, false, false],
      [true, true, false, false],
      [false, false, true, false],
      [false, true, false, true],
      [false, true, false, false],
      [false, false, false, false],
      [false, false, false, false],
      [false, true, false, false],
    ]);
  });

  test('name the same plugin, marketplace and checkout directories', () => {
    const names = [
      COPILOT_PLUGIN_ID,
      COPILOT_PLUGIN_DIR,
      COPILOT_LEGACY_PLUGIN_DIR,
      COPILOT_PRE_RENAME_PLUGIN_DIR,
      COPILOT_PRE_RENAME_PLUGIN_ID,
    ];

    expect(names).toEqual([
      SHIPPED_PLUGIN_ID,
      SHIPPED_PLUGIN_DIR,
      SHIPPED_LEGACY_DIR,
      SHIPPED_PRE_RENAME_DIR,
      SHIPPED_PRE_RENAME_ID,
    ]);
    expect(names).toMatchSnapshot();
  });
});
