import { expect, test } from 'bun:test';
import { loadBuiltinCommands as portedLoad } from '@next/hosts/opencode/builtin-commands/commands';
import {
  buildSafetyNetCommandPrompt as portedPrompt,
  registerBuiltinCommands as portedRegister,
} from '@next/hosts/pi/builtin-commands/commands';
import { loadBuiltinCommands as shippedLoad } from '@/integrations/opencode/builtin-commands/commands';
import {
  buildSafetyNetCommandPrompt as shippedPrompt,
  registerBuiltinCommands as shippedRegister,
} from '@/integrations/pi/builtin-commands/commands';

/**
 * The two builtin `/cc-safety-net` commands: OpenCode reads the template as config, Pi sends it as
 * a user message. Both carry the same skill document, so the ported and the shipped side must
 * produce the same command object, the same prompt and the same message for either idle state.
 */

const DEFAULT_REQUEST = 'Help me with CC Safety Net.';

type RecordedPi = { commands: unknown[][]; messages: unknown[][] };

async function recordPiCommand(
  register: typeof portedRegister,
  args: string,
  isIdle: boolean,
): Promise<RecordedPi> {
  const recorded: RecordedPi = { commands: [], messages: [] };
  let handler: ((text: string, ctx: { isIdle: () => boolean }) => Promise<void>) | undefined;
  register({
    registerCommand: (name, command) => {
      recorded.commands.push([name, command.description]);
      handler = command.handler;
    },
    sendUserMessage: (...parts: unknown[]) => recorded.messages.push(parts),
  });
  await handler?.(args, { isIdle: () => isIdle });
  return recorded;
}

test('the OpenCode builtin command carries the same template on both sides', () => {
  const ported = portedLoad();

  expect(ported).toStrictEqual(shippedLoad());
  expect(ported).toMatchSnapshot();
  expect(Object.keys(ported)).toStrictEqual(['cc-safety-net']);
  expect(ported['cc-safety-net']?.template).toStartWith('# CC Safety Net');
});

test('the Pi prompt is the same for an empty and for a filled request', () => {
  const empty = portedPrompt('');
  const filled = portedPrompt('explain rm');

  expect(empty).toBe(shippedPrompt(''));
  expect(empty).toMatchSnapshot();
  expect(filled).toBe(shippedPrompt('explain rm'));
  expect(filled).toMatchSnapshot();
  expect(empty).toEndWith(`## User request\n\n${DEFAULT_REQUEST}`);
  expect(filled).toEndWith('## User request\n\nexplain rm');
});

test.each([
  true,
  false,
])('registering the Pi command with isIdle %p records the same call', async (isIdle) => {
  const ported = await recordPiCommand(portedRegister, 'explain rm', isIdle);

  expect(ported).toStrictEqual(await recordPiCommand(shippedRegister, 'explain rm', isIdle));
  expect(ported).toMatchSnapshot();
  expect(ported.commands).toStrictEqual([
    ['cc-safety-net', 'Operate CC Safety Net: explain blocks, rules, integrations, diagnostics'],
  ]);
  expect(ported.messages[0]?.[1]).toStrictEqual(isIdle ? undefined : { deliverAs: 'followUp' });
});
