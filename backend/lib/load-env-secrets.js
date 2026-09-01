import fs from "node:fs";
import path from "node:path";

const DEFAULT_MAX_SECRET_BYTES = 64 * 1024;
const HARD_MAX_SECRET_BYTES = 1024 * 1024;
const PASSTHROUGH_FILE_VARIABLES = new Set(["INITIAL_ADMIN_SETUP_TOKEN_FILE", "SSL_CERT_FILE"]);

const parseMaximumSize = (environment = process.env) => {
	const raw = environment.SECRET_FILE_MAX_BYTES;
	if (typeof raw === "undefined" || raw === "") return DEFAULT_MAX_SECRET_BYTES;
	if (!/^[1-9]\d*$/.test(raw)) {
		throw new Error("SECRET_FILE_MAX_BYTES must be a positive integer");
	}
	const configured = Number(raw);
	if (!Number.isSafeInteger(configured) || configured > HARD_MAX_SECRET_BYTES) {
		throw new Error(`SECRET_FILE_MAX_BYTES must not exceed ${HARD_MAX_SECRET_BYTES}`);
	}
	return configured;
};

const assertSecureDirectoryChain = (filename) => {
	let directory = path.dirname(filename);
	while (directory !== path.dirname(directory)) {
		const stat = fs.lstatSync(directory);
		if (!stat.isDirectory() || stat.isSymbolicLink()) {
			throw new Error(`Secret parent is not a real directory: ${directory}`);
		}
		// Sticky world-writable roots such as /tmp are still unsuitable for long-lived secrets.
		if ((stat.mode & 0o022) !== 0) {
			throw new Error(`Secret parent directory is group/world writable: ${directory}`);
		}
		directory = path.dirname(directory);
	}
};

/**
 * Read one Docker/systemd-style secret without following symlinks.
 *
 * @param {string} filename absolute secret path
 * @param {NodeJS.ProcessEnv} [environment]
 * @returns {string} secret value with one conventional line ending removed
 */
export const readSecretFile = (filename, environment = process.env) => {
	if (!path.isAbsolute(filename)) {
		throw new Error("Secret file paths must be absolute");
	}
	const maximumSize = parseMaximumSize(environment);
	assertSecureDirectoryChain(filename);

	const before = fs.lstatSync(filename);
	if (!before.isFile() || before.isSymbolicLink()) {
		throw new Error(`Secret path must be a regular file, not a symlink: ${filename}`);
	}
	if ((before.mode & 0o077) !== 0) {
		throw new Error(`Secret file permissions must be 0600 or stricter: ${filename}`);
	}
	if (before.size > maximumSize) {
		throw new Error(`Secret file exceeds SECRET_FILE_MAX_BYTES: ${filename}`);
	}

	const descriptor = fs.openSync(filename, fs.constants.O_RDONLY | (fs.constants.O_NOFOLLOW || 0));
	try {
		const opened = fs.fstatSync(descriptor);
		if (!opened.isFile() || opened.dev !== before.dev || opened.ino !== before.ino) {
			throw new Error(`Secret file changed while it was opened: ${filename}`);
		}
		const value = fs.readFileSync(descriptor, "utf8");
		if (Buffer.byteLength(value, "utf8") > maximumSize) {
			throw new Error(`Secret file exceeds SECRET_FILE_MAX_BYTES: ${filename}`);
		}
		if (value.includes("\0")) {
			throw new Error(`Secret file contains a NUL byte: ${filename}`);
		}
		return value.replace(/\r?\n$/, "");
	} finally {
		fs.closeSync(descriptor);
	}
};

/**
 * Resolve every FOO_FILE variable to FOO before application modules read the environment.
 * A direct value and a file value are mutually exclusive to avoid ambiguous precedence.
 *
 * @param {NodeJS.ProcessEnv} [environment]
 * @returns {string[]} loaded destination variable names
 */
export const loadEnvironmentSecrets = (environment = process.env) => {
	const loaded = [];
	const maximumSize = parseMaximumSize(environment);
	for (const fileVariable of Object.keys(environment)
		.filter((name) => name.endsWith("_FILE"))
		.sort()) {
		if (!/^[A-Za-z_][A-Za-z0-9_]*_FILE$/.test(fileVariable)) {
			throw new Error(`Invalid file-backed environment variable name: ${fileVariable}`);
		}
		if (fileVariable === "SECRET_FILE_MAX_BYTES_FILE") {
			throw new Error("SECRET_FILE_MAX_BYTES_FILE is not supported");
		}
		// SSL_CERT_FILE is a standard path-valued variable, not a Docker secret.
		// The ownership credential has a stricter same-descriptor/owner contract
		// in internal/initial-setup.js. Neither may be converted to a plain value here.
		if (PASSTHROUGH_FILE_VARIABLES.has(fileVariable)) continue;
		const destination = fileVariable.slice(0, -5);
		const filename = environment[fileVariable];
		if (!filename) {
			throw new Error(`${fileVariable} must name an absolute secret file`);
		}
		if (typeof environment[destination] !== "undefined") {
			throw new Error(`${destination} and ${fileVariable} cannot be set together`);
		}
		environment[destination] = readSecretFile(filename, {
			SECRET_FILE_MAX_BYTES: String(maximumSize),
		});
		delete environment[fileVariable];
		loaded.push(destination);
	}
	return loaded;
};

loadEnvironmentSecrets();
