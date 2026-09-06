import { describe, expect, test } from 'bun:test';
import {
  installCommand as portedInstallCommand,
  uninstallCommand as portedUninstallCommand,
  updateCommand as portedUpdateCommand,
} from '@next/cli/commands/install';
import {
  installCommand as shippedInstallCommand,
  uninstallCommand as shippedUninstallCommand,
  updateCommand as shippedUpdateCommand,
} from '@/cli/commands/install';

/**
 * These three definitions are what `--help` prints, so every flag, description and example is
 * user-visible text derived from the catalog: the differential catches both a drifted wording and
 * a catalog row that stops reaching the help.
 */

describe('cli/commands/install', () => {
  test('the three definitions are identical on both implementations', () => {
    expect(portedInstallCommand).toEqual(shippedInstallCommand);
    expect(portedInstallCommand).toMatchSnapshot();
    expect(portedUninstallCommand).toEqual(shippedUninstallCommand);
    expect(portedUninstallCommand).toMatchSnapshot();
    expect(portedUpdateCommand).toEqual(shippedUpdateCommand);
    expect(portedUpdateCommand).toMatchSnapshot();
  });

  test('each definition keeps its name, usage and help option', () => {
    expect([
      portedInstallCommand.name,
      portedUninstallCommand.name,
      portedUpdateCommand.name,
    ]).toEqual(['install', 'uninstall', 'update']);
    expect([
      portedInstallCommand.usage,
      portedUninstallCommand.usage,
      portedUpdateCommand.usage,
    ]).toEqual(['install [TARGET_FLAG]', 'uninstall [TARGET_FLAG]', 'update']);
    expect(portedInstallCommand.options.at(-1)).toEqual({
      flags: '-h, --help',
      description: 'Show this help',
    });
    expect(portedInstallCommand.examples[0]).toBe('cc-safety-net install');
    expect(portedUninstallCommand.examples[0]).toBe('cc-safety-net uninstall');
    expect(portedUpdateCommand.examples).toEqual(['cc-safety-net update']);
  });

  test('every install target reaches the help on both implementations', () => {
    const targetOptions = portedInstallCommand.options.slice(0, -1);
    expect(targetOptions.length).toBeGreaterThan(0);
    const flags = targetOptions.map((option) => option.flags);
    expect(flags).toEqual(shippedInstallCommand.options.slice(0, -1).map((option) => option.flags));
    expect(flags).toMatchSnapshot();
    expect(portedInstallCommand.examples.slice(1)).toEqual(
      targetOptions.map((option) => `cc-safety-net install ${option.flags}`),
    );
  });
});
