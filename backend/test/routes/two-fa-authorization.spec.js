import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
	refresh: vi.fn(),
	addYubikey: vi.fn(),
	setupDuo: vi.fn(),
	remove: vi.fn(),
	regenerate: vi.fn(),
	verify: vi.fn(),
	beginPasskey: vi.fn(),
	completePasskey: vi.fn(),
	beginDuo: vi.fn(),
	completeDuo: vi.fn(),
	payload: null,
}));
vi.mock("../../internal/2fa-service.js", () => ({
	default: {
		removeTwoFaMethod: mocks.remove,
		addYubikey: mocks.addYubikey,
		setupDuo: mocks.setupDuo,
		regenerateBackupCodes: mocks.regenerate,
		verifyLoginChallenge: mocks.verify,
		beginPasskeyAuthentication: mocks.beginPasskey,
		completePasskeyAuthentication: mocks.completePasskey,
		beginDuoAuthentication: mocks.beginDuo,
		completeDuoAuthentication: mocks.completeDuo,
	},
}));
vi.mock("../../internal/token.js", () => ({ default: { refreshTokenPair: mocks.refresh } }));
vi.mock("../../models/token.js", () => ({ default: () => ({ load: async () => mocks.payload }) }));
vi.mock("../../lib/config.js", () => ({ getEncryptionKey: () => "01".repeat(32) }));
vi.mock("../../models/user.js", () => ({ default: {} }));
vi.mock("../../models/user-2fa.js", () => ({ default: {} }));
vi.mock("../../models/user-2fa-backup-codes.js", () => ({ default: {} }));
vi.mock("../../lib/express/jwt-decode.js", () => ({ default: () => (_req, _res, next) => next() }));
vi.mock("../../lib/express/user-id-from-me.js", () => ({ default: (_req, _res, next) => next() }));
vi.mock("../../lib/validator/api.js", () => ({ default: vi.fn() }));
vi.mock("../../schema/index.js", () => ({ getValidationSchema: vi.fn() }));
vi.mock("../../logger.js", () => ({ debug: vi.fn(), express: { warn: vi.fn(), error: vi.fn() } }));

import errs from "../../lib/error.js";
import managementRouter from "../../routes/2fa.js";
import tokenRouter from "../../routes/tokens.js";

const handler = (router, path) => router.stack.find((layer) => layer.route?.path === path).route.stack.at(-1).handle;
const response = (access) => ({
	locals: { access },
	status: vi.fn().mockReturnThis(),
	send: vi.fn(),
	json: vi.fn(),
	sendStatus: vi.fn(),
	clearCookie: vi.fn(),
	set: vi.fn(),
});

describe("2FA management authorization", () => {
	beforeEach(() => vi.clearAllMocks());

	it.each(["/yubikey/add", "/duo/setup"])(
		"returns newly generated recovery codes without leaking factor secrets at %s",
		async (path) => {
			const record = {
				id: 1,
				type: path.includes("duo") ? "duo" : "yubikey",
				label: "Factor",
				created_on: "today",
				secret: "private",
				meta: { clientSecret: "private" },
				backup_codes: ["NEWCODE"],
			};
			mocks.addYubikey.mockResolvedValue(record);
			mocks.setupDuo.mockResolvedValue(record);
			const res = response({ token: { getUserId: () => 7 }, can: vi.fn().mockResolvedValue(true) });
			await handler(managementRouter, path)({ params: { user_id: "me" }, body: { otp: "otp" } }, res);
			expect(res.json).toHaveBeenCalledWith({
				id: 1,
				type: record.type,
				label: "Factor",
				created_on: "today",
				backup_codes: ["NEWCODE"],
			});
		},
	);

	it.each(["pending second factor", "disabled account"])(
		"denies method deletion with a valid JWT for a %s",
		async () => {
			const access = {
				token: { getUserId: () => 7, hasScope: () => false },
				can: vi.fn().mockRejectedValue(new errs.PermissionError()),
			};
			await expect(
				handler(managementRouter, "/:methodId")({ params: { user_id: "me", methodId: "2" } }, response(access)),
			).rejects.toMatchObject({ status: 403 });
			expect(access.can).toHaveBeenCalledWith("users:update", 7);
			expect(mocks.remove).not.toHaveBeenCalled();
		},
	);

	it("cannot mint backup codes before the second factor is completed", async () => {
		const access = { token: { getUserId: () => 7 }, can: vi.fn().mockRejectedValue(new errs.PermissionError()) };
		await expect(
			handler(managementRouter, "/backup-codes/regenerate")({ params: { user_id: "7" } }, response(access)),
		).rejects.toMatchObject({ status: 403 });
		expect(mocks.regenerate).not.toHaveBeenCalled();
	});

	it("uses database admin authorization with the normal user-scoped session", async () => {
		const access = { token: { getUserId: () => 7, hasScope: () => false }, can: vi.fn().mockResolvedValue(true) };
		const res = response(access);
		await handler(managementRouter, "/:methodId")({ params: { user_id: "9", methodId: "2" } }, res);
		expect(access.can).toHaveBeenCalledWith("users:update", 9);
		expect(mocks.remove).toHaveBeenCalledWith(9, 2);
		expect(res.sendStatus).toHaveBeenCalledWith(204);
	});
});

describe("pending 2FA login token validation", () => {
	beforeEach(() => vi.clearAllMocks());
	const paths = ["/2fa/verify", "/2fa/passkey/begin", "/2fa/passkey/complete", "/2fa/duo/begin"];
	const body = {
		pending_token: "signed-token",
		method: "totp",
		code: "123456",
		challenge_id: "challenge",
		auth_response: {},
		duo_code: "duo-code",
		state: "state",
	};

	it.each(paths)("rejects an ordinary JWT at %s", async (path) => {
		mocks.payload = { attrs: { id: 7 }, scope: ["user"] };
		const res = response();
		await handler(tokenRouter, path)({ body }, res);
		expect(res.status).toHaveBeenCalledWith(401);
		for (const operation of [
			mocks.verify,
			mocks.beginPasskey,
			mocks.completePasskey,
			mocks.beginDuo,
			mocks.completeDuo,
		])
			expect(operation).not.toHaveBeenCalled();
	});

	it.each(paths)("rejects a pending token without a user ID at %s", async (path) => {
		mocks.payload = { attrs: {}, scope: ["2fa_pending"] };
		const res = response();
		await handler(tokenRouter, path)({ body }, res);
		expect(res.status).toHaveBeenCalledWith(401);
	});

	it("allows a valid pending token to begin passkey verification", async () => {
		mocks.payload = { attrs: { id: 7 }, scope: ["2fa_pending"] };
		mocks.beginPasskey.mockResolvedValue({ options: { challenge: "abc" }, challengeId: "id" });
		const res = response();
		const req = { body };
		await handler(tokenRouter, "/2fa/passkey/begin")(req, res);
		expect(mocks.beginPasskey).toHaveBeenCalledWith(7, req);
		expect(res.status).toHaveBeenCalledWith(200);
	});
});

describe("refresh failures preserve recoverable sessions", () => {
	it("does not clear cookies or expose internal details on a transient failure", async () => {
		mocks.refresh.mockRejectedValueOnce(new Error("Database connection password=private"));
		const res = response();
		await handler(tokenRouter, "/refresh")({ cookies: { shieldpm_refresh: "refresh" }, headers: {} }, res);
		expect(res.status).toHaveBeenCalledWith(500);
		expect(res.clearCookie).not.toHaveBeenCalled();
		expect(res.send).toHaveBeenCalledWith({ error: { code: 500, message: "Token refresh failed" } });
	});
	it("returns an authentication error without deleting a potentially newer login's cookies", async () => {
		mocks.refresh.mockRejectedValueOnce(new errs.AuthError("Invalid refresh token"));
		const res = response();
		await handler(tokenRouter, "/refresh")({ cookies: { shieldpm_refresh: "refresh" }, headers: {} }, res);
		expect(res.status).toHaveBeenCalledWith(401);
		expect(res.clearCookie).not.toHaveBeenCalled();
		expect(res.send).toHaveBeenCalledWith({ error: { code: 401, message: "Invalid refresh token" } });
	});
});
