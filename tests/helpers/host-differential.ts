import { expect } from 'bun:test';
import { mkdirSync } from 'node:fs';
import { join, posix } from 'node:path';
import type { Environment } from '@/core/environment';
import type { HookDetection } from '@/hosts/detect/context';
import type { InstallResult } from '@/hosts/install/types';
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
  snapshotHome,
  WINDOWS_SEPARATOR_FOLDS,
} from './temp-home';

/**
 * One seed, one home: the installer reads the isolation values off an `Environment` built from
 * them, and the row records the bytes it wrote, detected and removed rather than what it claims.
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
  ported: (environment: Environment) => T | Promise<T>;
}) {
  const portedHome = seedHome('cc-safety-net-ported-', options.seed);
  const portedEnv = isolationEnv(portedHome, resolvePlaceholders(options.env, portedHome));
  const ported = await describeAsyncOutcome(async () =>
    options.ported(environmentFor(portedHome, portedEnv)),
  );

  return {
    // The separator is folded with the home, so a `<home>/`-spelled expectation holds on Windows.
    outcome: normalize(ported, [[portedHome, '<home>'], ...WINDOWS_SEPARATOR_FOLDS]),
    tree: snapshotHome(portedHome),
  };
}

/** The content of one file in a home snapshot, or `undefined` when nothing sits there. */
export function fileAt(tree: TreeEntry[] | undefined, path: string) {
  return tree?.find((entry) => entry.path === path)?.content;
}

/**
 * A detect-only host: nothing of ours is installed through it here, so a row is one seeded home
 * and the detection reported for it. Inputs that vary per case (a host command's output, a CLI
 * version, a project directory) are closed over when the runner is built.
 */
export function detectionRunner(sides: { ported: (environment: Environment) => HookDetection }) {
  return async (seed: TreeSpec, env?: Record<string, string>) =>
    (await differential({ seed, env, ported: sides.ported })).outcome;
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

/** Binds one host's implementation, so each seed reads as data rather than as wiring. */
export function hostRunner(sides: { ported: (environment: Environment) => HostActions }) {
  return {
    row: async (seed: TreeSpec, env?: Record<string, string>) => {
      const result = await differential({
        seed,
        env,
        ported: (environment) => hostLifecycle(environment.home, sides.ported(environment)),
      });
      return {
        steps: result.outcome.kind === 'returned' ? result.outcome.value : undefined,
        tree: result.tree,
      };
    },
    detection: async (seed: TreeSpec, env?: Record<string, string>) =>
      (
        await differential({
          seed,
          env,
          ported: (environment) => sides.ported(environment).detect(),
        })
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
  const configPath = posix.join('<home>', expected.file);
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
