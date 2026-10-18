import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, expect, it } from "vitest";
import { captureConfigurationFiles, restoreConfigurationFiles } from "../../lib/configuration-files.js";

let directory;
beforeEach(async () => {
	directory = await fs.mkdtemp(path.join(os.tmpdir(), "shieldpm-config-snapshot-"));
});
afterEach(async () => {
	await fs.rm(directory, { recursive: true, force: true });
});
it("preserves certificate archive symlinks rather than replacing them with regular key files", async () => {
	const oldTarget = path.join(directory, "archive-1.pem");
	const newTarget = path.join(directory, "archive-2.pem");
	const active = path.join(directory, "active.pem");
	await fs.writeFile(oldTarget, "old certificate");
	await fs.writeFile(newTarget, "new certificate");
	await fs.symlink(oldTarget, active);
	const snapshot = await captureConfigurationFiles([active]);
	const inode = (await fs.lstat(active)).ino;
	await restoreConfigurationFiles(snapshot);
	expect((await fs.lstat(active)).ino).toBe(inode);
	await fs.unlink(active);
	await fs.symlink(newTarget, active);
	await restoreConfigurationFiles(snapshot);
	expect(await fs.readlink(active)).toBe(oldTarget);
	expect(await fs.readFile(active, "utf8")).toBe("old certificate");
	expect(await fs.readFile(newTarget, "utf8")).toBe("new certificate");
});
it("restores prior absence and exact mode/content after candidate publication", async () => {
	const filename = path.join(directory, "host.conf");
	const missing = await captureConfigurationFiles([filename]);
	await fs.writeFile(filename, "candidate");
	await restoreConfigurationFiles(missing);
	await expect(fs.stat(filename)).rejects.toMatchObject({ code: "ENOENT" });
	await fs.writeFile(filename, "previous", { mode: 0o640 });
	const previous = await captureConfigurationFiles([filename]);
	await fs.writeFile(filename, "candidate");
	await fs.chmod(filename, 0o600);
	await restoreConfigurationFiles(previous);
	expect(await fs.readFile(filename, "utf8")).toBe("previous");
	expect((await fs.stat(filename)).mode & 0o777).toBe(0o640);
});
