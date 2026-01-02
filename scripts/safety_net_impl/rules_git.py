"""Git command analysis rules for the safety net."""

from __future__ import annotations

from .shell import _short_opts

_REASON_GIT_CHECKOUT_DOUBLE_DASH = (
    "git checkout -- discards uncommitted changes permanently. Use 'git stash' first."
)
_REASON_GIT_CHECKOUT_REF_DOUBLE_DASH = (
    "git checkout <ref> -- <path> overwrites working tree. Use 'git stash' first."
)
_REASON_GIT_CHECKOUT_REF_PATHSPEC = (
    "git checkout <ref> <path> overwrites working tree. Use 'git stash' first."
)
_REASON_GIT_CHECKOUT_PATHSPEC_FROM_FILE = (
    "git checkout --pathspec-from-file overwrites working tree. Use 'git stash' first."
)
_REASON_GIT_RESTORE = (
    "git restore discards uncommitted changes. Use 'git stash' or 'git diff' first."
)
_REASON_GIT_RESTORE_WORKTREE = (
    "git restore --worktree discards uncommitted changes permanently."
)
_REASON_GIT_RESET_HARD = (
    "git reset --hard destroys uncommitted changes. Use 'git stash' first."
)
_REASON_GIT_RESET_MERGE = "git reset --merge can lose uncommitted changes."
_REASON_GIT_CLEAN_FORCE = (
    "git clean -f removes untracked files permanently. "
    "Review with 'git clean -n' first."
)
_REASON_GIT_PUSH_FORCE = (
    "Force push can destroy remote history. Use --force-with-lease if necessary."
)
_REASON_GIT_WORKTREE_REMOVE_FORCE = (
    "git worktree remove --force can delete worktree files. Verify the path first."
)
_REASON_GIT_BRANCH_DELETE_FORCE = (
    "git branch -D force-deletes without merge check. Use -d for safety."
)
_REASON_GIT_STASH_DROP = (
    "git stash drop permanently deletes stashed changes. "
    "List stashes first with 'git stash list'."
)
_REASON_GIT_STASH_CLEAR = "git stash clear permanently deletes ALL stashed changes."


def _analyze_git(tokens: list[str]) -> str | None:
    sub, rest = _git_subcommand_and_rest(tokens)
    if not sub:
        return None

    sub = sub.lower()
    rest_lower = [t.lower() for t in rest]
    short = _short_opts(rest)

    if sub == "checkout":
        if "--" in rest:
            idx = rest.index("--")
            return (
                _REASON_GIT_CHECKOUT_DOUBLE_DASH
                if idx == 0
                else _REASON_GIT_CHECKOUT_REF_DOUBLE_DASH
            )
        if "-b" in rest or "b" in short:
            return None
        if "-B" in rest or "B" in short:
            return None
        if "--orphan" in rest_lower:
            return None

        has_pathspec_from_file = any(
            t == "--pathspec-from-file" or t.startswith("--pathspec-from-file=")
            for t in rest_lower
        )
        if has_pathspec_from_file:
            return _REASON_GIT_CHECKOUT_PATHSPEC_FROM_FILE

        # git checkout <ref> <pathspec> (without "--") is accepted by git when
        # disambiguation is possible and overwrites working-tree files.
        positional = _checkout_positional_args(rest)
        if len(positional) >= 2:
            return _REASON_GIT_CHECKOUT_REF_PATHSPEC
        return None

    if sub == "restore":
        if "-h" in rest_lower or "--help" in rest_lower or "--version" in rest_lower:
            return None
        if "--worktree" in rest_lower:
            return _REASON_GIT_RESTORE_WORKTREE
        if "--staged" in rest_lower:
            return None
        return _REASON_GIT_RESTORE

    if sub == "reset":
        if "--hard" in rest_lower:
            return _REASON_GIT_RESET_HARD
        if "--merge" in rest_lower:
            return _REASON_GIT_RESET_MERGE
        return None

    if sub == "clean":
        has_force = "--force" in rest_lower or "f" in short
        if has_force:
            return _REASON_GIT_CLEAN_FORCE
        return None

    if sub == "push":
        has_force_with_lease = any(
            t.startswith("--force-with-lease") for t in rest_lower
        )
        has_force = "--force" in rest_lower or "f" in short
        if has_force and not has_force_with_lease:
            return _REASON_GIT_PUSH_FORCE
        if "--force" in rest_lower and has_force_with_lease:
            return _REASON_GIT_PUSH_FORCE
        if "f" in short and has_force_with_lease:
            return _REASON_GIT_PUSH_FORCE
        return None

    if sub == "worktree":
        if not rest_lower:
            return None
        if rest_lower[0] != "remove":
            return None

        rest_for_opts = rest
        if "--" in rest_for_opts:
            rest_for_opts = rest_for_opts[: rest_for_opts.index("--")]
        rest_for_opts_lower = [t.lower() for t in rest_for_opts]
        short_for_opts = _short_opts(rest_for_opts)
        has_force = "--force" in rest_for_opts_lower or "f" in short_for_opts
        if has_force:
            return _REASON_GIT_WORKTREE_REMOVE_FORCE
        return None

    if sub == "branch":
        if "-D" in rest or "D" in short:
            return _REASON_GIT_BRANCH_DELETE_FORCE
        if "-d" in rest or "d" in short:
            return None
        return None

    if sub == "stash":
        if not rest_lower:
            return None
        if rest_lower[0] == "drop":
            return _REASON_GIT_STASH_DROP
        if rest_lower[0] == "clear":
            return _REASON_GIT_STASH_CLEAR
        return None

    return None


def _git_subcommand_and_rest(tokens: list[str]) -> tuple[str | None, list[str]]:
    if not tokens or tokens[0].lower() != "git":
        return None, []

    opts_with_value = {
        "-c",
        "-C",
        "--exec-path",
        "--git-dir",
        "--namespace",
        "--super-prefix",
        "--work-tree",
    }
    opts_no_value = {
        "-p",
        "-P",
        "-h",
        "--help",
        "--no-pager",
        "--paginate",
        "--version",
        "--bare",
        "--no-replace-objects",
        "--literal-pathspecs",
        "--noglob-pathspecs",
        "--icase-pathspecs",
    }

    i = 1
    while i < len(tokens):
        tok = tokens[i]
        if tok == "--":
            i += 1
            break

        if not tok.startswith("-") or tok == "-":
            break

        if tok in opts_no_value:
            i += 1
            continue

        if tok in opts_with_value:
            i += 2
            continue

        if tok.startswith("--"):
            if "=" in tok:
                opt, _value = tok.split("=", 1)
                if opt in opts_with_value:
                    i += 1
                    continue
            i += 1
            continue

        # Short options, possibly with attached values (e.g. -Crepo, -cname=value)
        if tok.startswith("-C") and len(tok) > 2:
            i += 1
            continue
        if tok.startswith("-c") and len(tok) > 2:
            i += 1
            continue

        i += 1

    if i >= len(tokens):
        return None, []

    sub = tokens[i]
    return sub, tokens[i + 1 :]


def _checkout_positional_args(rest: list[str]) -> list[str]:
    """Return positional args for `git checkout`, ignoring options and their values."""

    opts_with_value = {
        "-b",
        "-B",
        "--orphan",
        "--conflict",
        "-U",
        "--unified",
        "--inter-hunk-context",
        "--pathspec-from-file",
    }

    opts_no_value = {
        "-f",
        "--force",
        "-m",
        "--merge",
        "-q",
        "--quiet",
        "--detach",
        "--ignore-skip-worktree-bits",
        "--overwrite-ignore",
        "--no-overlay",
        "--overlay",
        "--progress",
        "--no-progress",
        "--guess",
        "--no-guess",
        "--pathspec-file-nul",
    }

    positionals: list[str] = []
    i = 0
    while i < len(rest):
        tok = rest[i]
        if tok == "--":
            break

        # A lone '-' is a positional (previous branch).
        if tok == "-":
            positionals.append(tok)
            i += 1
            continue

        if tok.startswith("-"):
            if tok in opts_no_value:
                i += 1
                continue

            # Long options with attached values.
            if tok.startswith("--") and "=" in tok:
                opt, _value = tok.split("=", 1)
                if opt in opts_with_value:
                    i += 1
                    continue
                i += 1
                continue

            # Short options with attached values (e.g. -U3, -bbranch).
            if tok.startswith("-U") and len(tok) > 2:
                i += 1
                continue
            if tok.startswith("-b") and len(tok) > 2:
                i += 1
                continue
            if tok.startswith("-B") and len(tok) > 2:
                i += 1
                continue

            if tok in opts_with_value:
                i += 2
                continue

            # Options with optional values; consume the value only when it matches
            # the known (and limited) set of accepted values.
            if tok == "--recurse-submodules":
                if i + 1 < len(rest) and rest[i + 1] in {"checkout", "on-demand"}:
                    i += 2
                    continue
                i += 1
                continue
            if tok in {"-t", "--track"}:
                if i + 1 < len(rest) and rest[i + 1] in {"direct", "inherit"}:
                    i += 2
                    continue
                i += 1
                continue

            # For unknown long options, conservatively assume they may take a value.
            # This avoids misclassifying option arguments as positional pathspecs.
            if tok.startswith("--"):
                if i + 1 < len(rest) and not rest[i + 1].startswith("-"):
                    i += 2
                    continue
                i += 1
                continue

            i += 1
            continue

        positionals.append(tok)
        i += 1

    return positionals
