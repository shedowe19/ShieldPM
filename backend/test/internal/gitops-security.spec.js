import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
	containsSecretMaterial,
	createSecureGitHttp,
	readRegularFile,
	redactSecrets,
	resolveSnapshotPath,
	validateBranch,
	validateRepositoryUrl,
} from "../../internal/gitops-security.js";

const temporaryDirectories = [];

afterEach(async () => {
	await Promise.all(
		temporaryDirectories.splice(0).map((directory) => fs.promises.rm(directory, { recursive: true, force: true })),
	);
});

describe("GitOps repository boundary", () => {
	it("accepts only credential-free HTTPS repository URLs", () => {
		expect(validateRepositoryUrl("https://github.com/example/config.git").protocol).toBe("https:");
		for (const url of [
			"http://github.com/example/config.git",
			"ssh://git@github.com/example/config.git",
			"https://user:pat@github.com/example/config.git",
			"https://github.com/example/config.git?token=secret",
			"https://github.com/example/config.git#main",
		]) {
			expect(() => validateRepositoryUrl(url)).toThrow();
		}
	});

	it("rejects dangerous ref syntax and traversal", () => {
		expect(validateBranch("feature/safe-branch")).toBe("feature/safe-branch");
		for (const branch of ["../main", "main..other", "refs/main@{1}", "-upload-pack", "bad branch", "bad\\ref"]) {
			expect(() => validateBranch(branch)).toThrow();
		}
		expect(() => resolveSnapshotPath("/safe/root", "../secret")).toThrow();
	});

	it("binds the Git HTTP adapter to the configured origin", async () => {
		const client = createSecureGitHttp(new URL("https://github.com/example/config.git"));
		await expect(client.request({ url: "https://evil.example/repo.git/info/refs" })).rejects.toThrow(
			"configured repository origin",
		);
	});
});

describe("GitOps file and secret boundary", () => {
	it("reads bounded regular files and refuses symbolic links", async () => {
		const directory = await fs.promises.mkdtemp(path.join(os.tmpdir(), "shieldpm-gitops-test-"));
		temporaryDirectories.push(directory);
		const regular = path.join(directory, "safe.yaml");
		const link = path.join(directory, "link.yaml");
		await fs.promises.writeFile(regular, "id: 1\n");
		await fs.promises.symlink(regular, link);
		expect((await readRegularFile(regular)).toString("utf8")).toBe("id: 1\n");
		await expect(readRegularFile(link)).rejects.toThrow();
		await expect(readRegularFile(regular, 2)).rejects.toThrow("size");
	});

	it("recursively detects and redacts secret fields and PEM material", () => {
		const value = { nested: [{ password_hash: "hash" }, { text: "-----BEGIN PRIVATE KEY-----" }] };
		expect(containsSecretMaterial(value)).toBe(true);
		expect(redactSecrets(value)).toEqual({
			nested: [{ password_hash: "[REDACTED]" }, { text: "[REDACTED]" }],
		});
	});
});
