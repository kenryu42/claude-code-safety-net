#!/usr/bin/env node
import { analyzeCommand, loadConfig } from "../core/analyze.ts";
import { redactSecrets, writeAuditLog } from "../core/audit.ts";
import { envTruthy } from "../core/env.ts";
import { formatBlockedMessage } from "../core/format.ts";
import { verifyConfig } from "../core/verify-config.ts";
import type { HookInput, HookOutput } from "../types.ts";

const VERSION = "0.4.0";

function printHelp(): void {
	console.log(`cc-safety-net v${VERSION}

Blocks destructive git and filesystem commands before execution.

USAGE:
  cc-safety-net -cc, --claude-code      Run as Claude Code PreToolUse hook (reads JSON from stdin)
  cc-safety-net -vc, --verify-config    Validate config files
  cc-safety-net -h,  --help             Show this help
  cc-safety-net -V,  --version          Show version

ENVIRONMENT VARIABLES:
  SAFETY_NET_STRICT=1             Fail-closed on unparseable commands
  SAFETY_NET_PARANOID=1           Enable all paranoid checks
  SAFETY_NET_PARANOID_RM=1        Block non-temp rm -rf within cwd
  SAFETY_NET_PARANOID_INTERPRETERS=1  Block interpreter one-liners

CONFIG FILES:
  ~/.cc-safety-net/config.json    User-scope config
  .safety-net.json                Project-scope config`);
}

function printVersion(): void {
	console.log(VERSION);
}

async function handleCliFlags(): Promise<boolean> {
	const args = process.argv.slice(2);

	if (args.length === 0 || args.includes("--help") || args.includes("-h")) {
		printHelp();
		process.exit(0);
	}

	if (args.includes("--version") || args.includes("-V")) {
		printVersion();
		process.exit(0);
	}

	if (args.includes("--verify-config") || args.includes("-vc")) {
		process.exit(verifyConfig());
	}

	if (args.includes("--claude-code") || args.includes("-cc")) {
		return true;
	}

	console.error(`Unknown option: ${args[0]}`);
	console.error("Run 'cc-safety-net --help' for usage.");
	process.exit(1);
}

async function runClaudeCodeHook(): Promise<void> {
	const chunks: Buffer[] = [];

	for await (const chunk of process.stdin) {
		chunks.push(chunk as Buffer);
	}

	const inputText = Buffer.concat(chunks).toString("utf-8").trim();

	if (!inputText) {
		return;
	}

	let input: HookInput;
	try {
		input = JSON.parse(inputText) as HookInput;
	} catch {
		if (envTruthy("SAFETY_NET_STRICT")) {
			outputDeny("Failed to parse hook input JSON (strict mode)");
		}
		return;
	}

	if (input.tool_name !== "Bash") {
		return;
	}

	const command = input.tool_input?.command;
	if (!command) {
		return;
	}

	const cwd = input.cwd ?? process.cwd();
	const strict = envTruthy("SAFETY_NET_STRICT");
	const paranoidAll = envTruthy("SAFETY_NET_PARANOID");
	const paranoidRm = paranoidAll || envTruthy("SAFETY_NET_PARANOID_RM");
	const paranoidInterpreters =
		paranoidAll || envTruthy("SAFETY_NET_PARANOID_INTERPRETERS");

	const config = loadConfig(cwd);

	const result = analyzeCommand(command, {
		cwd,
		config,
		strict,
		paranoidRm,
		paranoidInterpreters,
	});

	if (result) {
		const sessionId = input.session_id;
		if (sessionId) {
			writeAuditLog(sessionId, command, result.segment, result.reason, cwd);
		}
		outputDeny(result.reason, command, result.segment);
	}
}

function outputDeny(reason: string, command?: string, segment?: string): void {
	const message = formatBlockedMessage({
		reason,
		command,
		segment,
		redact: redactSecrets,
	});

	const output: HookOutput = {
		hookSpecificOutput: {
			hookEventName: "PreToolUse",
			permissionDecision: "deny",
			permissionDecisionReason: message,
		},
	};

	console.log(JSON.stringify(output));
}

async function main(): Promise<void> {
	await handleCliFlags();
	await runClaudeCodeHook();
}

main().catch((error: unknown) => {
	console.error("Safety Net error:", error);
	process.exit(1);
});
