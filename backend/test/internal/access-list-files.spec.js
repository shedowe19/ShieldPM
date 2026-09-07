import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../models/access_list.js", () => ({ default: {} }));
vi.mock("../../models/access_list_auth.js", () => ({ default: {} }));
vi.mock("../../models/access_list_client.js", () => ({ default: {} }));
vi.mock("../../models/proxy_host.js", () => ({ default: {} }));
vi.mock("../../models/now_helper.js", () => ({ default: () => "now" }));
vi.mock("../../internal/audit-log.js", () => ({ default: {} }));
vi.mock("../../internal/gitops.js", () => ({ default: {} }));
vi.mock("../../internal/nginx.js", () => ({ default: {} }));
vi.mock("../../internal/oauth2-proxy.js", () => ({ default: {} }));

import service from "../../internal/access-list.js";

describe("atomic access-list files", () => {
	let directory;
	let filename;
	const hash = `$2b$12$${"A".repeat(53)}`;
	beforeEach(async () => {
		directory = await fs.promises.mkdtemp(path.join(os.tmpdir(), "shieldpm-access-test-"));
		filename = path.join(directory, "1");
		vi.spyOn(service, "getFilename").mockReturnValue(filename);
		await fs.promises.writeFile(filename, "previous:hash\n");
	});
	afterEach(async () => {
		vi.restoreAllMocks();
		await fs.promises.rm(directory, { recursive: true, force: true });
	});
	it("publishes the complete credential set in a private file", async () => {
		await service.build({ id: 1, name: "Test", items: [{ username: "new", password: hash }] });
		expect(await fs.promises.readFile(filename, "utf8")).toBe(`new:${hash}\n`);
		expect((await fs.promises.stat(filename)).mode & 0o777).toBe(0o600);
		expect(await fs.promises.readdir(directory)).toEqual(["1"]);
	});
	it("retains the previous credentials and removes staging files if replacement fails", async () => {
		vi.spyOn(fs.promises, "rename").mockRejectedValue(new Error("disk unavailable"));
		await expect(
			service.build({ id: 1, name: "Test", items: [{ username: "new", password: hash }] }),
		).rejects.toThrow("disk unavailable");
		expect(await fs.promises.readFile(filename, "utf8")).toBe("previous:hash\n");
		expect(await fs.promises.readdir(directory)).toEqual(["1"]);
	});
});
