import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../internal/ai/executor.js", () => ({ executeTools: vi.fn() }));
vi.mock("../../internal/ai/tools.js", () => ({ getToolDefinitions: vi.fn() }));
vi.mock("../../internal/setting.js", () => ({ default: {} }));
vi.mock("../../lib/encryption.js", () => ({ encrypt: vi.fn(), decrypt: vi.fn() }));
vi.mock("../../logger.js", () => ({ global: { debug: vi.fn(), info: vi.fn(), warn: vi.fn() } }));

import { callGemini, callLocalLLM, callLocalWithResults, getLocalEndpoint } from "../../internal/ai/providers.js";
import ai from "../../internal/ai.js";
import errs from "../../lib/error.js";

const access = { can: vi.fn().mockResolvedValue(true) };
const providerConfig = { provider: "local", base_url: "https://provider.example/v1", model: "test" };
const providerCalls = [
	["initial response", (config) => callLocalLLM(config, "system", "user", [], [])],
	[
		"tool follow-up",
		(config) => callLocalWithResults(config, "system", "user", [], { content: "", toolCalls: [] }, []),
	],
];

describe("AI structured error contracts", () => {
	beforeEach(() => {
		access.can.mockReset().mockResolvedValue(true);
		vi.stubGlobal("fetch", vi.fn());
	});
	afterEach(() => {
		vi.restoreAllMocks();
		vi.unstubAllGlobals();
	});

	it("reports missing Gemini credentials and a disabled agent as public configuration errors", async () => {
		for (const action of [
			() => ai.getModels(access, { provider: "gemini" }),
			() => callGemini({}, "system", "user", [], []),
		]) {
			await expect(action()).rejects.toMatchObject({ name: "ConfigurationError", status: 400, public: true });
		}
		vi.spyOn(ai, "_getConfigForChat").mockResolvedValue({ enabled: false });
		await expect(ai.chat(access, "hello")).rejects.toMatchObject({
			name: "ConfigurationError",
			status: 400,
			public: true,
			message: "AI Agent is disabled.",
		});
		expect(fetch).not.toHaveBeenCalled();
	});

	it.each(["not-a-url-secret-value", "file:///private/secret-value"])(
		"rejects invalid endpoints without including private URL contents: %s",
		async (base_url) => {
			for (const action of [
				() => getLocalEndpoint(base_url, "v1/models"),
				() => ai.getModels(access, { ...providerConfig, base_url }),
				...providerCalls.map(
					([, call]) =>
						() =>
							call({ ...providerConfig, base_url }),
				),
			]) {
				let error;
				try {
					await action();
				} catch (err) {
					error = err;
				}
				expect(error).toBeInstanceOf(errs.ConfigurationError);
				expect(error).toMatchObject({ status: 400, public: true });
				expect(error.message).not.toContain("secret-value");
			}
			expect(fetch).not.toHaveBeenCalled();
		},
	);

	it.each(["gemini", "local"])("retains private transport failures when fetching %s models", async (provider) => {
		const cause = new Error("Transport failed for key=private-model-key");
		fetch.mockRejectedValue(cause);
		const error = await ai.getModels(access, { ...providerConfig, provider, api_key: "test" }).catch((err) => err);
		expect(error).toBeInstanceOf(errs.InternalError);
		expect(error).toMatchObject({ status: 500, public: false, previous: cause });
		expect(error.message).not.toContain("private-model-key");
	});

	it.each(["gemini", "local"])("keeps unsuccessful %s model-list responses private", async (provider) => {
		fetch.mockResolvedValue({ ok: false, status: 403, statusText: "secret upstream details" });
		const error = await ai.getModels(access, { ...providerConfig, provider, api_key: "test" }).catch((err) => err);
		expect(error).toBeInstanceOf(errs.InternalError);
		expect(error).toMatchObject({ status: 500, public: false });
		expect(error.previous).toMatchObject({ name: "InternalError", status: 500, public: false });
		expect(error.previous.previous).toEqual({ status: 403, statusText: "secret upstream details" });
		expect(error.previous.message).toContain("403");
		expect(error.message).not.toContain("secret");
	});

	it.each(providerCalls)("keeps upstream error bodies out of the %s message", async (_name, call) => {
		const body = "Provider token=private-provider-key";
		fetch.mockResolvedValue({ ok: false, status: 502, text: async () => body });
		const error = await call(providerConfig).catch((err) => err);
		expect(error).toBeInstanceOf(errs.InternalError);
		expect(error).toMatchObject({ status: 500, public: false, previous: { status: 502, body } });
		expect(error.message).toContain("502");
		expect(error.message).not.toContain("private-provider-key");
	});

	it("preserves an authorization failure before contacting the provider", async () => {
		const denied = new errs.PermissionError("Settings access denied");
		access.can.mockRejectedValue(denied);
		await expect(ai.getModels(access, providerConfig)).rejects.toBe(denied);
		expect(fetch).not.toHaveBeenCalled();
	});
});
