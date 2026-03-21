import { beforeEach, describe, expect, it, vi } from "vitest";
import internalAi from "../../modules/ai/service.js";
import internalProxyHost from "../../modules/proxy-host/service.js";
import internalSetting from "../../modules/setting/service.js";
import SettingModel from "../../models/setting.js";

// Mock dependencies
vi.mock("../../modules/setting/service.js");
vi.mock("../../modules/proxy-host/service.js");
vi.mock("../../models/setting.js");
vi.mock("../../lib/logger.js", () => ({
	logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn() },
}));

vi.mock("../../lib/encryption.js", () => ({
	encrypt: vi.fn((val) => `encrypted_${val}`),
	decrypt: vi.fn((val) => val.replace("encrypted_", "")),
}));

vi.mock("../../db.js", () => ({
	default: vi.fn(() => ({
		// Mock knex instance
		transaction: vi.fn(),
		destroy: vi.fn(),
	})),
}));

// Mock fetch
global.fetch = vi.fn();

describe("internal/ai.js", () => {
	const mockAccess = { can: vi.fn().mockResolvedValue(true) };

	beforeEach(() => {
		vi.resetAllMocks();
	});

	describe("getConfig", () => {
		it("should return default config if setting not found", async () => {
			internalSetting.get.mockRejectedValue(new Error("Not found"));
			const config = await internalAi.getConfig(mockAccess);
			expect(config.provider).toBe("gemini");
			expect(config.enabled).toBe(false);
		});

		it("should return stored config", async () => {
			const mockConfig = { enabled: true, provider: "local" };
			internalSetting.get.mockResolvedValue({ meta: mockConfig });
			const config = await internalAi.getConfig(mockAccess);
			expect(config).toEqual(mockConfig);
		});
	});

	describe("chat", () => {
		it("should throws if AI is disabled", async () => {
			// Mock direct DB call for _getConfigForChat
			SettingModel.query.mockReturnValue({
				where: vi.fn().mockReturnValue({
					first: vi.fn().mockResolvedValue({ meta: { enabled: false } }),
				}),
			});

			await expect(internalAi.chat(mockAccess, "hello")).rejects.toThrow("AI Agent is disabled");
		});

		it("should calls Gemini API", async () => {
			SettingModel.query.mockReturnValue({
				where: vi.fn().mockReturnValue({
					first: vi.fn().mockResolvedValue({
						meta: { enabled: true, provider: "gemini", api_key: "test" },
					}),
				}),
			});

			const mockGeminiResponse = {
				candidates: [
					{
						content: {
							parts: [{ text: "Hello from Gemini" }],
						},
					},
				],
			};

			global.fetch.mockResolvedValue({
				ok: true,
				json: async () => mockGeminiResponse,
			});

			const res = await internalAi.chat(mockAccess, "Hi");
			expect(res.content).toBe("Hello from Gemini");
			expect(global.fetch).toHaveBeenCalledWith(
				expect.stringContaining("generativelanguage.googleapis.com"),
				expect.any(Object),
			);
		});

		it("should handle Tool Calls (mocked)", async () => {
			SettingModel.query.mockReturnValue({
				where: vi.fn().mockReturnValue({
					first: vi.fn().mockResolvedValue({
						meta: { enabled: true, provider: "gemini", api_key: "test" },
					}),
				}),
			});

			// 1. Tool Call Response
			const mockToolCallResponse = {
				candidates: [
					{
						content: {
							parts: [
								{
									functionCall: { name: "get_proxy_hosts", args: {} },
								},
							],
						},
					},
				],
			};

			// 2. Final Response
			const mockFinalResponse = {
				candidates: [
					{
						content: {
							parts: [{ text: "You have 2 hosts" }],
						},
					},
				],
			};

			global.fetch
				.mockResolvedValueOnce({
					ok: true,
					json: async () => mockToolCallResponse,
				})
				.mockResolvedValueOnce({
					ok: true,
					json: async () => mockFinalResponse,
				});

			// Mock Tool Execution
			internalProxyHost.getAll.mockResolvedValue([
				{ id: 1, domain_names: ["example.com"], forward_ip: "127.0.0.1", forward_port: 80, enabled: 1 },
			]);

			const res = await internalAi.chat(mockAccess, "List hosts");
			expect(res.content).toBe("You have 2 hosts");
			expect(internalProxyHost.getAll).toHaveBeenCalled();
		});
	});
});
