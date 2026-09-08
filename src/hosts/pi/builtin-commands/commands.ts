import { CC_SAFETY_NET_TEMPLATE } from '@/hosts/templates/cc-safety-net';

type PiCommandApi = {
  registerCommand: (
    name: 'cc-safety-net',
    command: {
      description: string;
      handler: (args: string, ctx: PiCommandContext) => Promise<void>;
    },
  ) => void;
  sendUserMessage: (content: string, options?: { deliverAs: 'followUp' }) => void;
};

type PiCommandContext = {
  isIdle: () => boolean;
};

const COMMAND_NAME = 'cc-safety-net';
const COMMAND_DESCRIPTION =
  'Operate CC Safety Net: explain blocks, rules, integrations, diagnostics';
const DEFAULT_USER_REQUEST = 'Help me with CC Safety Net.';

export function registerBuiltinCommands(pi: PiCommandApi): void {
  pi.registerCommand(COMMAND_NAME, {
    description: COMMAND_DESCRIPTION,
    handler: async (args, ctx) => {
      pi.sendUserMessage(
        buildSafetyNetCommandPrompt(args),
        ctx.isIdle() ? undefined : { deliverAs: 'followUp' },
      );
    },
  });
}

/** @internal - exported for test coverage */
export function buildSafetyNetCommandPrompt(args: string): string {
  return `${CC_SAFETY_NET_TEMPLATE.slice(CC_SAFETY_NET_TEMPLATE.indexOf('# CC Safety Net')).trimEnd()}\n\n## User request\n\n${args.trim() || DEFAULT_USER_REQUEST}`;
}
