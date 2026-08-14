import { spawnSync } from "node:child_process";
import fs from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { backendSourcePath } from "../helpers/source-path.js";

const nodePackageVersionVariable = "$" + "{NODE_PACKAGE_VERSION}";
const updater = fs.readFileSync(backendSourcePath("..", "rootfs", "usr", "local", "bin", "update-shieldpm"), "utf8");
const nativeInstaller = fs.readFileSync(backendSourcePath("..", "scripts", "install.sh"), "utf8");
const nodePackageVersionAssignment = updater
	.split("\n")
	.find((line) => line.includes('NODE_PACKAGE_VERSION="$(apt-cache madison nodejs'));
const backendHealthCheck = updater.match(/wait_for_backend_health\(\) \{[\s\S]*?^\}/m)?.[0];
const temporaryDirectories = [];

if (!nodePackageVersionAssignment) {
	throw new Error("The updater must determine a Node.js package version from apt-cache madison output.");
}

if (!backendHealthCheck) {
	throw new Error("The updater must define the native backend health check.");
}

const createAptCacheFixture = () => {
	const directory = fs.mkdtempSync(join(tmpdir(), "shieldpm-update-apt-cache-"));
	temporaryDirectories.push(directory);
	const aptCachePath = join(directory, "apt-cache");

	fs.writeFileSync(
		aptCachePath,
		[
			"#!/bin/sh",
			"i=0",
			'while [ "$i" -lt 100000 ]; do',
			"    printf '%s\\n' 'nodejs | 26.99.0-1nodesource1 | https://deb.nodesource.com/node_26.x nodistro/main amd64 Packages'",
			"    i=$((i + 1))",
			"done",
			"",
		].join("\n"),
	);
	fs.chmodSync(aptCachePath, 0o755);

	return directory;
};

afterEach(() => {
	for (const directory of temporaryDirectories.splice(0)) {
		fs.rmSync(directory, { force: true, recursive: true });
	}
});

describe("update-shieldpm Node 26 runtime contract", () => {
	it("replaces an existing NodeSource major source with Node 26 before installing Node.js", () => {
		expect(updater).toContain("NODE_MAJOR=26");
		expect(updater).toContain("https://deb.nodesource.com/node_%s.x nodistro main");
		expect(updater).toContain("deb[.]nodesource[.]com/node_[0-9]+[.]x");
		expect(updater).toContain("apt-cache madison nodejs");
		expect(updater).toContain(`"nodejs=\${NODE_PACKAGE_VERSION}"`);
	});

	it("consumes the complete NodeSource version listing under pipefail", () => {
		const aptCacheDirectory = createAptCacheFixture();
		const result = spawnSync(
			"bash",
			[
				"-c",
				[
					"set -euo pipefail",
					nodePackageVersionAssignment.trim(),
					'test "$NODE_PACKAGE_VERSION" = "26.99.0-1nodesource1"',
				].join("\n"),
			],
			{
				encoding: "utf8",
				env: { ...process.env, PATH: `${aptCacheDirectory}:${process.env.PATH}` },
			},
		);

		expect(result.status, result.stderr).toBe(0);
	});

	it("uses the signed NodeSource repository instead of Debian npm packages", () => {
		expect(updater).toContain("https://deb.nodesource.com/gpgkey/nodesource-repo.gpg.key");
		expect(updater).toContain("gpg --dearmor");
		expect(updater).not.toContain("apt-get install -y npm");
	});

	it("also configures NodeSource Node 26 for fresh native installations", () => {
		expect(nativeInstaller).toContain("NODE_MAJOR=26");
		expect(nativeInstaller).toContain("https://deb.nodesource.com/gpgkey/nodesource-repo.gpg.key");
		expect(nativeInstaller).toContain(`"nodejs=${nodePackageVersionVariable}"`);
	});

	it("uses Node's system CA store for the Yarn bootstrap without weakening TLS", () => {
		for (const script of [updater, nativeInstaller]) {
			expect(script).toContain("enable_node_system_ca()");
			expect(script).toMatch(/install_node_26\(\) \{[\s\S]*enable_node_system_ca/);
			expect(script).toMatch(/export NODE_OPTIONS=.*--use-system-ca/);
			expect(script).not.toContain("NODE_TLS_REJECT_UNAUTHORIZED=0");
			expect(script).not.toContain("strict-ssl=false");
		}
	});

	it("removes only stale Corepack shims before the npm Yarn fallback", () => {
		for (const script of [updater, nativeInstaller]) {
			expect(script).toContain("remove_stale_corepack_shims()");
			expect(script).toContain("*corepack/dist/*");
			expect(script).toContain('rm -f "$shim"');
			expect(script).toContain('[ -x "$COREPACK_BIN" ]');
			expect(script).toMatch(
				/else[\s\S]*remove_stale_corepack_shims[\s\S]*npm install --global --allow-scripts=yarn yarn@1\.22\.22/,
			);
		}
	});

	it("pins Yarn Classic through Corepack when available and npm otherwise", () => {
		expect(updater).toContain("command -v corepack");
		for (const script of [updater, nativeInstaller]) {
			expect(script).toContain("npm install --global --allow-scripts=yarn yarn@1.22.22");
		}
		expect(updater).toContain('[[ ! "$NODE_VERSION" =~ ^v26\\. ]]');
		expect(updater).toContain("yarn --version");
	});

	it("rebuilds existing installations exactly from committed lockfiles", () => {
		expect(updater).toContain("yarn install --frozen-lockfile --production --silent");
		expect(updater).toContain("yarn install --frozen-lockfile --silent");
		expect(updater).toContain('find "$BACKEND_DIR" -mindepth 1 -maxdepth 1 -exec rm -rf -- {} +');
		expect(updater).toContain('cp -a "$TEMP_DIR/backend/." "$BACKEND_DIR/"');
		expect(updater).toContain('find "$FRONTEND_DIR" -mindepth 1 -maxdepth 1 -exec rm -rf -- {} +');
		expect(updater).toContain('cp -a "$TEMP_DIR/frontend/dist/." "$FRONTEND_DIR/"');
	});

	it("checks the native backend health endpoint at the socket root", () => {
		const commandDirectory = fs.mkdtempSync(join(tmpdir(), "shieldpm-update-health-check-"));
		temporaryDirectories.push(commandDirectory);
		const curlArgumentsPath = join(commandDirectory, "curl-arguments");
		const curlPath = join(commandDirectory, "curl");
		const jqPath = join(commandDirectory, "jq");

		fs.writeFileSync(
			curlPath,
			[
				"#!/bin/sh",
				'printf "%s\\n" "$@" > "$HEALTH_CHECK_CURL_ARGUMENTS"',
				`printf '%s\\n' '{"status":"OK"}'`,
			].join("\n"),
		);
		fs.writeFileSync(jqPath, ["#!/bin/sh", "cat >/dev/null"].join("\n"));
		fs.chmodSync(curlPath, 0o755);
		fs.chmodSync(jqPath, 0o755);

		const result = spawnSync("bash", ["-c", `set -euo pipefail\n${backendHealthCheck}\nwait_for_backend_health`], {
			encoding: "utf8",
			env: {
				...process.env,
				HEALTH_CHECK_CURL_ARGUMENTS: curlArgumentsPath,
				PATH: `${commandDirectory}:${process.env.PATH}`,
			},
		});

		expect(result.status, result.stderr).toBe(0);
		const curlArguments = fs.readFileSync(curlArgumentsPath, "utf8").split("\n");
		expect(curlArguments).toContain("http://localhost/");
		expect(curlArguments).not.toContain("http://localhost/api/");
	});

	it("updates optional runtime binaries and waits for migrations to become healthy", () => {
		expect(updater).toContain('ANUBIS_VERSION="1.27.0"');
		expect(updater).toContain('OAUTH2_VERSION="7.15.3"');
		expect(updater).toContain("wait_for_backend_health()");
		expect(updater).toContain("--unix-socket /run/shieldpm.sock");
		expect(updater).toContain('.status == "OK"');
		expect(updater).toContain("systemctl restart shieldpm");
		expect(updater).toContain("local max_attempts=120");
		expect(updater).toContain("jq");
		expect(updater).toContain("journalctl --no-pager -u shieldpm -n 100");
		expect(nativeInstaller).toContain('VERSION="1.27.0"');
		expect(nativeInstaller).toContain('OAUTH2_VERSION="7.15.3"');
		expect(nativeInstaller).not.toContain("SHOULD_UPDATE_OAUTH2");
	});
});
