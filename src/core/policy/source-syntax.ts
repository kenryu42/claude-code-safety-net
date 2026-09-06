export const NAME_PATTERN = /^[a-zA-Z][a-zA-Z0-9_-]{0,63}$/;
export const RULEBOOK_FILE = 'rulebook.json';
export const RULES_DIR = '.cc-safety-net/rules';
/** @internal */
export const GITHUB_RULEBOOK_SOURCE_FORMAT = 'owner/repo#ref/<rulebook-name>';

const GITHUB_SOURCE_RE = /^([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+)#(.+)$/;
const GITHUB_REPOSITORY_SOURCE_RE = /^[A-Za-z0-9][A-Za-z0-9_.-]*\/[A-Za-z0-9_.-]+$/;
const GITHUB_REF_PATTERN = /^[A-Za-z0-9._-]+(?:\/[A-Za-z0-9._-]+)*$/;
const RULES_DIR_RE = RULES_DIR.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const RULEBOOK_FILE_RE = RULEBOOK_FILE.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

export const GITHUB_RULEBOOK_PATH_RE = new RegExp(
  `^${RULES_DIR_RE}/(${NAME_PATTERN.source.slice(1, -1)})/${RULEBOOK_FILE_RE}$`,
);

export interface ParsedGitHubSource {
  owner: string;
  repo: string;
  ref: string;
  path: string;
  name: string;
}

/** @internal */
export function getRepositoryRulebookPath(name: string): string {
  return `${RULES_DIR}/${name}/${RULEBOOK_FILE}`;
}

export function getRulebookSourceSyntaxError(source: string): string | null {
  if (isGitHubRulebookSource(source)) {
    try {
      parseGitHubSource(source);
      return null;
    } catch (error) {
      return error instanceof Error ? error.message : String(error);
    }
  }
  return NAME_PATTERN.test(source)
    ? null
    : `Local rulebook sources must be bare names matching ${NAME_PATTERN}: ${source}`;
}

export function parseGitHubSource(spec: string): ParsedGitHubSource {
  if (spec.startsWith('github:')) throw new Error(`Invalid rulebook source: ${spec}`);
  const match = spec.match(GITHUB_SOURCE_RE);
  if (!match?.[1] || !match[2] || !match[3]) {
    throw new Error(`Invalid GitHub rulebook source: ${spec}`);
  }
  const separator = match[3].lastIndexOf('/');
  if (separator < 1) {
    throw new Error(`GitHub rulebook sources must be ${GITHUB_RULEBOOK_SOURCE_FORMAT}: ${spec}`);
  }
  const ref = match[3].slice(0, separator);
  const name = match[3].slice(separator + 1);
  if (!ref || !GITHUB_REF_PATTERN.test(ref)) {
    throw new Error(`GitHub rulebook refs must use valid path segments: ${spec}`);
  }
  if (!name || !NAME_PATTERN.test(name)) {
    throw new Error(`GitHub rulebook sources must be ${GITHUB_RULEBOOK_SOURCE_FORMAT}: ${spec}`);
  }
  return {
    owner: match[1],
    repo: match[2],
    ref,
    path: getRepositoryRulebookPath(name),
    name,
  };
}

export function isGitHubRepositorySource(source: string): boolean {
  return GITHUB_REPOSITORY_SOURCE_RE.test(source);
}

export function isGitHubRef(ref: string): boolean {
  return GITHUB_REF_PATTERN.test(ref);
}

export function isGitHubRulebookSource(source: string): boolean {
  return GITHUB_SOURCE_RE.test(source);
}

export function assertBareRulebookName(source: string): void {
  if (!NAME_PATTERN.test(source)) {
    throw new Error(
      `Local rulebook sources must be bare names matching ${NAME_PATTERN}: ${source}`,
    );
  }
}
