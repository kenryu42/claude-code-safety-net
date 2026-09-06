import { describe, expect, test } from 'bun:test';
import { renderPages, sliceBlock } from '../helpers/gui-page';

/**
 * The false-positive report the feed offers: the paths it scrubs before anything leaves the
 * machine, and the issue URL it builds under GitHub's length limit. The block is pinned by its
 * recorded snapshot, and it is then run on its own to prove what those bytes do.
 */

// Token-shaped, assembled here rather than written out, and fixed so the slice is deterministic.
const TOKEN = Buffer.from('cc-safety-net gui report fixture').toString('base64url');
const ISSUE_URL =
  'https://github.com/kenryu42/cc-safety-net/issues/new?template=false_positive.yml';

type ReportBlock = {
  reportIssueUrl: string;
  scrubReportPaths: (text: string, cwd: string, home: string) => string;
  buildReportUrl: (fields: Record<string, string>) => string;
  buildReportRequest: (
    fields: Record<string, string>,
    dropped?: string[],
  ) => { url: string; dropped: string[] };
};

const pages = renderPages(TOKEN);
const block = (page: string) => sliceBlock(page, 'var reportIssueUrl =', 'var openReportDialog =');
const report = new Function(
  `${block(pages.ported)}\nreturn { reportIssueUrl, scrubReportPaths, buildReportUrl, buildReportRequest };`,
)() as ReportBlock;

describe('the report block on the served page', () => {
  test('is the shipped block byte for byte', () => {
    expect(block(pages.ported)).toMatchSnapshot();
  });

  test('scrubs the project path before the home it sits under', () => {
    const home = '/var/home/robin';
    const cwd = `${home}/checkouts/ledger`;

    expect(
      report.scrubReportPaths(
        `reading "${cwd}/src/app.ts" failed, and ${home}/.ssh/id_ed25519 was next; last: ${cwd}`,
        cwd,
        home,
      ),
      // The project is its own placeholder rather than a path under `~`, and both keep what
      // follows them so the report still says which file.
    ).toBe(
      'reading "<project>/src/app.ts" failed, and ~/.ssh/id_ed25519 was next; last: <project>',
    );
  });

  test('leaves a path that merely starts with the project path alone', () => {
    expect(
      report.scrubReportPaths(
        '/srv/work/ledger-old/notes.md',
        '/srv/work/ledger',
        '/var/home/robin',
      ),
    ).toBe('/srv/work/ledger-old/notes.md');
  });

  test('carries only the fields that have something to say', () => {
    const url = new URL(
      report.buildReportUrl({ command: 'rm -rf /tmp/x', reason: '', why: 'test' }),
    );

    expect(report.reportIssueUrl).toBe(ISSUE_URL);
    expect(url.origin + url.pathname).toBe('https://github.com/kenryu42/cc-safety-net/issues/new');
    expect(url.searchParams.get('template')).toBe('false_positive.yml');
    expect(url.searchParams.get('command')).toBe('rm -rf /tmp/x');
    expect(url.searchParams.get('why')).toBe('test');
    expect(url.searchParams.has('reason')).toBeFalse();
  });

  test('drops the largest field until the URL fits, and names what it dropped', () => {
    const request = report.buildReportRequest({
      command: 'd'.repeat(9000),
      why: 'e'.repeat(20),
    });

    expect(request.dropped).toStrictEqual(['command']);
    expect(request.url.length).toBeLessThanOrEqual(8000);
    // What survived is still on the issue form, so the report is worth filing.
    expect(new URL(request.url).searchParams.get('why')).toBe('e'.repeat(20));
  });
});
