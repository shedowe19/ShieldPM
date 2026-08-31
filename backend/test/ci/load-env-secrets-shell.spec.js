import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { backendSourcePath } from "../helpers/source-path.js";

const loader = backendSourcePath("..", "rootfs", "usr", "local", "bin", "load-env-secrets.sh");
const temporaryDirectories = [];

const fixture = (contents) => {
	const directory = fs.mkdtempSync(path.join(os.homedir(), ".shell-secret-test-"));
	fs.chmodSync(directory, 0o700);
	temporaryDirectories.push(directory);
	const secret = path.join(directory, "secret");
	fs.writeFileSync(secret, contents, { mode: 0o600 });
	return { directory, secret };
};

const cleanEnvironment = () =>
	Object.fromEntries(
		Object.entries(process.env).filter(([name]) => !name.endsWith("_FILE") && name !== "CSRF_SECRET"),
	);

afterEach(() => {
	for (const directory of temporaryDirectories.splice(0)) fs.rmSync(directory, { recursive: true, force: true });
});

describe("rootfs file-backed secret loader", () => {
	it("exports literal contents without evaluating them", () => {
		const { directory, secret } = fixture("$(touch should-not-exist)\n");
		const result = spawnSync("bash", ["-c", 'source "$1" && printf "%s" "$CSRF_SECRET"', "test", loader], {
			cwd: directory,
			env: { ...cleanEnvironment(), CSRF_SECRET_FILE: secret },
			encoding: "utf8",
		});

		expect(result.status).toBe(0);
		expect(result.stdout).toBe("$(touch should-not-exist)");
		expect(fs.existsSync(path.join(directory, "should-not-exist"))).toBe(false);
	});

	it("rejects NUL bytes before exporting a truncated value", () => {
		const { secret } = fixture(Buffer.from([0x61, 0, 0x62]));
		const result = spawnSync("bash", ["-c", 'source "$1"', "test", loader], {
			env: { ...cleanEnvironment(), DB_MYSQL_PASSWORD_FILE: secret },
			encoding: "utf8",
		});

		expect(result.status).not.toBe(0);
		expect(result.stderr).toMatch(/NUL byte/);
	});

	it("rejects group/world-readable secret files", () => {
		const { secret } = fixture("password");
		fs.chmodSync(secret, 0o644);
		const result = spawnSync("bash", ["-c", 'source "$1"', "test", loader], {
			env: { ...cleanEnvironment(), DB_MYSQL_PASSWORD_FILE: secret },
			encoding: "utf8",
		});

		expect(result.status).not.toBe(0);
		expect(result.stderr).toMatch(/0600 or stricter/);
	});

	it("defers the initial ownership token to the dedicated backend loader", () => {
		const { secret } = fixture("setup-token");
		const unsetExpression = "$" + "{INITIAL_ADMIN_SETUP_TOKEN-unset}";
		const result = spawnSync(
			"bash",
			[
				"-c",
				`source "$1" && printf "%s|%s" "${unsetExpression}" "$INITIAL_ADMIN_SETUP_TOKEN_FILE"`,
				"test",
				loader,
			],
			{
				env: { ...cleanEnvironment(), INITIAL_ADMIN_SETUP_TOKEN_FILE: secret },
				encoding: "utf8",
			},
		);

		expect(result.status).toBe(0);
		expect(result.stdout).toBe(`unset|${secret}`);
	});

	it("preserves SSL_CERT_FILE as a path-valued standard variable", () => {
		const { secret } = fixture("certificate");
		fs.chmodSync(secret, 0o644);
		const result = spawnSync("bash", ["-c", 'source "$1" && printf "%s" "$SSL_CERT_FILE"', "test", loader], {
			env: { ...cleanEnvironment(), SSL_CERT_FILE: secret },
			encoding: "utf8",
		});

		expect(result.status).toBe(0);
		expect(result.stdout).toBe(secret);
	});
});
