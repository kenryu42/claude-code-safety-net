import { describe, expect, test } from 'bun:test';
import { execFileSync } from 'node:child_process';
import { mkdirSync, symlinkSync } from 'node:fs';
import { join } from 'node:path';
import { analyzeGit } from '@/core/rules-git';
import {
  assertAllowed,
  assertBlocked,
  createLinkedWorktreeFixture,
  createSubmoduleLikeGitFileFixture,
  runGuard,
  toShellPath,
  withEnv,
} from '../helpers.ts';

describe('analyzeGit direct', () => {
  test('empty tokens returns null', () => {
    expect(analyzeGit([])).toBeNull();
  });
});

describe('git checkout', () => {
  test('git checkout --force blocked', () => {
    assertBlocked('git checkout --force main', 'git checkout --force');
  });

  test('git checkout -f blocked', () => {
    assertBlocked('git checkout -f main', 'git checkout --force');
  });

  test('git checkout -qf blocked', () => {
    assertBlocked('git checkout -qf main', 'git checkout --force');
  });

  test('git checkout -tf blocked', () => {
    assertBlocked('git checkout -tf main', 'git checkout --force');
  });

  test('git checkout force wins over branch creation', () => {
    assertBlocked('git checkout -f -b new-branch', 'git checkout --force');
  });

  test('git checkout -- blocked', () => {
    assertBlocked('git checkout -- file.txt', 'git checkout --');
  });

  test('git checkout -- multiple files blocked', () => {
    assertBlocked('git checkout -- file1.txt file2.txt', 'git checkout --');
  });

  test('git checkout -- . blocked', () => {
    assertBlocked('git checkout -- .', 'git checkout --');
  });

  test('git checkout ref -- blocked', () => {
    assertBlocked('git checkout HEAD -- file.txt', 'git checkout <ref> -- <path>');
  });

  test('git checkout -b allowed', () => {
    assertAllowed('git checkout -b new-branch');
  });

  test('git checkout --orphan allowed', () => {
    assertAllowed('git checkout --orphan orphan-branch');
  });

  test('git checkout -bnew-branch allowed', () => {
    assertAllowed('git checkout -bnew-branch');
  });

  test('git checkout -bfeature allowed', () => {
    assertAllowed('git checkout -bfeature');
  });

  test('git checkout -Bnew-branch allowed', () => {
    assertAllowed('git checkout -Bnew-branch');
  });

  test('git checkout -qbfeature allowed', () => {
    assertAllowed('git checkout -qbfeature');
  });

  test('git checkout ref pathspec blocked', () => {
    assertBlocked('git checkout HEAD file.txt', 'multiple positional args');
  });

  test('git checkout ref multiple pathspecs blocked', () => {
    assertBlocked('git checkout main a.txt b.txt', 'multiple positional args');
  });

  test('git checkout branch only allowed', () => {
    assertAllowed('git checkout main');
  });

  test('git checkout -U3 main allowed', () => {
    assertAllowed('git checkout -U3 main');
  });

  test('git checkout - allowed', () => {
    assertAllowed('git checkout -');
  });

  test('git checkout -- -f blocked as path restore, not force', () => {
    assertBlocked('git checkout -- -f', 'git checkout --');
  });

  test('git checkout --detach allowed', () => {
    assertAllowed('git checkout --detach main');
  });

  test('git checkout --recurse-submodules allowed', () => {
    assertAllowed('git checkout --recurse-submodules main');
  });

  test('git checkout --pathspec-from-file blocked', () => {
    assertBlocked(
      'git checkout HEAD --pathspec-from-file=paths.txt',
      'git checkout --pathspec-from-file',
    );
  });

  test('git checkout ref pathspec from file arg blocked', () => {
    assertBlocked(
      'git checkout HEAD --pathspec-from-file paths.txt',
      'git checkout --pathspec-from-file',
    );
  });

  test('git checkout --conflict=merge allowed', () => {
    assertAllowed('git checkout --conflict=merge main');
  });

  test('git checkout --conflict merge allowed', () => {
    assertAllowed('git checkout --conflict merge main');
  });

  test('git checkout -q ref pathspec blocked', () => {
    assertBlocked('git checkout -q main file.txt', 'multiple positional args');
  });

  test('git checkout --no-quiet ref pathspec blocked', () => {
    assertBlocked('git checkout --no-quiet main file.txt', 'multiple positional args');
  });

  test('git checkout --guess ref pathspec blocked', () => {
    assertBlocked('git checkout --guess main file.txt', 'multiple positional args');
  });

  test('git checkout --recurse-submodules=checkout allowed', () => {
    assertAllowed('git checkout --recurse-submodules=checkout main');
  });

  test('git checkout --recurse-submodules=on-demand allowed', () => {
    assertAllowed('git checkout --recurse-submodules=on-demand main');
  });

  test('git checkout --recurse-submodules ref pathspec blocked', () => {
    assertBlocked('git checkout --recurse-submodules main file.txt', 'multiple positional args');
  });

  test('git checkout --no-recurse-submodules ref pathspec blocked', () => {
    assertBlocked('git checkout --no-recurse-submodules main file.txt', 'multiple positional args');
  });

  test('git checkout --recurse-submodules without mode allowed', () => {
    assertAllowed('git checkout --recurse-submodules main');
  });

  test('git checkout --recurse-submodules without mode ref pathspec blocked', () => {
    assertBlocked('git checkout --recurse-submodules main file.txt', 'multiple positional args');
  });

  test('git checkout --recurse-submodules with checkout mode allowed', () => {
    assertAllowed('git checkout --recurse-submodules checkout main');
  });

  test('git checkout --recurse-submodules with on-demand mode allowed', () => {
    assertAllowed('git checkout --recurse-submodules on-demand main');
  });

  test('git checkout --track with direct mode allowed', () => {
    assertAllowed('git checkout --track direct main');
  });

  test('git checkout --track with inherit mode allowed', () => {
    assertAllowed('git checkout --track inherit main');
  });

  test('git checkout --recurse-submodules followed by option allowed', () => {
    assertAllowed('git checkout --recurse-submodules -q main');
  });

  test('git checkout --track followed by option allowed', () => {
    assertAllowed('git checkout --track -q main');
  });

  test('git checkout -t followed by option allowed', () => {
    assertAllowed('git checkout -t -q main');
  });

  test('git checkout --track=direct allowed', () => {
    assertAllowed('git checkout --track=direct main');
  });

  test('git checkout --track=inherit allowed', () => {
    assertAllowed('git checkout --track=inherit main');
  });

  test('git checkout --track without mode ref pathspec blocked', () => {
    assertBlocked('git checkout --track main file.txt', 'multiple positional args');
  });

  test('git checkout --unified 3 allowed', () => {
    assertAllowed('git checkout --unified 3 main');
  });

  test('git checkout --inter-hunk-context 3 allowed', () => {
    assertAllowed('git checkout --inter-hunk-context 3 main');
  });

  test('git checkout -U attached value allowed', () => {
    assertAllowed('git checkout -U3 main');
  });

  test('git checkout unknown long option ref pathspec blocked', () => {
    assertBlocked('git checkout --unknown main file.txt', 'multiple positional args');
  });

  test('git checkout unknown long option does not consume option value allowed', () => {
    assertAllowed('git checkout --unknown -q main');
  });

  test('git checkout unknown long option equals allowed', () => {
    assertAllowed('git checkout --unknown=value main');
  });
});

describe('git switch', () => {
  test('git switch --discard-changes blocked', () => {
    assertBlocked('git switch --discard-changes main', 'git switch --discard-changes');
  });

  test('git switch --force blocked', () => {
    assertBlocked('git switch --force main', 'git switch --force');
  });

  test('git switch -f blocked', () => {
    assertBlocked('git switch -f main', 'git switch --force');
  });

  test('git switch -qf blocked', () => {
    assertBlocked('git switch -qf main', 'git switch --force');
  });

  test('git -C repo switch -f blocked', () => {
    assertBlocked('git -C repo switch -f main', 'git switch --force');
  });

  test('git switch main allowed', () => {
    assertAllowed('git switch main');
  });

  test('git switch -c feature allowed', () => {
    assertAllowed('git switch -c feature');
  });

  test('git switch -cfeature allowed', () => {
    assertAllowed('git switch -cfeature');
  });

  test('git switch -Cfixup allowed', () => {
    assertAllowed('git switch -Cfixup');
  });

  test('git switch --detach main allowed', () => {
    assertAllowed('git switch --detach main');
  });

  test('git switch -- -f allowed', () => {
    assertAllowed('git switch -- -f');
  });
});

describe('git restore', () => {
  test('git restore file blocked', () => {
    assertBlocked('git restore file.txt', 'git restore');
  });

  test('git restore multiple files blocked', () => {
    assertBlocked('git restore a.txt b.txt', 'git restore');
  });

  test('git restore --worktree blocked', () => {
    assertBlocked('git restore --worktree file.txt', 'git restore --worktree');
  });

  test('git restore --staged allowed', () => {
    assertAllowed('git restore --staged file.txt');
  });

  test('git restore --staged . allowed', () => {
    assertAllowed('git restore --staged .');
  });

  test('git restore --help allowed', () => {
    assertAllowed('git restore --help');
  });
});

describe('git reset', () => {
  test('git reset --hard blocked', () => {
    assertBlocked('git reset --hard', 'git reset --hard');
  });

  test('git reset --hard HEAD~1 blocked', () => {
    assertBlocked('git reset --hard HEAD~1', 'git reset --hard');
  });

  test('git reset -q --hard blocked', () => {
    assertBlocked('git reset -q --hard', 'git reset --hard');
  });

  test('echo ok | git reset --hard blocked', () => {
    assertBlocked('echo ok | git reset --hard', 'git reset --hard');
  });

  test('git -C repo reset --hard blocked', () => {
    assertBlocked('git -C repo reset --hard', 'git reset --hard');
  });

  test('git -Crepo reset --hard blocked', () => {
    assertBlocked('git -Crepo reset --hard', 'git reset --hard');
  });

  test('git reset --hard global option -C attached blocked', () => {
    assertBlocked('git -Crepo reset --hard', 'git reset --hard');
  });

  test('git --git-dir=repo/.git reset --hard blocked', () => {
    assertBlocked('git --git-dir=repo/.git reset --hard', 'git reset --hard');
  });

  test('git --git-dir repo/.git reset --hard blocked', () => {
    assertBlocked('git --git-dir repo/.git reset --hard', 'git reset --hard');
  });

  test('git --work-tree=repo reset --hard blocked', () => {
    assertBlocked('git --work-tree=repo reset --hard', 'git reset --hard');
  });

  test('git --no-pager reset --hard blocked', () => {
    assertBlocked('git --no-pager reset --hard', 'git reset --hard');
  });

  test('git -c foo=bar reset --hard blocked', () => {
    assertBlocked('git -c foo=bar reset --hard', 'git reset --hard');
  });

  test('git -- reset --hard blocked', () => {
    assertBlocked('git -- reset --hard', 'reset --hard');
  });

  test('git -cfoo=bar reset --hard blocked', () => {
    assertBlocked('git -cfoo=bar reset --hard', 'git reset --hard');
  });

  test('sudo env VAR=1 git reset --hard blocked', () => {
    assertBlocked('sudo env VAR=1 git reset --hard', 'git reset --hard');
  });

  test('env -- git reset --hard blocked', () => {
    assertBlocked('env -- git reset --hard', 'git reset --hard');
  });

  test('command -- git reset --hard blocked', () => {
    assertBlocked('command -- git reset --hard', 'git reset --hard');
  });

  test('env -u PATH git reset --hard blocked', () => {
    assertBlocked('env -u PATH git reset --hard', 'git reset --hard');
  });

  test('git reset --merge blocked', () => {
    assertBlocked('git reset --merge', 'git reset --merge');
  });

  test('git reset without flags allowed', () => {
    assertAllowed('git reset');
  });

  test('git reset HEAD allowed', () => {
    assertAllowed('git reset HEAD');
  });

  test("sh -c 'git reset --hard' blocked", () => {
    assertBlocked("sh -c 'git reset --hard'", 'git reset --hard');
  });
});

describe('git clean', () => {
  test('git clean -f blocked', () => {
    assertBlocked('git clean -f', 'git clean');
  });

  test('git clean --force blocked', () => {
    assertBlocked('git clean --force', 'git clean -f');
  });

  test('git clean -nf blocked', () => {
    assertBlocked('git clean -nf', 'git clean -f');
  });

  test('git clean -n && git clean -f blocked', () => {
    assertBlocked('git clean -n && git clean -f', 'git clean -f');
  });

  test('git clean -fd blocked', () => {
    assertBlocked('git clean -fd', 'git clean');
  });

  test('git clean -xf blocked', () => {
    assertBlocked('git clean -xf', 'git clean');
  });

  test('git clean -n allowed', () => {
    assertAllowed('git clean -n');
  });

  test('git clean --dry-run allowed', () => {
    assertAllowed('git clean --dry-run');
  });

  test('git clean -nd allowed', () => {
    assertAllowed('git clean -nd');
  });
});

describe('git linked worktree mode', () => {
  test('default mode still blocks local discard commands in linked worktrees', () => {
    const fixture = createLinkedWorktreeFixture();
    try {
      assertBlocked('git reset --hard', 'git reset --hard', fixture.linkedWorktree);
    } finally {
      fixture.cleanup();
    }
  });

  test('SAFETY_NET_WORKTREE allows local discard commands in linked worktrees', () => {
    const fixture = createLinkedWorktreeFixture();
    try {
      withEnv({ SAFETY_NET_WORKTREE: '1' }, () => {
        const commands = [
          'git restore file.txt',
          'git restore --worktree file.txt',
          'git checkout -- file.txt',
          'git checkout HEAD -- file.txt',
          'git checkout --force main',
          'git checkout --pathspec-from-file paths.txt',
          'git checkout main file.txt',
          'git switch --discard-changes main',
          'git switch -f main',
          'git reset --hard',
          'git reset --merge',
          'git clean -f',
          'git clean -fd',
        ];

        for (const command of commands) {
          expect(runGuard(command, fixture.linkedWorktree)).toBeNull();
        }
      });
    } finally {
      fixture.cleanup();
    }
  });

  test('SAFETY_NET_WORKTREE does not relax main worktree commands', () => {
    const fixture = createLinkedWorktreeFixture();
    try {
      withEnv({ SAFETY_NET_WORKTREE: '1' }, () => {
        assertBlocked('git reset --hard', 'git reset --hard', fixture.mainWorktree);
      });
    } finally {
      fixture.cleanup();
    }
  });

  test('SAFETY_NET_WORKTREE does not relax main worktree subdirectories', () => {
    const fixture = createLinkedWorktreeFixture();
    const subdir = join(fixture.mainWorktree, 'nested');
    mkdirSync(subdir);
    try {
      withEnv({ SAFETY_NET_WORKTREE: '1' }, () => {
        assertBlocked('git clean -f', 'git clean -f', subdir);
      });
    } finally {
      fixture.cleanup();
    }
  });

  test('SAFETY_NET_WORKTREE does not relax submodule-like git file directories', () => {
    const fixture = createSubmoduleLikeGitFileFixture();
    try {
      withEnv({ SAFETY_NET_WORKTREE: '1' }, () => {
        assertBlocked('git reset --hard', 'git reset --hard', fixture.cwd);
      });
    } finally {
      fixture.cleanup();
    }
  });

  test('SAFETY_NET_WORKTREE allows symlinked cwd inside linked worktree', () => {
    const fixture = createLinkedWorktreeFixture();
    const nested = join(fixture.linkedWorktree, 'nested');
    const symlinkedCwd = join(fixture.rootDir, 'nested-link');
    mkdirSync(nested);
    symlinkSync(nested, symlinkedCwd, 'dir');
    try {
      withEnv({ SAFETY_NET_WORKTREE: '1' }, () => {
        assertAllowed('git reset --hard', symlinkedCwd);
      });
    } finally {
      fixture.cleanup();
    }
  });

  test('SAFETY_NET_WORKTREE allows nested linked worktrees', () => {
    const fixture = createLinkedWorktreeFixture();
    const nestedWorktree = join(fixture.linkedWorktree, 'inner-worktree');
    execFileSync('git', ['worktree', 'add', '-b', 'feature/nested-worktree-test', nestedWorktree], {
      cwd: fixture.mainWorktree,
      stdio: 'ignore',
    });
    try {
      withEnv({ SAFETY_NET_WORKTREE: '1' }, () => {
        assertAllowed('git reset --hard', nestedWorktree);
      });
    } finally {
      fixture.cleanup();
    }
  });

  test('SAFETY_NET_WORKTREE honors git -C linked worktree directories', () => {
    const fixture = createLinkedWorktreeFixture();
    try {
      withEnv({ SAFETY_NET_WORKTREE: '1' }, () => {
        assertAllowed(
          `git -C ${toShellPath(fixture.linkedWorktree)} reset --hard`,
          fixture.mainWorktree,
        );
        assertAllowed(
          `git -C${toShellPath(fixture.linkedWorktree)} clean -f`,
          fixture.mainWorktree,
        );
        assertAllowed(
          `git -C ${toShellPath(fixture.mainWorktree)} -C ../linked reset --merge`,
          fixture.rootDir,
        );
      });
    } finally {
      fixture.cleanup();
    }
  });

  test('SAFETY_NET_WORKTREE does not relax unresolved git -C directories', () => {
    const fixture = createLinkedWorktreeFixture();
    try {
      withEnv({ SAFETY_NET_WORKTREE: '1' }, () => {
        assertBlocked(
          `git -C ${toShellPath(join(fixture.rootDir, 'missing'))} reset --hard`,
          'git reset --hard',
          fixture.linkedWorktree,
        );
      });
    } finally {
      fixture.cleanup();
    }
  });

  test('SAFETY_NET_WORKTREE does not relax after cwd becomes unknown', () => {
    const fixture = createLinkedWorktreeFixture();
    try {
      withEnv({ SAFETY_NET_WORKTREE: '1' }, () => {
        assertBlocked('cd /tmp && git reset --hard', 'git reset --hard', fixture.linkedWorktree);
      });
    } finally {
      fixture.cleanup();
    }
  });

  test('SAFETY_NET_WORKTREE does not relax explicit git context overrides', () => {
    const fixture = createLinkedWorktreeFixture();
    try {
      withEnv({ SAFETY_NET_WORKTREE: '1' }, () => {
        assertBlocked(
          'git --git-dir=.git reset --hard',
          'git reset --hard',
          fixture.linkedWorktree,
        );
        assertBlocked('git --work-tree=. reset --hard', 'git reset --hard', fixture.linkedWorktree);
        assertBlocked('GIT_DIR=.git git reset --hard', 'git reset --hard', fixture.linkedWorktree);
        assertBlocked(
          'GIT_WORK_TREE=. git reset --hard',
          'git reset --hard',
          fixture.linkedWorktree,
        );
        assertBlocked(
          'GIT_COMMON_DIR=.git git reset --hard',
          'git reset --hard',
          fixture.linkedWorktree,
        );
      });
    } finally {
      fixture.cleanup();
    }
  });

  test('SAFETY_NET_WORKTREE treats GIT_INDEX_FILE as a git context override', () => {
    const fixture = createLinkedWorktreeFixture();
    try {
      withEnv({ SAFETY_NET_WORKTREE: '1' }, () => {
        assertBlocked(
          `GIT_INDEX_FILE=${toShellPath(join(fixture.mainWorktree, '.git', 'index'))} git reset --hard`,
          'git reset --hard',
          fixture.linkedWorktree,
        );
      });
    } finally {
      fixture.cleanup();
    }
  });

  test('SAFETY_NET_WORKTREE tracks shell-exported git context overrides', () => {
    const fixture = createLinkedWorktreeFixture();
    const mainWorktree = toShellPath(fixture.mainWorktree);
    const mainGitDir = toShellPath(join(fixture.mainWorktree, '.git'));
    try {
      withEnv({ SAFETY_NET_WORKTREE: '1' }, () => {
        const commands = [
          `declare GIT_WORK_TREE=${mainWorktree}; export GIT_WORK_TREE; git reset --hard`,
          `typeset GIT_WORK_TREE=${mainWorktree}; export GIT_WORK_TREE; git reset --hard`,
          `declare -- GIT_WORK_TREE=${mainWorktree}; export GIT_WORK_TREE; git reset --hard`,
          `declare GIT_WORK_TREE=${mainWorktree}; declare -x GIT_WORK_TREE; git reset --hard`,
          `declare -x GIT_WORK_TREE; GIT_WORK_TREE=${mainWorktree}; git reset --hard`,
          `export GIT_WORK_TREE; GIT_WORK_TREE=${mainWorktree}; git reset --hard`,
          `builtin export GIT_WORK_TREE=${mainWorktree}; git reset --hard`,
          `command export GIT_WORK_TREE=${mainWorktree}; git reset --hard`,
          `set -a; GIT_WORK_TREE=${mainWorktree}; git reset --hard`,
          `set -o allexport; GIT_WORK_TREE=${mainWorktree}; git reset --hard`,
          `export GIT_WORK_TREE+=${mainWorktree}; git reset --hard`,
          `declare -x GIT_WORK_TREE+=${mainWorktree}; git reset --hard`,
          `GIT_DIR=${mainGitDir} GIT_WORK_TREE=${mainWorktree} export GIT_DIR GIT_WORK_TREE; git reset --hard`,
        ];

        for (const command of commands) {
          assertBlocked(command, 'git reset --hard', fixture.linkedWorktree);
        }
      });
    } finally {
      fixture.cleanup();
    }
  });

  test('SAFETY_NET_WORKTREE honors disabled allexport before later assignments', () => {
    const fixture = createLinkedWorktreeFixture();
    const mainWorktree = toShellPath(fixture.mainWorktree);
    try {
      withEnv({ SAFETY_NET_WORKTREE: '1' }, () => {
        expect(
          runGuard(
            `set -a; set +a; GIT_WORK_TREE=${mainWorktree}; git reset --hard`,
            fixture.linkedWorktree,
          ),
        ).toBeNull();
        expect(
          runGuard(
            `set -o allexport; set +o allexport; GIT_WORK_TREE=${mainWorktree}; git reset --hard`,
            fixture.linkedWorktree,
          ),
        ).toBeNull();
      });
    } finally {
      fixture.cleanup();
    }
  });

  test('SAFETY_NET_WORKTREE does not relax cwd-changing wrappers into main worktree', () => {
    const fixture = createLinkedWorktreeFixture();
    try {
      withEnv({ SAFETY_NET_WORKTREE: '1' }, () => {
        assertBlocked(
          `env -C ${toShellPath(fixture.mainWorktree)} git reset --hard`,
          'git reset --hard',
          fixture.linkedWorktree,
        );
      });
    } finally {
      fixture.cleanup();
    }
  });

  test('SAFETY_NET_WORKTREE keeps env chdir context through terminators and attached args', () => {
    const fixture = createLinkedWorktreeFixture();
    try {
      withEnv({ SAFETY_NET_WORKTREE: '1' }, () => {
        assertBlocked(
          `env -C ${toShellPath(fixture.mainWorktree)} -- git reset --hard`,
          'git reset --hard',
          fixture.linkedWorktree,
        );
        assertBlocked(
          `env -C${toShellPath(fixture.mainWorktree)} git reset --hard`,
          'git reset --hard',
          fixture.linkedWorktree,
        );
      });
    } finally {
      fixture.cleanup();
    }
  });

  test('SAFETY_NET_WORKTREE resolves wrapper chdir targets physically', () => {
    const fixture = createLinkedWorktreeFixture();
    const mainSubdir = join(fixture.mainWorktree, 'subdir');
    const symlinkedMainSubdir = join(fixture.linkedWorktree, 'link');
    mkdirSync(mainSubdir);
    symlinkSync(mainSubdir, symlinkedMainSubdir, 'dir');
    try {
      withEnv({ SAFETY_NET_WORKTREE: '1' }, () => {
        assertBlocked(
          'env -C link/.. git reset --hard',
          'git reset --hard',
          fixture.linkedWorktree,
        );
        assertBlocked(
          'sudo -D link/.. git reset --hard',
          'git reset --hard',
          fixture.linkedWorktree,
        );
      });
    } finally {
      fixture.cleanup();
    }
  });

  test('SAFETY_NET_WORKTREE parses env split strings before relaxing', () => {
    const fixture = createLinkedWorktreeFixture();
    try {
      withEnv({ SAFETY_NET_WORKTREE: '1' }, () => {
        assertBlocked(
          `env -S '-C ${toShellPath(fixture.mainWorktree)}' git reset --hard`,
          'git reset --hard',
          fixture.linkedWorktree,
        );
        assertBlocked(
          `env -S 'GIT_DIR=${toShellPath(join(fixture.mainWorktree, '.git'))} GIT_WORK_TREE=${toShellPath(fixture.mainWorktree)}' git reset --hard`,
          'git reset --hard',
          fixture.linkedWorktree,
        );
      });
    } finally {
      fixture.cleanup();
    }
  });

  test('SAFETY_NET_WORKTREE tracks sudo chdir before relaxing', () => {
    const fixture = createLinkedWorktreeFixture();
    try {
      withEnv({ SAFETY_NET_WORKTREE: '1' }, () => {
        assertBlocked(
          `sudo -D ${toShellPath(fixture.mainWorktree)} git reset --hard`,
          'git reset --hard',
          fixture.linkedWorktree,
        );
        assertBlocked(
          `sudo --chdir=${toShellPath(fixture.mainWorktree)} git reset --hard`,
          'git reset --hard',
          fixture.linkedWorktree,
        );
      });
    } finally {
      fixture.cleanup();
    }
  });

  test('SAFETY_NET_WORKTREE tracks attached sudo chdir and sudo login cwd', () => {
    const fixture = createLinkedWorktreeFixture();
    try {
      withEnv({ SAFETY_NET_WORKTREE: '1' }, () => {
        assertBlocked(
          `sudo -D${toShellPath(fixture.mainWorktree)} git reset --hard`,
          'git reset --hard',
          fixture.linkedWorktree,
        );
        assertBlocked('sudo -i git reset --hard', 'git reset --hard', fixture.linkedWorktree);
      });
    } finally {
      fixture.cleanup();
    }
  });

  test('SAFETY_NET_WORKTREE does not relax xargs child git env overrides', () => {
    const fixture = createLinkedWorktreeFixture();
    try {
      withEnv({ SAFETY_NET_WORKTREE: '1' }, () => {
        assertBlocked(
          `echo HEAD | xargs env GIT_DIR=${toShellPath(join(fixture.mainWorktree, '.git'))} GIT_WORK_TREE=${toShellPath(fixture.mainWorktree)} git reset --hard`,
          'git reset --hard',
          fixture.linkedWorktree,
        );
      });
    } finally {
      fixture.cleanup();
    }
  });

  test('SAFETY_NET_WORKTREE does not relax parallel child git env overrides', () => {
    const fixture = createLinkedWorktreeFixture();
    try {
      withEnv({ SAFETY_NET_WORKTREE: '1' }, () => {
        assertBlocked(
          `parallel env GIT_DIR=${toShellPath(join(fixture.mainWorktree, '.git'))} GIT_WORK_TREE=${toShellPath(fixture.mainWorktree)} git reset --hard ::: x`,
          'git reset --hard',
          fixture.linkedWorktree,
        );
      });
    } finally {
      fixture.cleanup();
    }
  });

  test('SAFETY_NET_WORKTREE propagates wrapper context through parallel commands mode', () => {
    const fixture = createLinkedWorktreeFixture();
    try {
      withEnv({ SAFETY_NET_WORKTREE: '1' }, () => {
        assertBlocked(
          `env -C ${toShellPath(fixture.mainWorktree)} parallel ::: 'git reset --hard'`,
          'git reset --hard',
          fixture.linkedWorktree,
        );
        assertBlocked(
          `GIT_DIR=${toShellPath(join(fixture.mainWorktree, '.git'))} GIT_WORK_TREE=${toShellPath(fixture.mainWorktree)} parallel ::: 'git reset --hard'`,
          'git reset --hard',
          fixture.linkedWorktree,
        );
      });
    } finally {
      fixture.cleanup();
    }
  });

  test('SAFETY_NET_WORKTREE propagates wrapper context through BusyBox', () => {
    const fixture = createLinkedWorktreeFixture();
    try {
      withEnv({ SAFETY_NET_WORKTREE: '1' }, () => {
        assertBlocked(
          `env -C ${toShellPath(fixture.mainWorktree)} busybox sh -c 'git reset --hard'`,
          'git reset --hard',
          fixture.linkedWorktree,
        );
        assertBlocked(
          `GIT_DIR=${toShellPath(join(fixture.mainWorktree, '.git'))} GIT_WORK_TREE=${toShellPath(fixture.mainWorktree)} busybox sh -c 'git reset --hard'`,
          'git reset --hard',
          fixture.linkedWorktree,
        );
      });
    } finally {
      fixture.cleanup();
    }
  });

  test('SAFETY_NET_WORKTREE does not relax exported git context overrides', () => {
    const fixture = createLinkedWorktreeFixture();
    try {
      withEnv({ SAFETY_NET_WORKTREE: '1' }, () => {
        assertBlocked(
          `export GIT_WORK_TREE=${toShellPath(fixture.mainWorktree)}; git reset --hard`,
          'git reset --hard',
          fixture.linkedWorktree,
        );
        assertBlocked(
          `GIT_WORK_TREE=${toShellPath(fixture.mainWorktree)}; export GIT_WORK_TREE; git reset --hard`,
          'git reset --hard',
          fixture.linkedWorktree,
        );
        assertBlocked(
          `export -- GIT_WORK_TREE=${toShellPath(fixture.mainWorktree)}; git reset --hard`,
          'git reset --hard',
          fixture.linkedWorktree,
        );
        assertBlocked(
          `typeset -x GIT_WORK_TREE=${toShellPath(fixture.mainWorktree)}; git reset --hard`,
          'git reset --hard',
          fixture.linkedWorktree,
        );
      });
    } finally {
      fixture.cleanup();
    }
  });

  test('SAFETY_NET_WORKTREE does not relax shell wrapper git env overrides', () => {
    const fixture = createLinkedWorktreeFixture();
    try {
      withEnv({ SAFETY_NET_WORKTREE: '1' }, () => {
        assertBlocked(
          `GIT_DIR=${toShellPath(join(fixture.mainWorktree, '.git'))} GIT_WORK_TREE=${toShellPath(fixture.mainWorktree)} sh -c 'git reset --hard'`,
          'git reset --hard',
          fixture.linkedWorktree,
        );
      });
    } finally {
      fixture.cleanup();
    }
  });

  test('SAFETY_NET_WORKTREE does not relax fallback embedded git commands', () => {
    const fixture = createLinkedWorktreeFixture();
    try {
      withEnv({ SAFETY_NET_WORKTREE: '1' }, () => {
        assertBlocked('ssh host git clean -f', 'git clean -f', fixture.linkedWorktree);
      });
    } finally {
      fixture.cleanup();
    }
  });

  test('SAFETY_NET_WORKTREE does not relax remote parallel git commands', () => {
    const fixture = createLinkedWorktreeFixture();
    try {
      withEnv({ SAFETY_NET_WORKTREE: '1' }, () => {
        assertBlocked(
          'parallel -S host git clean -f ::: .',
          'git clean -f',
          fixture.linkedWorktree,
        );
      });
    } finally {
      fixture.cleanup();
    }
  });

  test('SAFETY_NET_WORKTREE keeps ref-moving resets blocked', () => {
    const fixture = createLinkedWorktreeFixture();
    try {
      withEnv({ SAFETY_NET_WORKTREE: '1' }, () => {
        assertBlocked('git reset --hard HEAD~1', 'git reset --hard', fixture.linkedWorktree);
        assertBlocked('git reset --merge HEAD~1', 'git reset --merge', fixture.linkedWorktree);
      });
    } finally {
      fixture.cleanup();
    }
  });

  test('SAFETY_NET_WORKTREE keeps xargs and parallel appended reset refs blocked', () => {
    const fixture = createLinkedWorktreeFixture();
    try {
      withEnv({ SAFETY_NET_WORKTREE: '1' }, () => {
        assertBlocked(
          'echo HEAD~1 | xargs git reset --hard',
          'git reset --hard',
          fixture.linkedWorktree,
        );
        assertBlocked(
          'parallel git reset --hard ::: HEAD~1',
          'git reset --hard',
          fixture.linkedWorktree,
        );
      });
    } finally {
      fixture.cleanup();
    }
  });

  test('SAFETY_NET_WORKTREE fails closed on dynamic xargs git arguments', () => {
    const fixture = createLinkedWorktreeFixture();
    try {
      withEnv({ SAFETY_NET_WORKTREE: '1' }, () => {
        assertBlocked('echo --force | xargs git clean -f', 'git clean -f', fixture.linkedWorktree);
        assertBlocked(
          'echo --recurse-submodules | xargs git checkout --force main',
          'git checkout --force',
          fixture.linkedWorktree,
        );
      });
    } finally {
      fixture.cleanup();
    }
  });

  test('SAFETY_NET_WORKTREE fails closed on dynamic parallel git arguments', () => {
    const fixture = createLinkedWorktreeFixture();
    try {
      withEnv({ SAFETY_NET_WORKTREE: '1' }, () => {
        assertBlocked(
          "printf 'HEAD~1\\n' | parallel git reset --hard",
          'git reset --hard',
          fixture.linkedWorktree,
        );
        assertBlocked('parallel git clean -f {} ::: -ffdx', 'git clean -f', fixture.linkedWorktree);
      });
    } finally {
      fixture.cleanup();
    }
  });

  test('SAFETY_NET_WORKTREE does not relax git context append assignments', () => {
    const fixture = createLinkedWorktreeFixture();
    try {
      withEnv({ SAFETY_NET_WORKTREE: '1' }, () => {
        assertBlocked(
          `GIT_WORK_TREE+=${toShellPath(fixture.mainWorktree)} git reset --hard`,
          'git reset --hard',
          fixture.linkedWorktree,
        );
      });
    } finally {
      fixture.cleanup();
    }
  });

  test('SAFETY_NET_WORKTREE keeps recursive submodule discards blocked', () => {
    const fixture = createLinkedWorktreeFixture();
    try {
      withEnv({ SAFETY_NET_WORKTREE: '1' }, () => {
        assertBlocked(
          'git reset --hard --recurse-submodules',
          'git reset --hard',
          fixture.linkedWorktree,
        );
        assertBlocked(
          'git checkout --force --recurse-submodules main',
          'git checkout --force',
          fixture.linkedWorktree,
        );
      });
    } finally {
      fixture.cleanup();
    }
  });

  test('SAFETY_NET_WORKTREE keeps recursive submodule config discards blocked', () => {
    const fixture = createLinkedWorktreeFixture();
    try {
      withEnv({ SAFETY_NET_WORKTREE: '1' }, () => {
        assertBlocked(
          'git -c submodule.recurse=true reset --hard',
          'git reset --hard',
          fixture.linkedWorktree,
        );
        assertBlocked(
          'git -csubmodule.recurse=true checkout --force main',
          'git checkout --force',
          fixture.linkedWorktree,
        );
      });
    } finally {
      fixture.cleanup();
    }
  });

  test('SAFETY_NET_WORKTREE keeps forced branch resets blocked', () => {
    const fixture = createLinkedWorktreeFixture();
    try {
      withEnv({ SAFETY_NET_WORKTREE: '1' }, () => {
        assertBlocked(
          'git checkout -f -B feature HEAD~1',
          'git checkout --force',
          fixture.linkedWorktree,
        );
        assertBlocked(
          'git switch -f -C feature HEAD~1',
          'git switch --force',
          fixture.linkedWorktree,
        );
      });
    } finally {
      fixture.cleanup();
    }
  });

  test('SAFETY_NET_WORKTREE keeps double-force clean blocked', () => {
    const fixture = createLinkedWorktreeFixture();
    try {
      withEnv({ SAFETY_NET_WORKTREE: '1' }, () => {
        assertBlocked('git clean -ffdx', 'git clean -f', fixture.linkedWorktree);
        assertBlocked('git clean -f --force', 'git clean -f', fixture.linkedWorktree);
      });
    } finally {
      fixture.cleanup();
    }
  });

  test('SAFETY_NET_WORKTREE verifies worktree config before relaxing', () => {
    const fixture = createLinkedWorktreeFixture();
    try {
      execFileSync('git', ['config', 'extensions.worktreeConfig', 'true'], {
        cwd: fixture.mainWorktree,
        stdio: 'ignore',
      });
      execFileSync('git', ['config', '--worktree', 'core.worktree', fixture.mainWorktree], {
        cwd: fixture.linkedWorktree,
        stdio: 'ignore',
      });

      withEnv({ SAFETY_NET_WORKTREE: '1' }, () => {
        assertBlocked('git reset --hard', 'git reset --hard', fixture.linkedWorktree);
      });
    } finally {
      fixture.cleanup();
    }
  });

  test('SAFETY_NET_WORKTREE propagates interpreter wrapper context', () => {
    const fixture = createLinkedWorktreeFixture();
    try {
      withEnv({ SAFETY_NET_WORKTREE: '1' }, () => {
        assertBlocked(
          `GIT_WORK_TREE=${toShellPath(fixture.mainWorktree)} ruby -e '\`git restore file.txt\`'`,
          'git restore',
          fixture.linkedWorktree,
        );
      });
    } finally {
      fixture.cleanup();
    }
  });

  test('SAFETY_NET_WORKTREE keeps shared and remote destructive rules blocked', () => {
    const fixture = createLinkedWorktreeFixture();
    try {
      withEnv({ SAFETY_NET_WORKTREE: '1' }, () => {
        assertBlocked('git push -f', 'push --force', fixture.linkedWorktree);
        assertBlocked(
          'git branch -D feature/worktree-test',
          'git branch -D',
          fixture.linkedWorktree,
        );
        assertBlocked('git stash clear', 'git stash clear', fixture.linkedWorktree);
        assertBlocked(
          'git worktree remove --force ../other-worktree',
          'git worktree remove --force',
          fixture.linkedWorktree,
        );
      });
    } finally {
      fixture.cleanup();
    }
  });
});

describe('git push', () => {
  test('git push --force blocked', () => {
    assertBlocked('git push --force', 'push --force');
  });

  test('git push --force origin main blocked', () => {
    assertBlocked('git push --force origin main', 'push --force');
  });

  test('git push -f blocked', () => {
    assertBlocked('git push -f', 'push --force');
  });

  test('git push -f origin main blocked', () => {
    assertBlocked('git push -f origin main', 'push --force');
  });

  test('git push --force-with-lease allowed', () => {
    assertAllowed('git push --force-with-lease');
  });

  test('git push --force-with-lease origin main allowed', () => {
    assertAllowed('git push --force-with-lease origin main');
  });

  test('git push --force-with-lease=refs/heads/main allowed', () => {
    assertAllowed('git push --force-with-lease=refs/heads/main');
  });

  test('git push --force --force-with-lease allowed', () => {
    assertAllowed('git push --force --force-with-lease');
  });

  test('git push -f --force-with-lease allowed', () => {
    assertAllowed('git push -f --force-with-lease');
  });

  test('git push origin main allowed', () => {
    assertAllowed('git push origin main');
  });
});

describe('git worktree', () => {
  test('git worktree remove --force blocked', () => {
    assertBlocked('git worktree remove --force /tmp/wt', 'git worktree remove --force');
  });

  test('git worktree remove -f blocked', () => {
    assertBlocked('git worktree remove -f /tmp/wt', 'git worktree remove --force');
  });

  test('git worktree remove without force allowed', () => {
    assertAllowed('git worktree remove /tmp/wt');
  });

  test('git worktree remove -- -f allowed', () => {
    assertAllowed('git worktree remove -- -f');
  });
});

describe('git branch', () => {
  test('git branch -D blocked', () => {
    assertBlocked('git branch -D feature', 'git branch -D');
  });

  test('git branch -Dv blocked', () => {
    assertBlocked('git branch -Dv feature', 'git branch -D');
  });

  test('git branch -d allowed', () => {
    assertAllowed('git branch -d feature');
  });
});

describe('git stash', () => {
  test('git stash drop blocked', () => {
    assertBlocked('git stash drop', 'git stash drop');
  });

  test('git stash drop stash@{0} blocked', () => {
    assertBlocked('git stash drop stash@{0}', 'git stash drop');
  });

  test('git stash clear blocked', () => {
    assertBlocked('git stash clear', 'git stash clear');
  });

  test('git stash allowed', () => {
    assertAllowed('git stash');
  });

  test('git stash list allowed', () => {
    assertAllowed('git stash list');
  });

  test('git stash pop allowed', () => {
    assertAllowed('git stash pop');
  });
});

describe('git edge cases', () => {
  test('git -- without subcommand allowed', () => {
    assertAllowed('git --');
  });

  test('git -- followed by option allowed', () => {
    assertAllowed('git -- --help');
  });
});

describe('safe commands', () => {
  test('git allowed', () => {
    assertAllowed('git');
  });

  test('git --help allowed', () => {
    assertAllowed('git --help');
  });

  test('git status allowed', () => {
    assertAllowed('git status');
  });

  test('git -C repo status allowed', () => {
    assertAllowed('git -C repo status');
  });

  test('git status global option -C allowed', () => {
    assertAllowed('git -Crepo status');
  });

  test('sudo env VAR=1 git status allowed', () => {
    assertAllowed('sudo env VAR=1 git status');
  });

  test('git diff allowed', () => {
    assertAllowed('git diff');
  });

  test('git log --oneline -10 allowed', () => {
    assertAllowed('git log --oneline -10');
  });

  test('git add . allowed', () => {
    assertAllowed('git add .');
  });

  test("git commit -m 'test' allowed", () => {
    assertAllowed("git commit -m 'test'");
  });

  test('git pull allowed', () => {
    assertAllowed('git pull');
  });

  test("bash -c 'echo ok' allowed", () => {
    assertAllowed("bash -c 'echo ok'");
  });

  test('python -c "print(\'ok\')" allowed', () => {
    assertAllowed('python -c "print(\'ok\')"');
  });

  test('ls -la allowed', () => {
    assertAllowed('ls -la');
  });

  test('cat file.txt allowed', () => {
    assertAllowed('cat file.txt');
  });
});
