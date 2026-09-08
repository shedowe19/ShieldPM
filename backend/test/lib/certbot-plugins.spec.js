import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ execFile: vi.fn(), complete: vi.fn() }));
vi.mock("../../lib/utils.js", () => ({ default: { execFile: mocks.execFile } }));
vi.mock("../../logger.js", () => ({ certbot: { start: vi.fn(), complete: mocks.complete, error: vi.fn() } }));

import { installPlugin, installPlugins } from "../../lib/certbot.js";

describe("runtime Certbot plugin installation", () => {
	beforeEach(() => vi.resetAllMocks());

	it("installs plugins and their dependencies into writable data instead of the base virtualenv", async () => {
		mocks.execFile.mockResolvedValue("installed");
		await expect(installPlugin("cloudflare")).resolves.toBe("installed");
		expect(mocks.execFile).toHaveBeenCalledExactlyOnceWith("pip", [
			"install",
			"--upgrade",
			"--no-cache-dir",
			"--target",
			"/data/certbot-plugins",
			"certbot-dns-cloudflare",
		]);
	});

	it.each(["constructor", "__proto__", "missing-provider"])("rejects unregistered provider %s", async (key) => {
		await expect(installPlugin(key)).rejects.toThrow();
		expect(mocks.execFile).not.toHaveBeenCalled();
	});

	it("propagates pip failure without reporting a successful install", async () => {
		mocks.execFile.mockRejectedValue(new Error("pip failed"));
		await expect(installPlugin("cloudflare")).rejects.toThrow("pip failed");
		expect(mocks.complete).not.toHaveBeenCalled();
	});

	it("attempts the remaining registered plugins and reports aggregate failure", async () => {
		mocks.execFile.mockRejectedValueOnce(new Error("pip failed")).mockResolvedValueOnce("installed");
		await expect(installPlugins(["cloudflare", "digitalocean"])).rejects.toThrow("Some plugins failed to install");
		expect(mocks.execFile).toHaveBeenCalledTimes(2);
		expect(mocks.complete).toHaveBeenCalledExactlyOnceWith("Installed digitalocean");
	});
});

describe("Certbot Python target discovery", () => {
	let directory;
	afterEach(() => {
		if (directory) fs.rmSync(directory, { recursive: true, force: true });
	});

	it("lists and loads base and target plugin entry points while preferring target dependencies", () => {
		directory = fs.mkdtempSync(path.join(os.tmpdir(), "shieldpm-certbot-python-"));
		const venv = path.join(directory, "venv");
		execFileSync("python3", ["-m", "venv", "--without-pip", venv]);
		const python = path.join(venv, "bin", "python");
		const site = execFileSync(python, ["-c", 'import sysconfig; print(sysconfig.get_path("purelib"))'], {
			encoding: "utf8",
		}).trim();
		const target = path.join(directory, "certbot-plugins");
		fs.mkdirSync(target);
		const writeDistribution = (root, name, entryPoint, module) => {
			fs.writeFileSync(path.join(root, `${name}.py`), module);
			const metadata = path.join(root, `${name}-1.0.dist-info`);
			fs.mkdirSync(metadata);
			fs.writeFileSync(path.join(metadata, "METADATA"), `Metadata-Version: 2.1\nName: ${name}\nVersion: 1.0\n`);
			fs.writeFileSync(
				path.join(metadata, "entry_points.txt"),
				`[certbot.plugins]\n${entryPoint} = ${name}:Authenticator\n`,
			);
		};
		// Synthetic distributions model the base venv and pip --target layout; no package download is needed.
		writeDistribution(
			site,
			"fixture_base_plugin",
			"fixture-webroot",
			'class Authenticator:\n    source = "base"\n',
		);
		writeDistribution(
			target,
			"fixture_dns_plugin",
			"fixture-dns",
			"import fixture_dependency\nclass Authenticator:\n    source = fixture_dependency.source\n",
		);
		fs.writeFileSync(path.join(site, "fixture_dependency.py"), 'source = "base-dependency"\n');
		fs.writeFileSync(path.join(target, "fixture_dependency.py"), 'source = "target-dependency"\n');
		const output = execFileSync(
			python,
			[
				"-c",
				'import importlib.metadata, json; print(json.dumps({entry.name: entry.load().source for entry in importlib.metadata.entry_points(group="certbot.plugins")}))',
			],
			{ encoding: "utf8", env: { ...process.env, PYTHONPATH: target } },
		);
		expect(JSON.parse(output)).toEqual({ "fixture-webroot": "base", "fixture-dns": "target-dependency" });
	});
});
