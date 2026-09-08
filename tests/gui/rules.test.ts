import { describe, expect, test } from 'bun:test';
import { renderPages, sliceBlock } from '../helpers/gui-page';

/**
 * The prompt the Rules composer copies out: it has to tell the agent which scope to write into,
 * which directory that is, and which rulebook names are already taken. The block is sliced out of the
 * served page and run over its own state.
 */

// Token-shaped, assembled here rather than written out, and fixed so the slice is deterministic.
const TOKEN = Buffer.from('cc-safety-net gui rules fixture').toString('base64url');

const pages = renderPages(TOKEN);
const block = (page: string) =>
  sliceBlock(page, 'var rulePromptText = () => {', 'var copyRulePrompt = async () => {');

/**
 * The block reads the module state the page keeps and the two form fields it renders, so both are
 * supplied where it looks for them.
 */
const promptFor = (state: {
  rulesData: { projectPath: string; rulebooks: { spec: string; name: string }[] } | null;
  rulesScope: 'user' | 'project';
  fields: Record<string, string>;
}) =>
  (
    new Function(
      'rulesData',
      'rulesScope',
      'fields',
      `const qs = (id) => ({ value: fields[id] });\n${block(pages.ported)}\nreturn rulePromptText();`,
    ) as (rulesData: unknown, rulesScope: string, fields: Record<string, string>) => string
  )(state.rulesData, state.rulesScope, state.fields);

const RULEBOOKS = [
  { spec: 'kenryu42/ops-rules', name: 'ops-guard' },
  { spec: './local-rules', name: 'db-guard' },
];

describe('the rule prompt block on the served page', () => {
  test('names the directory in the field, not the one the listing was loaded for', () => {
    const prompt = promptFor({
      rulesData: { projectPath: '/srv/launched-from', rulebooks: RULEBOOKS },
      rulesScope: 'project',
      fields: {
        'rules-project-path': '  /srv/typed-instead  ',
        'rules-composer-input': '  block terraform destroy  ',
      },
    });

    expect(prompt).toContain('Scope: this project - /srv/typed-instead');
    expect(prompt).not.toContain('/srv/launched-from');
    // The names have to stay unique across both scopes, so every one of them is listed.
    expect(prompt).toContain(
      'Existing rulebooks (names must stay unique across both scopes): ops-guard, db-guard',
    );
    // What the user typed is the last line, with the composer's whitespace trimmed off.
    expect(prompt.split('\n').at(-1)).toBe('block terraform destroy');
    expect(prompt.split('\n')[0]).toBe('Use the cc-safety-net skill for this request.');
  });

  test('names the user scope without a directory', () => {
    const prompt = promptFor({
      rulesData: { projectPath: '/srv/launched-from', rulebooks: RULEBOOKS },
      rulesScope: 'user',
      fields: { 'rules-project-path': '/srv/typed-instead', 'rules-composer-input': 'block npx' },
    });

    expect(prompt).toContain('Scope: all projects (user scope)');
    expect(prompt).not.toContain('/srv/typed-instead');
  });

  test('says outright that no rulebook exists yet', () => {
    const nothingLoaded = promptFor({
      rulesData: null,
      rulesScope: 'project',
      fields: { 'rules-project-path': '/srv/app', 'rules-composer-input': 'block rm' },
    });
    const emptyListing = promptFor({
      rulesData: { projectPath: '/srv/app', rulebooks: [] },
      rulesScope: 'project',
      fields: { 'rules-project-path': '/srv/app', 'rules-composer-input': 'block rm' },
    });

    expect(nothingLoaded).toContain(
      'Existing rulebooks (names must stay unique across both scopes): none',
    );
    expect(emptyListing).toBe(nothingLoaded);
  });
});
