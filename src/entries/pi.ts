import { registerBuiltinCommands } from '@/hosts/pi/builtin-commands/commands';
import { registerToolCallEvent } from '@/hosts/pi/tool-call';

type PiExtensionApi = Parameters<typeof registerBuiltinCommands>[0] &
  Parameters<typeof registerToolCallEvent>[0];

export default function ccSafetyNetPiExtension(pi: PiExtensionApi): void {
  registerToolCallEvent(pi);
  registerBuiltinCommands(pi);
}
