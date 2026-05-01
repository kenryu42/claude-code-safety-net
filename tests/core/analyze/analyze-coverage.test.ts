import { describe, expect, test } from 'bun:test';
import { homedir } from 'node:os';
import { analyzeCommand } from '@/core/analyze';
import type { Config } from '@/types';
import { createLinkedWorktreeFixture, toShellPath, withEnv } from '../../helpers.ts';

const EMPTY_CONFIG: Config = { version: 1, rules: [] };

describe('analyzeCommand (coverage)', () => {
  test('unclosed-quote cd segment handled', () => {
    // Ensures cwd-tracking fallback runs for unparseable cd segments.
    expect(
      analyzeCommand('cd "unterminated', {
        cwd: '/tmp',
        config: EMPTY_CONFIG,
      }),
    ).toBeNull();
  });

  test('empty head token returns null', () => {
    expect(
      analyzeCommand('""', {
        cwd: '/tmp',
        config: EMPTY_CONFIG,
      }),
    ).toBeNull();
  });

  test('rm -rf in home cwd is blocked with dedicated message', () => {
    const result = analyzeCommand('rm -rf build', {
      cwd: homedir(),
      config: EMPTY_CONFIG,
    });
    expect(result?.reason).toContain('rm -rf in home directory');
  });

  test('rm without -rf in home cwd is not blocked by home cwd guard', () => {
    expect(
      analyzeCommand('rm -f file.txt', {
        cwd: homedir(),
        config: EMPTY_CONFIG,
      }),
    ).toBeNull();
  });

  test('custom rules can block rm after builtin allow', () => {
    const config: Config = {
      version: 1,
      rules: [
        {
          name: 'block-rm-rf',
          command: 'rm',
          block_args: ['-rf'],
          reason: 'No rm -rf.',
        },
      ],
    };
    const result = analyzeCommand('rm -rf /tmp/test-dir', {
      cwd: '/tmp',
      config,
    });
    expect(result?.reason).toContain('[block-rm-rf] No rm -rf.');
  });

  test('custom rules can block find after builtin allow', () => {
    const config: Config = {
      version: 1,
      rules: [
        {
          name: 'block-find-print',
          command: 'find',
          block_args: ['-print'],
          reason: 'Avoid find -print in tests.',
        },
      ],
    };
    const result = analyzeCommand('find . -print', { cwd: '/tmp', config });
    expect(result?.reason).toContain('[block-find-print] Avoid find -print in tests.');
  });

  test('fallback scan catches embedded rm', () => {
    const result = analyzeCommand('tool rm -rf /', {
      cwd: '/tmp',
      config: EMPTY_CONFIG,
    });
    expect(result?.reason).toContain('extremely dangerous');
  });

  test('fallback scan ignores embedded rm when analyzeRm allows it', () => {
    expect(
      analyzeCommand('tool rm -rf /tmp/a', {
        cwd: '/tmp',
        config: EMPTY_CONFIG,
      }),
    ).toBeNull();
  });

  test('fallback scan catches embedded git', () => {
    const result = analyzeCommand('tool git reset --hard', {
      cwd: '/tmp',
      config: EMPTY_CONFIG,
    });
    expect(result?.reason).toContain('git reset --hard');
  });

  test('fallback scan ignores embedded git when safe', () => {
    expect(
      analyzeCommand('tool git status', {
        cwd: '/tmp',
        config: EMPTY_CONFIG,
      }),
    ).toBeNull();
  });

  test('fallback scan catches embedded find', () => {
    const result = analyzeCommand('tool find . -delete', {
      cwd: '/tmp',
      config: EMPTY_CONFIG,
    });
    expect(result?.reason).toContain('find -delete');
  });

  test('fallback scan ignores embedded find when safe', () => {
    expect(
      analyzeCommand('tool find . -print', {
        cwd: '/tmp',
        config: EMPTY_CONFIG,
      }),
    ).toBeNull();
  });

  test('TMPDIR override to a temp dir keeps $TMPDIR allowed', () => {
    const result = analyzeCommand('TMPDIR=/tmp rm -rf $TMPDIR/test-dir', {
      cwd: '/tmp',
      config: EMPTY_CONFIG,
    });
    expect(result).toBeNull();
  });

  test('TMPDIR traversal override blocks $TMPDIR', () => {
    const result = analyzeCommand('TMPDIR=/tmp/../root rm -rf $TMPDIR/test-dir', {
      cwd: '/tmp',
      config: EMPTY_CONFIG,
    });
    expect(result?.reason).toContain('rm -rf');
  });

  test('xargs child git command is analyzed', () => {
    const result = analyzeCommand('xargs git reset --hard', {
      cwd: '/tmp',
      config: EMPTY_CONFIG,
    });
    expect(result?.reason).toContain('git reset --hard');
  });

  test('xargs child git command can be safe', () => {
    expect(
      analyzeCommand('xargs git status', {
        cwd: '/tmp',
        config: EMPTY_CONFIG,
      }),
    ).toBeNull();
  });

  describe('shell git context env state branches', () => {
    test('command -- export target is tracked across segments', () => {
      const fixture = createLinkedWorktreeFixture();
      try {
        withEnv({ SAFETY_NET_WORKTREE: '1' }, () => {
          const result = analyzeCommand(
            `command -- export GIT_WORK_TREE=${toShellPath(fixture.mainWorktree)}; git reset --hard`,
            {
              cwd: fixture.linkedWorktree,
              config: EMPTY_CONFIG,
              worktreeMode: true,
            },
          );
          expect(result?.reason).toContain('git reset --hard');
        });
      } finally {
        fixture.cleanup();
      }
    });

    test('command inspection with no executable target leaves later git context unchanged', () => {
      const fixture = createLinkedWorktreeFixture();
      try {
        withEnv({ SAFETY_NET_WORKTREE: '1' }, () => {
          expect(
            analyzeCommand(
              `command -v export; GIT_WORK_TREE=${toShellPath(
                fixture.mainWorktree,
              )}; git reset --hard`,
              {
                cwd: fixture.linkedWorktree,
                config: EMPTY_CONFIG,
                worktreeMode: true,
              },
            ),
          ).toBeNull();
          expect(
            analyzeCommand('command; git reset --hard', {
              cwd: fixture.linkedWorktree,
              config: EMPTY_CONFIG,
              worktreeMode: true,
            }),
          ).toBeNull();
        });
      } finally {
        fixture.cleanup();
      }
    });

    test('export option parsing tracks only valid export operands', () => {
      const fixture = createLinkedWorktreeFixture();
      try {
        withEnv({ SAFETY_NET_WORKTREE: '1' }, () => {
          expect(
            analyzeCommand(
              `export -z GIT_WORK_TREE=${toShellPath(fixture.mainWorktree)}; git reset --hard`,
              {
                cwd: fixture.linkedWorktree,
                config: EMPTY_CONFIG,
                worktreeMode: true,
              },
            ),
          ).toBeNull();

          const result = analyzeCommand(
            `export -- GIT_WORK_TREE=${toShellPath(fixture.mainWorktree)}; git reset --hard`,
            {
              cwd: fixture.linkedWorktree,
              config: EMPTY_CONFIG,
              worktreeMode: true,
            },
          );
          expect(result?.reason).toContain('git reset --hard');
        });
      } finally {
        fixture.cleanup();
      }
    });

    test('exporting an unset tracked name uses an empty effective value', () => {
      const fixture = createLinkedWorktreeFixture();
      try {
        withEnv({ SAFETY_NET_WORKTREE: '1' }, () => {
          const result = analyzeCommand('export GIT_WORK_TREE; git reset --hard', {
            cwd: fixture.linkedWorktree,
            config: EMPTY_CONFIG,
            worktreeMode: true,
          });
          expect(result?.reason).toContain('git reset --hard');
        });
      } finally {
        fixture.cleanup();
      }
    });

    test('typeset and readonly forms update tracked env state only when exported', () => {
      const fixture = createLinkedWorktreeFixture();
      try {
        withEnv({ SAFETY_NET_WORKTREE: '1' }, () => {
          const mainWorktree = toShellPath(fixture.mainWorktree);
          const blockedCommands = [
            `typeset -x GIT_WORK_TREE=${mainWorktree}; git reset --hard`,
            `declare -x GIT_WORK_TREE; GIT_WORK_TREE=${mainWorktree}; git reset --hard`,
            `export GIT_WORK_TREE; typeset GIT_WORK_TREE=${mainWorktree}; git reset --hard`,
            `GIT_WORK_TREE=${mainWorktree} readonly GIT_WORK_TREE; git reset --hard`,
          ];

          for (const command of blockedCommands) {
            const result = analyzeCommand(command, {
              cwd: fixture.linkedWorktree,
              config: EMPTY_CONFIG,
              worktreeMode: true,
            });
            expect(result?.reason).toContain('git reset --hard');
          }

          for (const command of [
            `typeset -- -x GIT_WORK_TREE=${mainWorktree}; git reset --hard`,
            `declare -x; GIT_WORK_TREE=${mainWorktree}; git reset --hard`,
          ]) {
            expect(
              analyzeCommand(command, {
                cwd: fixture.linkedWorktree,
                config: EMPTY_CONFIG,
                worktreeMode: true,
              }),
            ).toBeNull();
          }

          expect(
            analyzeCommand(`typeset +x GIT_WORK_TREE=${mainWorktree}; git reset --hard`, {
              cwd: fixture.linkedWorktree,
              config: EMPTY_CONFIG,
              worktreeMode: true,
            }),
          ).toBeNull();
        });
      } finally {
        fixture.cleanup();
      }
    });

    test('set option parsing toggles exported assignment behavior', () => {
      const fixture = createLinkedWorktreeFixture();
      try {
        withEnv({ SAFETY_NET_WORKTREE: '1' }, () => {
          const mainWorktree = toShellPath(fixture.mainWorktree);
          const allowedCommands = [
            `set -k; set +k; git restore file.txt GIT_WORK_TREE=${mainWorktree}`,
            `set positional; GIT_WORK_TREE=${mainWorktree}; git reset --hard`,
            `set --; GIT_WORK_TREE=${mainWorktree}; git reset --hard`,
          ];

          for (const command of allowedCommands) {
            expect(
              analyzeCommand(command, {
                cwd: fixture.linkedWorktree,
                config: EMPTY_CONFIG,
                worktreeMode: true,
              }),
            ).toBeNull();
          }
        });
      } finally {
        fixture.cleanup();
      }
    });
  });

  describe('parallel parsing/analysis branches', () => {
    test('parallel bash -c with placeholder and no args analyzes template', () => {
      const result = analyzeCommand("parallel bash -c 'echo {}'", {
        cwd: '/tmp',
        config: EMPTY_CONFIG,
      });
      expect(result).toBeNull();
    });

    test('parallel bash -c with placeholder outside script is blocked', () => {
      const result = analyzeCommand("parallel bash -c 'echo hi' {} ::: a", {
        cwd: '/tmp',
        config: EMPTY_CONFIG,
      });
      expect(result?.reason).toContain('parallel with shell -c');
    });

    test('parallel bash -c without script but with args is blocked', () => {
      const result = analyzeCommand("parallel bash -c ::: 'echo hi'", {
        cwd: '/tmp',
        config: EMPTY_CONFIG,
      });
      expect(result?.reason).toContain('parallel with shell -c');
    });

    test('parallel bash -c without script or args is allowed', () => {
      expect(
        analyzeCommand('parallel bash -c', {
          cwd: '/tmp',
          config: EMPTY_CONFIG,
        }),
      ).toBeNull();
    });

    test('parallel bash with placeholder but missing -c arg is blocked', () => {
      const result = analyzeCommand('parallel bash {} -c', {
        cwd: '/tmp',
        config: EMPTY_CONFIG,
      });
      expect(result?.reason).toContain('parallel with shell -c');
    });

    test('parallel rm -rf with explicit temp arg is allowed', () => {
      const result = analyzeCommand('parallel rm -rf ::: /tmp/a', {
        cwd: '/tmp',
        config: EMPTY_CONFIG,
      });
      expect(result).toBeNull();
    });

    test('parallel git tokens are analyzed', () => {
      const result = analyzeCommand('parallel git reset --hard :::', {
        cwd: '/tmp',
        config: EMPTY_CONFIG,
      });
      expect(result?.reason).toContain('git reset --hard');
    });

    test('parallel with -- separator parses template', () => {
      const result = analyzeCommand('parallel -- rm -rf ::: /tmp/a', {
        cwd: '/tmp',
        config: EMPTY_CONFIG,
      });
      expect(result).toBeNull();
    });

    test('parallel -j option consumes its value', () => {
      const result = analyzeCommand('parallel -j 4 rm -rf ::: /tmp/a', {
        cwd: '/tmp',
        config: EMPTY_CONFIG,
      });
      expect(result).toBeNull();
    });
  });
});
