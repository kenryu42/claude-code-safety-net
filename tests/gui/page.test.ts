import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { guiDocument } from '@/gui/assets';
import { normalizePage, renderPages } from '../helpers/gui-page';

/**
 * The page the GUI serves is a build artifact: `page.html` with the stylesheet, the icon, the logo
 * and the browser script folded in at module load. The frontend files are byte-identical copies, so
 * the only thing the port can change is what the bundler writes around them — the module labels and
 * the order the three helper modules land in. Everything else, the session token included, is what the
 * recorded snapshot pins.
 */

const FRONTEND = join(import.meta.dir, '..', '..', 'src', 'gui', 'frontend');
const asset = (name: string) => readFileSync(join(FRONTEND, name), 'utf-8');

// Token-shaped, assembled here rather than written out, and fixed so the comparison is deterministic.
const TOKEN = Buffer.from('cc-safety-net gui page fixture').toString('base64url');

const dataPayload = (html: string) => {
  const match = html.match(/<script id="ccsn-data" type="application\/json">([^<]*)<\/script>/);
  return JSON.parse(match?.[1] ?? '') as unknown;
};

describe('the served GUI page', () => {
  test('is the shipped page once the bundler labels and module order are folded out', () => {
    const ported = normalizePage(renderPages(TOKEN).ported, TOKEN);

    expect(ported).toMatchSnapshot();
    expect(ported.modules).toHaveLength(3);
    // The one request-time value, in the empty tag the page script reads on load.
    expect(ported.head).toContain(
      '<script id="ccsn-data" type="application/json">{"token":"<token>"}</script>',
    );
  });

  test('a token that closes the data tag parses back to itself on both sides', () => {
    const hostile = `${Buffer.from('hostile').toString('base64url')}</script><script>alert(1)`;
    const pages = renderPages(hostile);

    expect(pages.ported).not.toContain(`${hostile}</script>`);
    expect(dataPayload(pages.ported)).toStrictEqual({ token: hostile });
  });

  test('carries the stylesheet, the icon and the logo inline and links nothing', () => {
    expect(guiDocument).toContain(`<style>\n${asset('custom.css')}\n  </style>`);
    expect(guiDocument).toContain('<link rel="icon" href="data:image/svg+xml,');
    expect(guiDocument).toContain(
      `<a class="brand-home" href="#overview" title="Overview">${asset('logo.svg')}</a>`,
    );
    expect(guiDocument).not.toContain('<link rel="stylesheet"');
    expect(guiDocument).not.toContain('<script src=');
  });
});
