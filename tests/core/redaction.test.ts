import { describe, expect, test } from 'bun:test';
import * as next from '@/core/redaction';
import { expectRecordedDigest } from '../helpers/gate-differential';
import { corpusStrings, seededRandom } from './differential-inputs';

/** Each exported sanitizer, in the order the digest keys number them. */
const SANITIZERS = [
  next.redactSecrets,
  next.redactNonAssignmentSecrets,
  next.redactEnvAssignmentValues,
  next.sanitizeDiagnosticText,
  next.getEnvAssignmentValues,
  next.mightContainEnvAssignment,
] as const;

const PRIVATE_KEY =
  '-----BEGIN RSA PRIVATE KEY-----\nMIIEowIBAAKCAQEA0Z3VS5JJcds3xfn/ygWyF8PbnGy0AYc5\n-----END RSA PRIVATE KEY-----';

const FIXED: readonly string[] = [
  // Environment assignments in every quoting form.
  'TOKEN=abc123 npm publish',
  'export GITHUB_TOKEN="ghp_abcdefghijklmnopqrstuvwxyz0123" gh auth status',
  "AWS_SECRET_ACCESS_KEY='wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY' aws s3 ls",
  'DATABASE_URL=postgres://user:pw@db.internal:5432/app prisma migrate',
  'DATABASE_DSN=host=db user=app password=hunter2 sslmode=require psql',
  'CONNECTION_STRING="Server=db;User Id=app;Password=hunter2" dotnet run',
  'REDIS_URI=redis://:pw@cache:6379/0 node worker.js',
  'MY_API_KEY=$(cat ~/.secret) ./run',
  'TOKEN=$(printf \'%s\' "$(get-secret)") SAFE=value',
  'PASSWORD="with \\" escaped quote" ./login',
  "PASS='single quoted value' ./login",
  'CREDENTIALS= empty-then-space',
  'KEY=',
  'prefixTOKEN=value',
  'prefix-TOKEN=value',
  '(TOKEN=inside-parens) [KEY=brackets] {SECRET=braces}',
  'X=1 Y="two words" Z=$(echo three) W=`four`',
  'lower_case_token=abc mixed_Case=def',
  'FOO=bar\nSECRET_KEY=baz\nBAR=qux',
  'echo TOKEN=not-at-start-but-preceded-by-space',
  'A=B=C D==E =F G= H',
  '1TOKEN=digit-first _TOKEN=underscore-first',
  // Bearer and API tokens, headers, and JWTs.
  'curl -H "Authorization: Bearer ghp_abcdefghijklmnopqrstuvwxyz0123" https://api.github.com',
  "curl -H 'x-api-key: sk-ant-api03-abcdefghijklmnopqrstuvwxyz' https://api.example.com",
  'authorization: Basic dXNlcjpwYXNzd29yZA==',
  '{"authorization":"Bearer abc","cookie":"session=xyz; other=1"}',
  "{'api-key': 'value with spaces', 'x-api-key': \"v2\"}",
  'Cookie: a=b; c=d',
  'api-key: "<redacted>" cookie: \'<redacted>\'',
  'token eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.dozjgNryP4J3jVmNHl0w5N_XgL0n3I9PlFUP0THsR8U',
  'AKIAIOSFODNN7EXAMPLE and ASIAIOSFODNN7EXAMPLE',
  'gho_abcdefghijklmnopqrstuvwxyz0123 github_pat_11ABCDEFG0123456789abcdef',
  // The Slack sample is assembled at runtime so the file never carries a token-shaped literal.
  `glpat-abcdefghijklmnopqrstuv ${['xoxb', '1234567890', 'abcdefghijklmnop'].join('-')} npm_abcdefghijklmnopqrstuvwxyz`,
  'pypi-AgEIcHlwaS5vcmcCJDAwMDAwMDAw sk_live_abcdefghijklmnopqrstuv rk_test_abcdefghijklmnopqrstuv',
  'sk-proj-abcdefghijklmnopqrstuvwxyz sk_abcdefghijklmnopqrstuvwxyz',
  `gsk_${'a'.repeat(52)} xai-${'b'.repeat(80)} pplx-${'c'.repeat(20)}`,
  `bastn_${'d'.repeat(16)} tgp_v1_${'e'.repeat(43)} flp_${'f'.repeat(10)} wfr_${'g'.repeat(20)}`,
  `fw_${'h'.repeat(20)} fwp_${'i'.repeat(20)} tp-${'j'.repeat(20)} psk-${'k'.repeat(8)}-${'l'.repeat(8)}`,
  `${'0'.repeat(32)}.${'A'.repeat(16)} looks like a paired token`,
  'ghp_short xoxb-short sk-short',
  // URLs with embedded credentials and signed URLs.
  'git clone https://user:s3cr3t@github.com/org/repo.git',
  'git remote add origin https://token@github.com/org/repo.git',
  'curl ftp://anonymous:me@ftp.example.com/file',
  'wget "https://bucket.s3.amazonaws.com/key?X-Amz-Signature=abcdef0123456789&X-Amz-Date=1"',
  'curl "https://storage.googleapis.com/o?x-goog-signature=abc123"',
  'curl "https://cdn.example.com/f?sig=abc%2Fdef&sv=2024"',
  'curl -u admin:password https://example.com',
  'curl --user=admin:password https://example.com',
  'curl --user admin https://example.com',
  'mongodb+srv://app:pw@cluster0.example.net/db',
  // Private-key blocks and mixed shell text.
  `echo "${PRIVATE_KEY}" > key.pem`,
  `cat <<EOF > id_rsa\n${PRIVATE_KEY}\nEOF`,
  '-----BEGIN OPENSSH PRIVATE KEY-----\nabc\n-----END OPENSSH PRIVATE KEY-----',
  '-----BEGIN PRIVATE KEY----- unterminated',
  'TOKEN=ghp_abcdefghijklmnopqrstuvwxyz0123 curl -H "Authorization: Bearer $TOKEN" https://u:p@h/',
  'sh -c \'export API_KEY=xyz; curl -H "x-api-key: $API_KEY" https://api\'',
  'echo password=hunter2 | tee creds.txt',
  'docker run -e POSTGRES_PASSWORD=pw -e DB_URL=postgres://a:b@c/d image',
  // Nothing to redact.
  '',
  'git status',
  'ls -la ~/projects',
  'echo hello world',
  'rm -rf ./build && npm run build',
  'the word token appears but no assignment',
  'https://example.com/path?query=1#frag',
  'echo 😀 é 日本語',
  'a=1',
  'x'.repeat(300),
];

const FUZZ_FRAGMENTS: readonly string[] = [
  'TOKEN=',
  'SECRET_KEY=',
  'DB_URL=',
  'DATABASE_DSN=',
  'PASSWORD=',
  'PLAIN=',
  'x=',
  '"',
  "'",
  '\\"',
  '$(',
  ')',
  ' ',
  '  ',
  '\n',
  '\t',
  '(',
  '[',
  '{',
  ';',
  '|',
  '&',
  '?',
  '=',
  ':',
  '@',
  '//',
  'https://',
  'postgres://',
  'user:pw@host',
  'token@host',
  'Bearer',
  'authorization:',
  'x-api-key:',
  'cookie:',
  'sig=',
  'signature=',
  '-u',
  '--user',
  'admin:password',
  'ghp_abcdefghijklmnopqrstuvwxyz0123',
  'sk-abcdefghijklmnopqrstuvwxyz',
  'AKIAIOSFODNN7EXAMPLE',
  'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.dozjgNryP4J3jVmNHl0w5N_XgL0n3I9PlFUP0THsR8U',
  '-----BEGIN PRIVATE KEY-----',
  '-----END PRIVATE KEY-----',
  'value',
  'hunter2',
  'echo',
  'curl',
  'git',
  'é',
  '😀',
  '<redacted>',
];

function fuzzTexts(count: number, seed: number): readonly string[] {
  const random = seededRandom(seed);
  return Array.from({ length: count }, () =>
    Array.from(
      { length: 1 + Math.floor(random() * 16) },
      () => FUZZ_FRAGMENTS[Math.floor(random() * FUZZ_FRAGMENTS.length)] ?? '',
    ).join(''),
  );
}

describe('redaction', () => {
  test('every sanitizer agrees with the shipped one on fixed, corpus, and fuzzed text', () => {
    const texts = [...FIXED, ...corpusStrings(), ...fuzzTexts(3_000, 0x5afe_0003)];
    const recorded: (readonly [string, unknown])[] = [];
    for (const [index, sanitize] of SANITIZERS.entries()) {
      for (const [row, text] of texts.entries()) {
        recorded.push([`${index}-${row}`, sanitize(text)]);
      }
    }
    expectRecordedDigest('core-redaction/sanitizers', recorded);
  });

  test('the fixed table both redacts and leaves text alone', () => {
    const redacted = FIXED.filter((text) => next.redactSecrets(text) !== text);
    expect(redacted.length).toBeGreaterThanOrEqual(50);
    expect(FIXED.length - redacted.length).toBeGreaterThanOrEqual(10);
    for (const text of redacted) expect(next.redactSecrets(text)).toContain('<redacted>');
  });
});
