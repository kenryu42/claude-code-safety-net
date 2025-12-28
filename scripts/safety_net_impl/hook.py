"""Git/filesystem safety net for Claude Code.

Blocks destructive commands that can lose uncommitted work or delete files.
This hook runs before Bash commands execute and can deny dangerous operations.

Exit behavior:
  - Exit 0 with JSON containing permissionDecision: "deny" = block command
  - Exit 0 with no output = allow command
"""

import json
import posixpath
import re
import sys
from os import getenv

from .rules_git import _analyze_git
from .rules_rm import _analyze_rm
from .shell import _shlex_split, _short_opts, _split_shell_commands, _strip_wrappers

_MAX_RECURSION_DEPTH = 5

_STRICT_SUFFIX = " [strict mode - disable with: unset SAFETY_NET_STRICT]"

_REASON_FIND_DELETE = (
    "find -delete permanently deletes matched files. Use -print first."
)

_REASON_XARGS_RM_RF = (
    "xargs can feed arbitrary input to rm -rf. "
    "List files first, then delete individually."
)

_REASON_PARALLEL_RM_RF = (
    "parallel can feed arbitrary input to rm -rf. "
    "List files first, then delete individually."
)


def _strip_token_wrappers(token: str) -> str:
    """Strip common shell wrapper punctuation from a token.

    Intentionally does not strip `;` so callers can still recognize terminators
    like `-exec ... \\;`.
    """

    tok = token.strip()
    while tok.startswith("$("):
        tok = tok[2:]
    tok = tok.lstrip("\\`({[")
    tok = tok.rstrip("`)}]")
    return tok


def _find_has_delete(args: list[str]) -> bool:
    """Return True if `find` args include the destructive `-delete` primary.

    This is a best-effort scan that avoids common false-positives where "-delete"
    is merely an argument (e.g. `-name -delete`) or appears inside `-exec`.
    """

    # Predicates/actions that consume exactly one argument.
    consumes_one = {
        "-name",
        "-iname",
        "-path",
        "-ipath",
        "-wholename",
        "-iwholename",
        "-regex",
        "-iregex",
        "-lname",
        "-ilname",
        "-samefile",
        "-newer",
        "-newerxy",
        "-perm",
        "-user",
        "-group",
        "-printf",
        "-fprintf",
        "-fprint",
        "-fprint0",
        "-fls",
    }

    exec_like = {"-exec", "-execdir", "-ok", "-okdir"}

    i = 0
    while i < len(args):
        tok = _strip_token_wrappers(args[i]).lower()

        if tok in exec_like:
            i += 1
            while i < len(args):
                end = _strip_token_wrappers(args[i])
                if end in {";", "+"}:
                    i += 1
                    break
                i += 1
            continue

        if tok in consumes_one:
            i += 2
            continue

        if tok == "-delete":
            return True

        i += 1

    return False


def _strict_mode() -> bool:
    val = (getenv("SAFETY_NET_STRICT") or "").strip().lower()
    return val in {"1", "true", "yes", "on"}


def _normalize_cmd_token(token: str) -> str:
    tok = _strip_token_wrappers(token)
    tok = tok.rstrip(";")
    tok = tok.lower()
    tok = posixpath.basename(tok)
    return tok


def _extract_dash_c_arg(tokens: list[str]) -> str | None:
    # Handles: <shell> -c 'cmd', <shell> -lc 'cmd', <shell> --norc -c 'cmd'
    for i in range(1, len(tokens)):
        tok = tokens[i]
        if tok == "--":
            return None
        if tok == "-c":
            return tokens[i + 1] if i + 1 < len(tokens) else None
        if tok.startswith("-") and len(tok) > 1 and tok[1:].isalpha():
            letters = set(tok[1:])
            # Common combined short options for shells.
            if "c" in letters and letters.issubset({"c", "l", "i", "s"}):
                return tokens[i + 1] if i + 1 < len(tokens) else None
    return None


def _has_shell_dash_c(tokens: list[str]) -> bool:
    for i in range(1, len(tokens)):
        tok = tokens[i]
        if tok == "--":
            break
        if tok == "-c":
            return True
        if tok.startswith("-") and len(tok) > 1 and tok[1:].isalpha():
            letters = set(tok[1:])
            if "c" in letters and letters.issubset({"c", "l", "i", "s"}):
                return True
    return False


def _extract_pythonish_code_arg(tokens: list[str]) -> str | None:
    # Handles: python -c 'code', node -e 'code', ruby -e 'code', perl -e 'code'
    for i in range(1, len(tokens)):
        tok = tokens[i]
        if tok == "--":
            return None
        if tok in {"-c", "-e"}:
            return tokens[i + 1] if i + 1 < len(tokens) else None
    return None


def _rm_has_recursive_force(tokens: list[str]) -> bool:
    """Return True if the rm invocation is effectively `rm -rf`."""

    if not tokens:
        return False

    opts: list[str] = []
    for tok in tokens[1:]:
        if tok == "--":
            break
        opts.append(tok)

    opts_lower = [t.lower() for t in opts]
    short = _short_opts(opts)
    recursive = "--recursive" in opts_lower or "r" in short or "R" in short
    force = "--force" in opts_lower or "f" in short
    return recursive and force


def _extract_xargs_child_command(tokens: list[str]) -> list[str] | None:
    """Return the command tokens `xargs` will execute, or None if unspecified.

    This is a best-effort scan over xargs options to find where the child command
    starts. It is intentionally conservative and does not attempt to fully model
    platform-specific xargs behavior.
    """

    if not tokens or _normalize_cmd_token(tokens[0]) != "xargs":
        return None

    consumes_value = {
        "-a",
        "-I",
        "-J",
        "-L",
        "-l",
        "-n",
        "-R",
        "-S",
        "-s",
        "-P",
        "-d",
        "-E",
        "--arg-file",
        "--delimiter",
        "--eof",
        "--max-args",
        "--max-lines",
        "--max-procs",
        "--max-chars",
        "--process-slot-var",
    }

    i = 1
    while i < len(tokens):
        tok = tokens[i]

        if tok == "--":
            i += 1
            break
        if not tok.startswith("-") or tok == "-":
            break

        # Long options (best-effort).
        if tok.startswith("--"):
            if tok in consumes_value:
                i += 2
                continue
            for opt in (
                "--arg-file=",
                "--delimiter=",
                "--max-args=",
                "--max-lines=",
                "--max-procs=",
                "--max-chars=",
                "--process-slot-var=",
                "--eof=",
            ):
                if tok.startswith(opt):
                    i += 1
                    break
            else:
                i += 1
            continue

        # Short options.
        if tok == "-i":
            # -i enables replacement (optional attached arg), but does NOT consume
            # the next token in the common form `xargs -i cmd ...`.
            i += 1
            continue
        if tok in consumes_value:
            i += 2
            continue

        # Common attached forms.
        if tok.startswith("-I") and len(tok) > 2:
            i += 1
            continue
        if tok.startswith("-i") and len(tok) > 2:
            i += 1
            continue
        if tok.startswith("-n") and len(tok) > 2 and tok[2:].isdigit():
            i += 1
            continue
        if tok.startswith("-P") and len(tok) > 2 and tok[2:].isdigit():
            i += 1
            continue
        if tok.startswith("-L") and len(tok) > 2 and tok[2:].isdigit():
            i += 1
            continue
        if tok.startswith("-R") and len(tok) > 2 and tok[2:].isdigit():
            i += 1
            continue
        if tok.startswith("-S") and len(tok) > 2 and tok[2:].isdigit():
            i += 1
            continue
        if tok.startswith("-s") and len(tok) > 2 and tok[2:].isdigit():
            i += 1
            continue
        if tok.startswith("-a") and len(tok) > 2:
            i += 1
            continue
        if tok.startswith("-d") and len(tok) > 2:
            i += 1
            continue
        if tok.startswith("-E") and len(tok) > 2:
            i += 1
            continue
        if tok.startswith("-J") and len(tok) > 2:
            i += 1
            continue

        # Unknown short option; best-effort skip.
        i += 1

    if i >= len(tokens):
        return None
    return tokens[i:]


def _xargs_replacement_tokens(tokens: list[str]) -> set[str]:
    """Return replacement tokens used by xargs (-I/-i/-J/--replace).

    If xargs is not in replacement mode, returns an empty set.
    """

    if not tokens or _normalize_cmd_token(tokens[0]) != "xargs":
        return set()

    repl: set[str] = set()

    i = 1
    while i < len(tokens):
        tok = tokens[i]
        if tok == "--":
            break
        if not tok.startswith("-") or tok == "-":
            break

        if tok in {"-I", "-J"}:
            if i + 1 < len(tokens):
                repl.add(tokens[i + 1])
                i += 2
                continue
            break

        if tok.startswith("-I") and len(tok) > 2:
            repl.add(tok[2:])
            i += 1
            continue
        if tok.startswith("-J") and len(tok) > 2:
            repl.add(tok[2:])
            i += 1
            continue

        if tok == "-i":
            # -i enables replacement mode with the default token "{}".
            repl.add("{}")
            i += 1
            continue
        if tok.startswith("-i") and len(tok) > 2:
            repl.add(tok[2:])
            i += 1
            continue

        if tok in {"--replace", "--replace=", "--replace-str"}:
            # Treat as replacement mode; default replacement is "{}".
            repl.add("{}")
            i += 1
            continue
        if tok.startswith("--replace="):
            repl.add(tok.split("=", 1)[1] or "{}")
            i += 1
            continue

        # Other options; we don't need to fully parse them here.
        i += 1

    return repl


def _extract_parallel_template_and_args(
    tokens: list[str],
) -> tuple[list[str], list[str], bool] | None:
    """Return (template_tokens, args, args_dynamic) for GNU parallel.

    When `:::` is present, args are the tokens after it.
    When `:::` is absent, parallel reads args from stdin (args_dynamic=True).
    """

    if not tokens or _normalize_cmd_token(tokens[0]) != "parallel":
        return None

    args_dynamic = ":::" not in tokens
    if args_dynamic:
        marker = len(tokens)
        args: list[str] = []
    else:
        marker = tokens.index(":::")
        args = tokens[marker + 1 :]

    i = 1
    consumes_value = {
        "-j",
        "--jobs",
        "-S",
        "--sshlogin",
        "--sshloginfile",
        "--results",
        "--joblog",
        "--workdir",
        "--tmpdir",
        "--tempdir",
        "--tagstring",
    }
    while i < marker:
        tok = tokens[i]
        if tok == "--":
            i += 1
            break
        if not tok.startswith("-") or tok == "-":
            break

        # Best-effort handling for options that consume a value.
        if tok in consumes_value:
            i += 2
            continue

        if tok.startswith("--"):
            for opt in (
                "--jobs=",
                "--sshlogin=",
                "--sshloginfile=",
                "--results=",
                "--joblog=",
                "--workdir=",
                "--tmpdir=",
                "--tempdir=",
                "--tagstring=",
            ):
                if tok.startswith(opt):
                    i += 1
                    break
            else:
                i += 1
            continue

        if tok.startswith("-j") and len(tok) > 2:
            i += 1
            continue
        if tok.startswith("-S") and len(tok) > 2:
            i += 1
            continue

        i += 1

    template = tokens[i:marker]
    return template, args, args_dynamic


def _redact_secrets(text: str) -> str:
    # Heuristic redaction: do not echo likely secrets back into logs.
    redacted = text

    # KEY=VALUE patterns for common secret-ish keys.
    redacted = re.sub(
        r"\b([A-Z0-9_]*(?:TOKEN|SECRET|PASSWORD|PASS|KEY|CREDENTIALS)[A-Z0-9_]*)=([^\s]+)",
        r"\1=<redacted>",
        redacted,
        flags=re.IGNORECASE,
    )

    # Authorization headers.
    redacted = re.sub(
        r"(?i)([\"']\s*authorization\s*:\s*)([^\"']+)([\"'])",
        r"\1<redacted>\3",
        redacted,
    )
    redacted = re.sub(
        r"(?i)(authorization\s*:\s*)([^\s\"']+)(\s+[^\s\"']+)",
        r"\1<redacted>",
        redacted,
    )
    redacted = re.sub(
        r"(?i)(authorization\s*:\s*)([^\s\"']+)",
        r"\1<redacted>",
        redacted,
    )

    # URL credentials: scheme://user:pass@host
    redacted = re.sub(
        r"(?i)(https?://)([^\s/:@]+):([^\s@]+)@",
        r"\1<redacted>:<redacted>@",
        redacted,
    )

    # Common GitHub token prefixes.
    redacted = re.sub(r"\bgh[pousr]_[A-Za-z0-9]{20,}\b", "<redacted>", redacted)
    return redacted


def _format_safe_excerpt(label: str, text: str) -> str:
    text = _redact_secrets(text)
    if len(text) > 300:
        text = text[:300] + "…"
    return f"{label}: {text}\n\n"


def _dangerous_in_text(text: str) -> str | None:
    original = text
    t = text.lower()

    # Last-resort heuristics for when proper parsing fails or when destructive commands
    # are embedded in substitutions.
    if re.search(
        r"(?<![\w/\\])(?:/[^\s'\";|&]+/)?rm\b[^\n;|&]*(?:\s-(?:[a-z]*r[a-z]*f|[a-z]*f[a-z]*r)\b|\s-r\b[^\n;|&]*\s-f\b|\s-f\b[^\n;|&]*\s-r\b|\s--recursive\b[^\n;|&]*\s--force\b|\s--force\b[^\n;|&]*\s--recursive\b)",
        t,
    ):
        return "rm -rf is destructive. List files first, then delete individually."

    if "git reset --hard" in t:
        return "git reset --hard destroys uncommitted changes. Use 'git stash' first."
    if "git reset --merge" in t:
        return "git reset --merge can lose uncommitted changes."
    if "git clean -f" in t or "git clean --force" in t:
        return (
            "git clean -f removes untracked files permanently. "
            "Review with 'git clean -n' first."
        )
    if ("git push --force" in t or re.search(r"\bgit\s+push\s+-f\b", t)) and (
        "--force-with-lease" not in t
    ):
        return (
            "Force push can destroy remote history. "
            "Use --force-with-lease if necessary."
        )
    # Preserve case for -D vs -d (git treats these as different options).
    if re.search(r"(?i)\bgit\s+branch\b", original) and re.search(r"\s-D\b", original):
        return "git branch -D force-deletes without merge check. Use -d for safety."
    if "git stash drop" in t:
        return (
            "git stash drop permanently deletes stashed changes. "
            "List stashes first with 'git stash list'."
        )
    if "git stash clear" in t:
        return "git stash clear permanently deletes ALL stashed changes."
    if "git checkout --" in t:
        return (
            "git checkout -- discards uncommitted changes permanently. "
            "Use 'git stash' first."
        )
    if re.search(r"\bgit\s+restore\b", t) and (
        "--staged" not in t and "--help" not in t and "--version" not in t
    ):
        if "--worktree" in t:
            return "git restore --worktree discards uncommitted changes permanently."
        return (
            "git restore discards uncommitted changes. "
            "Use 'git stash' or 'git diff' first."
        )

    return None


def _dangerous_find_delete_in_text(text: str) -> str | None:
    """Best-effort detection for `find -delete` when token parsing is unavailable."""

    t = text.lower()
    stripped = t.lstrip()
    if stripped.startswith(("echo ", "rg ")):
        return None
    if re.search(r"\bfind\b[^\n;|&]*\s-delete\b", t):
        return _REASON_FIND_DELETE
    return None


def _analyze_segment(
    segment: str,
    *,
    depth: int,
    cwd: str | None,
    strict: bool,
) -> tuple[str, str] | None:
    tokens = _shlex_split(segment)
    if tokens is None:
        if strict:
            return segment, "Unable to parse shell command safely." + _STRICT_SUFFIX
        reason = _dangerous_in_text(segment) or _dangerous_find_delete_in_text(segment)
        return (segment, reason) if reason else None
    if not tokens:
        return None

    tokens = _strip_wrappers(tokens)
    if not tokens:
        return None

    head = _normalize_cmd_token(tokens[0])

    # Wrapper/interpreter recursion: bash/sh/zsh -c '...'
    if head in {"bash", "sh", "zsh", "dash", "ksh"}:
        cmd_str = _extract_dash_c_arg(tokens)
        if cmd_str is not None:
            if depth >= _MAX_RECURSION_DEPTH:
                return segment, "Command analysis recursion limit reached."
            analyzed = _analyze_command(
                cmd_str,
                depth=depth + 1,
                cwd=cwd,
                strict=strict,
            )
            if analyzed:
                return analyzed
        elif strict and _has_shell_dash_c(tokens):
            return segment, "Unable to parse shell -c wrapper safely." + _STRICT_SUFFIX

    # python/node/ruby/perl one-liners (-c/-e): can hide rm/git.
    if head in {"python", "python3", "node", "ruby", "perl"}:
        code = _extract_pythonish_code_arg(tokens)
        if code is not None:
            reason = _dangerous_in_text(code) or _dangerous_find_delete_in_text(code)
            if reason:
                return segment, reason
            if strict:
                return (
                    segment,
                    "Cannot safely analyze interpreter one-liners." + _STRICT_SUFFIX,
                )

    allow_tmpdir_var = not re.search(r"\bTMPDIR=", segment)

    if head == "xargs":
        child = _extract_xargs_child_command(tokens)
        if child is None:
            return None
        child = _strip_wrappers(child)
        if not child:
            return None

        child_head = _normalize_cmd_token(child[0])

        # xargs feeds dynamic input into the child command; do not trust any rm
        # targets visible on the command line.
        if child_head == "rm" and _rm_has_recursive_force(["rm", *child[1:]]):
            return segment, _REASON_XARGS_RM_RF
        if child_head == "busybox" and len(child) >= 3:
            applet = _normalize_cmd_token(child[1])
            if applet == "rm" and _rm_has_recursive_force(["rm", *child[2:]]):
                return segment, _REASON_XARGS_RM_RF

        if child_head in {"bash", "sh", "zsh", "dash", "ksh"}:
            cmd_str = _extract_dash_c_arg(child)
            if cmd_str is not None:
                repl_tokens = _xargs_replacement_tokens(tokens)
                if repl_tokens and cmd_str.strip() in repl_tokens:
                    return (
                        segment,
                        (
                            f"xargs {child[0]} -c can execute arbitrary commands "
                            "from input."
                        ),
                    )
                if repl_tokens and any(t and t in cmd_str for t in repl_tokens):
                    # xargs replacement mode substitutes dynamic input into the
                    # command string; do not trust placeholder-based rm -rf.
                    reason = _dangerous_in_text(cmd_str)
                    if reason and reason.startswith("rm -rf"):
                        return segment, _REASON_XARGS_RM_RF
                if depth >= _MAX_RECURSION_DEPTH:
                    return segment, "Command analysis recursion limit reached."
                analyzed = _analyze_command(
                    cmd_str,
                    depth=depth + 1,
                    cwd=cwd,
                    strict=strict,
                )
                if analyzed:
                    return analyzed
            elif _has_shell_dash_c(child):
                return (
                    segment,
                    f"xargs {child[0]} -c can execute arbitrary commands from input.",
                )

        if child_head == "busybox" and len(child) >= 2:
            applet = _normalize_cmd_token(child[1])
            if applet == "rm":
                reason = _analyze_rm(
                    ["rm", *child[2:]],
                    allow_tmpdir_var=allow_tmpdir_var,
                    cwd=cwd,
                    strict=strict,
                )
                return (segment, reason) if reason else None
            if applet == "find":
                if _find_has_delete(child[2:]):
                    return segment, _REASON_FIND_DELETE

        if child_head == "git":
            reason = _analyze_git(["git", *child[1:]])
            return (segment, reason) if reason else None
        if child_head == "rm":
            reason = _analyze_rm(
                ["rm", *child[1:]],
                allow_tmpdir_var=allow_tmpdir_var,
                cwd=cwd,
                strict=strict,
            )
            return (segment, reason) if reason else None
        if child_head == "find":
            if _find_has_delete(child[1:]):
                return segment, _REASON_FIND_DELETE

        return None

    if head == "parallel":
        extracted = _extract_parallel_template_and_args(tokens)
        if extracted is None:
            return None

        template, args_after_marker, args_dynamic = extracted

        template = _strip_wrappers(template)
        if not template:
            if not args_dynamic:
                # `parallel ::: <cmd> ...` runs each argument as a full command.
                for cmd_str in args_after_marker:
                    if depth >= _MAX_RECURSION_DEPTH:
                        return segment, "Command analysis recursion limit reached."
                    analyzed = _analyze_command(
                        cmd_str,
                        depth=depth + 1,
                        cwd=cwd,
                        strict=strict,
                    )
                    if analyzed:
                        return analyzed
            return None

        template_head = _normalize_cmd_token(template[0])
        if template_head in {"bash", "sh", "zsh", "dash", "ksh"}:
            cmd_str = _extract_dash_c_arg(template)
            if cmd_str is not None:
                # If the command string uses replacement placeholders, model
                # the substitution when args are known; otherwise deny.
                if "{}" in cmd_str:
                    if args_dynamic:
                        if cmd_str.strip() == "{}":
                            return (
                                segment,
                                (
                                    f"parallel {template[0]} -c can execute arbitrary "
                                    "commands from input."
                                ),
                            )
                        reason = _dangerous_in_text(cmd_str)
                        if reason and reason.startswith("rm -rf"):
                            return segment, _REASON_PARALLEL_RM_RF
                    elif args_after_marker:
                        for arg in args_after_marker:
                            if depth >= _MAX_RECURSION_DEPTH:
                                return (
                                    segment,
                                    "Command analysis recursion limit reached.",
                                )
                            analyzed = _analyze_command(
                                cmd_str.replace("{}", arg),
                                depth=depth + 1,
                                cwd=cwd,
                                strict=strict,
                            )
                            if analyzed:
                                return analyzed
                        return None
                if depth >= _MAX_RECURSION_DEPTH:
                    return segment, "Command analysis recursion limit reached."
                analyzed = _analyze_command(
                    cmd_str,
                    depth=depth + 1,
                    cwd=cwd,
                    strict=strict,
                )
                if analyzed:
                    return analyzed
            elif _has_shell_dash_c(template):
                return (
                    segment,
                    (
                        f"parallel {template[0]} -c can execute arbitrary commands "
                        "from input."
                    ),
                )

        if template_head == "busybox" and len(template) >= 2:
            applet = _normalize_cmd_token(template[1])
            if applet == "rm":
                rm_template = ["rm", *template[2:]]

                if args_dynamic and _rm_has_recursive_force(rm_template):
                    return segment, _REASON_PARALLEL_RM_RF

                rm_templates: list[list[str]] = [rm_template]
                if args_after_marker:
                    if any("{}" in tok for tok in rm_template):
                        rm_templates = [
                            [tok.replace("{}", arg) for tok in rm_template]
                            for arg in args_after_marker
                        ]
                    else:
                        rm_templates = [
                            [*rm_template, arg] for arg in args_after_marker
                        ]

                for rm_tokens in rm_templates:
                    reason = _analyze_rm(
                        rm_tokens,
                        allow_tmpdir_var=allow_tmpdir_var,
                        cwd=cwd,
                        strict=strict,
                    )
                    if reason:
                        return segment, reason
                return None
            if applet == "find":
                if _find_has_delete(template[2:]):
                    return segment, _REASON_FIND_DELETE

        if template_head == "git":
            reason = _analyze_git(["git", *template[1:]])
            return (segment, reason) if reason else None
        if template_head == "rm":
            if args_dynamic and _rm_has_recursive_force(["rm", *template[1:]]):
                return segment, _REASON_PARALLEL_RM_RF

            templates: list[list[str]] = [template]
            if args_after_marker:
                if any("{}" in tok for tok in template):
                    templates = [
                        [tok.replace("{}", arg) for tok in template]
                        for arg in args_after_marker
                    ]
                else:
                    templates = [[*template, arg] for arg in args_after_marker]

            for rm_tokens in templates:
                reason = _analyze_rm(
                    ["rm", *rm_tokens[1:]],
                    allow_tmpdir_var=allow_tmpdir_var,
                    cwd=cwd,
                    strict=strict,
                )
                if reason:
                    return segment, reason
            return None
        if template_head == "find":
            if _find_has_delete(template[1:]):
                return segment, _REASON_FIND_DELETE

        return None

    if head == "busybox" and len(tokens) >= 2:
        applet = _normalize_cmd_token(tokens[1])
        if applet == "rm":
            reason = _analyze_rm(
                ["rm", *tokens[2:]],
                allow_tmpdir_var=allow_tmpdir_var,
                cwd=cwd,
                strict=strict,
            )
            return (segment, reason) if reason else None
        if applet == "find":
            if _find_has_delete(tokens[2:]):
                return segment, _REASON_FIND_DELETE

    if head == "git":
        reason = _analyze_git(["git", *tokens[1:]])
        return (segment, reason) if reason else None
    if head == "rm":
        reason = _analyze_rm(
            ["rm", *tokens[1:]],
            allow_tmpdir_var=allow_tmpdir_var,
            cwd=cwd,
            strict=strict,
        )
        return (segment, reason) if reason else None

    if head == "find":
        if _find_has_delete(tokens[1:]):
            return segment, _REASON_FIND_DELETE

    # Detect embedded destructive commands (e.g. $(rm -rf ...), `git reset --hard`).
    for i in range(1, len(tokens)):
        cmd = _normalize_cmd_token(tokens[i])
        if cmd == "rm":
            reason = _analyze_rm(
                ["rm", *tokens[i + 1 :]],
                allow_tmpdir_var=allow_tmpdir_var,
                cwd=cwd,
                strict=strict,
            )
            if reason:
                return segment, reason
        if cmd == "git":
            reason = _analyze_git(["git", *tokens[i + 1 :]])
            if reason:
                return segment, reason
        if cmd == "find":
            if _find_has_delete(tokens[i + 1 :]):
                return segment, _REASON_FIND_DELETE

    reason = _dangerous_in_text(segment)
    return (segment, reason) if reason else None


def _analyze_command(
    command: str,
    *,
    depth: int,
    cwd: str | None,
    strict: bool,
) -> tuple[str, str] | None:
    effective_cwd = cwd
    for segment in _split_shell_commands(command):
        analyzed = _analyze_segment(
            segment,
            depth=depth,
            cwd=effective_cwd,
            strict=strict,
        )
        if analyzed:
            return analyzed

        if effective_cwd is not None and _segment_changes_cwd(segment):
            effective_cwd = None
    return None


def _segment_changes_cwd(segment: str) -> bool:
    tokens = _shlex_split(segment)
    if tokens is not None:
        # Best-effort handling for grouped commands/subshells like:
        #   { cd ..; ...; }
        #   ( cd ..; ... )
        #   $( cd ..; ... )
        while tokens and tokens[0] in {"{", "(", "$("}:
            tokens = tokens[1:]

        tokens = _strip_wrappers(tokens)
        if tokens and tokens[0].lower() == "builtin":
            tokens = tokens[1:]

        if tokens:
            return _normalize_cmd_token(tokens[0]) in {"cd", "pushd", "popd"}

    return bool(
        re.match(
            r"^\s*(?:\$\(\s*)?[\(\{]*\s*(?:command\s+|builtin\s+)?(?:cd|pushd|popd)(?:\s|$)",
            segment,
            flags=re.IGNORECASE,
        )
    )


def main() -> int:
    strict = _strict_mode()
    try:
        input_data = json.load(sys.stdin)
    except json.JSONDecodeError:
        if not strict:
            return 0
        print(
            json.dumps(
                {
                    "hookSpecificOutput": {
                        "hookEventName": "PreToolUse",
                        "permissionDecision": "deny",
                        "permissionDecisionReason": (
                            "BLOCKED by safety_net.py\n\nReason: Invalid hook input."
                        ),
                    }
                }
            )
        )
        return 0

    if not isinstance(input_data, dict):
        if not strict:
            return 0
        print(
            json.dumps(
                {
                    "hookSpecificOutput": {
                        "hookEventName": "PreToolUse",
                        "permissionDecision": "deny",
                        "permissionDecisionReason": (
                            "BLOCKED by safety_net.py\n\n"
                            "Reason: Invalid hook input structure."
                        ),
                    }
                }
            )
        )
        return 0

    tool_name = input_data.get("tool_name")
    if tool_name != "Bash":
        return 0

    tool_input = input_data.get("tool_input")
    if not isinstance(tool_input, dict):
        if not strict:
            return 0
        print(
            json.dumps(
                {
                    "hookSpecificOutput": {
                        "hookEventName": "PreToolUse",
                        "permissionDecision": "deny",
                        "permissionDecisionReason": (
                            "BLOCKED by safety_net.py\n\n"
                            "Reason: Invalid hook input structure."
                        ),
                    }
                }
            )
        )
        return 0

    command = tool_input.get("command")
    if not isinstance(command, str) or not command.strip():
        return 0

    cwd_val = input_data.get("cwd")
    cwd = cwd_val.strip() if isinstance(cwd_val, str) else None
    if cwd == "":
        cwd = None

    analyzed = _analyze_command(command, depth=0, cwd=cwd, strict=strict)
    if analyzed:
        segment, reason = analyzed
        output = {
            "hookSpecificOutput": {
                "hookEventName": "PreToolUse",
                "permissionDecision": "deny",
                "permissionDecisionReason": (
                    "BLOCKED by safety_net.py\n\n"
                    f"Reason: {reason}\n\n"
                    + _format_safe_excerpt("Command", command)
                    + _format_safe_excerpt("Segment", segment)
                    + "If this operation is truly needed, ask the user for explicit "
                    "permission and have them run the command manually."
                ),
            }
        }
        print(json.dumps(output))
        return 0

    return 0
