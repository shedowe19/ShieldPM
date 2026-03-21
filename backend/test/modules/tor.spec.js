import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("node:fs", () => ({
	default: {
		promises: {
			mkdir: vi.fn().mockResolvedValue(),
			writeFile: vi.fn().mockResolvedValue(),
			readFile: vi.fn().mockResolvedValue("hostname\n"),
		},
	},
}));

vi.mock("node:path", () => ({
	default: { join: vi.fn((...args) => args.join("/")) },
	join: vi.fn((...args) => args.join("/")),
}));

vi.mock("node:child_process", () => ({
	spawn: vi.fn(() => ({
		stdout: { on: vi.fn() },
		stderr: { on: vi.fn() },
		on: vi.fn(),
		kill: vi.fn(),
	})),
}));

vi.mock("node:crypto", () => ({
	default: {
		createHash: vi.fn(() => ({
			update: vi.fn().mockReturnThis(),
			digest: vi.fn(() => Buffer.alloc(32, 0xaa)),
		})),
		randomBytes: vi.fn(() => ({
			toString: vi.fn(() => "abcdef123456"),
		})),
	},
}));

vi.mock("../../logger.js", () => ({
	global: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}));

vi.mock("../../models/proxy_host.js", () => ({
	default: {
		query: vi.fn(() => mockProxyHostQuery),
	},
}));

vi.mock("../../models/tor_onion.js", () => ({
	default: {
		query: vi.fn(() => mockTorOnionQuery),
	},
}));

const mockProxyHostQuery = {
	where: vi.fn().mockReturnThis(),
	whereNotNull: vi.fn().mockResolvedValue([]),
};

const mockTorOnionQuery = {
	where: vi.fn().mockReturnThis(),
	first: vi.fn().mockResolvedValue(null),
	insert: vi.fn().mockResolvedValue({ id: 1 }),
	patchAndFetchById: vi.fn().mockResolvedValue({}),
};

import { buildConfigText, torDataPath, writeTorKeyFiles } from "../../modules/tor/helpers.js";

describe("tor module", () => {
	beforeEach(() => vi.clearAllMocks());

	describe("torDataPath", () => {
		it("should have a default path", () => {
			expect(typeof torDataPath).toBe("string");
			expect(torDataPath).toContain("tor");
		});
	});

	describe("buildConfigText", () => {
		it("should generate valid tor config with services", () => {
			const services = [
				{ dir: "/data/tor/1", target: "127.0.0.1:80" },
				{ dir: "/data/tor/2", target: "127.0.0.1:8080" },
			];
			const config = buildConfigText(services);
			expect(config).toContain("DataDirectory /var/lib/tor");
			expect(config).toContain("Log notice stdout");
			expect(config).toContain("HiddenServiceDir /data/tor/1");
			expect(config).toContain("HiddenServicePort 80 127.0.0.1:80");
			expect(config).toContain("HiddenServiceDir /data/tor/2");
			expect(config).toContain("HiddenServicePort 80 127.0.0.1:8080");
			expect(config).toContain("HiddenServiceVersion 3");
		});

		it("should generate minimal config with no services", () => {
			const config = buildConfigText([]);
			expect(config).toContain("DataDirectory /var/lib/tor");
			expect(config).toContain("Log notice stdout");
			expect(config).not.toContain("HiddenServiceDir");
		});

		it("should handle single service", () => {
			const config = buildConfigText([{ dir: "/data/tor/5", target: "10.0.0.1:443" }]);
			expect(config).toContain("HiddenServiceDir /data/tor/5");
			expect(config).toContain("HiddenServicePort 80 10.0.0.1:443");
		});
	});

	describe("writeTorKeyFiles", () => {
		it("should create directory and write key files", async () => {
			const hostname = await writeTorKeyFiles("/data/tor/1", "testtoken");
			expect(hostname).toBe("testtoken.onion");
		});

		it("should create .onion hostname from token", async () => {
			const hostname = await writeTorKeyFiles("/data/tor/2", "myonion");
			expect(hostname).toMatch(/\.onion$/);
		});
	});
});
