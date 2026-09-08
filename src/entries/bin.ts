#!/usr/bin/env node
import { parseCommandArgs } from '@/cli/args';
import { findHookIntegrationByFlag, findLegacyTopLevelHookIntegration } from './hook-integrations';

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const commandName = args[0];
  // The same global scan the CLI chunk runs, so the hook verb never pre-empts a help or
  // version request: `hook --claude-code --help` prints the hook help and `-cc -V` prints
  // the version, exactly as the shipped bin does before it dispatches.
  const globalScan = parseCommandArgs(
    { label: 'cc-safety-net', booleans: { version: ['-V', '--version'] }, positionals: 'list' },
    args,
  );

  if (!globalScan.help && !globalScan.flags.version) {
    // The verb is matched the way the CLI chunk's command lookup matches it, case-insensitively,
    // so `Hook --claude-code` runs the hook here rather than reaching the chunk's failure branch.
    if (commandName?.toLowerCase() === 'hook') {
      const integration = findHookIntegrationByFlag(args.slice(1));
      if (integration) {
        await integration.run();
        return;
      }
    }
    const legacyIntegration = findLegacyTopLevelHookIntegration(commandName);
    if (legacyIntegration) {
      await legacyIntegration.run();
      return;
    }
  }

  const cli = await import('@/cli/main');
  await cli.runCli(args);
}

main().catch((error: unknown) => {
  console.error('CC Safety Net error:', error);
  process.exit(1);
});
