import { EventEmitter } from "node:events";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ get: vi.fn(), destroyAgent: vi.fn() }));
vi.mock("node:https", () => ({ default: { get: mocks.get } }));
vi.mock("proxy-agent", () => ({
	ProxyAgent: class {
		destroy() {
			mocks.destroyAgent();
		}
	},
}));

import remoteVersion from "../../internal/remote-version.js";
import pjson from "../../package.json" with { type: "json" };

describe("release lookup resilience", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		remoteVersion.last_result = null;
		remoteVersion.last_fetch_time = null;
		remoteVersion.in_flight = null;
	});
	afterEach(() => {
		vi.restoreAllMocks();
		vi.useRealTimers();
	});

	it("does not cache an error payload and retries a subsequent valid release", async () => {
		const fetch = vi
			.spyOn(remoteVersion, "fetchUrl")
			.mockResolvedValueOnce('{"message":"rate limited"}')
			.mockResolvedValueOnce('{"tag_name":"v999.0.0"}');
		await expect(remoteVersion.get()).rejects.toThrow("Invalid release version");
		expect(remoteVersion.last_result).toBeNull();
		await expect(remoteVersion.get()).resolves.toMatchObject({ latest: "v999.0.0", update_available: true });
		expect(fetch).toHaveBeenCalledTimes(2);
	});

	it("shares one pending request between concurrent callers", async () => {
		let resolve;
		const fetch = vi.spyOn(remoteVersion, "fetchUrl").mockReturnValue(
			new Promise((done) => {
				resolve = done;
			}),
		);
		const first = remoteVersion.get();
		const second = remoteVersion.get();
		expect(fetch).toHaveBeenCalledTimes(1);
		resolve('{"tag_name":"v999.0.0"}');
		expect(await first).toEqual(await second);
		await remoteVersion.get();
		expect(fetch).toHaveBeenCalledTimes(1);
	});

	it("keeps the same-version prerelease below an installed stable version", async () => {
		vi.spyOn(remoteVersion, "fetchUrl").mockResolvedValue(JSON.stringify({ tag_name: `v${pjson.version}-rc.1` }));
		await expect(remoteVersion.get()).resolves.toMatchObject({ update_available: false });
	});

	const connection = () => {
		const request = new EventEmitter();
		request.destroy = vi.fn((err) => {
			request.emit("error", err);
			request.emit("close");
		});
		const response = new EventEmitter();
		response.setEncoding = vi.fn();
		response.resume = vi.fn();
		response.statusCode = 200;
		let callback;
		mocks.get.mockImplementation((_url, _options, fn) => {
			callback = fn;
			return request;
		});
		return { request, response, open: () => callback(response) };
	};

	it("rejects non-success HTTP responses instead of using them as release data", async () => {
		const io = connection();
		const result = remoteVersion.fetchUrl("https://example.test");
		io.response.statusCode = 429;
		io.open();
		io.request.emit("close");
		await expect(result).rejects.toThrow("HTTP 429");
	});

	it("enforces a deadline even before response headers arrive", async () => {
		vi.useFakeTimers();
		const io = connection();
		const result = remoteVersion.fetchUrl("https://example.test");
		const rejected = expect(result).rejects.toThrow("timed out");
		await vi.advanceTimersByTimeAsync(10000);
		await rejected;
		expect(io.request.destroy).toHaveBeenCalledOnce();
		expect(mocks.destroyAgent).toHaveBeenCalledOnce();
	});

	it("bounds response memory and rejects interrupted responses", async () => {
		const io = connection();
		const result = remoteVersion.fetchUrl("https://example.test");
		io.open();
		io.response.emit("data", "x".repeat(1024 * 1024 + 1));
		await expect(result).rejects.toThrow("size limit");
		const next = connection();
		const aborted = remoteVersion.fetchUrl("https://example.test");
		next.open();
		next.response.emit("aborted");
		next.request.emit("close");
		await expect(aborted).rejects.toThrow("interrupted");
	});
});
