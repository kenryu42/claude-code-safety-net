import type { Plugin } from '@opencode-ai/plugin';
import { createCCSafetyNetPlugin } from '@/hosts/opencode/plugin';

export const CCSafetyNetPlugin: Plugin = createCCSafetyNetPlugin();
