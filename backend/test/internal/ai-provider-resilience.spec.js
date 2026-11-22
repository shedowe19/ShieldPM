import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("../../logger.js", () => ({ global: { debug: vi.fn(), info: vi.fn(), warn: vi.fn() } }));

import { callGemini, callLocalLLM, callLocalWithResults } from "../../internal/ai/providers.js";

const localConfig = {
	base_url: "https://provider.example/v1",
	model: "test-model",
	api_key: "",
	retry_delay_ms: 0,
};

const geminiConfig = {
	api_key: "private-gemini-key",
	model: "gemini-2.5-flash",
	retry_delay_ms: 0,
};

describe("AI provider resilience", () => {
	afterEach(() => vi.unstubAllGlobals());

	it("retries transient provider failures with backoff and then succeeds", async () => {
		const fetch = vi
			.fn()
			.mockResolvedValueOnce({ ok: false, status: 503, text: async () => "busy" })
			.mockResolvedValueOnce({
				ok: true,
				json: async () => ({ choices: [{ message: { content: "Recovered" } }] }),
			});
		vi.stubGlobal("fetch", fetch);

		const response = await callLocalLLM({ ...localConfig, max_retries: 1 }, "system", "hi", [], []);
		expect(response.content).toBe("Recovered");
		expect(fetch).toHaveBeenCalledTimes(2);
	});

	it("does not retry non-transient authorization failures", async () => {
		const fetch = vi.fn().mockResolvedValue({ ok: false, status: 401, text: async () => "denied" });
		vi.stubGlobal("fetch", fetch);

		const error = await callLocalLLM({ ...localConfig, max_retries: 2 }, "system", "hi", [], []).catch(
			(err) => err,
		);
		expect(error).toMatchObject({ status: 500, public: false, previous: { status: 401 } });
		expect(fetch).toHaveBeenCalledTimes(1);
	});

	it("turns an aborted provider timeout into a bounded internal error", async () => {
		const fetch = vi.fn().mockRejectedValue(Object.assign(new Error("aborted"), { name: "AbortError" }));
		vi.stubGlobal("fetch", fetch);

		const error = await callLocalLLM({ ...localConfig, timeout_ms: 1000 }, "system", "hi", [], []).catch(
			(err) => err,
		);
		expect(error).toMatchObject({ status: 500, public: false });
		expect(error.message).toContain("timed out");
	});

	it("passes a cancellation signal to the transport", async () => {
		const controller = new AbortController();
		const fetch = vi.fn().mockResolvedValue({
			ok: true,
			json: async () => ({ choices: [{ message: { content: "ok" } }] }),
		});
		vi.stubGlobal("fetch", fetch);

		await callLocalWithResults(localConfig, "system", "hi", [], { content: "", toolCalls: [] }, [], [], {
			signal: controller.signal,
		});
		expect(fetch.mock.calls[0][1].signal).toBeInstanceOf(AbortSignal);
	});

	it("uses a header for the Gemini key, caps output tokens and reports usage", async () => {
		const fetch = vi.fn().mockResolvedValue({
			ok: true,
			json: async () => ({
				candidates: [{ content: { parts: [{ text: "Hello" }] } }],
				usageMetadata: { promptTokenCount: 3, candidatesTokenCount: 4, totalTokenCount: 7 },
			}),
		});
		vi.stubGlobal("fetch", fetch);

		const response = await callGemini(geminiConfig, "system", "hi", [], []);

		const [url, init] = fetch.mock.calls[0];
		expect(String(url)).not.toContain("private-gemini-key");
		expect(init.headers["x-goog-api-key"]).toBe("private-gemini-key");
		const body = JSON.parse(init.body);
		expect(body.generationConfig).toMatchObject({ temperature: 0, maxOutputTokens: 2048 });
		expect(response.content).toBe("Hello");
		expect(response.usage).toEqual({ input_tokens: 3, output_tokens: 4, total_tokens: 7 });
	});

	it("parses Ollama token counters", async () => {
		const fetch = vi.fn().mockResolvedValue({
			ok: true,
			json: async () => ({
				message: { content: "Hi" },
				prompt_eval_count: 11,
				eval_count: 5,
			}),
		});
		vi.stubGlobal("fetch", fetch);

		const response = await callLocalLLM(
			{ base_url: "http://localhost:11434", model: "llama", retry_delay_ms: 0 },
			"system",
			"hi",
			[],
			[],
		);
		expect(response.usage).toEqual({ input_tokens: 11, output_tokens: 5, total_tokens: 16 });
	});

	it("normalizes array-shaped assistant content instead of crashing", async () => {
		const fetch = vi.fn().mockResolvedValue({
			ok: true,
			json: async () => ({
				choices: [{ message: { content: [{ type: "text", text: "part one " }, { text: "part two" }] } }],
			}),
		});
		vi.stubGlobal("fetch", fetch);

		const response = await callLocalLLM(localConfig, "system", "hi", [], []);
		expect(response.content).toBe("part one part two");
		const headers = fetch.mock.calls[0][1].headers;
		expect(headers.Authorization).toBeUndefined();
	});
});
