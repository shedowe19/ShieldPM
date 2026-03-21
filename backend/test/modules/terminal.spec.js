import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../models/proxy_host.js", () => ({
	default: {
		query: vi.fn(() => mockProxyHostQuery),
	},
}));

vi.mock("../../lib/encryption.js", () => ({
	decrypt: vi.fn((v) => `decrypted-${v}`),
}));

vi.mock("ssh2", () => {
	return {
		Client: class SSHClient {
			constructor() {
				this._handlers = {};
			}
			on(evt, fn) {
				this._handlers[evt] = fn;
				return this;
			}
			connect(_cfg) {}
			end() {}
			shell(_opts, _cb) {}
		},
	};
});

vi.mock("ws", () => ({
	WebSocketServer: class WSS {
		on() {}
		handleUpgrade() {}
		emit() {}
	},
}));

vi.mock("../../logger.js", () => ({
	internal: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
	debug: vi.fn(),
}));

const mockProxyHostQuery = {
	findById: vi.fn().mockReturnThis(),
	where: vi.fn().mockReturnThis(),
	throwIfNotFound: vi.fn().mockResolvedValue({
		id: 1,
		terminal_host: "192.168.1.1",
		terminal_port: 22,
		terminal_username: "root",
		terminal_auth_type: "password",
		terminal_password: "encrypted-pass",
	}),
};

import { buildSshConfig, createSshClient, resolveHost } from "../../modules/terminal/ssh.js";

describe("terminal module", () => {
	beforeEach(() => vi.clearAllMocks());

	describe("buildSshConfig", () => {
		it("should build config with password auth", () => {
			const host = {
				terminal_host: "10.0.0.1",
				terminal_port: 22,
				terminal_username: "admin",
				terminal_auth_type: "password",
				terminal_password: "enc-pass",
			};
			const config = buildSshConfig(host);
			expect(config.host).toBe("10.0.0.1");
			expect(config.port).toBe(22);
			expect(config.username).toBe("admin");
			expect(config.password).toBe("decrypted-enc-pass");
		});

		it("should build config with key auth", () => {
			const host = {
				terminal_host: "10.0.0.2",
				terminal_port: 2222,
				terminal_username: "deploy",
				terminal_auth_type: "key",
				terminal_private_key: "enc-key",
			};
			const config = buildSshConfig(host);
			expect(config.host).toBe("10.0.0.2");
			expect(config.port).toBe(2222);
			expect(config.username).toBe("deploy");
			expect(config.privateKey).toBe("decrypted-enc-key");
			expect(config.password).toBeUndefined();
		});

		it("should use terminal_port value", () => {
			const host = {
				terminal_host: "host.com",
				terminal_port: 22,
				terminal_username: "user",
				terminal_auth_type: "password",
			};
			const config = buildSshConfig(host);
			expect(config.port).toBe(22);
		});

		it("should not include auth when type is neither password nor key", () => {
			const host = {
				terminal_host: "host.com",
				terminal_port: 22,
				terminal_username: "user",
				terminal_auth_type: "none",
			};
			const config = buildSshConfig(host);
			expect(config.password).toBeUndefined();
			expect(config.privateKey).toBeUndefined();
		});

		it("should handle custom port", () => {
			const host = {
				terminal_host: "host.com",
				terminal_port: 2222,
				terminal_username: "user",
				terminal_auth_type: "password",
				terminal_password: "pass",
			};
			const config = buildSshConfig(host);
			expect(config.port).toBe(2222);
		});
	});

	describe("createSshClient", () => {
		it("should create a new SSH Client instance", () => {
			const client = createSshClient();
			expect(client).toBeDefined();
			expect(typeof client.connect).toBe("function");
			expect(typeof client.end).toBe("function");
		});
	});

	describe("resolveHost", () => {
		it("should query proxy host with terminal scheme", async () => {
			const host = await resolveHost(1);
			expect(host).toBeDefined();
			expect(host.terminal_host).toBe("192.168.1.1");
		});
	});
});
