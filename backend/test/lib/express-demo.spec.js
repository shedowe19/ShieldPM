import { describe, expect, it, vi, beforeEach } from "vitest";

let demoEnabled = false;

vi.mock("../../lib/config.js", () => ({
	isDemoMode: () => demoEnabled,
}));

vi.mock("ipaddr.js", () => ({
	default: {
		isValid: vi.fn((host) => {
			try {
				// simple check for IPv4
				return /^\d{1,3}(\.\d{1,3}){3}$/.test(host);
			} catch {
				return false;
			}
		}),
		parse: vi.fn((host) => ({
			range: () => {
				if (host.startsWith("127.")) return "loopback";
				if (host.startsWith("10.") || host.startsWith("192.168.")) return "private";
				return "unicast";
			},
			kind: () => "ipv4",
		})),
	},
}));

const checkDemoMode = (await import("../../lib/express/demo.js")).default;

describe("express/demo middleware", () => {
	const makeReq = (method, path, body = {}) => ({
		method,
		path,
		body,
		headers: {},
	});

	const makeRes = () => {
		const res = {
			statusCode: 200,
			_body: null,
			status: vi.fn((code) => {
				res.statusCode = code;
				return res;
			}),
			send: vi.fn((data) => {
				res._body = data;
				return res;
			}),
		};
		return res;
	};

	beforeEach(() => {
		demoEnabled = false;
	});

	it("calls next when demo mode is off", () => {
		const next = vi.fn();
		checkDemoMode(makeReq("PUT", "/users/1/auth"), makeRes(), next);
		expect(next).toHaveBeenCalled();
	});

	it("blocks PUT /users/:id/auth in demo mode", () => {
		demoEnabled = true;
		const res = makeRes();
		const next = vi.fn();
		checkDemoMode(makeReq("PUT", "/users/1/auth"), res, next);
		expect(next).not.toHaveBeenCalled();
		expect(res.status).toHaveBeenCalledWith(403);
	});

	it("blocks PUT /users/:id/permissions in demo mode", () => {
		demoEnabled = true;
		const res = makeRes();
		const next = vi.fn();
		checkDemoMode(makeReq("PUT", "/users/5/permissions"), res, next);
		expect(next).not.toHaveBeenCalled();
		expect(res.status).toHaveBeenCalledWith(403);
	});

	it("blocks POST /users in demo mode", () => {
		demoEnabled = true;
		const res = makeRes();
		const next = vi.fn();
		checkDemoMode(makeReq("POST", "/users"), res, next);
		expect(next).not.toHaveBeenCalled();
	});

	it("blocks DELETE /users/:id in demo mode", () => {
		demoEnabled = true;
		const res = makeRes();
		const next = vi.fn();
		checkDemoMode(makeReq("DELETE", "/users/3"), res, next);
		expect(next).not.toHaveBeenCalled();
	});

	it("blocks PATCH /settings in demo mode", () => {
		demoEnabled = true;
		const res = makeRes();
		const next = vi.fn();
		checkDemoMode(makeReq("PATCH", "/settings/general"), res, next);
		expect(next).not.toHaveBeenCalled();
	});

	it("blocks POST /nginx/cloudflared in demo mode", () => {
		demoEnabled = true;
		const res = makeRes();
		const next = vi.fn();
		checkDemoMode(makeReq("POST", "/nginx/cloudflared/tunnels"), res, next);
		expect(next).not.toHaveBeenCalled();
	});

	it("blocks advanced_config in proxy host creation", () => {
		demoEnabled = true;
		const res = makeRes();
		const next = vi.fn();
		checkDemoMode(makeReq("POST", "/nginx/proxy-hosts", { advanced_config: "some config" }), res, next);
		expect(next).not.toHaveBeenCalled();
	});

	it("blocks forward_scheme=path in proxy hosts", () => {
		demoEnabled = true;
		const res = makeRes();
		const next = vi.fn();
		checkDemoMode(makeReq("POST", "/nginx/proxy-hosts", { forward_scheme: "path" }), res, next);
		expect(next).not.toHaveBeenCalled();
	});

	it("blocks localhost forward_host in proxy hosts", () => {
		demoEnabled = true;
		const res = makeRes();
		const next = vi.fn();
		checkDemoMode(makeReq("POST", "/nginx/proxy-hosts", { forward_host: "localhost" }), res, next);
		expect(next).not.toHaveBeenCalled();
	});

	it("allows safe requests in demo mode", () => {
		demoEnabled = true;
		const next = vi.fn();
		checkDemoMode(makeReq("GET", "/users"), makeRes(), next);
		expect(next).toHaveBeenCalled();
	});
});
