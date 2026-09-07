import { EventEmitter } from "node:events";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ insert: vi.fn(), upsert: vi.fn(), hosts: [] }));
vi.mock("dockerode", () => ({ default: class {} }));
vi.mock("../../models/proxy_host.js", () => ({
	default: {
		query: () => ({
			where: () => ({ withGraphFetched: async () => mocks.hosts }),
			insertGraphAndFetch: mocks.insert,
			upsertGraphAndFetch: mocks.upsert,
		}),
	},
}));
vi.mock("../../internal/certificate.js", () => ({ default: {} }));
vi.mock("../../internal/nginx.js", () => ({ default: {} }));
vi.mock("../../logger.js", () => ({ global: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));

import docker from "../../internal/docker.js";

describe("Docker discovery", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mocks.hosts = [];
		mocks.insert.mockResolvedValue({ id: 1 });
		vi.spyOn(docker, "configureNginx").mockResolvedValue();
	});
	it("creates normalized domain relations and uses published ports from listContainers", async () => {
		await docker.processContainer(
			{
				Id: "abc123",
				Labels: { "shieldpm.hostname": "example.com", "shieldpm.port": "80" },
				Ports: [{ PrivatePort: 80, PublicPort: 8080, Type: "tcp" }],
			},
			{ isRemote: true, hostIp: "10.1.1.2", name: "remote" },
		);
		expect(mocks.insert).toHaveBeenCalledWith(
			expect.objectContaining({
				host_domains: [{ domain_name: "example.com" }],
				forward_host: "10.1.1.2",
				forward_port: 8080,
			}),
		);
		expect(mocks.insert.mock.calls[0][0]).not.toHaveProperty("domain_names");
	});
	it("rejects extra injected directives after an allowed directive", async () => {
		await docker.processContainer(
			{
				Id: "abc123",
				Labels: {
					"shieldpm.hostname": "example.com",
					"shieldpm.advanced_config":
						"add_header X-Safe true;\nadd_header X-Test true; access_by_lua_block { unexpected() }\ninclude /untrusted.conf;",
				},
			},
			{ isRemote: false },
		);
		expect(mocks.insert.mock.calls[0][0].advanced_config).toBe("add_header X-Safe true;");
	});
	it("handles fragmented and combined event frames in their original order", async () => {
		const stream = new EventEmitter();
		stream.setEncoding = vi.fn();
		docker.clients = [
			{ isConnected: true, name: "test", docker: { getEvents: (_options, callback) => callback(null, stream) } },
		];
		const disable = vi.spyOn(docker, "disableContainerHost").mockResolvedValue();
		await docker.watch();
		stream.emit("data", '{"Action":"die","Actor":');
		stream.emit("data", '{"ID":"first"}}\n{"Action":"pause","Actor":{"ID":"second"}}\n');
		await vi.waitFor(() => expect(disable).toHaveBeenCalledTimes(2));
		expect(disable.mock.calls).toEqual([["first"], ["second"]]);
	});
});
