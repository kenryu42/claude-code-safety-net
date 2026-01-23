import { describe, expect, test } from 'bun:test';
import { mkdtempSync, rmSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { join } from 'node:path';
import { analyzeRm } from '@/core/rules-rm';
import { assertAllowed, assertBlocked, withEnv } from '../helpers.ts';

describe('rm -rf blocked', () => {
  test('rm -rf blocked', () => {
    assertBlocked('rm -rf /some/path', 'rm -rf');
  });

  test('rm -Rf blocked', () => {
    assertBlocked('rm -Rf /some/path', 'rm -rf');
  });

  test('rm -R -f blocked', () => {
    assertBlocked('rm -R -f /some/path', 'rm -rf');
  });

  test('rm -rf ~/projects blocked', () => {
    assertBlocked('rm -rf ~/projects', 'rm -rf');
  });

  test('rm -fr blocked', () => {
    assertBlocked('rm -fr /some/path', 'rm -rf');
  });

  test('true & rm -rf blocked', () => {
    assertBlocked('true & rm -rf /some/path', 'rm -rf');
  });

  test('rm -rf /tmp/../Users/some/path blocked', () => {
    assertBlocked('rm -rf /tmp/../Users/some/path', 'rm -rf');
  });

  test('/bin/rm -rf blocked', () => {
    assertBlocked('/bin/rm -rf /some/path', 'rm -rf');
  });

  test('busybox rm -rf blocked', () => {
    assertBlocked('busybox rm -rf /some/path', 'rm -rf');
  });

  test('busybox rm -R -f blocked', () => {
    assertBlocked('busybox rm -R -f /some/path', 'rm -rf');
  });

  test("bash -c 'rm -rf /some/path' blocked", () => {
    assertBlocked("bash -c 'rm -rf /some/path'", 'rm -rf');
  });

  test('python -c rm -rf blocked', () => {
    assertBlocked('python -c \'import os; os.system("rm -rf /some/path")\'', 'dangerous');
  });

  test('echo $(rm -rf /some/path) blocked', () => {
    assertBlocked('echo $(rm -rf /some/path)', 'rm -rf');
  });

  test('TMPDIR=/Users rm -rf $TMPDIR/test-dir blocked', () => {
    assertBlocked('TMPDIR=/Users rm -rf $TMPDIR/test-dir', 'rm -rf');
  });

  test('rm -rf / blocked (root)', () => {
    assertBlocked('rm -rf /', 'extremely dangerous');
  });

  test('rm -rf ~ blocked (home)', () => {
    assertBlocked('rm -rf ~', 'extremely dangerous');
  });

  test('rm -rf -- / blocked', () => {
    assertBlocked('rm -rf -- /', 'extremely dangerous');
  });

  test('rm -rf $TMPDIR/../escape blocked', () => {
    assertBlocked('rm -rf $TMPDIR/../escape', 'rm -rf');
  });

  test('rm -rf `pwd`/escape blocked', () => {
    assertBlocked('rm -rf `pwd`/escape', 'rm -rf');
  });

  test('rm -rf ~someone/escape blocked', () => {
    assertBlocked('rm -rf ~someone/escape', 'rm -rf');
  });
});

describe('rm -rf allowed', () => {
  test('rm -rf /tmp/test-dir allowed', () => {
    assertAllowed('rm -rf /tmp/test-dir');
  });

  test('rm -rf /var/tmp/test-dir allowed', () => {
    assertAllowed('rm -rf /var/tmp/test-dir');
  });

  test('rm -rf $TMPDIR/test-dir allowed', () => {
    assertAllowed('rm -rf $TMPDIR/test-dir');
  });

  test('rm -rf ${TMPDIR}/test-dir allowed', () => {
    assertAllowed('rm -rf ${TMPDIR}/test-dir');
  });

  test('rm -rf "$TMPDIR/test-dir" allowed', () => {
    assertAllowed('rm -rf "$TMPDIR/test-dir"');
  });

  test('rm -rf $TMPDIR allowed', () => {
    assertAllowed('rm -rf $TMPDIR');
  });

  test('rm -rf /tmp allowed', () => {
    assertAllowed('rm -rf /tmp');
  });

  test('rm -r without force allowed', () => {
    assertAllowed('rm -r /some/path');
  });

  test('rm -R without force allowed', () => {
    assertAllowed('rm -R /some/path');
  });

  test('rm -f without recursive allowed', () => {
    assertAllowed('rm -f /some/path');
  });

  test('/bin/rm -rf /tmp/test-dir allowed', () => {
    assertAllowed('/bin/rm -rf /tmp/test-dir');
  });

  test('busybox rm -rf /tmp/test-dir allowed', () => {
    assertAllowed('busybox rm -rf /tmp/test-dir');
  });
});

describe('rm -rf cwd-aware', () => {
  let tmpDir: string;

  const setup = () => {
    tmpDir = mkdtempSync(join(tmpdir(), 'safety-net-test-'));
  };

  const cleanup = () => {
    if (tmpDir) {
      rmSync(tmpDir, { recursive: true, force: true });
    }
  };

  test('rm -rf relative path in home cwd blocked', () => {
    setup();
    try {
      withEnv({ HOME: tmpDir }, () => {
        assertBlocked('rm -rf build', 'rm -rf', tmpDir);
      });
    } finally {
      cleanup();
    }
  });

  test('rm -rf relative path in subdir of home allowed', () => {
    setup();
    try {
      const repo = join(tmpDir, 'repo');
      require('node:fs').mkdirSync(repo);
      withEnv({ HOME: tmpDir }, () => {
        assertAllowed('rm -rf build', repo);
      });
    } finally {
      cleanup();
    }
  });

  test('rm -rf relative path allowed', () => {
    setup();
    try {
      assertAllowed('rm -rf build', tmpDir);
    } finally {
      cleanup();
    }
  });

  test('rm -rf ./dist allowed', () => {
    setup();
    try {
      assertAllowed('rm -rf ./dist', tmpDir);
    } finally {
      cleanup();
    }
  });

  test('rm -rf ../other blocked', () => {
    setup();
    try {
      assertBlocked('rm -rf ../other', 'rm -rf', tmpDir);
    } finally {
      cleanup();
    }
  });

  test('rm -rf /other/path blocked', () => {
    setup();
    try {
      assertBlocked('rm -rf /other/path', 'rm -rf', tmpDir);
    } finally {
      cleanup();
    }
  });

  test('rm -rf absolute inside cwd allowed', () => {
    setup();
    try {
      const inside = join(tmpDir, 'dist');
      assertAllowed(`rm -rf ${inside}`, tmpDir);
    } finally {
      cleanup();
    }
  });

  test('rm -rf . blocked', () => {
    setup();
    try {
      assertBlocked('rm -rf .', 'rm -rf', tmpDir);
    } finally {
      cleanup();
    }
  });

  test('rm -rf cwd itself blocked', () => {
    setup();
    try {
      assertBlocked(`rm -rf ${tmpDir}`, 'rm -rf', tmpDir);
    } finally {
      cleanup();
    }
  });

  test('cd .. && rm -rf build blocked', () => {
    setup();
    try {
      assertBlocked('cd .. && rm -rf build', 'rm -rf', tmpDir);
    } finally {
      cleanup();
    }
  });

  test('paranoid rm blocks within cwd', () => {
    setup();
    try {
      withEnv({ SAFETY_NET_PARANOID_RM: '1' }, () => {
        assertBlocked('rm -rf build', 'SAFETY_NET_PARANOID', tmpDir);
      });
    } finally {
      cleanup();
    }
  });

  test('global paranoid blocks within cwd', () => {
    setup();
    try {
      withEnv({ SAFETY_NET_PARANOID: '1' }, () => {
        assertBlocked('rm -rf build', 'SAFETY_NET_PARANOID', tmpDir);
      });
    } finally {
      cleanup();
    }
  });

  test('rm -rf after builtin cd bypasses cwd allowlist blocked', () => {
    setup();
    try {
      assertBlocked('builtin cd .. && rm -rf build', 'rm -rf', tmpDir);
    } finally {
      cleanup();
    }
  });

  test('rm -rf after command substitution cd bypasses cwd allowlist blocked', () => {
    setup();
    try {
      assertBlocked('$( cd ..; rm -rf build )', 'rm -rf', tmpDir);
    } finally {
      cleanup();
    }
  });

  test('rm -rf after grouped cd bypasses cwd allowlist blocked', () => {
    setup();
    try {
      assertBlocked('{ cd ..; rm -rf build; }', 'rm -rf', tmpDir);
    } finally {
      cleanup();
    }
  });

  test('rm -rf after safe command substitution cd bypasses cwd allowlist blocked', () => {
    setup();
    try {
      assertBlocked('$( cd ..; echo ok ) && rm -rf build', 'rm -rf', tmpDir);
    } finally {
      cleanup();
    }
  });

  test('rm -rf after safe grouped cd bypasses cwd allowlist blocked', () => {
    setup();
    try {
      assertBlocked('{ cd ..; echo ok; } && rm -rf build', 'rm -rf', tmpDir);
    } finally {
      cleanup();
    }
  });

  test('rm -rf after subshell cd bypasses cwd allowlist blocked', () => {
    setup();
    try {
      assertBlocked('( cd ..; rm -rf build )', 'rm -rf', tmpDir);
    } finally {
      cleanup();
    }
  });

  test('rm -rf strict mode allows within cwd', () => {
    setup();
    try {
      assertAllowed('rm -rf build', tmpDir);
    } finally {
      cleanup();
    }
  });

  test('command substitution rm rf blocked', () => {
    setup();
    try {
      assertBlocked('echo $(rm -rf /some/path)', 'rm -rf', tmpDir);
    } finally {
      cleanup();
    }
  });

  test('TMPDIR assignment not trusted blocked', () => {
    setup();
    try {
      assertBlocked('TMPDIR=/Users rm -rf $TMPDIR/test-dir', 'rm -rf', tmpDir);
    } finally {
      cleanup();
    }
  });

  test('TMPDIR= empty assignment blocked (expands to /)', () => {
    setup();
    try {
      assertBlocked('TMPDIR= rm -rf $TMPDIR/test-dir', 'rm -rf', tmpDir);
    } finally {
      cleanup();
    }
  });

  test('TMPDIR=/tmp-malicious blocked (not a real temp path)', () => {
    setup();
    try {
      assertBlocked('TMPDIR=/tmp-malicious rm -rf $TMPDIR/test-dir', 'rm -rf', tmpDir);
    } finally {
      cleanup();
    }
  });

  test('TMPDIR=/tmp/subdir allowed (subpath of /tmp)', () => {
    setup();
    try {
      assertAllowed('TMPDIR=/tmp/subdir rm -rf $TMPDIR/test-dir', tmpDir);
    } finally {
      cleanup();
    }
  });

  test('TMPDIR=/var/tmp-malicious blocked (not a real temp path)', () => {
    setup();
    try {
      assertBlocked('TMPDIR=/var/tmp-malicious rm -rf $TMPDIR/test-dir', 'rm -rf', tmpDir);
    } finally {
      cleanup();
    }
  });
});

describe('analyzeRm (unit)', () => {
  test('does not treat flags after -- as rm -rf', () => {
    expect(analyzeRm(['rm', '--', '-rf', '/'], { cwd: '/tmp' })).toBeNull();
  });

  test('blocks $HOME targets', () => {
    expect(analyzeRm(['rm', '-rf', '$HOME/*'], { cwd: '/tmp' })).toContain('extremely dangerous');
  });

  test('blocks ${HOME} targets', () => {
    expect(analyzeRm(['rm', '-rf', '${HOME}/*'], { cwd: '/tmp' })).toContain('extremely dangerous');
  });

  test('treats ${TMPDIR} paths as temp when allowed', () => {
    expect(
      analyzeRm(['rm', '-rf', '${TMPDIR}/test'], {
        cwd: '/tmp',
        allowTmpdirVar: true,
      }),
    ).toBeNull();
  });

  test('does not trust ${TMPDIR} when disallowed', () => {
    expect(
      analyzeRm(['rm', '-rf', '${TMPDIR}/test'], {
        cwd: '/tmp',
        allowTmpdirVar: false,
      }),
    ).toContain('rm -rf outside cwd');
  });

  test('handles non-string cwd defensively', () => {
    const badCwd = 1 as unknown as string;
    expect(analyzeRm(['rm', '-rf', 'foo'], { cwd: badCwd })).toContain('rm -rf outside cwd');
  });

  test('handles absolute-path checks defensively', () => {
    const badCwd = 1 as unknown as string;
    expect(analyzeRm(['rm', '-rf', '/abs'], { cwd: badCwd })).toContain('rm -rf outside cwd');
  });

  test('blocks tilde-prefixed paths (not cwd-relative)', () => {
    expect(analyzeRm(['rm', '-rf', '~/somewhere'], { cwd: '/tmp' })).toContain(
      'rm -rf outside cwd',
    );
  });

  test('blocks ../ paths', () => {
    expect(analyzeRm(['rm', '-rf', '../escape'], { cwd: '/tmp' })).toContain('rm -rf outside cwd');
  });

  test('allows nested relative paths within cwd', () => {
    const cwd = mkdtempSync(join(tmpdir(), 'safety-net-rm-unit-'));
    try {
      expect(
        analyzeRm(['rm', '-rf', 'subdir/file'], {
          cwd,
          originalCwd: cwd,
        }),
      ).toBeNull();
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  test('blocks rm -rf in home cwd via direct analyzeRm call', () => {
    const home = homedir();
    expect(analyzeRm(['rm', '-rf', 'somefile'], { cwd: home })).toContain('extremely dangerous');
  });
});
