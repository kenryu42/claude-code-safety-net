import { execFileSync } from 'node:child_process';

/** @internal */
export function runGit(cwd: string, args: string[]): void {
  execFileSync('git', args, { cwd, stdio: 'ignore' });
}
