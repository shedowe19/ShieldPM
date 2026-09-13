import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("../../logger.js", () => ({ global: { debug: vi.fn(), info: vi.fn() } }));

import { callLocalLLM, callLocalWithResults, getLocalEndpoint } from "../../internal/ai/providers.js";

describe("OpenAI compatible provider conversation", () => {
	afterEach(() => vi.unstubAllGlobals());
	it.each([
		["https://provider.example/v1/", "https://provider.example/v1/chat/completions"],
		["https://provider.example/proxy/", "https://provider.example/proxy/v1/chat/completions"],
		["https://provider.example/proxy/v1", "https://provider.example/proxy/v1/chat/completions"],
	])("keeps endpoint prefixes in %s", (base, expected) => {
		expect(getLocalEndpoint(base, "v1/chat/completions").toString()).toBe(expected);
	});
	it("preserves previous rounds and executes structured follow-up tool calls", async () => {
		const fetch = vi
			.fn()
			.mockResolvedValueOnce({
				ok: true,
				json: async () => ({
					choices: [
						{
							message: {
								content: "",
								tool_calls: [{ id: "first", function: { name: "get_proxy_hosts", arguments: "{}" } }],
							},
						},
					],
				}),
			})
			.mockResolvedValueOnce({
				ok: true,
				json: async () => ({
					choices: [
						{
							message: {
								content: "",
								tool_calls: [{ id: "second", function: { name: "get_certificates", arguments: "{}" } }],
							},
						},
					],
				}),
			})
			.mockResolvedValueOnce({ ok: true, json: async () => ({ choices: [{ message: { content: "Done" } }] }) });
		vi.stubGlobal("fetch", fetch);
		const config = { base_url: "https://provider.example/v1/", model: "test" };
		const tools = [{ function: { name: "get_proxy_hosts", parameters: { type: "object" } } }];
		const first = await callLocalLLM(config, "system", "user", [], tools);
		const second = await callLocalWithResults(
			config,
			"system",
			"user",
			[],
			first,
			[{ name: "get_proxy_hosts", toolCallId: "first", result: "hosts" }],
			tools,
		);
		expect(second.toolCalls[0].id).toBe("second");
		const final = await callLocalWithResults(
			config,
			"system",
			"user",
			[],
			second,
			[{ name: "get_certificates", toolCallId: "second", result: "certs" }],
			tools,
		);
		expect(final.content).toBe("Done");
		const payloads = fetch.mock.calls.map(([, options]) => JSON.parse(options.body));
		expect(payloads[2].messages.map((message) => message.role)).toEqual([
			"system",
			"user",
			"assistant",
			"tool",
			"assistant",
			"tool",
		]);
		expect(payloads[2].messages[3]).toMatchObject({ content: "hosts", tool_call_id: "first" });
		for (const payload of payloads) {
			expect(payload).not.toHaveProperty("keep_alive");
			expect(payload).not.toHaveProperty("options");
			expect(payload.tools).toHaveLength(1);
		}
	});
});
