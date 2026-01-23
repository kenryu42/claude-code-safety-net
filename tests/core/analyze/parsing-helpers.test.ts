/**
 * Targeted unit tests for helper parsers in the safety net.
 *
 * These focus on option-scanning branches that are hard to hit via end-to-end
 * command strings, improving confidence (and coverage) of the parsing logic.
 */

import { describe, expect, test } from 'bun:test';
import {
  _extractParallelChildCommand,
  _extractXargsChildCommand,
  _findHasDelete,
  _hasRecursiveForceFlags,
} from '@/core/analyze';
import { dangerousInText } from '@/core/analyze/dangerous-text';
import { extractDashCArg } from '@/core/analyze/shell-wrappers';
import { _extractGitSubcommandAndRest, _getCheckoutPositionalArgs } from '@/core/rules-git';
import { extractShortOpts, splitShellCommands, stripWrappersWithInfo } from '@/core/shell';
import { MAX_STRIP_ITERATIONS } from '@/types';

describe('shell parsing helpers', () => {
  describe('extractDashCArg', () => {
    test('returns null for empty tokens', () => {
      expect(extractDashCArg([])).toBeNull();
    });

    test('returns null for single token', () => {
      expect(extractDashCArg(['bash'])).toBeNull();
    });

    test('extracts arg after standalone -c', () => {
      expect(extractDashCArg(['bash', '-c', 'echo ok'])).toBe('echo ok');
    });

    test('extracts arg after bundled -lc', () => {
      expect(extractDashCArg(['bash', '-lc', 'echo ok'])).toBe('echo ok');
    });

    test('extracts arg after bundled -xc', () => {
      expect(extractDashCArg(['sh', '-xc', 'rm -rf /'])).toBe('rm -rf /');
    });

    test('returns null when -c has no following arg', () => {
      expect(extractDashCArg(['bash', '-c'])).toBeNull();
    });

    test('returns null when bundled option has no following arg', () => {
      expect(extractDashCArg(['bash', '-lc'])).toBeNull();
    });

    test('handles -- separator before -c (implementation scans past it)', () => {
      expect(extractDashCArg(['bash', '--', '-c', 'echo'])).toBe('echo');
    });

    test('ignores long options starting with --', () => {
      expect(extractDashCArg(['bash', '--rcfile', 'script'])).toBeNull();
    });

    test('returns null when next token starts with dash', () => {
      expect(extractDashCArg(['bash', '-lc', '-x'])).toBeNull();
    });

    test('handles -c appearing later in tokens', () => {
      expect(extractDashCArg(['bash', '-l', '-c', 'echo ok'])).toBe('echo ok');
    });
  });

  describe('extractShortOpts', () => {
    test('stops at double dash', () => {
      // given: tokens with -Ap after -- (a filename, not options)
      // when: extracting short options
      // then: A and p should NOT be in the result
      expect(extractShortOpts(['git', 'add', '--', '-Ap'])).toEqual(new Set());
      expect(extractShortOpts(['rm', '-r', '--', '-f'])).toEqual(new Set(['-r']));
    });

    test('extracts before double dash', () => {
      // given: tokens with options before --
      // when: extracting short options
      // then: only options before -- are extracted
      expect(extractShortOpts(['git', '-v', 'add', '-n', '--', '-x'])).toEqual(
        new Set(['-v', '-n']),
      );
    });
  });

  describe('splitShellCommands', () => {
    test('returns whole command when quotes are unclosed', () => {
      expect(splitShellCommands('echo "unterminated')).toEqual([['echo "unterminated']]);
    });

    test('extracts arithmetic substitution segments (nested parens)', () => {
      expect(splitShellCommands('echo $((1+2))')).toEqual([['echo'], ['1+2']]);
    });

    test('extracts backtick substitution segments', () => {
      expect(splitShellCommands('echo `date`')).toEqual([['date'], ['echo', '`date`']]);
    });

    test('extracts $() substitution segments split on operators', () => {
      expect(splitShellCommands('echo $(rm -rf /tmp/x && echo ok)')).toEqual([
        ['echo'],
        ['rm', '-rf', '/tmp/x'],
        ['echo', 'ok'],
      ]);
    });

    test('extracts multiple backtick substitutions from one token', () => {
      expect(splitShellCommands('echo `a`:`b`')).toEqual([['a'], ['b'], ['echo', '`a`:`b`']]);
    });

    test('handles nested $(...) with operators', () => {
      const result = splitShellCommands('echo $(echo $(rm -rf /tmp/x))');
      expect(result.length).toBeGreaterThan(1);
      const flat = result.flat();
      expect(flat).toContain('rm');
      expect(flat).toContain('-rf');
    });

    test('handles deeply nested $(...) substitutions', () => {
      const result = splitShellCommands('echo $(a $(b $(c)))');
      expect(result.length).toBeGreaterThan(1);
    });

    test('handles $(...) with semicolon operators', () => {
      expect(splitShellCommands('echo $(cd /tmp; rm -rf .)')).toEqual([
        ['echo'],
        ['cd', '/tmp'],
        ['rm', '-rf', '.'],
      ]);
    });

    test('handles $(...) with pipe operators', () => {
      expect(splitShellCommands('echo $(cat file | rm -rf /)')).toEqual([
        ['echo'],
        ['cat', 'file'],
        ['rm', '-rf', '/'],
      ]);
    });

    test('handles unterminated $() substitution (no hang, still extracts tokens)', () => {
      expect(splitShellCommands('echo $(rm -rf /tmp/x')).toEqual([
        ['echo'],
        ['rm', '-rf', '/tmp/x'],
      ]);
    });
  });

  describe('stripWrappersWithInfo', () => {
    test('strips sudo options that consume a value', () => {
      const result = stripWrappersWithInfo(['sudo', '-u', 'root', 'rm', '-rf', '/tmp/a']);
      expect(result.tokens).toEqual(['rm', '-rf', '/tmp/a']);
    });

    test('strips env -C=...', () => {
      const result = stripWrappersWithInfo(['env', '-C=/tmp', 'rm', '-rf']);
      expect(result.tokens).toEqual(['rm', '-rf']);
    });

    test('strips command -pv and -- separator', () => {
      const result = stripWrappersWithInfo(['command', '-pv', '--', 'git', 'status']);
      expect(result.tokens).toEqual(['git', 'status']);
    });

    test('captures env assignments after hitting max strip iterations', () => {
      const tokens = Array.from({ length: MAX_STRIP_ITERATIONS }, () => 'sudo');
      tokens.push('FOO=bar', 'rm', '-rf');

      const result = stripWrappersWithInfo(tokens);
      expect(result.tokens).toEqual(['rm', '-rf']);
      expect(result.envAssignments.get('FOO')).toBe('bar');
    });

    test('strips nested wrappers across iterations and preserves env assignments', () => {
      const result = stripWrappersWithInfo([
        'sudo',
        'env',
        'FOO=1',
        'sudo',
        'command',
        '--',
        'rm',
        '-rf',
        '/tmp/a',
      ]);
      expect(result.tokens).toEqual(['rm', '-rf', '/tmp/a']);
      expect(result.envAssignments.get('FOO')).toBe('1');
    });

    test("drops leading tokens containing '=' that are not NAME=value assignments", () => {
      // Intentionally conservative: only strict NAME=value is treated as an env assignment.
      // Shell-legal forms like NAME+=value are dropped to reach the real command head.
      const result = stripWrappersWithInfo(['FOO+=bar', 'rm', '-rf']);
      expect(result.tokens).toEqual(['rm', '-rf']);
      expect(result.envAssignments.get('FOO')).toBeUndefined();
    });
  });
});

describe('rm parsing helpers', () => {
  describe('hasRecursiveForceFlags', () => {
    test('empty tokens returns false', () => {
      expect(_hasRecursiveForceFlags([])).toBe(false);
    });

    test('stops at double dash', () => {
      // -f after `--` is a positional arg, not an option.
      expect(_hasRecursiveForceFlags(['rm', '-r', '--', '-f'])).toBe(false);
    });

    test('detects -rf combined', () => {
      expect(_hasRecursiveForceFlags(['rm', '-rf', 'foo'])).toBe(true);
    });

    test('detects -r -f separate', () => {
      expect(_hasRecursiveForceFlags(['rm', '-r', '-f', 'foo'])).toBe(true);
    });

    test('detects --recursive --force', () => {
      expect(_hasRecursiveForceFlags(['rm', '--recursive', '--force', 'foo'])).toBe(true);
    });
  });
});

describe('find parsing helpers', () => {
  describe('findHasDelete', () => {
    test('exec without terminator ignored', () => {
      // Un-terminated -exec should not cause a false positive on -delete.
      expect(_findHasDelete(['-exec', 'echo', '-delete'])).toBe(false);
    });

    test('skips undefined tokens', () => {
      // biome-ignore lint/suspicious/noExplicitAny: intentionally testing malformed input
      expect(_findHasDelete([undefined as any, '-delete'] as any)).toBe(true);
    });

    test('delete outside exec detected', () => {
      expect(_findHasDelete(['-name', '*.txt', '-delete'])).toBe(true);
    });

    test('delete inside exec not detected', () => {
      expect(_findHasDelete(['-exec', 'rm', '-delete', ';', '-print'])).toBe(false);
    });

    test('options that consume a value treat -delete as an argument', () => {
      const consumingValue = [
        '-name',
        '-iname',
        '-path',
        '-ipath',
        '-regex',
        '-iregex',
        '-type',
        '-user',
        '-group',
        '-perm',
        '-size',
        '-mtime',
        '-ctime',
        '-atime',
        '-newer',
        '-printf',
        '-fprint',
        '-fprintf',
      ] as const;

      for (const opt of consumingValue) {
        expect(_findHasDelete([opt, '-delete'])).toBe(false);
        expect(_findHasDelete([opt, '-delete', '-delete'])).toBe(true);
      }
    });
  });
});

describe('dangerousInText', () => {
  test('detects rm -rf variants', () => {
    expect(dangerousInText('rm -rf /tmp/x')).toBe('rm -rf');
    expect(dangerousInText('rm -R -f /tmp/x')).toBe('rm -rf');
    expect(dangerousInText('rm -fr /tmp/x')).toBe('rm -rf');
    expect(dangerousInText('rm -f -r /tmp/x')).toBe('rm -rf');
  });

  test('detects with leading whitespace (trimStart)', () => {
    expect(dangerousInText('   rm -rf /tmp/x')).toBe('rm -rf');
  });

  test('detects key git patterns', () => {
    expect(dangerousInText('git reset --hard')).toBe('git reset --hard');
    expect(dangerousInText('git clean -f')).toBe('git clean -f');
  });

  test('skips find -delete when text starts with echo/rg', () => {
    expect(dangerousInText('echo "find . -delete')).toBeNull();
    expect(dangerousInText('rg "find . -delete')).toBeNull();
  });
});

describe('xargs parsing helpers', () => {
  describe('extractXargsChildCommand', () => {
    test('none when child unspecified', () => {
      expect(_extractXargsChildCommand(['xargs'])).toEqual([]);
    });

    test('double dash starts child', () => {
      expect(_extractXargsChildCommand(['xargs', '--', 'rm', '-rf'])).toEqual(['rm', '-rf']);
    });

    test('long option consumes value', () => {
      expect(_extractXargsChildCommand(['xargs', '--max-args', '5', 'rm', '-rf'])).toEqual([
        'rm',
        '-rf',
      ]);
    });

    test('long option equals form', () => {
      expect(_extractXargsChildCommand(['xargs', '--max-args=5', 'rm'])).toEqual(['rm']);
    });

    test('short option attached form', () => {
      expect(_extractXargsChildCommand(['xargs', '-n1', 'rm'])).toEqual(['rm']);
    });

    test('dash i does not consume child', () => {
      expect(_extractXargsChildCommand(['xargs', '-i', 'rm', '-rf'])).toEqual(['rm', '-rf']);
    });

    test('more attached forms', () => {
      const cases: Array<[string[], string[]]> = [
        [['xargs', '-P4', 'rm'], ['rm']],
        [['xargs', '-L2', 'rm'], ['rm']],
        [['xargs', '-n1', 'rm'], ['rm']],
      ];
      for (const [tokens, expected] of cases) {
        expect(_extractXargsChildCommand(tokens)).toEqual(expected);
      }
    });
  });
});

describe('parallel parsing helpers', () => {
  describe('extractParallelChildCommand', () => {
    test('returns empty when ::: is first token after parallel', () => {
      // When ::: is the first token after parallel (and options),
      // it returns empty because args follow :::
      expect(_extractParallelChildCommand(['parallel', ':::'])).toEqual([]);
    });

    test('extracts command with -- separator', () => {
      expect(_extractParallelChildCommand(['parallel', '--', 'rm', '-rf'])).toEqual(['rm', '-rf']);
    });

    test('returns command and all following tokens', () => {
      // The function returns all tokens starting from the first non-option
      expect(_extractParallelChildCommand(['parallel', 'rm', '-rf'])).toEqual(['rm', '-rf']);
    });

    test('returns command including ::: marker when command comes first', () => {
      // If command tokens appear before :::, all of them are returned
      expect(_extractParallelChildCommand(['parallel', 'rm', '-rf', ':::', '/'])).toEqual([
        'rm',
        '-rf',
        ':::',
        '/',
      ]);
    });

    test('consumes options', () => {
      expect(_extractParallelChildCommand(['parallel', '-j4', '--', 'rm', '-rf'])).toEqual([
        'rm',
        '-rf',
      ]);
    });

    test('consumes --option=value', () => {
      expect(_extractParallelChildCommand(['parallel', '--foo=bar', 'rm', '-rf'])).toEqual([
        'rm',
        '-rf',
      ]);
    });

    test('consumes options that take a value', () => {
      expect(_extractParallelChildCommand(['parallel', '-S', 'sshlogin', 'rm', '-rf'])).toEqual([
        'rm',
        '-rf',
      ]);
    });

    test('consumes -j value form', () => {
      expect(_extractParallelChildCommand(['parallel', '-j', '4', 'rm', '-rf'])).toEqual([
        'rm',
        '-rf',
      ]);
    });

    test('skips unknown short option', () => {
      expect(_extractParallelChildCommand(['parallel', '-X', 'rm', '-rf'])).toEqual(['rm', '-rf']);
    });

    test('empty for just parallel', () => {
      expect(_extractParallelChildCommand(['parallel'])).toEqual([]);
    });
  });
});

describe('git rules helpers', () => {
  describe('extractGitSubcommandAndRest', () => {
    test('git only returns null subcommand', () => {
      const result = _extractGitSubcommandAndRest(['git']);
      expect(result.subcommand).toBeNull();
      expect(result.rest).toEqual([]);
    });

    test('non git returns null subcommand', () => {
      const result = _extractGitSubcommandAndRest(['echo', 'ok']);
      expect(result.subcommand).toBeNull();
      expect(result.rest).toEqual([]);
    });

    test('unknown short option skipped', () => {
      const result = _extractGitSubcommandAndRest(['git', '-x', 'reset', '--hard']);
      expect(result.subcommand).toBe('reset');
      expect(result.rest).toEqual(['--hard']);
    });

    test('unknown long option equals skipped', () => {
      const result = _extractGitSubcommandAndRest(['git', '--unknown=1', 'reset', '--hard']);
      expect(result.subcommand).toBe('reset');
      expect(result.rest).toEqual(['--hard']);
    });

    test('opts with value separate consumed', () => {
      const result = _extractGitSubcommandAndRest(['git', '-c', 'foo=bar', 'reset']);
      expect(result.subcommand).toBe('reset');
      expect(result.rest).toEqual([]);
    });

    test('double dash can introduce subcommand', () => {
      const result = _extractGitSubcommandAndRest(['git', '--', 'reset', '--hard']);
      expect(result.subcommand).toBe('reset');
      expect(result.rest).toEqual(['--hard']);
    });

    test('double dash without a subcommand yields null', () => {
      const result = _extractGitSubcommandAndRest(['git', '--', '--help']);
      expect(result.subcommand).toBeNull();
      expect(result.rest).toEqual(['--help']);
    });

    test('attached -C consumes itself', () => {
      const result = _extractGitSubcommandAndRest(['git', '-C/tmp', 'reset', '--hard']);
      expect(result.subcommand).toBe('reset');
      expect(result.rest).toEqual(['--hard']);
    });
  });

  describe('getCheckoutPositionalArgs', () => {
    test('attached short opts ignored', () => {
      expect(_getCheckoutPositionalArgs(['-bnew', 'main', 'file.txt'])).toEqual([
        'main',
        'file.txt',
      ]);
      expect(_getCheckoutPositionalArgs(['-U3', 'main'])).toEqual(['main']);
    });

    test('long equals ignored', () => {
      expect(_getCheckoutPositionalArgs(['--pathspec-from-file=paths.txt', 'main'])).toEqual([
        'main',
      ]);
    });

    test('double dash breaks', () => {
      expect(_getCheckoutPositionalArgs(['--', 'file.txt'])).toEqual([]);
    });

    test('options with value consumed', () => {
      expect(_getCheckoutPositionalArgs(['-b', 'new', 'main'])).toEqual(['main']);
    });

    test('unknown long option consumes value', () => {
      expect(_getCheckoutPositionalArgs(['--unknown', 'main', 'file.txt'])).toEqual(['file.txt']);
    });

    test('unknown short option skipped', () => {
      expect(_getCheckoutPositionalArgs(['-x', 'main'])).toEqual(['main']);
    });

    test('optional value options recurse-submodules', () => {
      expect(_getCheckoutPositionalArgs(['--recurse-submodules', 'main'])).toEqual(['main']);
      expect(_getCheckoutPositionalArgs(['--recurse-submodules=on-demand', 'main'])).toEqual([
        'main',
      ]);
    });

    test('optional value options track', () => {
      expect(_getCheckoutPositionalArgs(['--track', 'main'])).toEqual(['main']);
      expect(_getCheckoutPositionalArgs(['--track=direct', 'main'])).toEqual(['main']);
    });
  });
});

describe('cwd tracking helpers', () => {
  const { _segmentChangesCwd } = require('../../../src/core/analyze.ts');

  test('cd returns true', () => {
    expect(_segmentChangesCwd(['cd', '..'])).toBe(true);
  });

  test('pushd returns true', () => {
    expect(_segmentChangesCwd(['pushd', '/tmp'])).toBe(true);
  });

  test('popd returns true', () => {
    expect(_segmentChangesCwd(['popd'])).toBe(true);
  });

  test('builtin cd returns true', () => {
    expect(_segmentChangesCwd(['builtin', 'cd', '..'])).toBe(true);
  });

  test('builtin only returns false', () => {
    expect(_segmentChangesCwd(['builtin'])).toBe(false);
  });

  test('grouped cd returns true', () => {
    expect(_segmentChangesCwd(['{', 'cd', '..', ';', '}'])).toBe(true);
  });

  test('subshell cd returns true', () => {
    expect(_segmentChangesCwd(['(', 'cd', '..', ')'])).toBe(true);
  });

  test('command substitution cd returns true', () => {
    expect(_segmentChangesCwd(['$(', 'cd', '..', ')'])).toBe(true);
  });

  test('regex fallback on unparseable', () => {
    expect(_segmentChangesCwd(['cd', "'unterminated"])).toBe(true);
  });

  test('non-cd command returns false', () => {
    expect(_segmentChangesCwd(['ls', '-la'])).toBe(false);
  });
});

describe('xargs parsing helpers', () => {
  const { _extractXargsChildCommandWithInfo } = require('../../../src/core/analyze.ts');

  test('replacement token from -I option', () => {
    const result = _extractXargsChildCommandWithInfo(['xargs', '-I', '{}', 'rm', '-rf', '{}']);
    expect(result.replacementToken).toBe('{}');
  });

  test('replacement token from -I attached', () => {
    const result = _extractXargsChildCommandWithInfo(['xargs', '-I%', 'rm', '-rf', '%']);
    expect(result.replacementToken).toBe('%');
  });

  test('replacement token from --replace defaults to braces', () => {
    const result = _extractXargsChildCommandWithInfo(['xargs', '--replace', 'rm', '-rf', '{}']);
    expect(result.replacementToken).toBe('{}');
  });

  test('replacement token from --replace= empty defaults to braces', () => {
    const result = _extractXargsChildCommandWithInfo(['xargs', '--replace=', 'rm', '-rf', '{}']);
    expect(result.replacementToken).toBe('{}');
  });

  test('replacement token from --replace=CUSTOM', () => {
    const result = _extractXargsChildCommandWithInfo([
      'xargs',
      '--replace=FOO',
      'rm',
      '-rf',
      'FOO',
    ]);
    expect(result.replacementToken).toBe('FOO');
  });

  test('no replacement token when not specified', () => {
    const result = _extractXargsChildCommandWithInfo(['xargs', 'rm', '-rf']);
    expect(result.replacementToken).toBeNull();
  });
});
