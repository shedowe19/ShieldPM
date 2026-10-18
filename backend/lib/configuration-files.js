import { randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import { dirname } from "node:path";

/** Capture exact bytes and permissions; absence is part of the rollback state. */
export async function captureConfigurationFiles(paths) {
	const snapshots = [];
	for (const path of [...new Set(paths)]) {
		try {
			const linkStat = await fs.lstat(path);
			const symlink = linkStat.isSymbolicLink() ? await fs.readlink(path) : null;
			const stat = await fs.stat(path);
			if (!stat.isFile()) throw new TypeError(`Configuration path is not a regular file: ${path}`);
			snapshots.push({
				path,
				content: (await fs.readFile(path)).toString("base64"),
				mode: stat.mode & 0o777,
				symlink,
			});
		} catch (error) {
			if (error.code !== "ENOENT") throw error;
			snapshots.push({ path, content: null, mode: 0o600 });
		}
	}
	return snapshots;
}

/** Publish each complete file atomically while the caller holds the configuration lock. */
export async function restoreConfigurationFiles(snapshots) {
	for (const { path, content, mode, symlink } of snapshots) {
		if (content === null) {
			await fs.rm(path, { force: true });
			continue;
		}
		try {
			const existing = await captureConfigurationFiles([path]);
			if (
				existing[0].content === content &&
				existing[0].mode === mode &&
				(existing[0].symlink || null) === (symlink || null)
			)
				continue;
		} catch (error) {
			if (error.code !== "ENOENT") throw error;
		}
		await fs.mkdir(dirname(path), { recursive: true });
		const temporary = `${path}.${randomUUID()}.tmp`;
		try {
			if (symlink) await fs.symlink(symlink, temporary);
			else await fs.writeFile(temporary, Buffer.from(content, "base64"), { mode });
			await fs.rename(temporary, path);
		} finally {
			await fs.rm(temporary, { force: true });
		}
	}
}
