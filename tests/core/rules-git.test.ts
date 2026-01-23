import { describe, expect, test } from 'bun:test';
import { analyzeGit } from '@/core/rules-git';
import { assertAllowed, assertBlocked } from '../helpers.ts';

describe('analyzeGit direct', () => {
  test('empty tokens returns null', () => {
    expect(analyzeGit([])).toBeNull();
  });
});

describe('git checkout', () => {
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

  test('git checkout -Bnew-branch allowed', () => {
    assertAllowed('git checkout -Bnew-branch');
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

  test('git checkout --recurse-submodules=checkout allowed', () => {
    assertAllowed('git checkout --recurse-submodules=checkout main');
  });

  test('git checkout --recurse-submodules=on-demand allowed', () => {
    assertAllowed('git checkout --recurse-submodules=on-demand main');
  });

  test('git checkout --recurse-submodules ref pathspec blocked', () => {
    assertBlocked('git checkout --recurse-submodules main file.txt', 'multiple positional args');
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

  test('git checkout -U attached value allowed', () => {
    assertAllowed('git checkout -U3 main');
  });

  test('git checkout unknown long option consumes value allowed', () => {
    assertAllowed('git checkout --unknown main file.txt');
  });

  test('git checkout unknown long option does not consume option value allowed', () => {
    assertAllowed('git checkout --unknown -q main');
  });

  test('git checkout unknown long option equals allowed', () => {
    assertAllowed('git checkout --unknown=value main');
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
