import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../internal/nginx.js", () => ({ default: {} }));

import ranges from "../../internal/ip_ranges.js";

describe("atomic Cloudflare trust-list replacement", () => {
	let directory;
	let filename;
	beforeEach(async () => {
		directory = await fs.promises.mkdtemp(path.join(os.tmpdir(), "shieldpm-ip-ranges-"));
		filename = path.join(directory, "ip_ranges.conf");
		await fs.promises.writeFile(filename, "set_real_ip_from 192.0.2.0/24;\n");
		const remap = (file) => file.replace("/data/nginx/", `${directory}/`);
		for (const method of ["writeFile", "rm"]) {
			const original = fs.promises[method].bind(fs.promises);
			vi.spyOn(fs.promises, method).mockImplementation((file, ...args) => original(remap(file), ...args));
		}
		const rename = fs.promises.rename.bind(fs.promises);
		vi.spyOn(fs.promises, "rename").mockImplementation((from, to) => rename(remap(from), remap(to)));
	});
	afterEach(async () => {
		vi.restoreAllMocks();
		await fs.promises.rm(directory, { recursive: true, force: true });
	});
	it("retains the last complete trust list when a write runs out of space", async () => {
		const write = fs.promises.writeFile.getMockImplementation();
		fs.promises.writeFile.mockImplementationOnce(async (file) => {
			await write(file, "set_real_ip_from 203.");
			throw Object.assign(new Error("no space left"), { code: "ENOSPC" });
		});
		await expect(ranges.generateConfig(["203.0.113.0/24"])).rejects.toThrow("no space left");
		expect(await fs.promises.readFile(filename, "utf8")).toBe("set_real_ip_from 192.0.2.0/24;\n");
		expect(await fs.promises.readdir(directory)).toEqual(["ip_ranges.conf"]);
	});
	it("retains the last complete trust list when replacement fails", async () => {
		fs.promises.rename.mockRejectedValueOnce(new Error("replacement denied"));
		await expect(ranges.generateConfig(["203.0.113.0/24"])).rejects.toThrow("replacement denied");
		expect(await fs.promises.readFile(filename, "utf8")).toBe("set_real_ip_from 192.0.2.0/24;\n");
		expect(await fs.promises.readdir(directory)).toEqual(["ip_ranges.conf"]);
	});
	it("publishes the complete IPv4 and IPv6 trust list without staging files", async () => {
		await ranges.generateConfig(["203.0.113.0/24", "2001:db8::/32"]);
		const config = await fs.promises.readFile(filename, "utf8");
		expect(config).toContain("set_real_ip_from 203.0.113.0/24;");
		expect(config).toContain("set_real_ip_from 2001:db8::/32;");
		expect(await fs.promises.readdir(directory)).toEqual(["ip_ranges.conf"]);
	});
});
