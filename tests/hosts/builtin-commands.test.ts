import { expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { loadBuiltinCommands as portedLoad } from '@/hosts/opencode/builtin-commands/commands';
import {
  buildSafetyNetCommandPrompt as portedPrompt,
  registerBuiltinCommands as portedRegister,
} from '@/hosts/pi/builtin-commands/commands';
import { CC_SAFETY_NET_TEMPLATE } from '@/hosts/templates/cc-safety-net';

/**
 * The two builtin `/cc-safety-net` commands: OpenCode reads the template as config, Pi sends it as
 * a user message. Both carry the same skill document, and the last test here holds that document
 * to the shipped skill file, so the text itself is pinned at its source rather than beside each
 * caller.
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

  expect(Object.keys(ported)).toStrictEqual(['cc-safety-net']);
  expect(ported['cc-safety-net']?.description).toBe(
    'Operate CC Safety Net: explain blocks, rules, integrations, diagnostics',
  );
  // The command carries the document from its heading down, not the front matter above it.
  expect(ported['cc-safety-net']?.template).toStartWith('# CC Safety Net');
  expect(ported['cc-safety-net']?.template).toBe(
    CC_SAFETY_NET_TEMPLATE.slice(CC_SAFETY_NET_TEMPLATE.indexOf('# CC Safety Net')),
  );
});

test('the Pi prompt is the same for an empty and for a filled request', () => {
  const empty = portedPrompt('');
  const filled = portedPrompt('explain rm');

  // The two prompts differ only in the request they end with; the document above it is the same.
  expect(empty).toEndWith(`## User request\n\n${DEFAULT_REQUEST}`);
  expect(filled).toEndWith('## User request\n\nexplain rm');
  expect(empty.slice(0, empty.lastIndexOf('## User request'))).toBe(
    filled.slice(0, filled.lastIndexOf('## User request')),
  );
  expect(empty).toStartWith('# CC Safety Net');
});

test.each([
  true,
  false,
])('registering the Pi command with isIdle %p records the same call', async (isIdle) => {
  const ported = await recordPiCommand(portedRegister, 'explain rm', isIdle);

  expect(ported.commands).toStrictEqual([
    ['cc-safety-net', 'Operate CC Safety Net: explain blocks, rules, integrations, diagnostics'],
  ]);
  expect(ported.messages[0]?.[1]).toStrictEqual(isIdle ? undefined : { deliverAs: 'followUp' });
});

test('the template stays in sync with the skill document it is copied from', () => {
  const skill = readFileSync(join(import.meta.dir, '../../skills/cc-safety-net/SKILL.md'), 'utf-8');

  expect(CC_SAFETY_NET_TEMPLATE.trimStart()).toBe(
    skill.slice(skill.indexOf('# CC Safety Net')).replace(/\r\n/g, '\n'),
  );
  expect(skill).toContain('disable-model-invocation: true');
  expect(skill).toContain('npx -y cc-safety-net rule doc');
  expect(skill).not.toContain('**STRICT**');
});
