import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../internal/anubis.js", () => ({ default: { generatePolicy: vi.fn() } }));
vi.mock("../../lib/terminal-access.js", () => ({ getTerminalAccessToken: () => "test-token" }));
vi.mock("../../lib/firewall-geoip.js", () => ({
	assertAsnFirewallAvailable: vi.fn(),
	assertConfiguredFirewallLookups: vi.fn(),
	assertCountryFirewallAvailable: vi.fn(),
	getFirewallGeoipStatus: vi.fn(),
}));

import nginx from "../../internal/nginx.js";
import { assertConfiguredFirewallLookups } from "../../lib/firewall-geoip.js";
import utils from "../../lib/utils.js";

describe("staged firewall lookup validation before Nginx activation", () => {
	let directory;
	let events;
	let execute;
	const filename = (id) => path.join(directory, `${id}.conf`);
	const rows = () => [
		{ id: 1, enabled: true, meta: { note: "retained" } },
		{ id: 2, enabled: true, meta: {} },
	];
	const modelFor = (hosts) => ({
		transaction: (callback) => callback({}),
		query: () => ({
			findById: (id) => ({
				withGraphFetched: async () => hosts.find((host) => host.id === id),
				forUpdate: async () => hosts.find((host) => host.id === id),
			}),
			where: (_field, id) => ({
				patch: async (data) =>
					Object.assign(
						hosts.find((host) => host.id === id),
						data,
					),
			}),
		}),
	});

	beforeEach(async () => {
		directory = await fs.mkdtemp(path.join(os.tmpdir(), "shieldpm-firewall-stage-"));
		events = [];
		vi.stubEnv("ACME_OCSP_STAPLING", "false");
		vi.stubEnv("CUSTOM_OCSP_STAPLING", "false");
		execute = vi.spyOn(utils, "execFile").mockImplementation(async (_command, args) => {
			events.push(args.join(" "));
			return "syntax accepted";
		});
		vi.mocked(assertConfiguredFirewallLookups)
			.mockReset()
			.mockImplementation(async () => {
				events.push("staged lookups");
			});
	});

	afterEach(async () => {
		vi.restoreAllMocks();
		vi.unstubAllEnvs();
		await fs.rm(directory, { recursive: true, force: true });
	});

	it("checks the written configuration after syntax acceptance and before reload", async () => {
		await nginx.reload();
		expect(events).toEqual(["-tq", "staged lookups", "-s reload"]);
		expect(assertConfiguredFirewallLookups).toHaveBeenCalledExactlyOnceWith();
	});

	it("preserves the syntax-test result for configurations with no required lookups", async () => {
		await expect(nginx.test()).resolves.toBe("syntax accepted");
		expect(events).toEqual(["-tq", "staged lookups"]);
	});

	it("does not inspect or reload a configuration already rejected by Nginx", async () => {
		const failure = new Error("invalid Nginx syntax");
		execute.mockRejectedValueOnce(failure);
		await expect(nginx.reload()).rejects.toBe(failure);
		expect(assertConfiguredFirewallLookups).not.toHaveBeenCalled();
		expect(execute).toHaveBeenCalledExactlyOnceWith("nginx", ["-tq"]);
	});

	it("does not signal reload after a new conflicting lookup passed nginx-t", async () => {
		const failure = new Error("Required ASN lookup has a conflicting writer");
		vi.mocked(assertConfiguredFirewallLookups).mockRejectedValueOnce(failure);
		await expect(nginx.reload()).rejects.toBe(failure);
		expect(execute).toHaveBeenCalledExactlyOnceWith("nginx", ["-tq"]);
	});

	it("restores the old host file before validating and reloading the rollback", async () => {
		const hosts = rows().slice(0, 1);
		const model = modelFor(hosts);
		await fs.writeFile(filename(1), "working ASN configuration");
		vi.spyOn(nginx, "getConfigName").mockImplementation((_type, id) => filename(id));
		vi.spyOn(nginx, "generateConfig").mockImplementation(async () => {
			await fs.writeFile(filename(1), "new Advanced capture writer");
		});
		vi.mocked(assertConfiguredFirewallLookups)
			.mockImplementationOnce(async () => {
				expect(await fs.readFile(filename(1), "utf8")).toBe("new Advanced capture writer");
				throw new Error("Required ASN lookup has a conflicting writer");
			})
			.mockImplementationOnce(async () => {
				expect(await fs.readFile(filename(1), "utf8")).toBe("working ASN configuration");
				events.push("restored lookups");
			});

		const status = await nginx.configure(model, "proxy_host", hosts[0]);
		expect(status.nginx_online).toBe(false);
		expect(status.nginx_err).toContain("conflicting writer");
		expect(await fs.readFile(filename(1), "utf8")).toBe("working ASN configuration");
		expect(await fs.readFile(`${filename(1)}.err`, "utf8")).toBe("new Advanced capture writer");
		expect(events).toEqual(["-tq", "-tq", "restored lookups", "-s reload"]);
		expect(assertConfiguredFirewallLookups).toHaveBeenCalledTimes(2);
	});

	it("rejects a bulk collision only after staging all hosts and restores every file", async () => {
		const hosts = rows();
		const model = modelFor(hosts);
		for (const host of hosts) await fs.writeFile(filename(host.id), `working ${host.id}`);
		vi.spyOn(nginx, "getConfigName").mockImplementation((_type, id) => filename(id));
		vi.spyOn(nginx, "generateConfig").mockImplementation(async (_type, host) => {
			await fs.writeFile(filename(host.id), `staged ${host.id}`);
		});
		const failure = new Error("Required country lookup has a conflicting writer");
		vi.mocked(assertConfiguredFirewallLookups).mockImplementationOnce(async () => {
			for (const host of hosts) expect(await fs.readFile(filename(host.id), "utf8")).toBe(`staged ${host.id}`);
			throw failure;
		});

		await expect(
			nginx.bulkGenerateConfigGroups([{ model, hostType: "proxy_host", hosts }], { throwOnError: true }),
		).rejects.toBe(failure);
		for (const host of hosts) {
			expect(await fs.readFile(filename(host.id), "utf8")).toBe(`working ${host.id}`);
			expect(await fs.readFile(`${filename(host.id)}.err`, "utf8")).toBe(`staged ${host.id}`);
			expect(host.meta.nginx_err).toContain("conflicting writer");
		}
		expect(execute).toHaveBeenCalledExactlyOnceWith("nginx", ["-tq"]);
	});
});
