import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("node:fs", () => ({
	default: {
		existsSync: vi.fn(() => false),
		promises: {
			mkdir: vi.fn().mockResolvedValue(),
			writeFile: vi.fn().mockResolvedValue(),
			readFile: vi.fn().mockResolvedValue("CERT PEM CONTENT"),
		},
	},
	existsSync: vi.fn(() => false),
}));

vi.mock("node:path", () => ({
	default: { join: vi.fn((...args) => args.join("/")) },
	join: vi.fn((...args) => args.join("/")),
}));

vi.mock("node:util", () => ({
	default: {
		promisify: vi.fn(() => vi.fn().mockResolvedValue({ stdout: "", stderr: "" })),
	},
}));

vi.mock("node:child_process", () => ({
	execFile: vi.fn(),
}));

import { PKI_DIR, ROOT_KEY, ROOT_CERT, ROOT_SERIAL } from "../../modules/pki/ca.js";

describe("pki module", () => {
	beforeEach(() => vi.clearAllMocks());

	describe("constants", () => {
		it("should have correct PKI_DIR", () => {
			expect(PKI_DIR).toBe("/data/tls/internal");
		});

		it("should have correct ROOT_KEY path", () => {
			expect(ROOT_KEY).toContain("root_ca.key");
		});

		it("should have correct ROOT_CERT path", () => {
			expect(ROOT_CERT).toContain("root_ca.crt");
		});

		it("should have correct ROOT_SERIAL path", () => {
			expect(ROOT_SERIAL).toContain("root_ca.srl");
		});
	});

	describe("service re-exports", () => {
		it("should export createLeafCert and createLeadCert", async () => {
			const mod = await import("../../modules/pki/service.js");
			expect(mod.default.createLeafCert).toBeDefined();
			expect(mod.default.createLeadCert).toBeDefined();
			expect(mod.default.ensureCa).toBeDefined();
		});

		it("should have PKI constants on service", async () => {
			const mod = await import("../../modules/pki/service.js");
			expect(mod.default.PKI_DIR).toBe("/data/tls/internal");
			expect(mod.default.ROOT_KEY).toContain("root_ca.key");
			expect(mod.default.ROOT_CERT).toContain("root_ca.crt");
		});
	});
});
