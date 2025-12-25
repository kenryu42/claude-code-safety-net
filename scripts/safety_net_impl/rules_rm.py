"""Filesystem (rm) command analysis rules for the safety net."""

import os
import posixpath

from .shell import _short_opts

_REASON_RM_RF = "rm -rf is destructive. List files first, then delete individually."
_REASON_RM_RF_ROOT_HOME = "rm -rf on root or home paths is extremely dangerous."
_STRICT_SUFFIX = " [strict mode - disable with: unset SAFETY_NET_STRICT]"


def _analyze_rm(
    tokens: list[str],
    *,
    allow_tmpdir_var: bool = True,
    cwd: str | None = None,
    strict: bool = False,
) -> str | None:
    rest = tokens[1:]
    rest_lower = [t.lower() for t in rest]
    short = _short_opts(rest)
    recursive = "--recursive" in rest_lower or "r" in short
    force = "--force" in rest_lower or "f" in short

    if not (recursive and force):
        return None

    targets = _rm_targets(tokens)
    if any(_is_root_or_home_path(t) for t in targets):
        return _REASON_RM_RF_ROOT_HOME
    if targets and all(
        _is_temp_path(t, allow_tmpdir_var=allow_tmpdir_var) for t in targets
    ):
        return None

    if strict:
        return _REASON_RM_RF + _STRICT_SUFFIX

    if cwd and targets:
        home = os.environ.get("HOME")
        if home and posixpath.normpath(cwd) == posixpath.normpath(home):
            return _REASON_RM_RF_ROOT_HOME
        if all(_is_path_within_cwd(t, cwd) for t in targets):
            return None
    return _REASON_RM_RF


def _is_path_within_cwd(path: str, cwd: str) -> bool:
    """Return True if `path` resolves to something inside `cwd`.

    This is a best-effort, string-based containment check (no filesystem access).
    It intentionally treats deleting the entire cwd (".", cwd itself) as unsafe.
    """

    if path.startswith(("~", "$HOME", "${HOME}")):
        return False

    if "$" in path or "`" in path:
        return False

    normalized = posixpath.normpath(path)
    if normalized in {".", ""}:
        return False

    if path.startswith("/"):
        resolved = posixpath.normpath(path)
    else:
        resolved = posixpath.normpath(posixpath.join(cwd, path))

    cwd_normalized = posixpath.normpath(cwd)

    if resolved == cwd_normalized:
        return False

    return resolved.startswith(cwd_normalized + "/")


def _rm_targets(tokens: list[str]) -> list[str]:
    targets: list[str] = []
    after_double_dash = False
    for tok in tokens[1:]:
        if after_double_dash:
            targets.append(tok)
            continue
        if tok == "--":
            after_double_dash = True
            continue
        if tok.startswith("-") and tok != "-":
            continue
        targets.append(tok)
    return targets


def _is_temp_path(path: str, *, allow_tmpdir_var: bool) -> bool:
    if path.startswith("/"):
        normalized = posixpath.normpath(path)
        return (
            normalized == "/tmp"
            or normalized.startswith("/tmp/")
            or normalized == "/var/tmp"
            or normalized.startswith("/var/tmp/")
        )

    if not allow_tmpdir_var:
        return False

    for prefix in ("$TMPDIR", "${TMPDIR}"):
        if path == prefix:
            return True
        if path.startswith(prefix + "/"):
            rest = path[len(prefix) + 1 :]
            if ".." in rest.split("/"):
                return False
            return True

    return False


def _is_root_or_home_path(path: str) -> bool:
    return (
        path == "/"
        or (path.startswith("/") and posixpath.normpath(path) == "/")
        or path == "~"
        or path.startswith("~/")
        or path == "$HOME"
        or path.startswith("$HOME/")
        or path.startswith("${HOME}")
    )
