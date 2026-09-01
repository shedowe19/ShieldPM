import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { loadEnvironmentSecrets, readSecretFile } from "../../lib/load-env-secrets.js";

const temporaryDirectories = [];
const makeDirectory = () => {
	const directory = fs.mkdtempSync(path.join(os.homedir(), ".secret-test-"));
	fs.chmodSync(directory, 0o700);
	temporaryDirectories.push(directory);
	return directory;
};

afterEach(() => {
	for (const directory of temporaryDirectories.splice(0)) fs.rmSync(directory, { recursive: true, force: true });
});

describe("file-backed environment secrets", () => {
	it("loads a private regular file and removes the indirection variable", () => {
		const filename = path.join(makeDirectory(), "csrf");
		fs.writeFileSync(filename, "top-secret\n", { mode: 0o400 });
		const environment = { CSRF_SECRET_FILE: filename };

		expect(loadEnvironmentSecrets(environment)).toEqual(["CSRF_SECRET"]);
		expect(environment).toEqual({ CSRF_SECRET: "top-secret" });
	});

	it("rejects ambiguous direct/file values, symlinks and non-private files", () => {
		const directory = makeDirectory();
		const filename = path.join(directory, "database");
		fs.writeFileSync(filename, "password", { mode: 0o600 });
		expect(() => loadEnvironmentSecrets({ DB_MYSQL_PASSWORD: "direct", DB_MYSQL_PASSWORD_FILE: filename })).toThrow(
			/cannot be set together/,
		);

		const link = path.join(directory, "link");
		fs.symlinkSync(filename, link);
		expect(() => readSecretFile(link)).toThrow(/regular file/);

		fs.chmodSync(filename, 0o622);
		expect(() => readSecretFile(filename)).toThrow(/0600 or stricter/);
		fs.chmodSync(filename, 0o644);
		expect(() => readSecretFile(filename)).toThrow(/0600 or stricter/);
	});

	it("leaves the initial ownership token file to its stricter dedicated loader", () => {
		const filename = path.join(makeDirectory(), "initial-setup");
		fs.writeFileSync(filename, "setup-token", { mode: 0o600 });
		const environment = { INITIAL_ADMIN_SETUP_TOKEN_FILE: filename };

		expect(loadEnvironmentSecrets(environment)).toEqual([]);
		expect(environment).toEqual({ INITIAL_ADMIN_SETUP_TOKEN_FILE: filename });
	});

	it("preserves the standard SSL certificate path variable", () => {
		const filename = path.join(makeDirectory(), "ca.pem");
		fs.writeFileSync(filename, "certificate", { mode: 0o644 });
		const environment = { SSL_CERT_FILE: filename };

		expect(loadEnvironmentSecrets(environment)).toEqual([]);
		expect(environment).toEqual({ SSL_CERT_FILE: filename });
	});

	it("rejects oversized values and unsafe parent directories", () => {
		const directory = makeDirectory();
		const filename = path.join(directory, "large");
		fs.writeFileSync(filename, "x".repeat(65 * 1024), { mode: 0o600 });
		expect(() => readSecretFile(filename)).toThrow(/exceeds/);

		fs.chmodSync(directory, 0o777);
		expect(() => readSecretFile(filename)).toThrow(/parent directory/);
	});

	it("enforces a bounded explicit size and rejects NUL bytes", () => {
		const directory = makeDirectory();
		const filename = path.join(directory, "bounded");
		fs.writeFileSync(filename, "12345", { mode: 0o600 });
		expect(() => readSecretFile(filename, { SECRET_FILE_MAX_BYTES: "4" })).toThrow(/exceeds/);
		expect(() => readSecretFile(filename, { SECRET_FILE_MAX_BYTES: "invalid" })).toThrow(/positive integer/);
		expect(() => readSecretFile(filename, { SECRET_FILE_MAX_BYTES: String(1024 * 1024 + 1) })).toThrow(
			/must not exceed/,
		);

		fs.writeFileSync(filename, Buffer.from([0x61, 0, 0x62]), { mode: 0o600 });
		expect(() => readSecretFile(filename)).toThrow(/NUL/);
	});
});
