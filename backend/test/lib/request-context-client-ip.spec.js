import { describe, expect, it } from "vitest";
import { resolveClientIp } from "../../lib/request-context.js";

const request = ({ ip, remoteAddress, headers = {} }) => ({
	ip,
	headers,
	socket: { remoteAddress },
});

describe("client IP resolution on Unix-socket listeners", () => {
	it("prefers the address Express already resolved", () => {
		expect(resolveClientIp(request({ ip: "198.51.100.7", remoteAddress: undefined }))).toBe("198.51.100.7");
	});

	it("falls back to a validated X-Real-IP from the proxy", () => {
		expect(resolveClientIp(request({ headers: { "x-real-ip": "203.0.113.9" } }))).toBe("203.0.113.9");
	});

	it("accepts the first X-Forwarded-For address when X-Real-IP is absent", () => {
		expect(resolveClientIp(request({ headers: { "x-forwarded-for": "203.0.113.10, 10.0.0.1" } }))).toBe(
			"203.0.113.10",
		);
	});

	it("rejects a malformed proxy address", () => {
		expect(resolveClientIp(request({ headers: { "x-real-ip": "not-an-ip" } }))).toBeNull();
	});

	it("uses loopback for a headerless local socket", () => {
		expect(resolveClientIp(request({ headers: {} }))).toBe("127.0.0.1");
	});
});
