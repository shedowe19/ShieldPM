import { EventEmitter } from "node:events";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
	lookup: vi.fn(),
	request: vi.fn(),
}));

vi.mock("node:dns/promises", () => ({ lookup: mocks.lookup }));
vi.mock("node:https", () => ({ default: { request: mocks.request } }));
vi.mock("../../models/ddns_provider.js", () => ({ default: { query: vi.fn() } }));
vi.mock("../../logger.js", () => ({
	global: { info: vi.fn(), error: vi.fn(), success: vi.fn(), debug: vi.fn() },
}));

import { __test } from "../../internal/ddns.js";

const installHttpsResponses = (responses) => {
	const captured = [];
	mocks.request.mockImplementation((options, callback) => {
		const request = new EventEmitter();
		request.end = vi.fn(() => {
			queueMicrotask(() => {
				const definition = responses[captured.length - 1];
				if (!definition) return;
				const response = new EventEmitter();
				response.statusCode = definition.status ?? 200;
				response.headers = definition.headers ?? {};
				response.destroy = vi.fn((error) => {
					if (error) queueMicrotask(() => response.emit("error", error));
				});
				callback(response);
				if (definition.body) response.emit("data", Buffer.from(definition.body));
				if (!definition.hold) response.emit("end");
			});
		});
		request.destroy = vi.fn((error) => {
			if (error) queueMicrotask(() => request.emit("error", error));
		});
		captured.push({ options, request });
		return request;
	});
	return captured;
};

describe("DDNS custom callback SSRF protection", () => {
	beforeEach(() => {
		vi.useRealTimers();
		vi.clearAllMocks();
	});

	it.each(["http://example.com/update", "file:///etc/passwd", "https://user:password@example.com/update"])(
		"rejects an unsafe URL form: %s",
		(url) => {
			expect(() => __test.validatePublicUrl(url)).toThrow(/Only HTTPS|user information/u);
		},
	);

	it.each([
		"0.0.0.0",
		"10.0.0.1",
		"100.100.100.100",
		"127.0.0.1",
		"169.254.169.254",
		"172.16.0.1",
		"192.168.0.1",
		"224.0.0.1",
		"240.0.0.1",
		"::",
		"::1",
		"::ffff:127.0.0.1",
		"64:ff9b::127.0.0.1",
		"2001:db8::1",
		"fc00::1",
		"fe80::1",
		"ff02::1",
	])("rejects non-public address %s", (address) => {
		expect(() => __test.assertPublicAddress(address)).toThrow("Private, local, reserved, and metadata");
	});

	it.each(["8.8.8.8", "1.1.1.1", "2606:4700:4700::1111"])(
		"accepts globally routable unicast address %s",
		(address) => {
			expect(() => __test.assertPublicAddress(address)).not.toThrow();
		},
	);

	it.each(["https://localhost/update", "https://LOCALHOST./update", "https://service.localhost/update"])(
		"rejects localhost name %s before DNS",
		(url) => {
			expect(() => __test.validatePublicUrl(url)).toThrow("Localhost URLs are not allowed");
		},
	);

	it("rejects a hostname when any DNS answer is not public", async () => {
		mocks.lookup.mockResolvedValue([
			{ address: "8.8.8.8", family: 4 },
			{ address: "127.0.0.1", family: 4 },
		]);

		await expect(__test.requestCustomUrl("https://mixed.example/update")).rejects.toThrow(
			"Private, local, reserved, and metadata",
		);
		expect(mocks.request).not.toHaveBeenCalled();
	});

	it("re-resolves, validates, and pins every redirect hop without pooled sockets", async () => {
		mocks.lookup.mockImplementation(async (hostname) => {
			if (hostname === "first.example") return [{ address: "8.8.8.8", family: 4 }];
			return [{ address: "2606:4700:4700::1111", family: 6 }];
		});
		const captured = installHttpsResponses([
			{ status: 302, headers: { location: "https://next.example/finish" } },
			{ status: 200, body: "OK" },
		]);

		await expect(__test.requestCustomUrl("https://first.example/start")).resolves.toEqual({
			status: 200,
			body: "OK",
		});
		expect(mocks.lookup).toHaveBeenNthCalledWith(1, "first.example", { all: true, verbatim: true });
		expect(mocks.lookup).toHaveBeenNthCalledWith(2, "next.example", { all: true, verbatim: true });
		expect(captured).toHaveLength(2);
		expect(captured[0].options).toEqual(
			expect.objectContaining({ hostname: "first.example", agent: false, rejectUnauthorized: true }),
		);
		expect(captured[1].options).toEqual(
			expect.objectContaining({ hostname: "next.example", agent: false, rejectUnauthorized: true }),
		);

		const pinned = [];
		for (const { options } of captured) {
			options.lookup("ignored", {}, (_error, address, family) => pinned.push({ address, family }));
		}
		expect(pinned).toEqual([
			{ address: "8.8.8.8", family: 4 },
			{ address: "2606:4700:4700::1111", family: 6 },
		]);
	});

	it("blocks a redirect to a private literal before opening the next socket", async () => {
		mocks.lookup.mockResolvedValue([{ address: "8.8.8.8", family: 4 }]);
		installHttpsResponses([{ status: 302, headers: { location: "https://169.254.169.254/latest/meta-data" } }]);

		await expect(__test.requestCustomUrl("https://first.example/start")).rejects.toThrow(
			"Private, local, reserved, and metadata",
		);
		expect(mocks.request).toHaveBeenCalledTimes(1);
	});

	it("enforces the body cap while streaming", async () => {
		mocks.lookup.mockResolvedValue([{ address: "8.8.8.8", family: 4 }]);
		installHttpsResponses([{ status: 200, body: "x".repeat(256 * 1024 + 1) }]);

		await expect(__test.requestCustomUrl("https://callback.example/update")).rejects.toThrow(
			"response exceeds 256 KiB",
		);
	});

	it("enforces an absolute request timeout", async () => {
		vi.useFakeTimers();
		mocks.lookup.mockResolvedValue([{ address: "8.8.8.8", family: 4 }]);
		installHttpsResponses([{ hold: true }]);

		const request = __test.requestCustomUrl("https://callback.example/update");
		const rejection = expect(request).rejects.toThrow("request timed out");
		await Promise.resolve();
		await Promise.resolve();
		await vi.advanceTimersByTimeAsync(10_000);
		await rejection;
	});

	it("redacts callback URLs, authorization values, and configured secrets", () => {
		const message = __test.redactError(
			new Error("GET https://example.com/update?token=top-secret Authorization: Bearer top-secret"),
			{ config: { token: "top-secret" } },
		);
		expect(message).not.toContain("top-secret");
		expect(message).not.toContain("example.com");
		expect(message).toContain("[redacted-url]");
	});
});
