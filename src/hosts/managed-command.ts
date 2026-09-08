import { type RuntimeHookIntegrationId, runtimeHookIntegrationMetadata } from './catalog';

/**
 * The command every npx-launched host runs, derived from the catalog's long flag so the installer,
 * the detector, the adapter and the Hermes shim can never disagree on one host's spelling.
 */
export const managedHookCommands = Object.fromEntries(
  runtimeHookIntegrationMetadata.map((integration) => [
    integration.id,
    `npx -y cc-safety-net hook ${integration.flags[1]}`,
  ]),
) as Record<RuntimeHookIntegrationId, string>;
