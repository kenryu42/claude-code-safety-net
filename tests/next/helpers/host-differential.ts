import { expect } from 'bun:test';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import type { Environment } from '@next/core/environment';
import type { HookDetection } from '@next/hosts/detect/context';
import type { InstallResult } from '@next/hosts/install/types';
import {
  describeOutcome,
  type Outcome,
  type TreeEntry,
  type TreeSpec,
  writeTree,
} from './fixture-tree';
import {
  createTempRoot,
  describeAsyncOutcome,
  environmentFor,
  isolationEnv,
  normalize,
  recordPorted,
  snapshotHome,
  withProcessEnv,
} from './temp-home';

/**
 * One seed, two homes: the shipped installer reads the isolation values off `process.env` and the
 * ported one off an `Environment` built from the same values, so a row that passes proves the two
 * implementations wrote, detected and removed the same bytes rather than that they agree on paper.
 */

function seedHome(prefix: string, seed: TreeSpec): string {
  const home = join(createTempRoot(prefix), 'home');
  mkdirSync(home, { recursive: true });
  writeTree(home, seed);
  return home;
}

/** `<home>` in an env value stands for that side's home, which only exists once the root does. */
function resolvePlaceholders(env: Record<string, string> | undefined, home: string) {
  return Object.fromEntries(
    Object.entries(env ?? {}).map(([name, value]) => [name, value.replaceAll('<home>', home)]),
  );
}

export async function differential<T>(options: {
  seed: TreeSpec;
  env?: Record<string, string>;
  shipped: (home: string) => T | Promise<T>;
  ported: (environment: Environment) => T | Promise<T>;
}) {
  const shippedHome = seedHome('cc-safety-net-shipped-', options.seed);
  const portedHome = seedHome('cc-safety-net-ported-', options.seed);
  const portedEnv = isolationEnv(portedHome, resolvePlaceholders(options.env, portedHome));
  const shipped = await withProcessEnv(
    isolationEnv(shippedHome, resolvePlaceholders(options.env, shippedHome)),
    () => describeAsyncOutcome(async () => options.shipped(shippedHome)),
  );
  const ported = await describeAsyncOutcome(async () =>
    options.ported(environmentFor(portedHome, portedEnv)),
  );

  return {
    shipped: {
      outcome: normalize(shipped, [[shippedHome, '<home>']]),
      tree: snapshotHome(shippedHome),
    },
    ported: {
      outcome: normalize(ported, [[portedHome, '<home>']]),
      tree: snapshotHome(portedHome),
    },
  };
}

/** The two sides must be indistinguishable; the shipped one is what the contract is asserted on. */
export function expectSameSides<T>(result: { shipped: T; ported: T }): T {
  expect(result.ported).toEqual(result.shipped);
  // A probe that reports system information names the machine it ran on.
  recordPorted(result.ported, [[`${process.platform} ${process.arch}`, '<platform>']]);
  return result.shipped;
}

/** The content of one file in a home snapshot, or `undefined` when nothing sits there. */
export function fileAt(tree: TreeEntry[] | undefined, path: string) {
  return tree?.find((entry) => entry.path === path)?.content;
}

/**
 * A detect-only host: nothing of ours is installed through it here, so a row is one seeded home
 * and the detection both implementations must report for it. Inputs that vary per case (a host
 * command's output, a CLI version, a project directory) are closed over when the runner is built.
 */
export function detectionRunner(sides: {
  shipped: (home: string) => HookDetection;
  ported: (environment: Environment) => HookDetection;
}) {
  return async (seed: TreeSpec, env?: Record<string, string>) =>
    expectSameSides(await differential({ seed, env, shipped: sides.shipped, ported: sides.ported }))
      .outcome;
}

type HostActions = {
  install: () => InstallResult;
  detect: () => HookDetection;
  uninstall: () => InstallResult;
};

type LifecycleStep = {
  result: Outcome<InstallResult>;
  detection: HookDetection;
  tree: TreeEntry[];
};

type HostLifecycle = {
  install: LifecycleStep;
  reinstall: LifecycleStep;
  uninstall: LifecycleStep;
  finalUninstall: Outcome<InstallResult>;
};

/** Install, detect, install again, detect, uninstall, detect, uninstall again — one host row. */
function hostLifecycle(home: string, actions: HostActions): HostLifecycle {
  const step = (run: () => InstallResult) => ({
    result: describeOutcome(run),
    detection: actions.detect(),
    tree: snapshotHome(home),
  });

  return {
    install: step(actions.install),
    reinstall: step(actions.install),
    uninstall: step(actions.uninstall),
    finalUninstall: describeOutcome(actions.uninstall),
  };
}

/** Binds one host's two implementations, so each seed reads as data rather than as wiring. */
export function hostRunner(sides: {
  shipped: (home: string) => HostActions;
  ported: (environment: Environment) => HostActions;
}) {
  return {
    row: async (seed: TreeSpec, env?: Record<string, string>) => {
      const shipped = expectSameSides(
        await differential({
          seed,
          env,
          shipped: (home) => hostLifecycle(home, sides.shipped(home)),
          ported: (environment) => hostLifecycle(environment.home, sides.ported(environment)),
        }),
      );
      return {
        steps: shipped.outcome.kind === 'returned' ? shipped.outcome.value : undefined,
        tree: shipped.tree,
      };
    },
    detection: async (seed: TreeSpec, env?: Record<string, string>) =>
      expectSameSides(
        await differential({
          seed,
          env,
          shipped: (home) => sides.shipped(home).detect(),
          ported: (environment) => sides.ported(environment).detect(),
        }),
      ).outcome,
  };
}

/**
 * What a row that installs cleanly owes: install reported and wrote what it claims, the detector
 * then finds it, a second install changes nothing, uninstall leaves exactly `left` behind, the
 * host is no longer detected, and a second uninstall finds nothing to remove.
 */
export function expectRow(
  steps: HostLifecycle | undefined,
  expected: {
    file: string;
    alreadyInstalled: boolean;
    wrote: string;
    detected: HookDetection;
    left: string | undefined;
  },
): void {
  const configPath = join('<home>', expected.file);
  expect({
    install: steps?.install.result,
    wrote: fileAt(steps?.install.tree, expected.file),
    detected: steps?.install.detection,
    reinstall: steps?.reinstall.result,
    reinstallTree: steps?.reinstall.tree,
    left: fileAt(steps?.uninstall.tree, expected.file),
    detectedAfter: steps?.uninstall.detection,
    finalUninstall: steps?.finalUninstall,
  }).toEqual({
    install: {
      ok: true,
      value: { path: configPath, alreadyInstalled: expected.alreadyInstalled },
    },
    wrote: expected.wrote,
    detected: expected.detected,
    reinstall: { ok: true, value: { path: configPath, alreadyInstalled: true } },
    reinstallTree: steps?.install.tree,
    left: expected.left,
    detectedAfter: { platform: expected.detected.platform, status: 'n/a', configPath },
    finalUninstall: { ok: true, value: { path: configPath, alreadyInstalled: false } },
  });
}
