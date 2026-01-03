import { describe, it, expect, vi, beforeEach } from "vitest";
import internalAi from "../../internal/ai.js";
import internalSetting from "../../internal/setting.js";
import internalProxyHost from "../../internal/proxy-host.js";

// Mock dependencies
vi.mock("../../internal/setting.js");
vi.mock("../../internal/proxy-host.js");
vi.mock("../../lib/logger.js", () => ({
	logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn() },
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
		it("should throw if AI is disabled", async () => {
			internalSetting.get.mockResolvedValue({ meta: { enabled: false } });
			await expect(internalAi.chat(mockAccess, "hello")).rejects.toThrow("AI Agent is disabled");
		});

		it("should calls Gemini API", async () => {
			internalSetting.get.mockResolvedValue({
				meta: { enabled: true, provider: "gemini", api_key: "test" },
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
			internalSetting.get.mockResolvedValue({
				meta: { enabled: true, provider: "gemini", api_key: "test" },
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
