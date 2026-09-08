import LegacyAbortController from "abort-controller";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ bots: [], requests: [] }));
vi.mock("telegraf", () => ({
	Telegraf: class {
		constructor() {
			mocks.bots.push(this);
		}
		telegram = {
			callApi: (_method, _payload, { signal }) =>
				new Promise((resolve, reject) => {
					mocks.requests.push({ signal, resolve, reject });
					if (signal.aborted) reject(new Error("aborted"));
					else signal.addEventListener("abort", () => reject(new Error("aborted")), { once: true });
				}),
		};
		use() {}
		on() {}
		catch() {}
		launch() {
			return Promise.resolve();
		}
		stop() {}
	},
}));
vi.mock("telegraf/filters", () => ({ message: () => "text" }));
vi.mock("../../lib/access.js", () => ({ default: class {} }));
vi.mock("../../lib/config.js", () => ({ getPrivateKey: vi.fn() }));
vi.mock("../../lib/encryption.js", () => ({ decrypt: (token) => token }));
vi.mock("../../logger.js", () => ({ global: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() } }));
vi.mock("../../models/chat_integration.js", () => ({ default: {} }));
vi.mock("../../internal/ai.js", () => ({ default: {} }));

import chat from "../../internal/chat.js";

describe("ChatOps polling with Telegraf's installed abort-controller signal", () => {
	beforeEach(async () => {
		mocks.bots.length = 0;
		mocks.requests.length = 0;
		await chat.startBot({ id: 601, enabled: true, token: "test-token", config: { allowed_ids: [7] }, user_id: 1 });
	});
	afterEach(async () => {
		await chat.stopBot(601);
		vi.restoreAllMocks();
	});

	it.each(["success", "failure"])("accepts the polling signal and releases listeners after %s", async (result) => {
		const polling = new LegacyAbortController();
		const add = vi.spyOn(polling.signal, "addEventListener");
		const remove = vi.spyOn(polling.signal, "removeEventListener");
		// Telegraf's real Polling passes its abort-controller instance as callApi options.
		const request = mocks.bots[0].telegram.callApi("getUpdates", {}, polling);
		expect(mocks.requests[0].signal.aborted).toBe(false);
		if (result === "success") {
			mocks.requests[0].resolve([]);
			await expect(request).resolves.toEqual([]);
		} else {
			mocks.requests[0].reject(new Error("network unavailable"));
			await expect(request).rejects.toThrow("network unavailable");
		}
		expect(add).toHaveBeenCalledTimes(1);
		expect(remove).toHaveBeenCalledWith("abort", add.mock.calls[0][1]);
	});

	it.each(["polling", "lifecycle", "already stopped polling"])("cancels the request for %s", async (source) => {
		const polling = new LegacyAbortController();
		if (source === "already stopped polling") polling.abort();
		const request = mocks.bots[0].telegram.callApi("getUpdates", {}, polling);
		const rejected = expect(request).rejects.toThrow("aborted");
		if (source === "polling") polling.abort();
		if (source === "lifecycle") await chat.stopBot(601);
		await rejected;
		expect(mocks.requests[0].signal.aborted).toBe(true);
	});
});
