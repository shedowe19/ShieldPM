import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("dockerode", () => {
	return {
		default: class Docker {
			constructor(opts) {
				this.opts = opts;
			}
			ping() { return Promise.resolve("OK"); }
			listContainers() { return Promise.resolve([]); }
			getEvents() {}
			getContainer() {}
		},
	};
});

vi.mock("../../lib/constants.js", () => ({
	SYSTEM_USER_ID: 1,
}));

vi.mock("../../logger.js", () => ({
	global: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}));

vi.mock("../../models/proxy_host.js", () => ({
	default: { query: vi.fn(() => ({ where: vi.fn().mockReturnThis(), findById: vi.fn().mockReturnThis(), withGraphFetched: vi.fn().mockReturnThis(), first: vi.fn().mockResolvedValue(null) })) },
}));

vi.mock("../../modules/certificate/index.js", () => ({
	certificateService: { create: vi.fn().mockResolvedValue({ id: 1 }) },
}));

vi.mock("../../modules/nginx/index.js", () => ({
	nginxService: { generateConfig: vi.fn(), deleteConfig: vi.fn(), reload: vi.fn() },
}));

import {
	clearClients,
	createDockerClient,
	getClients,
	pushClient,
	reloadState,
} from "../../modules/docker/state.js";

describe("docker module", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		clearClients();
	});

	describe("state management", () => {
		it("should start with empty clients", () => {
			expect(getClients()).toHaveLength(0);
		});

		it("should push and retrieve clients", () => {
			pushClient({ name: "test", docker: {}, isConnected: false });
			expect(getClients()).toHaveLength(1);
			expect(getClients()[0].name).toBe("test");
		});

		it("should clear all clients", () => {
			pushClient({ name: "a" });
			pushClient({ name: "b" });
			clearClients();
			expect(getClients()).toHaveLength(0);
		});
	});

	describe("createDockerClient", () => {
		it("should create local socket client", () => {
			const client = createDockerClient("/var/run/docker.sock");
			expect(client.name).toBe("Local Socket");
			expect(client.isRemote).toBe(false);
			expect(client.isConnected).toBe(false);
			expect(client.docker).toBeDefined();
		});

		it("should create remote TCP client", () => {
			const client = createDockerClient("tcp://192.168.1.100:2375");
			expect(client.isRemote).toBe(true);
			expect(client.hostIp).toBe("192.168.1.100");
		});

		it("should create remote HTTP client", () => {
			const client = createDockerClient("http://10.0.0.1:2375");
			expect(client.isRemote).toBe(true);
			expect(client.hostIp).toBe("10.0.0.1");
		});

		it("should create remote HTTPS client", () => {
			const client = createDockerClient("https://secure-docker.example.com:2376");
			expect(client.isRemote).toBe(true);
			expect(client.hostIp).toBe("secure-docker.example.com");
		});
	});

	describe("reloadState", () => {
		it("should have a timer property", () => {
			expect(reloadState).toHaveProperty("timer");
			expect(reloadState.timer).toBeNull();
		});
	});
});
