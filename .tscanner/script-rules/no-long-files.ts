#!/usr/bin/env npx tsx

import fs from "node:fs";

const MAX_LINES = 1500;

// Read input from stdin
const input = fs.readFileSync(0, "utf-8");
const data = JSON.parse(input);

const issues = [];

for (const file of data.files) {
	const lineCount = file.lines.length;

	if (lineCount > MAX_LINES) {
		issues.push({
			file: file.path,
			line: MAX_LINES + 1,
			message: `File has ${lineCount} lines, exceeds maximum of ${MAX_LINES} lines`,
			severity: "warning",
		});
	}
}

// Output results in the format tscanner expects: { issues: [...] }
process.stdout.write(`${JSON.stringify({ issues })}\n`);
