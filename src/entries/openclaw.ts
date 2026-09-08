import { OPENCLAW_PLUGIN_ENTRY } from '@/hosts/openclaw/artifact';
import { registerOpenClawPlugin } from '@/hosts/openclaw/plugin';

export default {
  ...OPENCLAW_PLUGIN_ENTRY,
  register: registerOpenClawPlugin,
};
