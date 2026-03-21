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

	describe("setConfig", () => {
		it("should save new config when it does not exist", async () => {
			internalSetting.get.mockRejectedValue(new Error("ai-config"));
			SettingModel.query.mockReturnValue({
				insert: vi.fn().mockResolvedValue({}),
			});
			const data = { enabled: true, provider: "gemini", api_key: "mykey" };
			const result = await internalAi.setConfig(mockAccess, data);
			expect(result).toEqual(data);
		});

		it("should update existing config", async () => {
			internalSetting.get.mockResolvedValue({ id: "ai-config", meta: {} });
			internalSetting.update.mockResolvedValue({});
			const data = { enabled: false, provider: "local", api_key: "" };
			const result = await internalAi.setConfig(mockAccess, data);
			expect(result).toEqual(data);
			expect(internalSetting.update).toHaveBeenCalled();
		});

		it("should encrypt the api_key before saving", async () => {
			internalSetting.get.mockResolvedValue({ id: "ai-config", meta: {} });
			internalSetting.update.mockResolvedValue({});
			const data = { enabled: true, provider: "gemini", api_key: "secret123" };
			await internalAi.setConfig(mockAccess, data);
			const callArgs = internalSetting.update.mock.calls[0][1];
			expect(callArgs.meta.api_key).toBe("encrypted_secret123");
		});
	});

	describe("getModels", () => {
		it("should fetch Gemini models when provider is gemini", async () => {
			const mockModelsResponse = {
				models: [
					{ name: "models/gemini-1.5-flash", displayName: "Gemini 1.5 Flash" },
					{ name: "models/gemini-1.5-pro", displayName: "Gemini 1.5 Pro" },
				],
			};
			global.fetch.mockResolvedValue({
				ok: true,
				json: async () => mockModelsResponse,
			});
			const config = { provider: "gemini", api_key: "test-key" };
			const models = await internalAi.getModels(mockAccess, config);
			expect(models.length).toBe(2);
			expect(models[0]).toHaveProperty("id");
			expect(models[0]).toHaveProperty("name");
		});

		it("should throw if Gemini API key is missing", async () => {
			const config = { provider: "gemini", api_key: "" };
			await expect(internalAi.getModels(mockAccess, config)).rejects.toThrow("API Key is required");
		});

		it("should fetch local LLM models when provider is local", async () => {
			global.fetch.mockResolvedValue({
				ok: true,
				json: async () => ({ data: [{ id: "llama3" }, { id: "mistral" }] }),
			});
			const config = { provider: "local", base_url: "http://localhost:11434" };
			const models = await internalAi.getModels(mockAccess, config);
			expect(models.length).toBe(2);
		});

		it("should throw on fetch error for Gemini", async () => {
			global.fetch.mockResolvedValue({
				ok: false,
				status: 401,
				statusText: "Unauthorized",
			});
			const config = { provider: "gemini", api_key: "bad-key" };
			await expect(internalAi.getModels(mockAccess, config)).rejects.toThrow("Gemini Error");
		});

		it("should throw on invalid base_url for local", async () => {
			const config = { provider: "local", base_url: "ftp://invalid" };
			await expect(internalAi.getModels(mockAccess, config)).rejects.toThrow("Only HTTP/HTTPS");
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
