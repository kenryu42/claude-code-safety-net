import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { assertAllowed, assertBlocked, runGuard, withEnv } from '../../helpers.ts';

describe('edge cases', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'safety-net-test-'));
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  describe('input validation', () => {
    test('empty command allows', () => {
      assertAllowed('');
    });

    test('whitespace command allows', () => {
      assertAllowed('   ');
    });

    test('case insensitive matching blocks', () => {
      assertBlocked('GIT CHECKOUT -- file', 'git checkout --');
    });
  });

  describe('strict mode', () => {
    test('strict mode parse error denies', () => {
      withEnv({ SAFETY_NET_STRICT: '1' }, () => {
        const result = runGuard("git reset --hard 'unterminated");
        expect(result).not.toBeNull();
      });
    });

    test('strict mode unparseable safe command denies', () => {
      withEnv({ SAFETY_NET_STRICT: '1' }, () => {
        const result = runGuard("echo 'unterminated");
        expect(result).not.toBeNull();
        expect(result).toContain('could not be safely analyzed');
      });
    });

    test('non-strict mode unparseable safe command allows', () => {
      assertAllowed("echo 'unterminated");
    });

    test('strict mode bash -c without arg allows', () => {
      withEnv({ SAFETY_NET_STRICT: '1' }, () => {
        assertAllowed('bash -c');
      });
    });

    test('non strict bash -c without arg allows', () => {
      assertAllowed('bash -c');
    });

    test('bash double dash does not treat dash c as wrapper allowed', () => {
      assertAllowed("bash -- -c 'echo ok'");
    });

    test('strict mode bash without dash c allowed', () => {
      withEnv({ SAFETY_NET_STRICT: '1' }, () => {
        assertAllowed('bash -l echo ok');
      });
    });

    test('strict mode bash only allowed', () => {
      withEnv({ SAFETY_NET_STRICT: '1' }, () => {
        assertAllowed('bash');
      });
    });

    test('strict mode bash double dash does not treat dash c as wrapper allowed', () => {
      withEnv({ SAFETY_NET_STRICT: '1' }, () => {
        assertAllowed("bash -- -c 'echo ok'");
      });
    });

    test('strict mode python without one liner allowed', () => {
      withEnv({ SAFETY_NET_STRICT: '1' }, () => {
        assertAllowed('python script.py');
      });
    });

    test('strict mode python double dash does not treat dash c as one liner allowed', () => {
      withEnv({ SAFETY_NET_STRICT: '1' }, () => {
        assertAllowed("python -- -c 'print(1)'");
      });
    });

    test('strict mode python one liner allowed', () => {
      withEnv({ SAFETY_NET_STRICT: '1' }, () => {
        assertAllowed('python -c "print(\'ok\')"');
      });
    });

    test('strict mode bash lc without arg allows', () => {
      withEnv({ SAFETY_NET_STRICT: '1' }, () => {
        assertAllowed('bash -lc');
      });
    });
  });

  describe('shell wrappers', () => {
    test('sh -lc wrapper blocked', () => {
      assertBlocked("sh -lc 'git reset --hard'", 'git reset --hard');
    });
  });

  describe('unparseable commands with heuristics', () => {
    test('non strict unparseable rm -rf still blocked by heuristic', () => {
      assertBlocked("rm -rf /some/path 'unterminated", 'rm -rf');
    });

    test('non strict unparseable git push -f still blocked by heuristic', () => {
      assertBlocked("git push -f origin main 'unterminated", 'push --force');
    });

    test('non strict unparseable find delete blocked by heuristic', () => {
      assertBlocked("find . -delete 'unterminated", 'find -delete');
    });

    test('non strict unparseable non dangerous allows', () => {
      assertAllowed("echo 'unterminated");
    });

    test('non strict unparseable git restore help allows', () => {
      assertAllowed("git restore --help 'unterminated");
    });

    test('non strict unparseable git checkout dash dash still blocked by heuristic', () => {
      assertBlocked("git checkout -- file.txt 'unterminated", 'git checkout --');
    });

    test('non strict unparseable git restore blocked by heuristic', () => {
      assertBlocked("git restore file.txt 'unterminated", 'git restore');
    });

    test('non strict unparseable git restore worktree still blocked by heuristic', () => {
      assertBlocked("git restore --worktree file.txt 'unterminated", 'git restore');
    });

    test('non strict unparseable git stash clear still blocked by heuristic', () => {
      assertBlocked("git stash clear 'unterminated", 'git stash drop/clear');
    });

    test('non strict unparseable git branch D still blocked by heuristic', () => {
      assertBlocked("git branch -D feature 'unterminated", 'git branch -D');
    });

    test('non strict unparseable git reset hard still blocked by heuristic', () => {
      assertBlocked("git reset --hard 'unterminated", 'git reset --hard');
    });

    test('non strict unparseable git reset merge still blocked by heuristic', () => {
      assertBlocked("git reset --merge 'unterminated", 'git reset --merge');
    });

    test('non strict unparseable git clean f still blocked by heuristic', () => {
      assertBlocked("git clean -f 'unterminated", 'git clean -f');
    });

    test('non strict unparseable git stash drop still blocked by heuristic', () => {
      assertBlocked("git stash drop stash@{0} 'unterminated", 'git stash drop');
    });

    test('non strict unparseable git push force still blocked by heuristic', () => {
      assertBlocked("git push --force origin main 'unterminated", 'push --force');
    });

    test('unparseable echo mentions find delete allowed', () => {
      assertAllowed('echo "find . -delete');
    });

    test('unparseable rg mentions find delete allowed', () => {
      assertAllowed('rg "find . -delete');
    });
  });

  describe('command substitution', () => {
    test('command substitution git reset hard blocked', () => {
      assertBlocked('echo $(git reset --hard )', 'git reset --hard');
    });

    test('command substitution find delete blocked', () => {
      assertBlocked('echo $(find . -delete )', 'find -delete');
    });

    test('command substitution rm f allowed', () => {
      assertAllowed('echo $(rm -f /tmp/a )');
    });

    test('command substitution git status allowed', () => {
      assertAllowed('echo $(git status )');
    });

    test('command substitution find without delete allowed', () => {
      assertAllowed('echo $(find . -name foo )');
    });
  });

  describe('xargs', () => {
    test('xargs rm -rf blocked', () => {
      assertBlocked('echo / | xargs rm -rf', 'rm -rf');
    });

    test('xargs delimiter option still blocks child rm', () => {
      assertBlocked("echo / | xargs --delimiter '\\n' rm -rf", 'rm -rf');
    });

    test('xargs dash i does not consume child cmd still blocks', () => {
      assertBlocked('echo / | xargs -i rm -rf', 'rm -rf');
    });

    test('xargs attached n option still blocks child rm', () => {
      assertBlocked('echo / | xargs -n1 rm -rf', 'rm -rf');
    });

    test('xargs attached P option still blocks child rm', () => {
      assertBlocked('echo / | xargs -P2 rm -rf', 'rm -rf');
    });

    test('xargs long opt equals still blocks child rm', () => {
      assertBlocked('echo / | xargs --arg-file=/tmp/paths rm -rf', 'rm -rf');
    });

    test('xargs only options without child command allowed', () => {
      assertAllowed('echo ok | xargs -n1');
    });

    test('xargs attached i option still blocks child rm', () => {
      assertBlocked('echo / | xargs -i{} rm -rf', 'rm -rf');
    });

    test('xargs bash c script analyzed blocks', () => {
      assertBlocked("echo ok | xargs bash -c 'git reset --hard'", 'xargs');
    });

    test('xargs child wrappers only allowed', () => {
      assertAllowed('echo ok | xargs sudo --');
    });

    test('xargs busybox rm non destructive allowed', () => {
      assertAllowed('echo ok | xargs busybox rm -f /tmp/test');
    });

    test('xargs find without delete allowed', () => {
      assertAllowed('echo ok | xargs find . -name foo');
    });

    test('xargs print0 rm -rf blocked', () => {
      assertBlocked('find . -print0 | xargs -0 rm -rf', 'rm -rf');
    });

    test('xargs arg file option still blocks child rm', () => {
      assertBlocked('echo ok | xargs -a /tmp/paths rm -rf', 'rm -rf');
    });

    test('xargs echo allowed', () => {
      assertAllowed('echo ok | xargs echo');
    });

    test('xargs busybox rm -rf blocked', () => {
      assertBlocked('echo / | xargs busybox rm -rf', 'rm -rf');
    });

    test('xargs busybox find delete blocked', () => {
      assertBlocked('echo ok | xargs busybox find . -delete', 'find -delete');
    });

    test('xargs without child command allowed', () => {
      assertAllowed('echo ok | xargs');
    });

    test('xargs find delete blocked', () => {
      assertBlocked('echo ok | xargs find . -delete', 'find -delete');
    });

    test('xargs git reset hard blocked', () => {
      assertBlocked('echo ok | xargs git reset --hard', 'git reset --hard');
    });

    test('xargs replace I rm rf blocked', () => {
      assertBlocked('echo / | xargs -I{} rm -rf {}', 'xargs', tempDir);
    });

    test('xargs replace long option enables placeholder analysis', () => {
      assertBlocked("echo / | xargs --replace bash -c 'rm -rf {}'", 'xargs');
    });

    test('xargs replace long option with custom token enables placeholder analysis', () => {
      assertBlocked("echo / | xargs --replace=FOO bash -c 'rm -rf FOO'", 'xargs');
    });

    test('xargs replace long option empty value defaults to braces', () => {
      assertBlocked("echo / | xargs --replace= bash -c 'rm -rf {}'", 'xargs');
    });

    test('xargs replacement token parsing ignores unknown options', () => {
      assertBlocked("echo / | xargs --replace -t bash -c 'rm -rf {}'", 'xargs');
    });

    test('xargs replace I bash c script is input denied safe input', () => {
      assertBlocked('echo ok | xargs -I{} bash -c {}', 'arbitrary');
    });

    test('xargs bash c without arg denied safe input', () => {
      assertBlocked('echo ok | xargs bash -c', 'arbitrary');
    });

    test('xargs replace I bash c placeholder rm rf blocked', () => {
      assertBlocked("echo / | xargs -I{} bash -c 'rm -rf {}'", 'xargs', tempDir);
    });

    test('xargs replace custom token bash c placeholder rm rf blocked', () => {
      assertBlocked("echo / | xargs -I% bash -c 'rm -rf %'", 'xargs', tempDir);
    });

    test('xargs replace I bash c script is input denied', () => {
      assertBlocked("echo 'rm -rf /' | xargs -I{} bash -c {}", 'xargs');
    });

    test('xargs J consumes value still blocks child rm', () => {
      assertBlocked('echo / | xargs -J {} rm -rf {}', 'rm -rf');
    });

    test('xargs rm double dash prevents dash rf as option allowed', () => {
      assertAllowed('echo ok | xargs rm -- -rf', tempDir);
    });

    test('xargs bash c dynamic denied', () => {
      assertBlocked("echo 'rm -rf /' | xargs bash -c", 'xargs');
    });
  });

  describe('parallel', () => {
    test('parallel bash c dynamic denied', () => {
      assertBlocked("parallel bash -c ::: 'rm -rf /'", 'parallel');
    });

    test('parallel stdin mode blocks rm -rf', () => {
      assertBlocked('echo / | parallel rm -rf', 'rm -rf');
    });

    test('parallel busybox stdin mode blocks rm -rf', () => {
      assertBlocked('echo / | parallel busybox rm -rf', 'rm -rf');
    });

    test('parallel busybox find delete blocked', () => {
      assertBlocked('parallel busybox find . -delete ::: ok', 'find -delete');
    });

    test('parallel git reset hard blocked', () => {
      assertBlocked('parallel git reset --hard ::: ok', 'git reset --hard');
    });

    test('parallel find delete blocked', () => {
      assertBlocked('parallel find . -delete ::: ok', 'find -delete');
    });

    test('parallel find without delete allowed', () => {
      assertAllowed('parallel find . -name foo ::: ok');
    });

    test('parallel busybox find without delete allowed', () => {
      assertAllowed('parallel busybox find . -name foo ::: ok');
    });

    test('parallel stdin without template allowed', () => {
      assertAllowed('echo ok | parallel');
    });

    test('parallel marker without template allowed', () => {
      assertAllowed('parallel :::');
    });

    test('parallel bash c script is input denied', () => {
      assertBlocked("echo 'rm -rf /' | parallel bash -c {}", 'parallel');
    });

    test('parallel bash c script is input denied safe input', () => {
      assertBlocked('echo ok | parallel bash -c {}', 'arbitrary');
    });

    test('parallel results option blocks rm rf', () => {
      assertBlocked('parallel --results out rm -rf {} ::: /', 'rm -rf', tempDir);
    });

    test('parallel jobs attached option blocks', () => {
      assertBlocked('parallel -j2 rm -rf {} ::: /', 'root or home', tempDir);
    });

    test('parallel jobs long equals option blocks', () => {
      assertBlocked('parallel --jobs=2 rm -rf {} ::: /', 'root or home', tempDir);
    });

    test('parallel unknown long option is ignored for template parsing', () => {
      assertBlocked('parallel --eta rm -rf {} ::: /', 'root or home', tempDir);
    });

    test('parallel unknown short option ignored for template parsing', () => {
      assertBlocked('parallel -q rm -rf {} ::: /', 'root or home', tempDir);
    });

    test('parallel bash c stdin mode blocks rm rf placeholder', () => {
      assertBlocked("echo / | parallel bash -c 'rm -rf {}'", 'rm -rf');
    });

    test('parallel commands mode blocks rm rf', () => {
      assertBlocked("parallel ::: 'rm -rf /'", 'rm -rf');
    });

    test('parallel commands mode allows when all commands safe', () => {
      assertAllowed("parallel ::: 'echo ok' 'true'");
    });

    test('parallel rm rf args after marker without placeholder blocked', () => {
      assertBlocked('parallel rm -rf ::: /', 'root or home');
    });

    test('parallel rm rf with replacement args analyzed', () => {
      assertBlocked('parallel rm -rf {} ::: /', 'rm -rf', tempDir);
    });

    test('parallel bash c rm rf with replacement args analyzed', () => {
      assertBlocked("parallel bash -c 'rm -rf {}' ::: /", 'rm -rf', tempDir);
    });

    test('parallel busybox rm rf with replacement args analyzed', () => {
      assertBlocked('parallel busybox rm -rf {} ::: /', 'rm -rf', tempDir);
    });

    test('parallel rm rf with safe replacement allowed', () => {
      assertAllowed('parallel rm -rf {} ::: build', tempDir);
    });

    test('parallel bash c rm rf with safe replacement allowed', () => {
      assertAllowed("parallel bash -c 'rm -rf {}' ::: build", tempDir);
    });

    test('parallel busybox rm rf with safe replacement allowed', () => {
      assertAllowed('parallel busybox rm -rf {} ::: build', tempDir);
    });

    test('parallel bash c without placeholder analyzes script', () => {
      assertBlocked("parallel bash -c 'git reset --hard' ::: ok", 'git reset --hard');
    });

    test('parallel bash c without placeholder allows safe script', () => {
      assertAllowed("parallel bash -c 'echo ok' ::: ok");
    });

    test('parallel busybox rm rf args after marker without placeholder blocked', () => {
      assertBlocked('parallel busybox rm -rf ::: /', 'root or home');
    });
  });

  describe('busybox', () => {
    test('busybox find delete blocked', () => {
      assertBlocked('busybox find . -delete', 'find -delete');
    });

    test('busybox find without delete allowed', () => {
      assertAllowed('busybox find . -name foo');
    });
  });

  describe('operators', () => {
    test('or operator split blocked', () => {
      assertBlocked('git status || git reset --hard', 'git reset --hard');
    });

    test('semicolon split blocked', () => {
      assertBlocked('git status; git reset --hard', 'git reset --hard');
    });

    test('newline split blocked', () => {
      assertBlocked('git status\ngit reset --hard', 'git reset --hard');
    });

    test('redirection ampersand does not split blocked', () => {
      assertBlocked('echo ok 2>&1 && git reset --hard', 'git reset --hard');
    });

    test('redirection ampersand greater does not split blocked', () => {
      assertBlocked('echo ok &>out && git reset --hard', 'git reset --hard');
    });

    test('pipe stderr and stdout split blocked', () => {
      assertBlocked('echo ok |& git reset --hard', 'git reset --hard');
    });

    test('shell split with leading operator still blocks', () => {
      assertBlocked('&& git reset --hard', 'git reset --hard');
    });

    test('shell split with leading pipe still blocks', () => {
      assertBlocked('| git reset --hard', 'git reset --hard');
    });

    test('shell split with leading pipe stderr operator still blocks', () => {
      assertBlocked('|& git reset --hard', 'git reset --hard');
    });

    test('shell split with leading background operator still blocks', () => {
      assertBlocked('& git reset --hard', 'git reset --hard');
    });

    test('shell split with trailing separator ignored allowed', () => {
      assertAllowed('git status;');
    });
  });

  describe('env wrappers', () => {
    test('sudo double dash wrapper bypass blocked', () => {
      assertBlocked('sudo -- git reset --hard', 'git reset --hard');
    });

    test('env unset equals wrapper bypass blocked', () => {
      assertBlocked('env --unset=PATH git reset --hard', 'git reset --hard');
    });

    test('env unset attached wrapper bypass blocked', () => {
      assertBlocked('env -uPATH git reset --hard', 'git reset --hard');
    });

    test('env C attached wrapper bypass blocked', () => {
      assertBlocked('env -C/tmp git reset --hard', 'git reset --hard');
    });

    test('env C separate wrapper bypass blocked', () => {
      assertBlocked('env -C /tmp git reset --hard', 'git reset --hard');
    });

    test('env P wrapper bypass blocked', () => {
      assertBlocked('env -P /usr/bin git reset --hard', 'git reset --hard');
    });

    test('env S wrapper bypass blocked', () => {
      assertBlocked("env -S 'PATH=/usr/bin' git reset --hard", 'git reset --hard');
    });

    test('env dash breaks option scan still blocks', () => {
      assertBlocked('env - git reset --hard', 'git reset --hard');
    });

    test('command combined short opts wrapper bypass blocked', () => {
      assertBlocked('command -pv -- git reset --hard', 'git reset --hard');
    });

    test('command V wrapper bypass blocked', () => {
      assertBlocked('command -V git reset --hard', 'git reset --hard');
    });

    test('command combined short opts with V wrapper bypass blocked', () => {
      assertBlocked('command -pvV -- git reset --hard', 'git reset --hard');
    });

    test('env assignments stripped blocked', () => {
      assertBlocked('FOO=1 BAR=2 git reset --hard', 'git reset --hard');
    });

    test('invalid env assignment key does not strip still blocks', () => {
      assertBlocked('1A=2 git reset --hard', 'git reset --hard');
    });

    test('invalid env assignment chars does not strip still blocks', () => {
      assertBlocked('A-B=2 git reset --hard', 'git reset --hard');
    });

    test('empty env assignment key does not strip still blocks', () => {
      assertBlocked('=2 git reset --hard', 'git reset --hard');
    });

    test('only env assignments allowed', () => {
      assertAllowed('FOO=1');
    });

    test('sudo option wrapper bypass blocked', () => {
      assertBlocked('sudo -u root -- git reset --hard', 'git reset --hard');
    });

    test('env P attached wrapper bypass blocked', () => {
      assertBlocked('env -P/usr/bin git reset --hard', 'git reset --hard');
    });

    test('env S attached wrapper bypass blocked', () => {
      assertBlocked('env -SPATH=/usr/bin git reset --hard', 'git reset --hard');
    });

    test('env unknown option wrapper bypass blocked', () => {
      assertBlocked('env -i git reset --hard', 'git reset --hard');
    });

    test('command unknown short opts not stripped still blocks', () => {
      assertBlocked('command -px git reset --hard', 'git reset --hard');
    });
  });

  describe('interpreter one-liners', () => {
    test('node -e dangerous blocked', () => {
      assertBlocked('node -e "rm -rf /"', 'rm -rf');
    });

    test('node -e safe allowed', () => {
      assertAllowed('node -e "console.log(\\"ok\\")"');
    });

    test('ruby -e dangerous blocked', () => {
      assertBlocked('ruby -e "rm -rf /"', 'rm -rf');
    });

    test('ruby -e safe allowed', () => {
      assertAllowed('ruby -e "puts \'ok\'"');
    });

    test('perl -e dangerous blocked', () => {
      assertBlocked('perl -e "rm -rf /"', 'rm -rf');
    });

    test('perl -e safe allowed', () => {
      assertAllowed('perl -e "print \'ok\'"');
    });
  });

  describe('paranoid mode', () => {
    test('paranoid mode python one liner denies', () => {
      withEnv({ SAFETY_NET_PARANOID_INTERPRETERS: '1' }, () => {
        assertBlocked('python -c "print(\'ok\')"', 'Paranoid mode');
      });
    });

    test('global paranoid mode python one liner denies', () => {
      withEnv({ SAFETY_NET_PARANOID: '1' }, () => {
        assertBlocked('python -c "print(\'ok\')"', 'Paranoid mode');
      });
    });
  });

  describe('recursion', () => {
    test('shell dash c recursion limit reached blocks command', () => {
      let cmd = 'rm -rf /some/path';
      for (let i = 0; i < 11; i++) {
        cmd = `bash -c ${JSON.stringify(cmd)}`;
      }
      assertBlocked(cmd, 'recursion');
    });
  });

  describe('cwd handling', () => {
    test('cwd empty string treated as unknown', () => {
      assertBlocked('git reset --hard', 'git reset --hard', '');
    });

    test('cd makes effectiveCwd unknown and propagates to nested bash -c', () => {
      // After cd, effectiveCwd becomes null (unknown) and must be passed to nested analysis
      // rm -rf foo with unknown CWD should be blocked (can't verify it's within cwd)
      assertBlocked('cd /tmp && bash -c "rm -rf foo"', 'rm -rf', tempDir);
    });

    test('cd makes effectiveCwd unknown and propagates to interpreter -c', () => {
      // Interpreter catches dangerous patterns via containsDangerousCode()
      assertBlocked(
        'cd /tmp && python -c "import os; os.system(\'rm -rf foo\')"',
        'dangerous command',
        tempDir,
      );
    });
  });

  describe('display-only commands bypass fallback scanning', () => {
    test('echo with git reset --hard allowed', () => {
      assertAllowed('echo git reset --hard');
    });

    test('echo with rm -rf allowed', () => {
      assertAllowed('echo rm -rf /');
    });

    test('printf with git reset --hard allowed', () => {
      assertAllowed("printf 'git reset --hard'");
    });

    test('printf with rm -rf allowed', () => {
      assertAllowed("printf 'rm -rf /'");
    });

    test('cat with find -delete allowed', () => {
      assertAllowed('cat find -delete');
    });

    test('grep with git checkout -- file allowed', () => {
      assertAllowed("grep 'git checkout -- file' log.txt");
    });

    test('rg with rm -rf allowed', () => {
      assertAllowed("rg 'rm -rf' .");
    });

    test('sed with git reset --hard allowed', () => {
      assertAllowed("sed 's/git reset --hard/safe/' file.txt");
    });

    test('awk with rm -rf allowed', () => {
      assertAllowed("awk '/rm -rf/ {print}' log.txt");
    });

    test('head with git clean -f allowed', () => {
      assertAllowed('head git clean -f');
    });

    test('tail with git stash drop allowed', () => {
      assertAllowed('tail git stash drop');
    });

    test('wc with rm -rf allowed', () => {
      assertAllowed('wc rm -rf /');
    });

    test('less with git push --force allowed', () => {
      assertAllowed('less git push --force');
    });
  });

  describe('recursion depth boundary', () => {
    test('shell dash c recursion at exactly MAX_RECURSION_DEPTH (10) blocks', () => {
      let cmd = 'rm -rf /some/path';
      for (let i = 0; i < 10; i++) {
        cmd = `bash -c ${JSON.stringify(cmd)}`;
      }
      assertBlocked(cmd, 'recursion');
    });

    test('shell dash c recursion at depth 9 still blocks with rm reason', () => {
      let cmd = 'rm -rf /some/path';
      for (let i = 0; i < 9; i++) {
        cmd = `bash -c ${JSON.stringify(cmd)}`;
      }
      assertBlocked(cmd, 'rm -rf');
    });
  });

  describe('parallel rm placeholder expansion with mixed args', () => {
    test('parallel rm -rf with one safe and one dangerous arg blocked', () => {
      assertBlocked('parallel rm -rf {} ::: build /', 'rm -rf', tempDir);
    });

    test('parallel rm -rf with multiple dangerous args blocked', () => {
      assertBlocked('parallel rm -rf {} ::: / ~', 'rm -rf', tempDir);
    });

    test('parallel rm -rf with all safe args allowed', () => {
      assertAllowed('parallel rm -rf {} ::: build dist node_modules', tempDir);
    });

    test('parallel bash -c rm -rf with mixed args blocked', () => {
      assertBlocked("parallel bash -c 'rm -rf {}' ::: build /", 'rm -rf', tempDir);
    });
  });
});
