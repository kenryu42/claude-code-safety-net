/**
 * Recognizing a CC Safety Net invocation inside one command segment. Two guards
 * need it and must agree on what counts as this program: secret protection
 * exempts `explain` (it only analyses the string it is handed), and policy-apply
 * protection blocks `policy apply` (it rewrites the config the guards enforce).
 */

const CC_SAFETY_NET_ENTRYPOINTS = new Set([
  'src/entries/bin.ts',
  'src/cli/cc-safety-net.ts',
  'dist/bin/cc-safety-net.js',
]);
// Both published bin names, the runners that resolve a package by name, the
// runners that do it through a `dlx` subcommand, and the runtimes that execute
// an entrypoint file (directly or via `run`).
const CC_SAFETY_NET_BIN_NAMES = new Set(['cc-safety-net', 'ccsn']);
const PACKAGE_RUNNERS = new Set(['bunx', 'npx', 'pnpx']);
const DLX_RUNNERS = new Set(['pnpm', 'yarn']);
const EXEC_RUNNERS = new Set(['npm', 'pnpm', 'yarn']);
const SCRIPT_RUNTIMES = new Set(['bun', 'node']);

/**
 * Index into `tokens` of the CC Safety Net subcommand, or null when the segment
 * does not invoke CC Safety Net. `command` is the lowercased basename of the
 * segment's executable and `tokens` is everything after it.
 *
 * The two consumers need opposite strictness. The exemption in secret protection
 * must under-match: a form that might run something else (Yarn Classic treats
 * `yarn dlx` as a project script) must not have its argument treated as inert.
 * The policy-apply block must over-match: runner options in front of the target
 * (`npx --loglevel=silent cc-safety-net`, `npx --package cc-safety-net ccsn`)
 * must not unhook it. `broad` selects the blocking behavior.
 */
export function safetyNetSubcommandIndex(
  command: string,
  tokens: readonly string[],
  options: { broad?: boolean } = {},
): number | null {
  if (CC_SAFETY_NET_BIN_NAMES.has(command)) return 0;
  if (PACKAGE_RUNNERS.has(command)) {
    if (options.broad) return broadRunnerSubcommandIndex(tokens);
    // The install docs print `npx -y cc-safety-net`, so the consent flag is part
    // of a documented form. Only that flag is skipped: any other option changes
    // what the runner resolves.
    const skip = tokens[0] === '-y' || tokens[0] === '--yes' ? 1 : 0;
    return isRunnerTarget(tokens[skip]) ? skip + 1 : null;
  }
  // `npm exec`, `pnpm exec`, and `yarn exec` reach installed or fetched bins;
  // only the over-matching blocking consumer follows them, since what `exec`
  // resolves depends on the project. In broad mode, runner-global options in
  // front of the subcommand (`npm --silent exec`) are skipped too.
  const start = options.broad ? tokens.findIndex((token) => !token.startsWith('-')) : 0;
  if (start !== -1 && EXEC_RUNNERS.has(command) && options.broad && tokens[start] === 'exec') {
    const index = broadRunnerSubcommandIndex(tokens.slice(start + 1));
    return index === null ? null : start + 1 + index;
  }
  // `pnpm`/`yarn` run a package only through `dlx`; `pnpm exec` and the like
  // resolve something else and keep their arguments ordinary. Yarn Classic has
  // no built-in `dlx` and runs a project script of that name instead, so only
  // the over-matching blocking consumer trusts the yarn form.
  if (DLX_RUNNERS.has(command)) {
    if (command === 'yarn' && !options.broad) return null;
    if (!options.broad) return tokens[0] === 'dlx' && isRunnerTarget(tokens[1]) ? 2 : null;
    if (start === -1 || tokens[start] !== 'dlx') return null;
    const index = broadRunnerSubcommandIndex(tokens.slice(start + 1));
    return index === null ? null : start + 1 + index;
  }
  if (SCRIPT_RUNTIMES.has(command)) {
    // Node accepts options and a `--` terminator before its script, so the
    // blocking consumer looks past them; the exemption stays position-exact.
    const at = options.broad && start !== -1 ? start : 0;
    if (isSafetyNetEntrypoint(tokens[at])) return at + 1;
    // Only bun has a `run` subcommand; `node run ...` executes a local script
    // named `run`, so it is a different program.
    if (command === 'bun' && tokens[at] === 'run' && isSafetyNetEntrypoint(tokens[at + 1])) {
      return at + 2;
    }
  }
  return null;
}

// Blocking consumers over-match on purpose: the target is located anywhere in
// the token list, so option tokens and their values (`--loglevel silent`,
// `--package cc-safety-net ccsn`) never hide it, and every flag or further
// target after it is consumed before the subcommand is read. A stray argument
// that happens to equal the bin name over-blocks, which this guard may do.
function broadRunnerSubcommandIndex(tokens: readonly string[]): number | null {
  const first = tokens.findIndex((token) => isRunnerTarget(token));
  if (first === -1) return null;
  let index = first;
  while (index < tokens.length) {
    const token = tokens[index] ?? '';
    if (!token.startsWith('-') && !isRunnerTarget(token)) break;
    index++;
  }
  return index;
}

// The runner resolves its target by the token as written: `@scope/cc-safety-net`
// or a path ending in the bin name is a DIFFERENT program, and so is any
// protocol spec (`cc-safety-net@npm:other`, `@file:...`); only a version or tag
// suffix (`cc-safety-net@latest`, `cc-safety-net@2.3.0`) resolves this one.
function isRunnerTarget(token: string | undefined): boolean {
  if (!token) return false;
  const at = token.indexOf('@');
  if (at === -1) return CC_SAFETY_NET_BIN_NAMES.has(token);
  if (at === 0) return false;
  const suffix = token.slice(at + 1);
  if (suffix === '' || suffix.includes('/') || suffix.includes(':')) return false;
  return CC_SAFETY_NET_BIN_NAMES.has(token.slice(0, at));
}

function isSafetyNetEntrypoint(value: string | undefined): boolean {
  const normalized = value?.replaceAll('\\', '/');
  return [...CC_SAFETY_NET_ENTRYPOINTS].some(
    (entrypoint) => normalized === entrypoint || normalized?.endsWith(`/${entrypoint}`),
  );
}
