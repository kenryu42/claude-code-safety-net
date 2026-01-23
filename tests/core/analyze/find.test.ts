import { describe, test } from 'bun:test';
import { assertAllowed, assertBlocked } from '../../helpers.ts';

describe('find -delete tests', () => {
  test('find delete blocked', () => {
    assertBlocked('find . -name "*.pyc" -delete', 'find -delete');
  });

  test('find name argument delete allowed', () => {
    assertAllowed('find . -name -delete -print');
  });

  test('find exec echo delete allowed', () => {
    assertAllowed('find . -exec echo -delete \\; -print');
  });

  test('find exec plus terminator mentions delete allowed', () => {
    assertAllowed('find . -exec echo -delete + -print');
  });

  test('busybox find delete blocked', () => {
    assertBlocked('busybox find . -name "*.pyc" -delete', 'find -delete');
  });

  test('find print allowed', () => {
    assertAllowed('find . -name "*.pyc" -print');
  });

  test('echo mentions find delete allowed', () => {
    assertAllowed('echo "find . -name *.pyc -delete"');
  });

  test('rg mentions find delete allowed', () => {
    assertAllowed('rg "find .* -delete" file.txt');
  });

  test('python c system find delete blocked', () => {
    assertBlocked(
      'python -c "import os; os.system(\\"find . -delete\\")"',
      'dangerous command in interpreter',
    );
  });
});

describe('find -exec rm tests', () => {
  test('find exec rm rf blocked', () => {
    assertBlocked('find . -exec rm -rf {} \\;', 'rm -rf');
  });

  test('find execdir rm rf blocked', () => {
    assertBlocked('find /tmp -execdir rm -rf {} +', 'rm -rf');
  });

  test('find exec rm r force blocked', () => {
    assertBlocked("find . -name '*.tmp' -exec rm -r --force {} \\;", 'rm -rf');
  });

  test('find exec rm recursive blocked', () => {
    assertBlocked('find . -exec rm --recursive -f {} \\;', 'rm -rf');
  });

  test('find exec rm no force allowed', () => {
    assertAllowed('find . -exec rm -r {} \\;');
  });

  test('find exec rm no recursive allowed', () => {
    assertAllowed('find . -exec rm -f {} \\;');
  });

  test('find exec echo allowed', () => {
    assertAllowed('find . -exec echo {} \\;');
  });

  test('find exec cat allowed', () => {
    assertAllowed('find . -type f -exec cat {} +');
  });

  test('busybox find exec rm rf blocked', () => {
    assertBlocked('busybox find . -exec rm -rf {} \\;', 'rm -rf');
  });

  test('find exec rm rf in bash c blocked', () => {
    assertBlocked("bash -c 'find . -exec rm -rf {} \\;'", 'rm -rf');
  });

  test('find exec env rm rf blocked', () => {
    assertBlocked('find . -exec env rm -rf {} ;', 'rm -rf');
  });

  test('find exec sudo rm rf blocked', () => {
    assertBlocked('find . -exec sudo rm -rf {} ;', 'rm -rf');
  });

  test('find exec command rm rf blocked', () => {
    assertBlocked('find . -exec command rm -rf {} ;', 'rm -rf');
  });

  test('find exec busybox rm rf blocked', () => {
    assertBlocked('find . -exec busybox rm -rf {} ;', 'rm -rf');
  });

  test('find execdir env rm rf blocked', () => {
    assertBlocked('find /tmp -execdir env rm -rf {} +', 'rm -rf');
  });
});
