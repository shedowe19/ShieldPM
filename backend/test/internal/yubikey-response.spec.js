import crypto from "node:crypto";
import { EventEmitter } from "node:events";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ respond: null, request: null, parameters: null, registered: true, backupCodes: [] }));
vi.mock("node:https", () => ({
	default: {
		request: (options, callback) => {
			state.parameters = new URL(`https://yubico.test${options.path}`).searchParams;
			const request = new EventEmitter();
			state.request = request;
			request.setTimeout = vi.fn();
			request.destroy = vi.fn((error) => request.emit("error", error));
			request.end = () => {
				const response = new EventEmitter();
				response.statusCode = 200;
				callback(response);
				queueMicrotask(() => state.respond(response, state.parameters));
			};
			return request;
		},
	},
}));
vi.mock("../../models/user.js", () => ({ default: {} }));
vi.mock("../../models/user-2fa.js", () => ({
	default: {
		query: () => ({
			findOne: async () => (state.registered ? { id: 7 } : null),
			insertAndFetch: async (row) => ({ id: 7, ...row }),
		}),
	},
}));
vi.mock("../../models/user-2fa-backup-codes.js", () => ({
	default: {
		transaction: async (callback) => callback({}),
		query: () => ({
			where: () => ({ whereNull: () => ({ resultSize: async () => state.backupCodes.length }) }),
			delete: () => ({
				where: async () => {
					state.backupCodes = [];
				},
			}),
			insert: async (row) => {
				state.backupCodes.push(row);
			},
		}),
	},
}));
vi.mock("../../lib/config.js", () => ({ getEncryptionKey: () => "01".repeat(32) }));

import service from "../../internal/2fa-service.js";

const otp = `ccccccbcgujv${"cbdefghijklnrtuv".repeat(2)}`;
const key = Buffer.from("test-yubico-api-key");
const signature = (values) =>
	crypto
		.createHmac("sha1", key)
		.update(
			Object.keys(values)
				.filter((name) => name !== "h")
				.sort()
				.map((name) => `${name}=${values[name]}`)
				.join("&"),
		)
		.digest("base64");
const reply = (response, params, extra = {}) => {
	const values = { otp: params.get("otp"), nonce: params.get("nonce"), status: "OK", ...extra };
	response.emit(
		"data",
		Object.entries(values)
			.map(([name, value]) => `${name}=${value}`)
			.join("\r\n"),
	);
	response.emit("end");
};

describe("Yubico validation response authentication", () => {
	beforeEach(() => {
		vi.stubEnv("YUBICO_SECRET_KEY", "");
		state.registered = true;
		state.backupCodes = [];
		state.respond = (response, params) => reply(response, params);
	});
	afterEach(() => vi.unstubAllEnvs());
	it("returns recovery codes when adding the first YubiKey, and preserves an existing set", async () => {
		state.registered = false;
		const first = await service.addYubikey(7, otp);
		expect(first.backup_codes).toHaveLength(8);
		const previous = [...state.backupCodes];
		const second = await service.addYubikey(7, otp);
		expect(second.backup_codes).toBeUndefined();
		expect(state.backupCodes).toEqual(previous);
	});

	it("accepts a matching HTTPS response and configures a bounded request timeout", async () => {
		await expect(service.verifyYubikey(7, otp)).resolves.toBe(true);
		expect(state.request.setTimeout).toHaveBeenCalledWith(10000, expect.any(Function));
	});
	it.each([{ otp: "different" }, { nonce: "different" }, { status: "REPLAYED_OTP" }])(
		"rejects a mismatched or replayed response %j",
		async (extra) => {
			state.respond = (response, params) => reply(response, params, extra);
			await expect(service.verifyYubikey(7, otp)).rejects.toThrow();
		},
	);
	it("rejects a successful-looking body on an HTTP error", async () => {
		state.respond = (response, params) => {
			response.statusCode = 503;
			reply(response, params);
		};
		await expect(service.verifyYubikey(7, otp)).rejects.toThrow("unsuccessful");
	});
	it("rejects duplicate fields and oversized responses", async () => {
		state.respond = (response, params) => {
			response.emit("data", "status=OK\r\n");
			reply(response, params);
		};
		await expect(service.verifyYubikey(7, otp)).rejects.toThrow("Unexpected");
		state.respond = (response) => response.emit("data", "x".repeat(16385));
		await expect(service.verifyYubikey(7, otp)).rejects.toThrow("too large");
	});
	it("signs requests and verifies a configured API-key signature", async () => {
		vi.stubEnv("YUBICO_SECRET_KEY", key.toString("base64"));
		state.respond = (response, params) => {
			const values = { otp: params.get("otp"), nonce: params.get("nonce"), status: "OK" };
			expect(params.get("h")).toBe(signature(Object.fromEntries(params)));
			reply(response, params, { h: signature(values) });
		};
		await expect(service.verifyYubikey(7, otp)).resolves.toBe(true);
	});
	it.each(["", Buffer.alloc(20).toString("base64")])(
		"rejects missing or invalid signatures when configured",
		async (h) => {
			vi.stubEnv("YUBICO_SECRET_KEY", key.toString("base64"));
			state.respond = (response, params) => reply(response, params, { h });
			await expect(service.verifyYubikey(7, otp)).rejects.toThrow("signature");
		},
	);
	it("terminates a stalled validation request", async () => {
		state.respond = () => state.request.setTimeout.mock.calls[0][1]();
		await expect(service.verifyYubikey(7, otp)).rejects.toThrow("timed out");
	});
});
