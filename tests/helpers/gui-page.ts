import { renderPolicyGuiHtml as renderPortedPage } from '@/gui/page';

/**
 * The served page is one string built at module load: `page.html` with the stylesheet, the icon,
 * the logo and the bundled browser script folded in. It is one document per session token, so what
 * a row records is textual.
 */
export function renderPages(token: string) {
  return { ported: renderPortedPage(token) };
}

// Bun labels every bundled module with its repository path and emits them in import order, and
// orders the three helper modules by that path. The label lines are the split points: the head (the
// document down to the opening `<script>`), the three helper modules, and the page script itself.
const MODULE_LABEL = /^\/\/ (?:src|next)\/[^\n]*\.ts\n/m;

export function normalizePage(html: string, token: string) {
  const pieces = html.replaceAll(token, '<token>').split(MODULE_LABEL);
  return {
    head: pieces[0],
    // Which name the bundler gives an identifier two modules share moves between Bun versions, so a
    // record pins the page around the bundle and the labels inside it, not the bundled bodies; the
    // blocks a row asserts on are recorded through `sliceBlock`.
    modules: pieces.slice(1, -1).map(() => '[bundle]'),
    tail: (pieces[pieces.length - 1] ?? '').replace(/[\s\S]*\n(?= {2}<\/script>)/, '[bundle]\n'),
  };
}

/** The page text from `start` up to the next `end`, so a block bounded by two markers inside one
 *  bundled module is recorded on its own. */
export function sliceBlock(html: string, start: string, end: string): string {
  const from = html.indexOf(start);
  if (from < 0) throw new Error(`page block start not found: ${start}`);
  const to = html.indexOf(end, from);
  if (to < 0) throw new Error(`page block end not found: ${end}`);
  return html.slice(from, to).trimEnd();
}
