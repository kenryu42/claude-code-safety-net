#!/usr/bin/env bun

import { $ } from "bun";

export const EXCLUDED_AUTHORS = [
	"actions-user",
	"github-actions[bot]",
	"kenryu42",
];
export const REPO =
	process.env.GITHUB_REPOSITORY ?? "kenryu42/claude-code-safety-net";

export async function getLatestReleasedTag(): Promise<string | null> {
	try {
		const tag =
			await $`gh release list --exclude-drafts --exclude-pre-releases --limit 1 --json tagName --jq '.[0].tagName // empty'`.text();
		return tag.trim() || null;
	} catch {
		return null;
	}
}

export async function generateChangelog(
	previousTag: string,
): Promise<string[]> {
	const notes: string[] = [];

	try {
		const log =
			await $`git log ${previousTag}..HEAD --oneline --format="%h %s"`.text();
		const commits = log
			.split("\n")
			.filter(
				(line) =>
					line && !line.match(/^\w+ (ignore:|test:|chore:|ci:|release:)/i),
			);

		for (const commit of commits) {
			notes.push(`- ${commit}`);
		}
	} catch {
		// No commits found
	}

	return notes;
}

export async function getContributors(previousTag: string): Promise<string[]> {
	const notes: string[] = [];

	try {
		const compare =
			await $`gh api "/repos/${REPO}/compare/${previousTag}...HEAD" --jq '.commits[] | {login: .author.login, message: .commit.message}'`.text();
		const contributors = new Map<string, string[]>();

		for (const line of compare.split("\n").filter(Boolean)) {
			const { login, message } = JSON.parse(line) as {
				login: string | null;
				message: string;
			};
			const title = message.split("\n")[0] ?? "";
			if (title.match(/^(ignore:|test:|chore:|ci:|release:)/i)) continue;

			if (login && !EXCLUDED_AUTHORS.includes(login)) {
				if (!contributors.has(login)) contributors.set(login, []);
				contributors.get(login)?.push(title);
			}
		}

		if (contributors.size > 0) {
			notes.push("");
			notes.push(
				`**Thank you to ${contributors.size} community contributor${contributors.size > 1 ? "s" : ""}:**`,
			);
			for (const [username, userCommits] of contributors) {
				notes.push(`- @${username}:`);
				for (const commit of userCommits) {
					notes.push(`  - ${commit}`);
				}
			}
		}
	} catch {
		// Failed to fetch contributors
	}

	return notes;
}

async function main(): Promise<void> {
	const previousTag = await getLatestReleasedTag();

	if (!previousTag) {
		console.log("Initial release");
		return;
	}

	const changelog = await generateChangelog(previousTag);
	const contributors = await getContributors(previousTag);
	const notes = [...changelog, ...contributors];

	if (notes.length === 0) {
		console.log("No notable changes");
	} else {
		console.log(notes.join("\n"));
	}
}

if (import.meta.main) {
	main();
}
