import { describe, expect, it } from 'bun:test';
import { checkGitAddSecrets, checkHardcodedSecrets } from '@/core/rules-secret';

describe('checkGitAddSecrets', () => {
  it('blocks git add .env', () => {
    const result = checkGitAddSecrets(['git', 'add', '.env']);
    expect(result.blocked).toBe(true);
    expect(result.reason).toContain('.env');
  });

  it('blocks git add .env.local', () => {
    const result = checkGitAddSecrets(['git', 'add', '.env.local']);
    expect(result.blocked).toBe(true);
  });

  it('blocks git add .env.production', () => {
    const result = checkGitAddSecrets(['git', 'add', '.env.production']);
    expect(result.blocked).toBe(true);
  });

  it('blocks git add credentials.json', () => {
    const result = checkGitAddSecrets(['git', 'add', 'credentials.json']);
    expect(result.blocked).toBe(true);
    expect(result.reason).toContain('credential');
  });

  it('blocks git add id_rsa', () => {
    const result = checkGitAddSecrets(['git', 'add', 'id_rsa']);
    expect(result.blocked).toBe(true);
  });

  it('blocks git add server.pem', () => {
    const result = checkGitAddSecrets(['git', 'add', 'server.pem']);
    expect(result.blocked).toBe(true);
  });

  it('blocks git add private.key', () => {
    const result = checkGitAddSecrets(['git', 'add', 'private.key']);
    expect(result.blocked).toBe(true);
  });

  it('allows git add src/app.ts', () => {
    const result = checkGitAddSecrets(['git', 'add', 'src/app.ts']);
    expect(result.blocked).toBe(false);
  });

  it('allows git add package.json', () => {
    const result = checkGitAddSecrets(['git', 'add', 'package.json']);
    expect(result.blocked).toBe(false);
  });

  it('warns on git add . (does not block)', () => {
    const result = checkGitAddSecrets(['git', 'add', '.']);
    expect(result.blocked).toBe(false);
    expect(result.reason).toContain('git add .');
  });

  it('warns on git add -A (does not block)', () => {
    const result = checkGitAddSecrets(['git', 'add', '-A']);
    expect(result.blocked).toBe(false);
    expect(result.reason).toContain('git add .');
  });

  it('ignores non-git commands', () => {
    const result = checkGitAddSecrets(['npm', 'install']);
    expect(result.blocked).toBe(false);
  });

  it('ignores git non-add commands', () => {
    const result = checkGitAddSecrets(['git', 'status']);
    expect(result.blocked).toBe(false);
  });
});

describe('checkHardcodedSecrets', () => {
  it('blocks export with sk- key', () => {
    const result = checkHardcodedSecrets(['export', 'OPENAI_KEY=sk-1234567890abcdef']);
    expect(result.blocked).toBe(true);
    expect(result.reason).toContain('API key');
  });

  it('blocks export with ghp_ token', () => {
    const result = checkHardcodedSecrets(['export', 'GH_TOKEN=ghp_abc123']);
    expect(result.blocked).toBe(true);
  });

  it('blocks export with glpat- token', () => {
    const result = checkHardcodedSecrets(['export', 'GITLAB_TOKEN=glpat-xyz789']);
    expect(result.blocked).toBe(true);
  });

  it('blocks export with AKIA AWS key', () => {
    const result = checkHardcodedSecrets(['export', 'AWS_KEY=AKIAIOSFODNN7EXAMPLE']);
    expect(result.blocked).toBe(true);
  });

  it('allows export with non-secret value', () => {
    const result = checkHardcodedSecrets(['export', 'NODE_ENV=production']);
    expect(result.blocked).toBe(false);
  });

  it('allows export with env var reference', () => {
    const result = checkHardcodedSecrets(['export', 'API_KEY=$SECRET']);
    expect(result.blocked).toBe(false);
  });

  it('ignores non-export commands', () => {
    const result = checkHardcodedSecrets(['echo', 'sk-test']);
    expect(result.blocked).toBe(false);
  });
});
