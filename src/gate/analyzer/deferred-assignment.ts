import type { CommandNode, CommandProgram, CommandView, CommandWord } from '@/core/shell/model';
import { chargeScan } from './text-scanner';

const ASSIGNMENT_PATTERN = /^[A-Za-z_][A-Za-z0-9_]*=/;

/**
 * Decides whether a dangerous-text match on a cleanly parsed quoted-literal assignment
 * (`W='rm -rf ~'`) can defer to use-time rules. The assignment segment itself executes
 * nothing, and a quoted expansion stays one argv word, so it cannot split into a command
 * plus flags; code-string consumers (eval, sh -c, pipes into shells) block variable input
 * independently. Any reference the scan cannot prove is such a data use — unquoted,
 * command position, inside a substitution, or in an expanding heredoc body — keeps the
 * assignment-time block.
 */
export function isDataOnlyQuotedAssignment(
  view: CommandView,
  program: CommandProgram | undefined,
  scanWork?: { units: number },
): boolean {
  const word = view.words[0];
  if (!program || !word || view.words.length !== 1 || view.dialect !== 'posix') return false;
  if (!word.quoted || word.provenance !== 'literal') return false;
  const name = /^([A-Za-z_][A-Za-z0-9_]*)=/.exec(word.text)?.[1];
  if (!name) return false;
  chargeScan(scanWork, program.source, 2);
  const references = {
    anchored: new RegExp(`^\\$\\{?${name}(?![A-Za-z0-9_])`),
    loose: new RegExp(`\\$\\{?${name}(?![A-Za-z0-9_])`),
  };
  return nodesHaveOnlyDataReferences(program.nodes, word, references);
}

type ReferencePatterns = { anchored: RegExp; loose: RegExp };

function nodesHaveOnlyDataReferences(
  nodes: readonly CommandNode[],
  assignment: CommandWord,
  references: ReferencePatterns,
): boolean {
  return nodes.every((node) => {
    if (node.kind === 'connector') return true;
    if (node.kind === 'group' || node.kind === 'function') {
      return nodesHaveOnlyDataReferences(node.body.nodes, assignment, references);
    }
    if (node.kind === 'unknown') return !references.loose.test(node.source);
    return viewHasOnlyDataReferences(node, assignment, references);
  });
}

function viewHasOnlyDataReferences(
  view: CommandView,
  assignment: CommandWord,
  references: ReferencePatterns,
): boolean {
  if (view.nested.some((program) => references.loose.test(program.source))) return false;
  const commandIndex = view.words.findIndex((word) => !ASSIGNMENT_PATTERN.test(word.text));
  return (
    view.words.every(
      (word, index) =>
        word === assignment ||
        rawReferencesAreQuoted(word.raw, references.anchored, index !== commandIndex),
    ) &&
    view.redirections.every(
      (redirection) =>
        (!redirection.heredoc ||
          redirection.heredoc.quotedDelimiter ||
          !references.loose.test(redirection.heredoc.body)) &&
        (!redirection.target ||
          rawReferencesAreQuoted(redirection.target.raw, references.anchored, true)),
    )
  );
}

function rawReferencesAreQuoted(raw: string, anchored: RegExp, allowQuoted: boolean): boolean {
  let single = false;
  let double = false;
  for (let i = 0; i < raw.length; i++) {
    const char = raw[i];
    if (char === '\\' && !single) {
      i++;
      continue;
    }
    if (!double && char === "'") {
      single = !single;
      continue;
    }
    if (!single && char === '"') {
      double = !double;
      continue;
    }
    if (single || char !== '$') continue;
    if (!anchored.test(raw.slice(i))) continue;
    if (!double || !allowQuoted) return false;
  }
  return true;
}
