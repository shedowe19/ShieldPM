import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ enabled: true }));
vi.mock("../../lib/config.js", () => ({ isDemoMode: () => state.enabled }));

import middleware from "../../lib/express/demo.js";

const invoke = (method, path, body = {}) => {
	const response = { status: vi.fn().mockReturnThis(), send: vi.fn().mockReturnValue("blocked") };
	const next = vi.fn();
	middleware({ method, path, body }, response, next);
	return { response, next };
};
describe("demo restrictions follow the real API methods and aliases", () => {
	beforeEach(() => {
		state.enabled = true;
	});
	it.each([
		"/users/me/auth",
		"/users/7/auth",
		"/users/me/permissions",
		"/users/7/permissions",
		"/users/me",
		"/users/7",
		"/settings/default-site",
		"/settings/oidc-config",
	])("blocks PUT %s", (path) => {
		const { response, next } = invoke("PUT", path);
		expect(response.status).toHaveBeenCalledWith(403);
		expect(next).not.toHaveBeenCalled();
	});
	it.each(["LOCALHOST", "localhost.", "service.LOCAL.", "[::1]", "[::ffff:127.0.0.1]"])(
		"blocks equivalent internal destination %s",
		(forward_host) => {
			expect(invoke("POST", "/nginx/proxy-hosts", { forward_host }).response.status).toHaveBeenCalledWith(403);
		},
	);
	it("permits reads and normal-mode changes", () => {
		expect(invoke("GET", "/settings/default-site").next).toHaveBeenCalled();
		state.enabled = false;
		expect(invoke("PUT", "/users/me/auth").next).toHaveBeenCalled();
	});
	it.each(["POST", "PUT"])("blocks a private stream destination on %s", (method) => {
		for (const field of ["forwarding_host", "forwardingHost"]) {
			expect(invoke(method, "/nginx/streams", { [field]: "127.0.0.1" }).response.status).toHaveBeenCalledWith(
				403,
			);
			expect(invoke(method, "/nginx/streams", { [field]: "example.com" }).next).toHaveBeenCalled();
		}
	});
});
