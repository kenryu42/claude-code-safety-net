import type { Plugin } from '@opencode-ai/plugin';
import { analyzeCommand, loadConfig } from './core/analyze.ts';
import { envTruthy } from './core/env.ts';
import { formatBlockedMessage } from './core/format.ts';

export const SafetyNetPlugin: Plugin = async ({ directory }) => {
  const config = loadConfig(directory);
  const strict = envTruthy('SAFETY_NET_STRICT');
  const paranoidAll = envTruthy('SAFETY_NET_PARANOID');
  const paranoidRm = paranoidAll || envTruthy('SAFETY_NET_PARANOID_RM');
  const paranoidInterpreters = paranoidAll || envTruthy('SAFETY_NET_PARANOID_INTERPRETERS');

  return {
    'tool.execute.before': async (input, output) => {
      if (input.tool === 'bash') {
        const command = output.args.command;
        const result = analyzeCommand(command, {
          cwd: directory,
          config,
          strict,
          paranoidRm,
          paranoidInterpreters,
        });
        if (result) {
          const message = formatBlockedMessage({
            reason: result.reason,
            command,
            segment: result.segment,
          });

          throw new Error(message);
        }
      }
    },
  };
};
