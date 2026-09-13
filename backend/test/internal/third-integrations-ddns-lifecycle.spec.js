import { EventEmitter } from "node:events";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ query: vi.fn(), get: vi.fn(), patch: vi.fn(), fetch: vi.fn() }));
vi.mock("node:https", () => ({ default: { get: state.get } }));
vi.mock("../../models/ddns_provider.js", () => ({ default: { query: state.query } }));

import ddns, { requestPublicUrl } from "../../internal/ddns.js";

describe("DDNS process and timer lifecycle", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		vi.stubGlobal("fetch", state.fetch);
	});
	afterEach(() => {
		vi.unstubAllGlobals();
		vi.useRealTimers();
	});
	it("shares interval work and replays a forced change after an in-flight refresh", async () => {
		let finishLookup;
		const provider = {
			id: 3,
			name: "site",
			provider: "duckdns",
			domains: ["site"],
			config: { token: "test" },
			ip_ver: "v4",
			last_ipv4: "1.1.1.1",
		};
		state.query.mockReturnValue({ where: async () => [provider], patchAndFetchById: state.patch });
		state.fetch.mockImplementation(async (url) => {
			if (url.includes("api6.ipify")) return { ok: true, json: async () => ({ ip: "2001:db8::1" }) };
			if (url.includes("duckdns")) return { ok: true, text: async () => "OK" };
			return { ok: true, json: async () => ({ ip: "1.1.1.1" }) };
		});
		state.fetch.mockImplementationOnce(
			() =>
				new Promise((resolve) => {
					finishLookup = () => resolve({ ok: true, json: async () => ({ ip: "1.1.1.1" }) });
				}),
		);
		const first = ddns.process();
		await vi.waitFor(() => expect(finishLookup).toBeTypeOf("function"));
		const second = ddns.process();
		const forced = ddns.process(true);
		expect(state.fetch).toHaveBeenCalledTimes(1);
		finishLookup();
		await Promise.all([first, second, forced]);
		expect(state.fetch.mock.calls.filter(([url]) => url.includes("api.ipify"))).toHaveLength(2);
		expect(state.fetch.mock.calls.filter(([url]) => url.includes("duckdns"))).toHaveLength(1);
		expect(state.patch).toHaveBeenCalledOnce();
	});
	it("retains only one startup delay and one periodic timer after initialization repeats", async () => {
		vi.useFakeTimers();
		state.query.mockReturnValue({ where: async () => [] });
		ddns.initTimer();
		ddns.initTimer();
		expect(vi.getTimerCount()).toBe(2);
		await vi.advanceTimersByTimeAsync(5000);
		expect(state.query).toHaveBeenCalledOnce();
		vi.clearAllTimers();
	});
	it("handles an error emitted while draining an accepted custom response", async () => {
		const response = Object.assign(new EventEmitter(), { statusCode: 200, resume: vi.fn() });
		state.get.mockImplementation((_url, _options, onResponse) => {
			queueMicrotask(() => onResponse(response));
			return new EventEmitter();
		});
		await expect(requestPublicUrl("https://1.1.1.1/update")).resolves.toBe(200);
		expect(() => response.emit("error", new Error("connection reset"))).not.toThrow();
	});
});
