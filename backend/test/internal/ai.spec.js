import { beforeEach, describe, expect, it, vi } from "vitest";
import internalAi from "../../internal/ai.js";
import internalProxyHost from "../../internal/proxy-host.js";
import internalSetting from "../../internal/setting.js";
import SettingModel from "../../models/setting.js";

const geminiSendMessage = vi.hoisted(() => vi.fn());
const geminiCreateChat = vi.hoisted(() => vi.fn());

// Mock dependencies
vi.mock("../../internal/setting.js");
vi.mock("../../internal/proxy-host.js");
vi.mock("../../models/setting.js");
vi.mock("../../lib/logger.js", () => ({
	logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn() },
}));

vi.mock("../../lib/encryption.js", () => ({
	encrypt: vi.fn((val) => `encrypted_${val}`),
	decrypt: vi.fn((val) => val.replace("encrypted_", "")),
}));

vi.mock("../../lib/config.js", async (importOriginal) => ({
	...(await importOriginal()),
	getPrivateKey: vi.fn().mockReturnValue("unit-test-confirmation-key"),
	isDemoMode: vi.fn().mockReturnValue(false),
}));

vi.mock("@google/genai", () => ({
	GoogleGenAI: class {
		chats = { create: geminiCreateChat };
	},
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
	const mockAccess = {
		can: vi.fn().mockResolvedValue(true),
		token: { getUserId: vi.fn().mockReturnValue(1) },
	};

	beforeEach(() => {
		vi.resetAllMocks();
		geminiCreateChat.mockReturnValue({ sendMessage: geminiSendMessage });
		mockAccess.can.mockResolvedValue(true);
		mockAccess.token.getUserId.mockReturnValue(1);
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

			geminiSendMessage.mockResolvedValue({ text: "Hello from Gemini" });

			const res = await internalAi.chat(mockAccess, "Hi");
			expect(res.content).toBe("Hello from Gemini");
			expect(geminiSendMessage).toHaveBeenCalledWith({ message: "Hi" });
			const declaration = geminiCreateChat.mock.calls[0][0].config.tools[0].functionDeclarations[0];
			expect(declaration.parametersJsonSchema).toMatchObject({
				type: "object",
				additionalProperties: false,
			});
			expect(declaration).not.toHaveProperty("parameters");
		});

		it("does not execute tool-like text without a native function call", async () => {
			SettingModel.query.mockReturnValue({
				where: vi.fn().mockReturnValue({
					first: vi.fn().mockResolvedValue({
						meta: { enabled: true, provider: "gemini", api_key: "test" },
					}),
				}),
			});
			geminiSendMessage.mockResolvedValue({
				text: '{"name":"delete_proxy_host","arguments":{"id":1}}',
			});

			const result = await internalAi.chat(mockAccess, "show this example");

			expect(result.content).toContain("delete_proxy_host");
			expect(internalProxyHost.getAll).not.toHaveBeenCalled();
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
			const mockToolCallResponse = { functionCalls: [{ id: "call-1", name: "get_proxy_hosts", args: {} }] };

			// 2. Final Response
			const mockFinalResponse = { text: "You have 2 hosts" };

			geminiSendMessage.mockResolvedValueOnce(mockToolCallResponse).mockResolvedValueOnce(mockFinalResponse);

			// Mock Tool Execution
			internalProxyHost.getAll.mockResolvedValue([
				{ id: 1, domain_names: ["example.com"], forward_ip: "127.0.0.1", forward_port: 80, enabled: 1 },
			]);

			const res = await internalAi.chat(mockAccess, "List hosts");
			expect(res.content).toBe("You have 2 hosts");
			expect(internalProxyHost.getAll).toHaveBeenCalled();
		});

		it("pauses destructive tools until a separate authenticated confirmation", async () => {
			SettingModel.query.mockReturnValue({
				where: vi.fn().mockReturnValue({
					first: vi.fn().mockResolvedValue({
						meta: { enabled: true, provider: "gemini", api_key: "test" },
					}),
				}),
			});
			geminiSendMessage.mockResolvedValue({
				functionCalls: [{ id: "call-delete", name: "delete_proxy_host", args: { id: 7 } }],
			});
			internalProxyHost.getAll.mockResolvedValue([]);

			const pending = await internalAi.chat(mockAccess, "Delete proxy host 7");
			expect(pending.confirmation).toMatchObject({ tool: "delete_proxy_host", details: '{"id":7}' });
			expect(internalProxyHost.delete).not.toHaveBeenCalled();
			expect(geminiSendMessage).toHaveBeenCalledTimes(1);

			const confirmed = await internalAi.confirm(mockAccess, pending.confirmation.token);
			expect(confirmed.content).toContain("Deleted and VERIFIED");
			expect(internalProxyHost.delete).toHaveBeenCalledWith(mockAccess, { id: 7 });
			await expect(internalAi.confirm(mockAccess, pending.confirmation.token)).rejects.toThrow(
				"Invalid or expired AI confirmation",
			);
		});

		it("does not execute earlier mutations from a batch that requires confirmation", async () => {
			SettingModel.query.mockReturnValue({
				where: vi.fn().mockReturnValue({
					first: vi.fn().mockResolvedValue({
						meta: { enabled: true, provider: "gemini", api_key: "test" },
					}),
				}),
			});
			geminiSendMessage.mockResolvedValue({
				functionCalls: [
					{
						id: "call-create",
						name: "create_proxy_host",
						args: {
							domain_names: ["example.test"],
							forward_scheme: "http",
							forward_host: "backend",
							forward_port: 8080,
						},
					},
					{ id: "call-delete", name: "delete_proxy_host", args: { id: 7 } },
				],
			});

			const pending = await internalAi.chat(mockAccess, "Create one host and delete host 7");
			expect(pending.confirmation).toMatchObject({ tool: "delete_proxy_host", details: '{"id":7}' });
			expect(internalProxyHost.create).not.toHaveBeenCalled();
			expect(internalProxyHost.delete).not.toHaveBeenCalled();
		});

		it("propagates a confirmed action failure", async () => {
			SettingModel.query.mockReturnValue({
				where: vi.fn().mockReturnValue({
					first: vi.fn().mockResolvedValue({
						meta: { enabled: true, provider: "gemini", api_key: "test" },
					}),
				}),
			});
			geminiSendMessage.mockResolvedValue({
				functionCalls: [{ id: "call-delete", name: "delete_proxy_host", args: { id: 7 } }],
			});
			const pending = await internalAi.chat(mockAccess, "Delete proxy host 7");
			internalProxyHost.delete.mockRejectedValueOnce(new Error("database unavailable"));

			await expect(internalAi.confirm(mockAccess, pending.confirmation.token)).rejects.toThrow(
				"database unavailable",
			);
		});
	});
});
