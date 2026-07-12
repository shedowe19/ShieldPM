import { Readable } from "node:stream";
import { describe, expect, it } from "vitest";

const loadScanner = () => import(new URL("../../scripts/ci/scan-added-diff-secrets.js", import.meta.url).href);

describe("added diff secret scanner", () => {
	it("recognizes AWS access keys and GitHub fine-grained tokens", async () => {
		const { containsRecognizedToken } = await loadScanner();

		expect(containsRecognizedToken(`AKIA${"A".repeat(16)}`)).toBe(true);
		expect(containsRecognizedToken(`github_pat_${"a".repeat(82)}`)).toBe(true);
	});

	it("scans added content but ignores diff file headers", async () => {
		const { addedLinesFromDiff, containsRecognizedToken } = await loadScanner();
		const diff = [
			"diff --git a/file.txt b/file.txt",
			"--- a/file.txt",
			`+++ b/AKIA${"A".repeat(16)}.txt`,
			"@@ -1 +1 @@",
			"+safe addition",
		].join("\n");
		const addedLines = addedLinesFromDiff(diff);

		expect(addedLines).toEqual(["safe addition"]);
		expect(containsRecognizedToken(addedLines.join("\n"))).toBe(false);
	});

	it("detects added source lines that begin with two plus signs", async () => {
		const { addedLinesFromDiff, containsRecognizedToken, containsRecognizedTokenInDiff } = await loadScanner();
		const diff = [
			"diff --git a/file.txt b/file.txt",
			"--- a/file.txt",
			"+++ b/file.txt",
			"@@ -1 +1 @@",
			`+++AKIA${"A".repeat(16)}`,
		].join("\n");
		const addedLines = addedLinesFromDiff(diff);

		expect(addedLines).toEqual([`++AKIA${"A".repeat(16)}`]);
		expect(containsRecognizedToken(addedLines.join("\n"))).toBe(true);
		expect(await containsRecognizedTokenInDiff(Readable.from([diff]))).toBe(true);
	});
});
