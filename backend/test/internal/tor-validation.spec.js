import { EventEmitter } from "node:events";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
	connect: vi.fn(),
	service: null,
	exists: vi.fn(),
	read: vi.fn(),
	logError: vi.fn(),
}));
vi.mock("node:net", () => ({ createConnection: mocks.connect }));
vi.mock("node:fs", () => ({ default: { existsSync: mocks.exists, promises: { readFile: mocks.read } } }));
vi.mock("../../models/proxy_host.js", () => ({ default: {} }));
vi.mock("../../models/tor_onion.js", () => ({
	default: { query: () => ({ findById: () => ({ where: async () => mocks.service }) }) },
}));
vi.mock("../../internal/gitops.js", () => ({ default: {} }));
vi.mock("../../internal/nginx.js", () => ({ default: {} }));
vi.mock("../../internal/anubis.js", () => ({ default: {} }));
vi.mock("../../internal/oauth2-proxy.js", () => ({ default: {} }));
vi.mock("../../logger.js", () => ({ global: { info: vi.fn(), error: mocks.logError, debug: vi.fn(), warn: vi.fn() } }));

import tor from "../../internal/tor.js";

describe("Tor control protocol validation", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mocks.exists.mockReturnValue(true);
		mocks.read.mockResolvedValue("test-control-password");
	});
	it.each(["80\r\nQUIT", "80garbage", "1.5", -1, 65536])(
		"rejects a partially numeric port %s before opening a control socket",
		async (port) => {
			const patch = vi.fn().mockResolvedValue();
			mocks.service = {
				id: 1,
				name: "test",
				virtual_port: port,
				target_port: 80,
				$query: () => ({ patch }),
			};
			const result = await tor.create(mocks.service);
			expect(result).toBeNull();
			expect(patch).toHaveBeenCalledWith({ status: 3 });
			expect(mocks.connect).not.toHaveBeenCalled();
		},
	);
	it.each(["ED25519-V3:key\r\nQUIT", "malformed-private-key"])(
		"keeps malformed stored key failures private before opening a control socket",
		async (key) => {
			const patch = vi.fn().mockResolvedValue();
			mocks.service = {
				id: 1,
				name: "test",
				virtual_port: 80,
				target_port: 8080,
				private_key: key,
				onion_address: `${"a".repeat(56)}.onion`,
				$query: () => ({ patch }),
			};
			expect(await tor.start(mocks.service)).toBe(false);
			expect(patch).toHaveBeenCalledWith({ status: 3 });
			expect(mocks.connect).not.toHaveBeenCalled();
			const error = mocks.logError.mock.calls.at(-1)[1];
			expect(error).toMatchObject({ name: "InternalValidationError", status: 400, public: false });
			expect(error.message).not.toContain(key);
		},
	);
	it("preserves private password-file failure causes while keeping service start unsuccessful", async () => {
		const cause = new Error("EACCES /private/server/password-file");
		mocks.read.mockRejectedValueOnce(cause);
		const patch = vi.fn().mockResolvedValue();
		mocks.service = {
			id: 1,
			name: "test",
			virtual_port: 80,
			target_port: 8080,
			private_key: "ED25519-V3:key",
			onion_address: `${"a".repeat(56)}.onion`,
			$query: () => ({ patch }),
		};
		expect(await tor.start(mocks.service)).toBe(false);
		expect(mocks.logError.mock.calls.at(-1)[1]).toMatchObject({
			name: "InternalError",
			message: "Tor control password could not be read",
			status: 500,
			public: false,
			previous: cause,
		});
		expect(mocks.connect).not.toHaveBeenCalled();
		expect(patch).toHaveBeenCalledWith({ status: 3 });
	});
	it.each(["missing-password", "socket-error", "timeout", "authentication-failed"])(
		"reports a private infrastructure error for %s and keeps stop unsuccessful",
		async (failure) => {
			const cause = new Error("socket-specific details");
			if (failure === "missing-password") mocks.exists.mockReturnValue(false);
			mocks.connect.mockImplementation(() => {
				const socket = new EventEmitter();
				socket.destroy = vi.fn();
				socket.setTimeout = (_timeout, callback) => {
					queueMicrotask(() => {
						if (failure === "timeout") callback();
						else if (failure === "socket-error") socket.emit("error", cause);
						else socket.emit("end");
					});
				};
				return socket;
			});
			const patch = vi.fn().mockResolvedValue();
			mocks.service = {
				id: 1,
				name: "test",
				onion_address: `${"a".repeat(56)}.onion`,
				$query: () => ({ patch }),
			};
			expect(await tor.stop(mocks.service)).toBe(false);
			const error = mocks.logError.mock.calls.at(-1)[1];
			expect(error).toMatchObject({ name: "InternalError", status: 500, public: false });
			if (failure === "socket-error") expect(error.previous).toBe(cause);
			expect(error.message).not.toContain(cause.message);
			expect(patch).toHaveBeenCalledWith({ status: 3 });
		},
	);
});
