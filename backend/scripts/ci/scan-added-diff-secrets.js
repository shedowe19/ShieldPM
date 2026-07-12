import { spawn } from "node:child_process";
import { resolve } from "node:path";
import { createInterface } from "node:readline";
import { fileURLToPath } from "node:url";

const tokenPattern =
	/(AKIA[0-9A-Z]{16}|gh[pousr]_[A-Za-z0-9_]{36,}|github_pat_[A-Za-z0-9_]{20,}|xox[baprs]-[A-Za-z0-9-]{10,}|-----BEGIN (RSA|EC|OPENSSH|DSA) PRIVATE KEY-----)/;

export const addedLinesFromDiff = (diff) => {
	const parseAddedLine = createAddedLineParser();

	return diff.split("\n").flatMap((line) => {
		const addedLine = parseAddedLine(line);
		return addedLine === null ? [] : [addedLine];
	});
};

export const containsRecognizedToken = (content) => tokenPattern.test(content);

const createAddedLineParser = () => {
	let inHunk = false;

	return (line) => {
		if (line.startsWith("diff --git ")) {
			inHunk = false;
			return null;
		}

		if (line.startsWith("@@ ")) {
			inHunk = true;
			return null;
		}

		return inHunk && line.startsWith("+") ? line.slice(1) : null;
	};
};

export const containsRecognizedTokenInDiff = async (readable) => {
	const parseAddedLine = createAddedLineParser();
	const lines = createInterface({
		input: readable,
		crlfDelay: Number.POSITIVE_INFINITY,
	});
	let recognizedTokenFound = false;

	for await (const line of lines) {
		const addedLine = parseAddedLine(line);
		if (addedLine && containsRecognizedToken(addedLine)) {
			recognizedTokenFound = true;
		}
	}

	return recognizedTokenFound;
};

const main = async () => {
	const baseSha = process.argv[2];

	if (!baseSha) {
		console.error("Usage: node backend/scripts/ci/scan-added-diff-secrets.js <base-sha>");
		process.exitCode = 2;
		return;
	}

	const diff = spawn("git", ["diff", "--unified=0", baseSha, "HEAD"], {
		stdio: ["ignore", "pipe", "inherit"],
	});
	const close = new Promise((resolve, reject) => {
		diff.once("error", reject);
		diff.once("close", resolve);
	});
	const recognizedTokenFound = await containsRecognizedTokenInDiff(diff.stdout);
	const exitCode = await close;

	if (exitCode !== 0) {
		process.exitCode = exitCode || 1;
		return;
	}

	if (recognizedTokenFound) {
		console.error("Potentially exposed credential format found in added diff lines.");
		process.exitCode = 1;
	}
};

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
	main().catch((error) => {
		console.error(`Unable to scan added diff lines: ${error.message}`);
		process.exitCode = 1;
	});
}
