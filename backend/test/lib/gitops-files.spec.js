import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { assertSafeConfigTree, writeConfigFile } from "../../lib/gitops-files.js";

describe("GitOps repository path isolation", () => {
	let temporary;
	let root;
	let configuration;
	let outside;
	beforeEach(async () => {
		temporary = await fs.mkdtemp(path.join(os.tmpdir(), "shieldpm-gitops-files-"));
		root = path.join(temporary, "gitops");
		configuration = path.join(root, "shieldpm-config");
		outside = path.join(temporary, "outside");
		await fs.mkdir(configuration, { recursive: true });
		await fs.mkdir(outside);
		await fs.writeFile(path.join(outside, "sensitive.yaml"), "keep-original");
	});
	afterEach(async () => {
		await fs.rm(temporary, { recursive: true, force: true });
	});
	it("rejects repository directories symlinked outside before export or pruning", async () => {
		await fs.symlink(outside, path.join(configuration, "proxy-hosts"));
		await expect(assertSafeConfigTree(root, configuration)).rejects.toThrow("symbolic links");
		await expect(
			writeConfigFile(root, path.join(configuration, "proxy-hosts", "sensitive.yaml"), "overwrite"),
		).rejects.toThrow("symbolic links");
		expect(await fs.readFile(path.join(outside, "sensitive.yaml"), "utf8")).toBe("keep-original");
	});
	it("rejects symlink files and symlink roots without changing their targets", async () => {
		const linkedFile = path.join(configuration, "settings.yaml");
		await fs.symlink(path.join(outside, "sensitive.yaml"), linkedFile);
		await expect(writeConfigFile(root, linkedFile, "overwrite")).rejects.toThrow("symbolic links");
		const linkedRoot = path.join(temporary, "linked-root");
		await fs.symlink(root, linkedRoot);
		await expect(assertSafeConfigTree(linkedRoot, path.join(linkedRoot, "shieldpm-config"))).rejects.toThrow(
			"symbolic links",
		);
		expect(await fs.readFile(path.join(outside, "sensitive.yaml"), "utf8")).toBe("keep-original");
	});
	it("rejects traversal and writes ordinary generated files with private permissions", async () => {
		await expect(writeConfigFile(root, path.join(outside, "sensitive.yaml"), "overwrite")).rejects.toThrow(
			"escapes",
		);
		const target = path.join(configuration, "normal.yaml");
		await assertSafeConfigTree(root, configuration);
		await writeConfigFile(root, target, "safe");
		expect(await fs.readFile(target, "utf8")).toBe("safe");
		expect((await fs.stat(target)).mode & 0o777).toBe(0o600);
	});
});
