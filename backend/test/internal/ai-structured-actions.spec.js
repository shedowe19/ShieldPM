import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ execute: vi.fn(), call: vi.fn(), followup: vi.fn() }));
vi.mock("../../internal/ai/executor.js", () => ({ executeTools: mocks.execute }));
vi.mock("../../internal/ai/providers.js", () => ({ callLocalLLM: mocks.call, callLocalWithResults: mocks.followup }));
vi.mock("../../internal/setting.js", () => ({ default: {} }));
vi.mock("../../lib/encryption.js", () => ({ encrypt: vi.fn(), decrypt: vi.fn() }));
vi.mock("../../logger.js", () => ({ global: { debug: vi.fn(), info: vi.fn(), warn: vi.fn() } }));

import { getToolDefinitions } from "../../internal/ai/tools.js";
import ai from "../../internal/ai.js";

describe("AI structured action contract", () => {
	const access = { can: vi.fn().mockResolvedValue(true) };
	beforeEach(() => {
		vi.clearAllMocks();
		vi.spyOn(ai, "_getConfigForChat").mockResolvedValue({ enabled: true, provider: "local" });
		mocks.execute.mockResolvedValue([{ name: "delete_proxy_host", result: "Deleted", toolCallId: "call1" }]);
		mocks.followup.mockResolvedValue({ content: "Finished" });
	});
	it.each([
		'Example only: delete_proxy_host({"id":7})',
		'JSON example: {"name":"delete_proxy_host","arguments":{"id":7}}',
		'<tool_call>{"name":"delete_proxy_host","arguments":{"id":7}}</tool_call>',
	])("keeps explanatory prose inert: %s", async (content) => {
		mocks.call.mockResolvedValue({ content });
		await ai.chat(access, "Explain how this command works; do not run it");
		expect(mocks.execute).not.toHaveBeenCalled();
		expect(mocks.followup).not.toHaveBeenCalled();
	});
	it("continues executing structured provider tool calls", async () => {
		const call = { id: "call1", name: "delete_proxy_host", args: { id: 7 } };
		mocks.call.mockResolvedValue({ content: "", toolCalls: [call] });
		expect(await ai.chat(access, "Delete host 7")).toMatchObject({ content: "Finished" });
		expect(mocks.execute).toHaveBeenCalledWith(access, [call]);
	});
	it("advertises unique tool names and the account password/scheduling contract", async () => {
		const tools = (await getToolDefinitions(access)).map((tool) => tool.function);
		expect(new Set(tools.map((tool) => tool.name)).size).toBe(tools.length);
		const create = tools.find((tool) => tool.name === "create_user").parameters;
		expect(create.required).toContain("auth");
		expect(create.properties.auth.properties.type.enum).toEqual(["password"]);
		const maintenance = tools.find((tool) => tool.name === "set_maintenance_mode").parameters;
		expect(maintenance.properties).toHaveProperty("maintenance_start");
		expect(maintenance.required).not.toContain("active");
		expect(tools.some((tool) => ["login_as_user", "create_api_token"].includes(tool.name))).toBe(false);
	});
});
