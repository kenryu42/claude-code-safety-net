import { tmpdir } from "node:os";
import {
	type AnalyzeOptions,
	type AnalyzeResult,
	type Config,
	DANGEROUS_PATTERNS,
	INTERPRETERS,
	MAX_RECURSION_DEPTH,
	PARANOID_INTERPRETERS_SUFFIX,
	SHELL_WRAPPERS,
} from "../types.ts";
import { loadConfig } from "./config.ts";
import { checkCustomRules } from "./rules-custom.ts";
import { analyzeGit } from "./rules-git.ts";
import { analyzeRm, isHomeDirectory } from "./rules-rm.ts";
import {
	getBasename,
	normalizeCommandToken,
	splitShellCommands,
	stripEnvAssignmentsWithInfo,
	stripWrappers,
	stripWrappersWithInfo,
} from "./shell.ts";

const REASON_FIND_DELETE =
	"find -delete permanently removes files. Use -print first to preview.";
const REASON_XARGS_RM =
	"xargs rm -rf with dynamic input is dangerous. Use explicit file list instead.";
const REASON_XARGS_SHELL =
	"xargs with shell -c can execute arbitrary commands from dynamic input.";
const REASON_PARALLEL_RM =
	"parallel rm -rf with dynamic input is dangerous. Use explicit file list instead.";
const REASON_PARALLEL_SHELL =
	"parallel with shell -c can execute arbitrary commands from dynamic input.";
const REASON_INTERPRETER_DANGEROUS =
	"Detected potentially dangerous command in interpreter code.";
const REASON_INTERPRETER_BLOCKED =
	"Interpreter one-liners are blocked in paranoid mode.";
const REASON_RM_HOME_CWD =
	"rm -rf in home directory is dangerous. Change to a project directory first.";

const REASON_STRICT_UNPARSEABLE =
	"Command could not be safely analyzed (strict mode). Verify manually.";

export function analyzeCommand(
	command: string,
	options: AnalyzeOptions = {},
): AnalyzeResult | null {
	const config = options.config ?? loadConfig(options.cwd);
	return analyzeCommandInternal(command, 0, { ...options, config });
}

function analyzeCommandInternal(
	command: string,
	depth: number,
	options: AnalyzeOptions & { config: Config },
): AnalyzeResult | null {
	if (depth >= MAX_RECURSION_DEPTH) {
		return null;
	}

	const segments = splitShellCommands(command);

	// Strict mode: block if command couldn't be parsed (unclosed quotes, etc.)
	// Detected when splitShellCommands returns a single segment containing the raw command
	if (
		options.strict &&
		segments.length === 1 &&
		segments[0]?.length === 1 &&
		segments[0][0] === command &&
		command.includes(" ")
	) {
		return { reason: REASON_STRICT_UNPARSEABLE, segment: command };
	}

	const originalCwd = options.cwd;
	let effectiveCwd: string | null | undefined = options.cwd;

	for (const segment of segments) {
		const segmentStr = segment.join(" ");

		if (segment.length === 1 && segment[0]?.includes(" ")) {
			const textReason = dangerousInText(segment[0]);
			if (textReason) {
				return { reason: textReason, segment: segmentStr };
			}
			if (segmentChangesCwd(segment)) {
				effectiveCwd = null;
			}
			continue;
		}

		const reason = analyzeSegment(segment, depth, {
			...options,
			cwd: originalCwd,
			effectiveCwd,
		});
		if (reason) {
			return { reason, segment: segmentStr };
		}

		if (segmentChangesCwd(segment)) {
			effectiveCwd = null;
		}
	}

	return null;
}

const CWD_CHANGE_REGEX =
	/^\s*(?:\$\(\s*)?[({]*\s*(?:command\s+|builtin\s+)?(?:cd|pushd|popd)(?:\s|$)/;

function segmentChangesCwd(segment: string[]): boolean {
	const stripped = stripLeadingGrouping(segment);
	const unwrapped = stripWrappers(stripped);

	if (unwrapped.length === 0) {
		return false;
	}

	let head = unwrapped[0] ?? "";
	if (head === "builtin" && unwrapped.length > 1) {
		head = unwrapped[1] ?? "";
	}

	if (head === "cd" || head === "pushd" || head === "popd") {
		return true;
	}

	const joined = segment.join(" ");
	return CWD_CHANGE_REGEX.test(joined);
}

function stripLeadingGrouping(tokens: string[]): string[] {
	let i = 0;
	while (i < tokens.length) {
		const token = tokens[i];
		if (token === "{" || token === "(" || token === "$(") {
			i++;
		} else {
			break;
		}
	}
	return tokens.slice(i);
}

function analyzeSegment(
	tokens: string[],
	depth: number,
	options: AnalyzeOptions & { config: Config },
): string | null {
	if (tokens.length === 0) {
		return null;
	}

	const { tokens: strippedEnv, envAssignments: leadingEnvAssignments } =
		stripEnvAssignmentsWithInfo(tokens);
	const { tokens: stripped, envAssignments: wrapperEnvAssignments } =
		stripWrappersWithInfo(strippedEnv);

	const envAssignments = new Map(leadingEnvAssignments);
	for (const [k, v] of wrapperEnvAssignments) {
		envAssignments.set(k, v);
	}

	if (stripped.length === 0) {
		return null;
	}

	const head = stripped[0];
	if (!head) {
		return null;
	}

	const normalizedHead = normalizeCommandToken(head);
	const basename = getBasename(head);

	if (SHELL_WRAPPERS.has(normalizedHead)) {
		const dashCArg = extractDashCArg(stripped);
		if (dashCArg) {
			return (
				analyzeCommandInternal(dashCArg, depth + 1, options)?.reason ?? null
			);
		}
	}

	if (INTERPRETERS.has(normalizedHead)) {
		const codeArg = extractInterpreterCodeArg(stripped);
		if (codeArg) {
			if (options.paranoidInterpreters) {
				return REASON_INTERPRETER_BLOCKED + PARANOID_INTERPRETERS_SUFFIX;
			}

			const innerResult = analyzeCommandInternal(codeArg, depth + 1, options);
			if (innerResult) {
				return innerResult.reason;
			}

			if (containsDangerousCode(codeArg)) {
				return REASON_INTERPRETER_DANGEROUS;
			}
		}
	}

	if (normalizedHead === "busybox" && stripped.length > 1) {
		return analyzeSegment(stripped.slice(1), depth, options);
	}

	if (basename.toLowerCase() === "git") {
		const gitResult = analyzeGit(stripped);
		if (gitResult) {
			return gitResult;
		}
		// Check custom rules for git commands (only at top level)
		if (depth === 0) {
			const customResult = checkCustomRules(stripped, options.config.rules);
			if (customResult) {
				return customResult;
			}
		}
		return null;
	}

	if (basename === "rm") {
		const cwdUnknown = options.effectiveCwd === null;
		const cwdForRm = cwdUnknown
			? undefined
			: (options.effectiveCwd ?? options.cwd);
		const originalCwd = cwdUnknown ? undefined : options.cwd;
		if (cwdForRm && isHomeDirectory(cwdForRm)) {
			if (hasRecursiveForceFlags(stripped)) {
				return REASON_RM_HOME_CWD;
			}
		}
		const allowTmpdirVar = !isTmpdirOverriddenToNonTemp(envAssignments);
		const rmResult = analyzeRm(stripped, {
			cwd: cwdForRm,
			originalCwd,
			paranoid: options.paranoidRm,
			allowTmpdirVar,
		});
		if (rmResult) {
			return rmResult;
		}
		// Check custom rules for rm commands (only at top level)
		if (depth === 0) {
			const customResult = checkCustomRules(stripped, options.config.rules);
			if (customResult) {
				return customResult;
			}
		}
		return null;
	}

	if (basename === "find") {
		const findResult = analyzeFind(stripped);
		if (findResult) {
			return findResult;
		}
		// Check custom rules for find commands (only at top level)
		if (depth === 0) {
			const customResult = checkCustomRules(stripped, options.config.rules);
			if (customResult) {
				return customResult;
			}
		}
		return null;
	}

	if (basename === "xargs") {
		const xargsResult = analyzeXargs(stripped, depth, options, envAssignments);
		if (xargsResult) {
			return xargsResult;
		}
		// Check custom rules for xargs commands (only at top level)
		if (depth === 0) {
			const customResult = checkCustomRules(stripped, options.config.rules);
			if (customResult) {
				return customResult;
			}
		}
		return null;
	}

	if (basename === "parallel") {
		const parallelResult = analyzeParallel(
			stripped,
			depth,
			options,
			envAssignments,
		);
		if (parallelResult) {
			return parallelResult;
		}
		// Check custom rules for parallel commands (only at top level)
		if (depth === 0) {
			const customResult = checkCustomRules(stripped, options.config.rules);
			if (customResult) {
				return customResult;
			}
		}
		return null;
	}

	// Fallback: scan tokens for embedded git/rm/find commands
	// This catches cases like "command -px git reset --hard" where the head
	// token is not a known command but contains dangerous commands later
	// Skip for display-only commands that don't execute their arguments
	const DISPLAY_COMMANDS = new Set([
		"echo",
		"printf",
		"cat",
		"head",
		"tail",
		"less",
		"more",
		"grep",
		"rg",
		"ag",
		"ack",
		"sed",
		"awk",
		"cut",
		"tr",
		"sort",
		"uniq",
		"wc",
		"tee",
		"man",
		"help",
		"info",
		"type",
		"which",
		"whereis",
		"whatis",
		"apropos",
		"file",
		"stat",
		"ls",
		"ll",
		"dir",
		"tree",
		"pwd",
		"date",
		"cal",
		"uptime",
		"whoami",
		"id",
		"groups",
		"hostname",
		"uname",
		"env",
		"printenv",
		"set",
		"export",
		"alias",
		"history",
		"jobs",
		"fg",
		"bg",
		"test",
		"true",
		"false",
		"read",
		"return",
		"exit",
		"break",
		"continue",
		"shift",
		"wait",
		"trap",
		"basename",
		"dirname",
		"realpath",
		"readlink",
		"md5sum",
		"sha256sum",
		"base64",
		"xxd",
		"od",
		"hexdump",
		"strings",
		"diff",
		"cmp",
		"comm",
		"join",
		"paste",
		"column",
		"fmt",
		"fold",
		"nl",
		"pr",
		"expand",
		"unexpand",
		"rev",
		"tac",
		"shuf",
		"seq",
		"yes",
		"timeout",
		"time",
		"sleep",
		"watch",
		"logger",
		"write",
		"wall",
		"mesg",
		"notify-send",
	]);
	if (!DISPLAY_COMMANDS.has(normalizedHead)) {
		for (let i = 1; i < stripped.length; i++) {
			const token = stripped[i];
			if (!token) continue;

			const cmd = normalizeCommandToken(token);
			if (cmd === "rm") {
				const rmTokens = ["rm", ...stripped.slice(i + 1)];
				const cwdUnknown = options.effectiveCwd === null;
				const cwdForRm = cwdUnknown
					? undefined
					: (options.effectiveCwd ?? options.cwd);
				const originalCwd = cwdUnknown ? undefined : options.cwd;
				const allowTmpdirVar = !isTmpdirOverriddenToNonTemp(envAssignments);
				const reason = analyzeRm(rmTokens, {
					cwd: cwdForRm,
					originalCwd,
					paranoid: options.paranoidRm,
					allowTmpdirVar,
				});
				if (reason) {
					return reason;
				}
			}
			if (cmd === "git") {
				const gitTokens = ["git", ...stripped.slice(i + 1)];
				const reason = analyzeGit(gitTokens);
				if (reason) {
					return reason;
				}
			}
			if (cmd === "find") {
				const findTokens = ["find", ...stripped.slice(i + 1)];
				const reason = analyzeFind(findTokens);
				if (reason) {
					return reason;
				}
			}
		}
	}

	const customResult = checkCustomRules(stripped, options.config.rules);
	if (customResult) {
		return customResult;
	}

	return null;
}

function dangerousInText(text: string): string | null {
	const t = text.toLowerCase();
	const stripped = t.trimStart();
	const isEchoOrRg = stripped.startsWith("echo ") || stripped.startsWith("rg ");

	const patterns: Array<{
		regex: RegExp;
		reason: string;
		skipForEchoRg?: boolean;
		caseSensitive?: boolean;
	}> = [
		{
			regex:
				/\brm\s+(-[^\s]*r[^\s]*\s+-[^\s]*f|-[^\s]*f[^\s]*\s+-[^\s]*r|-[^\s]*rf|-[^\s]*fr)\b/,
			reason: "rm -rf",
		},
		{
			regex: /\bgit\s+reset\s+--hard\b/,
			reason: "git reset --hard",
		},
		{
			regex: /\bgit\s+reset\s+--merge\b/,
			reason: "git reset --merge",
		},
		{
			regex: /\bgit\s+clean\s+(-[^\s]*f|-f)\b/,
			reason: "git clean -f",
		},
		{
			regex: /\bgit\s+push\s+[^|;]*(-f\b|--force\b)(?!-with-lease)/,
			reason: "git push --force (use --force-with-lease instead)",
		},
		{
			regex: /\bgit\s+branch\s+-D\b/,
			reason: "git branch -D",
			caseSensitive: true,
		},
		{
			regex: /\bgit\s+stash\s+(drop|clear)\b/,
			reason: "git stash drop/clear",
		},
		{
			regex: /\bgit\s+checkout\s+--\s/,
			reason: "git checkout --",
		},
		{
			regex: /\bgit\s+restore\b(?!.*--(staged|help))/,
			reason: "git restore (without --staged)",
		},
		{
			regex: /\bfind\b[^\n;|&]*\s-delete\b/,
			reason: "find -delete",
			skipForEchoRg: true,
		},
	];

	for (const { regex, reason, skipForEchoRg, caseSensitive } of patterns) {
		if (skipForEchoRg && isEchoOrRg) continue;
		const target = caseSensitive ? text : t;
		if (regex.test(target)) {
			return reason;
		}
	}
	return null;
}

function extractDashCArg(tokens: string[]): string | null {
	for (let i = 1; i < tokens.length; i++) {
		const token = tokens[i];
		if (!token) continue;

		if (token === "-c" && tokens[i + 1]) {
			return tokens[i + 1] ?? null;
		}

		if (
			token.startsWith("-") &&
			token.includes("c") &&
			!token.startsWith("--")
		) {
			const nextToken = tokens[i + 1];
			if (nextToken && !nextToken.startsWith("-")) {
				return nextToken;
			}
		}
	}
	return null;
}

function extractInterpreterCodeArg(tokens: string[]): string | null {
	for (let i = 1; i < tokens.length; i++) {
		const token = tokens[i];
		if (!token) continue;

		if ((token === "-c" || token === "-e") && tokens[i + 1]) {
			return tokens[i + 1] ?? null;
		}
	}
	return null;
}

function containsDangerousCode(code: string): boolean {
	for (const pattern of DANGEROUS_PATTERNS) {
		if (pattern.test(code)) {
			return true;
		}
	}
	return false;
}

function hasRecursiveForceFlags(tokens: string[]): boolean {
	let hasRecursive = false;
	let hasForce = false;

	for (const token of tokens) {
		if (token === "--") break;

		if (token === "-r" || token === "-R" || token === "--recursive") {
			hasRecursive = true;
		} else if (token === "-f" || token === "--force") {
			hasForce = true;
		} else if (token.startsWith("-") && !token.startsWith("--")) {
			if (token.includes("r") || token.includes("R")) hasRecursive = true;
			if (token.includes("f")) hasForce = true;
		}
	}

	return hasRecursive && hasForce;
}

function isTmpdirOverriddenToNonTemp(
	envAssignments: Map<string, string>,
): boolean {
	if (!envAssignments.has("TMPDIR")) {
		return false;
	}
	const tmpdirValue = envAssignments.get("TMPDIR") ?? "";

	// Empty TMPDIR is dangerous: $TMPDIR/foo expands to /foo
	if (tmpdirValue === "") {
		return true;
	}

	// Check if it's a known temp path (exact match or subpath)
	const sysTmpdir = tmpdir();
	if (
		isPathOrSubpath(tmpdirValue, "/tmp") ||
		isPathOrSubpath(tmpdirValue, "/var/tmp") ||
		isPathOrSubpath(tmpdirValue, sysTmpdir)
	) {
		return false;
	}
	return true;
}

/**
 * Check if a path equals or is a subpath of basePath.
 * E.g., isPathOrSubpath("/tmp/foo", "/tmp") → true
 *       isPathOrSubpath("/tmp-malicious", "/tmp") → false
 */
function isPathOrSubpath(path: string, basePath: string): boolean {
	if (path === basePath) {
		return true;
	}
	// Ensure basePath ends with / for proper prefix matching
	const baseWithSlash = basePath.endsWith("/") ? basePath : `${basePath}/`;
	return path.startsWith(baseWithSlash);
}

function analyzeFind(tokens: string[]): string | null {
	// Check for -delete outside of -exec/-execdir blocks
	if (findHasDelete(tokens.slice(1))) {
		return REASON_FIND_DELETE;
	}

	// Check all -exec and -execdir blocks for dangerous commands
	for (let i = 0; i < tokens.length; i++) {
		const token = tokens[i];
		if (token === "-exec" || token === "-execdir") {
			const execTokens = tokens.slice(i + 1);
			const semicolonIdx = execTokens.indexOf(";");
			const plusIdx = execTokens.indexOf("+");
			// If no terminator found, shell-quote may have parsed it as an operator
			// In that case, treat the rest of the tokens as the exec command
			const endIdx =
				semicolonIdx !== -1 && plusIdx !== -1
					? Math.min(semicolonIdx, plusIdx)
					: semicolonIdx !== -1
						? semicolonIdx
						: plusIdx !== -1
							? plusIdx
							: execTokens.length; // No terminator - use all remaining tokens

			let execCommand = execTokens.slice(0, endIdx);
			// Strip wrappers (env, sudo, command)
			execCommand = stripWrappers(execCommand);
			if (execCommand.length > 0) {
				let head = getBasename(execCommand[0] ?? "");
				// Handle busybox wrapper
				if (head === "busybox" && execCommand.length > 1) {
					execCommand = execCommand.slice(1);
					head = getBasename(execCommand[0] ?? "");
				}
				if (head === "rm" && hasRecursiveForceFlags(execCommand)) {
					return "find -exec rm -rf is dangerous. Use explicit file list instead.";
				}
			}
		}
	}

	return null;
}

/**
 * Check if find command has -delete action (not as argument to another option).
 * Handles cases like "find -name -delete" where -delete is a filename pattern.
 */
function findHasDelete(tokens: string[]): boolean {
	let i = 0;
	let insideExec = false;
	let execDepth = 0;

	while (i < tokens.length) {
		const token = tokens[i];
		if (!token) {
			i++;
			continue;
		}

		// Track -exec/-execdir blocks
		if (token === "-exec" || token === "-execdir") {
			insideExec = true;
			execDepth++;
			i++;
			continue;
		}

		// End of -exec block
		if (insideExec && (token === ";" || token === "+")) {
			execDepth--;
			if (execDepth === 0) {
				insideExec = false;
			}
			i++;
			continue;
		}

		// Skip -delete inside -exec blocks
		if (insideExec) {
			i++;
			continue;
		}

		// Options that take an argument - skip the next token
		if (
			token === "-name" ||
			token === "-iname" ||
			token === "-path" ||
			token === "-ipath" ||
			token === "-regex" ||
			token === "-iregex" ||
			token === "-type" ||
			token === "-user" ||
			token === "-group" ||
			token === "-perm" ||
			token === "-size" ||
			token === "-mtime" ||
			token === "-ctime" ||
			token === "-atime" ||
			token === "-newer" ||
			token === "-printf" ||
			token === "-fprint" ||
			token === "-fprintf"
		) {
			i += 2; // Skip option and its argument
			continue;
		}

		// Found -delete outside of -exec and not as an argument
		if (token === "-delete") {
			return true;
		}

		i++;
	}

	return false;
}

function analyzeXargs(
	tokens: string[],
	_depth: number,
	options: AnalyzeOptions & { config: Config },
	envAssignments: Map<string, string>,
): string | null {
	const { childTokens: rawChildTokens } =
		extractXargsChildCommandWithInfo(tokens);

	let childTokens = stripWrappers(rawChildTokens);

	if (childTokens.length === 0) {
		return null;
	}

	let head = getBasename(childTokens[0] ?? "").toLowerCase();

	if (head === "busybox" && childTokens.length > 1) {
		childTokens = childTokens.slice(1);
		head = getBasename(childTokens[0] ?? "").toLowerCase();
	}

	// Check for shell wrapper with -c
	if (SHELL_WRAPPERS.has(head)) {
		// xargs bash -c is always dangerous - stdin feeds into the shell execution
		// Either no script arg (stdin IS the script) or script with dynamic input
		return REASON_XARGS_SHELL;
	}

	const allowTmpdirVar = !isTmpdirOverriddenToNonTemp(envAssignments);
	if (head === "rm" && hasRecursiveForceFlags(childTokens)) {
		const cwdUnknown = options.effectiveCwd === null;
		const cwdForRm = cwdUnknown
			? undefined
			: (options.effectiveCwd ?? options.cwd);
		const originalCwd = cwdUnknown ? undefined : options.cwd;
		const rmResult = analyzeRm(childTokens, {
			cwd: cwdForRm,
			originalCwd,
			paranoid: options.paranoidRm,
			allowTmpdirVar,
		});
		if (rmResult) {
			return rmResult;
		}
		// Even if analyzeRm passes (e.g., temp paths), xargs rm -rf is still dangerous
		// because stdin provides dynamic input
		return REASON_XARGS_RM;
	}

	if (head === "find") {
		const findResult = analyzeFind(childTokens);
		if (findResult) {
			return findResult;
		}
	}

	if (head === "git") {
		const gitResult = analyzeGit(childTokens);
		if (gitResult) {
			return gitResult;
		}
	}

	return null;
}

interface XargsParseResult {
	childTokens: string[];
	replacementToken: string | null;
}

function extractXargsChildCommandWithInfo(tokens: string[]): XargsParseResult {
	// Options that take a value as the next token
	const xargsOptsWithValue = new Set([
		"-L",
		"-n",
		"-P",
		"-s",
		"-a",
		"-E",
		"-e",
		"-d",
		"-J",
		"--max-args",
		"--max-procs",
		"--max-chars",
		"--arg-file",
		"--eof",
		"--delimiter",
		"--max-lines",
	]);

	let replacementToken: string | null = null;
	let i = 1;

	while (i < tokens.length) {
		const token = tokens[i];
		if (!token) break;

		if (token === "--") {
			return { childTokens: tokens.slice(i + 1), replacementToken };
		}

		if (token.startsWith("-")) {
			// Handle -I (replacement option)
			if (token === "-I") {
				// -I TOKEN - next arg is the token
				replacementToken = tokens[i + 1] ?? "{}";
				i += 2;
				continue;
			}
			if (token.startsWith("-I") && token.length > 2) {
				// -ITOKEN - token is attached
				replacementToken = token.slice(2);
				i++;
				continue;
			}

			// Handle --replace option
			// In GNU xargs, --replace takes an optional argument via =
			// --replace alone uses {}, --replace=FOO uses FOO
			if (token === "--replace") {
				// --replace (defaults to {})
				replacementToken = "{}";
				i++;
				continue;
			}
			if (token.startsWith("--replace=")) {
				// --replace=TOKEN or --replace= (empty defaults to {})
				const value = token.slice("--replace=".length);
				replacementToken = value === "" ? "{}" : value;
				i++;
				continue;
			}

			// Handle -J (macOS xargs replacement, consumes value)
			if (token === "-J") {
				// -J just consumes its value, doesn't enable placeholder mode for analysis
				i += 2;
				continue;
			}

			if (xargsOptsWithValue.has(token)) {
				i += 2;
			} else if (token.startsWith("--") && token.includes("=")) {
				i++;
			} else if (
				token.startsWith("-L") ||
				token.startsWith("-n") ||
				token.startsWith("-P") ||
				token.startsWith("-s")
			) {
				// These can have attached values like -n5
				i++;
			} else {
				// Unknown option, skip it
				i++;
			}
		} else {
			return { childTokens: tokens.slice(i), replacementToken };
		}
	}

	return { childTokens: [], replacementToken };
}

function extractXargsChildCommand(tokens: string[]): string[] {
	return extractXargsChildCommandWithInfo(tokens).childTokens;
}

function analyzeParallel(
	tokens: string[],
	depth: number,
	options: AnalyzeOptions & { config: Config },
	envAssignments: Map<string, string>,
): string | null {
	const parseResult = parseParallelCommand(tokens);

	if (!parseResult) {
		return null;
	}

	const { template, args, hasPlaceholder } = parseResult;

	if (template.length === 0) {
		// parallel ::: 'cmd1' 'cmd2' - commands mode
		// Analyze each arg as a command
		for (const arg of args) {
			const result = analyzeCommandInternal(arg, depth + 1, options);
			if (result) {
				return result.reason;
			}
		}
		return null;
	}

	let childTokens = stripWrappers([...template]);
	let head = getBasename(childTokens[0] ?? "").toLowerCase();

	if (head === "busybox" && childTokens.length > 1) {
		childTokens = childTokens.slice(1);
		head = getBasename(childTokens[0] ?? "").toLowerCase();
	}

	// Check for shell wrapper with -c
	if (SHELL_WRAPPERS.has(head)) {
		const dashCArg = extractDashCArg(childTokens);
		if (dashCArg) {
			// If script IS just the placeholder, stdin provides entire script - dangerous
			if (dashCArg === "{}" || dashCArg === "{1}") {
				return REASON_PARALLEL_SHELL;
			}
			// If script contains placeholder
			if (dashCArg.includes("{}")) {
				if (args.length > 0) {
					// Expand with actual args and analyze
					for (const arg of args) {
						const expandedScript = dashCArg.replace(/{}/g, arg);
						const result = analyzeCommandInternal(
							expandedScript,
							depth + 1,
							options,
						);
						if (result) {
							return result.reason;
						}
					}
					return null;
				}
				// Stdin mode with placeholder - analyze the script template
				// Check if the script pattern is dangerous (e.g., rm -rf {})
				const result = analyzeCommandInternal(dashCArg, depth + 1, options);
				if (result) {
					return result.reason;
				}
				return null;
			}
			// Script doesn't have placeholder - analyze it directly
			const result = analyzeCommandInternal(dashCArg, depth + 1, options);
			if (result) {
				return result.reason;
			}
			// If there's a placeholder in the shell wrapper args (not script),
			// it's still dangerous
			if (hasPlaceholder) {
				return REASON_PARALLEL_SHELL;
			}
			return null;
		}
		// bash -c without script argument
		// If there are args from :::, those become the scripts - dangerous pattern
		if (args.length > 0) {
			// The pattern of passing scripts via ::: to bash -c is inherently dangerous
			return REASON_PARALLEL_SHELL;
		}
		// Stdin provides the script - dangerous
		if (hasPlaceholder) {
			return REASON_PARALLEL_SHELL;
		}
		return null;
	}

	// For rm -rf, expand with actual args and analyze each expansion
	if (head === "rm" && hasRecursiveForceFlags(childTokens)) {
		const allowTmpdirVar = !isTmpdirOverriddenToNonTemp(envAssignments);
		const cwdUnknown = options.effectiveCwd === null;
		const cwdForRm = cwdUnknown
			? undefined
			: (options.effectiveCwd ?? options.cwd);
		const originalCwd = cwdUnknown ? undefined : options.cwd;
		if (hasPlaceholder && args.length > 0) {
			// Expand template with each arg and analyze
			for (const arg of args) {
				const expandedTokens = childTokens.map((t) => t.replace(/{}/g, arg));
				const rmResult = analyzeRm(expandedTokens, {
					cwd: cwdForRm,
					originalCwd,
					paranoid: options.paranoidRm,
					allowTmpdirVar,
				});
				if (rmResult) {
					return rmResult;
				}
			}
			return null;
		}
		// No placeholder or no args - analyze template as-is
		// If there are args (from :::), they get appended, analyze with first arg
		if (args.length > 0) {
			const expandedTokens = [...childTokens, args[0] ?? ""];
			const rmResult = analyzeRm(expandedTokens, {
				cwd: cwdForRm,
				originalCwd,
				paranoid: options.paranoidRm,
				allowTmpdirVar,
			});
			if (rmResult) {
				return rmResult;
			}
			return null;
		}
		return REASON_PARALLEL_RM;
	}

	if (head === "find") {
		const findResult = analyzeFind(childTokens);
		if (findResult) {
			return findResult;
		}
	}

	if (head === "git") {
		const gitResult = analyzeGit(childTokens);
		if (gitResult) {
			return gitResult;
		}
	}

	return null;
}

interface ParallelParseResult {
	template: string[];
	args: string[];
	hasPlaceholder: boolean;
}

function parseParallelCommand(tokens: string[]): ParallelParseResult | null {
	// Options that take a value as the next token
	const parallelOptsWithValue = new Set([
		"-S",
		"--sshlogin",
		"--slf",
		"--sshloginfile",
		"-a",
		"--arg-file",
		"--colsep",
		"-I",
		"--replace",
		"--results",
		"--result",
		"--res",
	]);

	let i = 1;
	const templateTokens: string[] = [];
	let markerIndex = -1;

	// First pass: find the ::: marker and extract template
	while (i < tokens.length) {
		const token = tokens[i];
		if (!token) break;

		if (token === ":::") {
			markerIndex = i;
			break;
		}

		if (token === "--") {
			// Everything after -- until ::: is the template
			i++;
			while (i < tokens.length) {
				const token = tokens[i];
				if (token === undefined || token === ":::") break;
				templateTokens.push(token);
				i++;
			}
			if (i < tokens.length && tokens[i] === ":::") {
				markerIndex = i;
			}
			break;
		}

		if (token.startsWith("-")) {
			// Handle -jN attached option
			if (
				token.startsWith("-j") &&
				token.length > 2 &&
				/^\d+$/.test(token.slice(2))
			) {
				i++;
				continue;
			}

			// Handle --option=value
			if (token.startsWith("--") && token.includes("=")) {
				i++;
				continue;
			}

			// Handle options that take a value
			if (parallelOptsWithValue.has(token)) {
				i += 2;
				continue;
			}

			// Handle -j as separate option
			if (token === "-j" || token === "--jobs") {
				i += 2;
				continue;
			}

			// Unknown option - skip it
			i++;
		} else {
			// Start of template
			while (i < tokens.length) {
				const token = tokens[i];
				if (token === undefined || token === ":::") break;
				templateTokens.push(token);
				i++;
			}
			if (i < tokens.length && tokens[i] === ":::") {
				markerIndex = i;
			}
			break;
		}
	}

	// Extract args after :::
	const args: string[] = [];
	if (markerIndex !== -1) {
		for (let j = markerIndex + 1; j < tokens.length; j++) {
			const token = tokens[j];
			if (token && token !== ":::") {
				args.push(token);
			}
		}
	}

	// Determine if template has placeholder
	const hasPlaceholder = templateTokens.some(
		(t) => t.includes("{}") || t.includes("{1}") || t.includes("{.}"),
	);

	// If no template and no marker, no valid parallel command
	if (templateTokens.length === 0 && markerIndex === -1) {
		return null;
	}

	return { template: templateTokens, args, hasPlaceholder };
}

function extractParallelChildCommand(tokens: string[]): string[] {
	// Legacy behavior: return everything after options until end
	// This includes ::: marker and args if present
	const parallelOptsWithValue = new Set([
		"-S",
		"--sshlogin",
		"--slf",
		"--sshloginfile",
		"-a",
		"--arg-file",
		"--colsep",
		"-I",
		"--replace",
		"--results",
		"--result",
		"--res",
	]);

	let i = 1;
	while (i < tokens.length) {
		const token = tokens[i];
		if (!token) break;

		if (token === ":::") {
			// ::: as first non-option means no template
			return [];
		}

		if (token === "--") {
			return tokens.slice(i + 1);
		}

		if (token.startsWith("-")) {
			if (
				token.startsWith("-j") &&
				token.length > 2 &&
				/^\d+$/.test(token.slice(2))
			) {
				i++;
				continue;
			}
			if (token.startsWith("--") && token.includes("=")) {
				i++;
				continue;
			}
			if (parallelOptsWithValue.has(token)) {
				i += 2;
				continue;
			}
			if (token === "-j" || token === "--jobs") {
				i += 2;
				continue;
			}
			i++;
		} else {
			// Return everything from here to end (including ::: and args)
			return tokens.slice(i);
		}
	}

	return [];
}

export { loadConfig } from "./config.ts";

/** @internal Exported for testing */
export {
	hasRecursiveForceFlags as _hasRecursiveForceFlags,
	findHasDelete as _findHasDelete,
	extractXargsChildCommand as _extractXargsChildCommand,
	extractParallelChildCommand as _extractParallelChildCommand,
	segmentChangesCwd as _segmentChangesCwd,
	extractXargsChildCommandWithInfo as _extractXargsChildCommandWithInfo,
};
