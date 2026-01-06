import type { Plugin } from "@opencode-ai/plugin";
import { analyzeCommand, loadConfig } from "./core/analyze.ts";

function envTruthy(name: string): boolean {
	const value = process.env[name];
	return value === "1" || value?.toLowerCase() === "true";
}

export const SafetyNetPlugin: Plugin = async ({ directory }) => {
	const config = loadConfig(directory);
	const strict = envTruthy("SAFETY_NET_STRICT");
	const paranoidAll = envTruthy("SAFETY_NET_PARANOID");
	const paranoidRm = paranoidAll || envTruthy("SAFETY_NET_PARANOID_RM");
	const paranoidInterpreters =
		paranoidAll || envTruthy("SAFETY_NET_PARANOID_INTERPRETERS");

	return {
		"tool.execute.before": async (input, output) => {
			if (input.tool === "bash") {
				const command = output.args.command;
				const result = analyzeCommand(command, {
					cwd: directory,
					config,
					strict,
					paranoidRm,
					paranoidInterpreters,
				});
				if (result) {
					let message = `BLOCKED by Safety Net\n\nReason: ${result.reason}`;

					const excerpt =
						command.length > 200 ? `${command.slice(0, 200)}...` : command;
					message += `\n\nCommand: ${excerpt}`;

					if (result.segment && result.segment !== command) {
						const segmentExcerpt =
							result.segment.length > 200
								? `${result.segment.slice(0, 200)}...`
								: result.segment;
						message += `\n\nSegment: ${segmentExcerpt}`;
					}

					message +=
						"\n\nIf this operation is truly needed, ask the user for explicit permission and have them run the command manually.";

					throw new Error(message);
				}
			}
		},
	};
};
