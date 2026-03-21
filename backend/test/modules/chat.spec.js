import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../lib/encryption.js", () => ({
	decrypt: vi.fn((v) => `decrypted-${v}`),
}));

vi.mock("../../lib/access.js", () => ({
	default: vi.fn().mockImplementation((token) => ({ token, can: vi.fn().mockResolvedValue(true) })),
}));

vi.mock("../../lib/config.js", () => ({
	getPrivateKey: vi.fn(() => {
		// Generate a fake RSA key for testing
		return "-----BEGIN RSA PRIVATE KEY-----\nMIIBogIBAAJBALRiMLAHudeSA/x3hB2f+2NRkHLixEIl3MdGnth4+BDMFnESIb6w\nwNqX6MQOUhOLRCuW3eKx0PGiXY3MZqjIguMCAwEAAQJAGxpeSHSWN91NKQ2LiVOl\nGon6FLJn0lnv05rvJc7GMwHjbSP3Z5T4FpPdnRNJr2v3tpGcvJ+CBLZR+4B3OqHA\naQIhAOq8Fqv3NZYgj0gfRCOsmP0zEbMJADPSdPOLWZfBoFbHAiEAxVGXHkR5pcRg\nxEJH7JXQKm3eV+wEgT9BK9Ca3AFQnXkCIGNCwPSGkNdMhJmjD5mCC4e3XoY1hCU\nQlzaYhagN7g7AiEAh+8SToInHOkOPF4ByrC+PoLhL/QFnyYPJzgPpm2XpRkCIBmy\njdz7ixpn7u7RGaXRHeTPjxJTHftxK0cR1mG8mGPF\n-----END RSA PRIVATE KEY-----";
	}),
}));

vi.mock("jsonwebtoken", () => ({
	default: {
		sign: vi.fn(() => "mock-jwt-token"),
	},
}));

vi.mock("telegraf", () => ({
	Telegraf: vi.fn().mockImplementation(() => ({
		use: vi.fn(),
		on: vi.fn(),
		catch: vi.fn(),
		launch: vi.fn().mockResolvedValue(undefined),
		stop: vi.fn(),
	})),
}));

vi.mock("telegraf/filters", () => ({
	message: vi.fn((type) => type),
}));

vi.mock("../../logger.js", () => ({
	global: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}));

vi.mock("../../models/chat_integration.js", () => ({
	default: {
		query: vi.fn(() => mockChatQuery),
	},
}));

vi.mock("../../modules/ai/index.js", () => ({
	aiService: { chat: vi.fn().mockResolvedValue({ content: "test response" }) },
}));

const mockChatQuery = {
	where: vi.fn().mockReturnThis(),
	withGraphFetched: vi.fn().mockResolvedValue([]),
	findById: vi.fn().mockResolvedValue(null),
};

import { smartEscape } from "../../modules/chat/helpers.js";
import { bots } from "../../modules/chat/state.js";

describe("chat module", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		for (const key of Object.keys(bots)) delete bots[key];
	});

	describe("smartEscape", () => {
		it("should escape special Telegram MarkdownV2 characters", () => {
			const result = smartEscape("Hello_world*test");
			expect(result).toContain("\\_");
			expect(result).toContain("\\*");
		});

		it("should not escape text inside backticks", () => {
			const result = smartEscape("Normal `code_block` text");
			expect(result).toContain("`code_block`");
		});

		it("should handle text with no special chars", () => {
			const result = smartEscape("hello world");
			expect(result).toBe("hello world");
		});

		it("should escape dots, exclamation marks, and hyphens", () => {
			const result = smartEscape("test.example!com-host");
			expect(result).toContain("\\.");
			expect(result).toContain("\\!");
			expect(result).toContain("\\-");
		});

		it("should handle empty string", () => {
			const result = smartEscape("");
			expect(result).toBe("");
		});

		it("should handle triple-backtick code blocks", () => {
			const result = smartEscape("text ```code_block*test``` more");
			expect(result).toContain("```code_block*test```");
		});
	});

	describe("state – bots object", () => {
		it("should start empty", () => {
			expect(Object.keys(bots)).toHaveLength(0);
		});

		it("should allow setting and getting bot instances", () => {
			bots[1] = { stop: vi.fn() };
			expect(bots[1]).toBeDefined();
			expect(Object.keys(bots)).toHaveLength(1);
		});

		it("should allow deleting bot instances", () => {
			bots[1] = { stop: vi.fn() };
			delete bots[1];
			expect(bots[1]).toBeUndefined();
		});
	});
});
