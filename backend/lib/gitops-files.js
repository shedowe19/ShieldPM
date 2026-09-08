import fs from "node:fs/promises";
import path from "node:path";
import errs from "./error.js";

/** Reject repository-controlled links in a path before any generated-file operation. */
export const assertNoSymlinkPath = async (root, target) => {
	const absoluteRoot = path.resolve(root);
	const absoluteTarget = path.resolve(target);
	const relative = path.relative(absoluteRoot, absoluteTarget);
	if (relative === ".." || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
		throw new errs.ValidationError("GitOps path escapes the configuration directory");
	}
	let current = absoluteRoot;
	for (const part of ["", ...relative.split(path.sep).filter(Boolean)]) {
		if (part) current = path.join(current, part);
		try {
			if ((await fs.lstat(current)).isSymbolicLink()) {
				throw new errs.ValidationError("GitOps configuration must not contain symbolic links");
			}
		} catch (error) {
			if (error.code !== "ENOENT") throw error;
		}
	}
};

/** Preflight the complete configuration before importing, exporting, or pruning any files. */
export const assertSafeConfigTree = async (root, directory) => {
	await assertNoSymlinkPath(root, directory);
	let entries;
	try {
		entries = await fs.readdir(directory, { withFileTypes: true });
	} catch (error) {
		if (error.code === "ENOENT") return;
		throw error;
	}
	for (const entry of entries) {
		const target = path.join(directory, entry.name);
		if (entry.isSymbolicLink()) {
			throw new errs.ValidationError("GitOps configuration must not contain symbolic links");
		}
		if (entry.isDirectory()) await assertSafeConfigTree(root, target);
	}
};

/** Write generated contents only beneath the trusted root, without following a final symlink. */
export const writeConfigFile = async (root, target, contents) => {
	await assertNoSymlinkPath(root, target);
	const file = await fs.open(
		target,
		fs.constants.O_WRONLY | fs.constants.O_CREAT | fs.constants.O_TRUNC | fs.constants.O_NOFOLLOW,
		0o600,
	);
	try {
		// Git checkouts create readable files; open(mode) only applies to new files.
		await file.chmod(0o600);
		await file.writeFile(contents);
	} finally {
		await file.close();
	}
};
