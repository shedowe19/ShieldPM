import { EventEmitter } from "node:events";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ lookup: vi.fn(), get: vi.fn() }));
vi.mock("node:dns", () => ({ lookup: mocks.lookup }));
vi.mock("node:http", () => ({ default: { get: mocks.get } }));
vi.mock("node:https", () => ({ default: { get: mocks.get } }));
vi.mock("../../models/ddns_provider.js", () => ({ default: {} }));
vi.mock("../../logger.js", () => ({ global: {} }));

import { requestPublicUrl } from "../../internal/ddns.js";

describe("custom DDNS SSRF protection", () => {
	beforeEach(() => vi.clearAllMocks());
	it.each([
		"http://127.1/update",
		"http://[::1]/update",
		"http://[::ffff:127.0.0.1]/update",
		"http://[fd00::1]/update",
		"http://169.254.169.254/update",
		"http://10.2.3.4/update",
		"file:///etc/passwd",
	])("rejects nonpublic literal URL %s", (url) => {
		expect(() => requestPublicUrl(url)).toThrow(/SSRF/);
		expect(mocks.get).not.toHaveBeenCalled();
	});
	it("checks DNS at connection time, rejecting mixed public/private records", async () => {
		mocks.lookup.mockImplementation((_host, _options, callback) =>
			callback(null, [
				{ address: "1.1.1.1", family: 4 },
				{ address: "10.0.0.1", family: 4 },
			]),
		);
		mocks.get.mockImplementation((_url, options) => {
			const request = new EventEmitter();
			queueMicrotask(() => options.lookup("updates.example", {}, (error) => request.emit("error", error)));
			return request;
		});
		await expect(requestPublicUrl("https://updates.example/update")).rejects.toThrow("DNS resolved to a private");
	});
	it("passes validated DNS addresses directly to the connection and rejects redirects", async () => {
		mocks.lookup.mockImplementation((_host, _options, callback) =>
			callback(null, [{ address: "1.1.1.1", family: 4 }]),
		);
		mocks.get.mockImplementation((_url, options, onResponse) => {
			const request = new EventEmitter();
			queueMicrotask(() =>
				options.lookup("updates.example", {}, (error, address, family) => {
					expect(error).toBeNull();
					expect(address).toBe("1.1.1.1");
					expect(family).toBe(4);
					onResponse(
						Object.assign(new EventEmitter(), {
							statusCode: 302,
							headers: { location: "http://127.0.0.1/" },
							resume: vi.fn(),
						}),
					);
				}),
			);
			return request;
		});
		await expect(requestPublicUrl("https://updates.example/update")).rejects.toThrow("Custom URL Error: 302");
		expect(mocks.get).toHaveBeenCalledTimes(1);
	});
});
