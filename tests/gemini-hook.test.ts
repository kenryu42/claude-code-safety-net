import { describe, expect, test } from "bun:test";

async function runGeminiHook(
	input: object,
): Promise<{ stdout: string; stderr: string; exitCode: number }> {
	const proc = Bun.spawn(["bun", "src/bin/cc-safety-net.ts", "-gc"], {
		stdin: "pipe",
		stdout: "pipe",
		stderr: "pipe",
	});
	proc.stdin.write(JSON.stringify(input));
	proc.stdin.end();
	const stdoutPromise = new Response(proc.stdout).text();
	const stderrPromise = new Response(proc.stderr).text();
	const [stdout, stderr] = await Promise.all([stdoutPromise, stderrPromise]);
	const exitCode = await proc.exited;
	return { stdout: stdout.trim(), stderr: stderr.trim(), exitCode };
}

describe("Gemini CLI hook", () => {
	describe("input parsing", () => {
		test("blocks rm -rf via run_shell_command", async () => {
			const input = {
				hook_event_name: "BeforeTool",
				tool_name: "run_shell_command",
				tool_input: { command: "rm -rf /" },
			};
			const { stdout, exitCode } = await runGeminiHook(input);
			expect(exitCode).toBe(0);
			const output = JSON.parse(stdout);
			expect(output.decision).toBe("deny");
			expect(output.reason).toContain("rm -rf");
		});

		test("allows safe commands (no output)", async () => {
			const input = {
				hook_event_name: "BeforeTool",
				tool_name: "run_shell_command",
				tool_input: { command: "ls -la" },
			};
			const { stdout, exitCode } = await runGeminiHook(input);
			expect(exitCode).toBe(0);
			expect(stdout).toBe(""); // No output means allowed
		});

		test("ignores non-BeforeTool events", async () => {
			const input = {
				hook_event_name: "AfterTool",
				tool_name: "run_shell_command",
				tool_input: { command: "rm -rf /" },
			};
			const { stdout, exitCode } = await runGeminiHook(input);
			expect(exitCode).toBe(0);
			expect(stdout).toBe(""); // Ignored, not blocked
		});

		test("ignores non-shell tools", async () => {
			const input = {
				hook_event_name: "BeforeTool",
				tool_name: "write_file",
				tool_input: { path: "/etc/passwd" },
			};
			const { stdout, exitCode } = await runGeminiHook(input);
			expect(exitCode).toBe(0);
			expect(stdout).toBe(""); // Ignored, not blocked
		});
	});

	describe("output format", () => {
		test("outputs Gemini format with decision: deny", async () => {
			const input = {
				hook_event_name: "BeforeTool",
				tool_name: "run_shell_command",
				tool_input: { command: "git reset --hard" },
			};
			const { stdout, exitCode } = await runGeminiHook(input);
			expect(exitCode).toBe(0);
			const output = JSON.parse(stdout);
			expect(output).toHaveProperty("decision", "deny");
			expect(output).toHaveProperty("reason");
			expect(output.reason).toContain("git reset --hard");
		});
	});
});
