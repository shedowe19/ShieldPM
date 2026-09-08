import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import utils from "../../lib/utils.js";

let template;
let written;

beforeEach(() => {
	template = "listen {{ env.HTTP_PORT }}; listen {{ env.HTTPS_PORT }} ssl;";
	written = [];
	vi.stubEnv("DATA_PATH", "/tmp/shieldpm-fingerprint-fixture");
	vi.stubEnv("TV", "5c");
	vi.spyOn(fs.promises, "readdir").mockResolvedValue(["proxy_host.conf"]);
	vi.spyOn(fs.promises, "readFile").mockImplementation(async () => template);
	vi.spyOn(fs.promises, "mkdir").mockResolvedValue(undefined);
	vi.spyOn(fs.promises, "writeFile").mockImplementation(async (file, content) => {
		written.push({ file, content });
	});
});
afterEach(() => {
	vi.restoreAllMocks();
	vi.unstubAllEnvs();
});

describe("regenerated configuration fingerprint", () => {
	it("distinguishes valid port configurations with the same concatenated values", async () => {
		vi.stubEnv("HTTPS_PORT", "443");
		vi.stubEnv("HTTP_PORT", "80");
		await utils.writeHash();
		vi.stubEnv("HTTPS_PORT", "44");
		vi.stubEnv("HTTP_PORT", "380");
		await utils.writeHash();
		expect(written[1].content).not.toBe(written[0].content);
	});
	it("regenerates after template changes even if the version and environment are unchanged", async () => {
		await utils.writeHash();
		template += '\nproxy_set_header Authorization "";';
		await utils.writeHash();
		expect(written[1].content).not.toBe(written[0].content);
	});
	it("persists the fingerprint under the configured instance data directory", async () => {
		await utils.writeHash();
		expect(written[0].file).toBe("/tmp/shieldpm-fingerprint-fixture/shieldpm/env.sha512sum");
	});
	it("agrees with the real shell startup check and detects a later environment change", async () => {
		vi.restoreAllMocks();
		const directory = fs.mkdtempSync(path.join(os.tmpdir(), "shieldpm-hash-check-"));
		vi.stubEnv("DATA_PATH", directory);
		vi.stubEnv("HTTPS_PORT", "443");
		vi.stubEnv("HTTP_PORT", "80");
		const root = fileURLToPath(new URL("../../../", import.meta.url));
		const shellSource = fs.readFileSync(path.join(root, "rootfs/usr/local/bin/envs.sh"), "utf8");
		const script =
			shellSource
				.slice(shellSource.indexOf("export TV="), shellSource.indexOf("exec migration.sh"))
				.replace("node /app/lib/environment-hash.js", '"$SHIELDPM_TEST_NODE" "$SHIELDPM_TEST_HASH"') +
			'\nprintf "%s" "$REGENERATE_ALL"\n';
		const check = (ports) =>
			spawnSync("sh", ["-eu", "-c", script], {
				encoding: "utf8",
				env: {
					...process.env,
					...ports,
					REGENERATE_ALL: "",
					SHIELDPM_TEST_NODE: process.execPath,
					SHIELDPM_TEST_HASH: path.join(root, "backend/lib/environment-hash.js"),
				},
			});
		try {
			await utils.writeHash();
			const unchanged = check({});
			expect(unchanged.stderr).toBe("");
			expect(unchanged.status).toBe(0);
			expect(unchanged.stdout).toBe("");
			const changed = check({ HTTPS_PORT: "44", HTTP_PORT: "380" });
			expect(changed.status).toBe(0);
			expect(changed.stdout).toMatch(/true$/);
			fs.symlinkSync(path.join(root, "backend"), path.join(directory, "app"));
			const linked = spawnSync(process.execPath, [path.join(directory, "app/lib/environment-hash.js")], {
				encoding: "utf8",
			});
			expect(linked.status).toBe(0);
			expect(linked.stdout.trim()).toBe(fs.readFileSync(path.join(directory, "shieldpm/env.sha512sum"), "utf8"));
		} finally {
			fs.rmSync(directory, { recursive: true, force: true });
		}
	});
});
