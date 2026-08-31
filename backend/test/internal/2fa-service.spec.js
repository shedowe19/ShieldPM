import crypto from "node:crypto";
import { EventEmitter } from "node:events";
import https from "node:https";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

let methodRows = [];
let backupRows = [];
let challengeRows = [];

const valueForComparison = (value) => (value instanceof Date ? value.getTime() : new Date(value).getTime() || value);

class MemoryQuery {
	constructor(store) {
		this.store = store;
		this.filters = [];
		this.mode = "many";
		this.data = null;
	}

	where(column, ...args) {
		if (typeof column === "object") {
			this.filters.push((row) => Object.entries(column).every(([key, expected]) => row[key] === expected));
			return this;
		}
		if (args.length === 1) {
			this.filters.push((row) => row[column] === args[0]);
			return this;
		}
		const [operator, value] = args;
		this.filters.push((row) => {
			const left = valueForComparison(row[column]);
			const right = valueForComparison(value);
			if (operator === ">") return left > right;
			if (operator === "<") return left < right;
			return false;
		});
		return this;
	}

	whereNull(column) {
		this.filters.push((row) => row[column] === null || typeof row[column] === "undefined");
		return this;
	}

	whereNot(column, value) {
		this.filters.push((row) => row[column] !== value);
		return this;
	}

	whereIn(column, values) {
		this.filters.push((row) => values.includes(row[column]));
		return this;
	}

	findOne(filter) {
		this.where(filter);
		this.mode = "one";
		return this;
	}

	findById(id) {
		return this.findOne({ id });
	}

	first() {
		this.mode = "one";
		return this;
	}

	select() {
		return this;
	}

	forUpdate() {
		return this;
	}

	delete() {
		this.mode = "delete";
		return this;
	}

	patch(data) {
		this.mode = "patch";
		this.data = data;
		return this;
	}

	insert(data) {
		this.mode = "insert";
		this.data = data;
		return this;
	}

	insertAndFetch(data) {
		this.mode = "insertOne";
		this.data = data;
		return this;
	}

	resultSize() {
		return Promise.resolve(this.filtered().length);
	}

	filtered() {
		return this.store().filter((row) => this.filters.every((filter) => filter(row)));
	}

	async execute() {
		const rows = this.filtered();
		if (this.mode === "one") return rows[0];
		if (this.mode === "delete") {
			const matched = new Set(rows);
			this.store(this.store().filter((row) => !matched.has(row)));
			return rows.length;
		}
		if (this.mode === "patch") {
			for (const row of rows) Object.assign(row, this.data);
			return rows.length;
		}
		if (this.mode === "insert" || this.mode === "insertOne") {
			const inserted = { id: this.store().length + 1, is_verified: 0, is_deleted: 0, counter: 0, ...this.data };
			if (inserted.flow_key && this.store().some((row) => row.flow_key === inserted.flow_key)) {
				const error = new Error("unique");
				error.code = "SQLITE_CONSTRAINT";
				throw error;
			}
			this.store([...this.store(), inserted]);
			return this.mode === "insertOne" ? inserted : inserted;
		}
		return rows;
	}

	// biome-ignore lint/suspicious/noThenProperty: Objection query builders are intentionally thenable.
	then(resolve, reject) {
		return this.execute().then(resolve, reject);
	}
}

const methodStore = (next) => {
	if (typeof next !== "undefined") methodRows = next;
	return methodRows;
};
const backupStore = (next) => {
	if (typeof next !== "undefined") backupRows = next;
	return backupRows;
};
const challengeStore = (next) => {
	if (typeof next !== "undefined") challengeRows = next;
	return challengeRows;
};

vi.mock("../../models/user-2fa.js", () => ({
	default: {
		query: vi.fn(() => new MemoryQuery(methodStore)),
	},
}));

const replaceForUser = vi.fn(async (userId, rows, options = {}) => {
	if (options.onlyIfMissing && backupRows.some((row) => row.user_id === userId && !row.used_at)) return false;
	backupRows = backupRows.filter((row) => row.user_id !== userId);
	backupRows.push(...rows.map((row, index) => ({ id: index + 1, used_at: null, ...row })));
	return true;
});

const findAndConsume = vi.fn(async (userId, plainCode) => {
	const record = backupRows.find(
		(row) => row.user_id === userId && !row.used_at && row.code_hash === `hash:${plainCode}`,
	);
	if (!record) return null;
	record.used_at = new Date();
	return record;
});

vi.mock("../../models/user-2fa-backup-codes.js", () => ({
	default: {
		query: vi.fn(() => new MemoryQuery(backupStore)),
		replaceForUser,
		findAndConsume,
	},
}));

vi.mock("../../models/user-2fa-challenge.js", () => ({
	default: {
		query: vi.fn(() => new MemoryQuery(challengeStore)),
		hashChallengeId: (value) => crypto.createHash("sha256").update(value, "utf8").digest("hex"),
	},
}));

vi.mock("../../models/user.js", () => ({
	default: {
		query: vi.fn(() => ({
			findById: vi.fn(() => Promise.resolve({ id: 1, name: "Test User", email: "test@example.com" })),
		})),
	},
}));

vi.mock("../../lib/encryption.js", () => ({
	encrypt: vi.fn((value) => `cipher:${value}`),
	decrypt: vi.fn((value) => value.replace(/^cipher:/, "")),
}));

vi.mock("bcryptjs", () => ({
	default: {
		hash: vi.fn((value) => Promise.resolve(`hash:${value}`)),
		compare: vi.fn((value, hash) => Promise.resolve(hash === `hash:${value}`)),
	},
}));

vi.mock("otplib", () => ({
	generateSecret: vi.fn(() => "JBSWY3DPEHPK3PXP"),
	generateURI: vi.fn(
		(options) =>
			`otpauth://totp/${options.issuer}:${options.label}?secret=${options.secret}&issuer=${options.issuer}`,
	),
	verifySync: vi.fn(({ token }) => ({ valid: token === "123456" })),
}));

vi.mock("qrcode", () => ({ default: { toDataURL: vi.fn(() => Promise.resolve("data:image/png;base64,fake")) } }));

const webauthn = vi.hoisted(() => ({
	generateRegistrationOptions: vi.fn(() =>
		Promise.resolve({ challenge: "registration-challenge", rp: { id: "app.example.test" } }),
	),
	verifyRegistrationResponse: vi.fn(() =>
		Promise.resolve({
			verified: true,
			registrationInfo: {
				credential: { id: "credential-1", publicKey: new Uint8Array([1, 2, 3]), counter: 0 },
				credentialDeviceType: "singleDevice",
				credentialBackedUp: false,
			},
		}),
	),
	generateAuthenticationOptions: vi.fn(() => Promise.resolve({ challenge: "authentication-challenge" })),
	verifyAuthenticationResponse: vi.fn(() =>
		Promise.resolve({ verified: true, authenticationInfo: { newCounter: 1 } }),
	),
}));

vi.mock("@simplewebauthn/server", () => webauthn);

const duo = vi.hoisted(() => ({
	healthCheck: vi.fn(() => Promise.resolve()),
	createAuthUrl: vi.fn((_user, state) => Promise.resolve(`https://api-123.duosecurity.com/auth?state=${state}`)),
	exchange: vi.fn((_code, user) =>
		Promise.resolve({ preferred_username: user, auth_time: Math.floor(Date.now() / 1000) }),
	),
}));

vi.mock("@duosecurity/duo_universal", () => ({
	constants: {
		CLIENT_ID_LENGTH: 20,
		CLIENT_SECRET_LENGTH: 40,
	},
	Client: class Client {
		healthCheck() {
			return duo.healthCheck();
		}

		createAuthUrl(user, state) {
			return duo.createAuthUrl(user, state);
		}

		exchangeAuthorizationCodeFor2FAResult(code, user) {
			return duo.exchange(code, user);
		}
	},
}));

vi.mock("../../lib/error.js", () => {
	const makeError = (name, status) =>
		class extends Error {
			constructor(message) {
				super(message);
				this.name = name;
				this.status = status;
				this.public = status < 500;
			}
		};
	return {
		default: {
			ValidationError: makeError("ValidationError", 400),
			ConfigurationError: makeError("ConfigurationError", 400),
			UnauthorizedError: makeError("UnauthorizedError", 401),
			ItemNotFoundError: makeError("ItemNotFoundError", 404),
			InternalError: makeError("InternalError", 500),
		},
	};
});

const { default: twoFaService } = await import("../../internal/2fa-service.js");

const pendingRequest = (token = "pending-token-with-enough-entropy") => ({
	body: { pending_token: token },
	headers: { host: "app.example.test", origin: "https://app.example.test" },
	hostname: "app.example.test",
	protocol: "https",
});

const authenticatedRequest = (token = "access-token-with-enough-entropy") => ({
	body: {},
	headers: {
		authorization: `Bearer ${token}`,
		host: "app.example.test",
		origin: "https://app.example.test",
	},
	hostname: "app.example.test",
	protocol: "https",
});

const mockYubicoResponse = (secretKey, mutateFields = (fields) => fields) => {
	vi.spyOn(https, "request").mockImplementation(
		/** @type {any} */ (
			(requestUrl, _options, callback) => {
				const request = new EventEmitter();
				const response = new EventEmitter();
				response.statusCode = 200;
				response.setEncoding = vi.fn();
				response.resume = vi.fn();
				request.destroy = (error) => {
					if (error) request.emit("error", error);
				};
				request.end = () => {
					const url = new URL(requestUrl);
					const fields = mutateFields({
						nonce: url.searchParams.get("nonce"),
						otp: url.searchParams.get("otp"),
						status: "OK",
						t: "2026-08-31T00:00:00Z0000",
					});
					const canonical = Object.entries(fields)
						.sort(([left], [right]) => left.localeCompare(right))
						.map(([key, value]) => `${key}=${value}`)
						.join("&");
					const signature = crypto.createHmac("sha1", secretKey).update(canonical).digest("base64");
					callback(response);
					queueMicrotask(() => {
						response.emit("data", `${canonical.replaceAll("&", "\n")}\nh=${signature}\n`);
						response.emit("end");
					});
				};
				return request;
			}
		),
	);
};

describe("2fa-service hardening", () => {
	beforeEach(() => {
		methodRows = [];
		backupRows = [];
		challengeRows = [];
		delete process.env.YUBICO_CLIENT_ID;
		delete process.env.YUBICO_SECRET_KEY;
		delete process.env.YUBICO_API_URL;
		delete process.env.PASSKEY_ORIGIN;
		delete process.env.PASSKEY_RP_ID;
		process.env.NODE_ENV = "test";
		vi.clearAllMocks();
	});

	afterEach(() => {
		vi.useRealTimers();
		vi.restoreAllMocks();
	});

	describe("TOTP enrollment", () => {
		it("encrypts and binds a pending setup to the initiating access token", async () => {
			const result = await twoFaService.setupTotp(1, "test@example.com", authenticatedRequest());
			expect(result.qrDataUrl).toMatch(/^data:image/);
			expect(methodRows[0].secret).toBe("enc:v1:cipher:JBSWY3DPEHPK3PXP");
			expect(methodRows[0].meta.sessionBinding).toMatch(/^[a-f0-9]{64}$/);

			await expect(
				twoFaService.verifyAndEnableTotp(1, "123456", authenticatedRequest("different-access-token-value")),
			).rejects.toMatchObject({ name: "ValidationError" });
			expect(methodRows[0].is_verified).toBe(0);
		});

		it("activates a setup only once and creates one recovery-code set", async () => {
			const req = authenticatedRequest();
			await twoFaService.setupTotp(1, "test@example.com", req);
			const codes = await twoFaService.verifyAndEnableTotp(1, "123456", req);

			expect(codes).toHaveLength(8);
			expect(methodRows[0].is_verified).toBe(1);
			expect(backupRows).toHaveLength(8);
			await expect(twoFaService.verifyAndEnableTotp(1, "123456", req)).rejects.toMatchObject({
				name: "ValidationError",
			});
		});

		it("never accepts an unverified TOTP record during login", async () => {
			methodRows.push({ user_id: 1, type: "totp", secret: "JBSWY3DPEHPK3PXP", is_verified: 0, is_deleted: 0 });
			await expect(twoFaService.verifyTotp(1, "123456")).resolves.toBe(false);
		});
	});

	describe("login purpose binding", () => {
		it("accepts only login and step-up purposes from the validated parent challenge", async () => {
			await expect(
				twoFaService.verifyLoginChallenge(1, "totp", "123456", {
					sessionBinding: "auth-challenge:1",
					purpose: "step_up",
				}),
			).resolves.toBe(false);
			await expect(
				twoFaService.verifyLoginChallenge(1, "totp", "123456", {
					sessionBinding: "auth-challenge:2",
					purpose: "attacker_chosen",
				}),
			).rejects.toMatchObject({ name: "ValidationError" });
		});
	});

	describe("backup-code races", () => {
		it("regenerates exactly one complete code set", async () => {
			const codes = await twoFaService.regenerateBackupCodes(1);
			expect(codes).toHaveLength(8);
			expect(new Set(codes).size).toBe(8);
			expect(backupRows).toHaveLength(8);
			expect(replaceForUser).toHaveBeenCalledTimes(1);
		});

		it("consumes a normalized recovery code only once", async () => {
			backupRows.push({ id: 1, user_id: 1, code_hash: "hash:ABCDE12345", used_at: null });
			const attempts = await Promise.all([
				twoFaService.verifyBackupCode(1, "abcde-12345"),
				twoFaService.verifyBackupCode(1, "ABCDE12345"),
			]);
			expect(attempts.filter(Boolean)).toHaveLength(1);
		});
	});

	describe("WebAuthn", () => {
		it("requires explicit production origin configuration", async () => {
			process.env.NODE_ENV = "production";
			await expect(
				twoFaService.beginPasskeyRegistration(1, "test@example.com", authenticatedRequest()),
			).rejects.toMatchObject({ name: "ConfigurationError" });
		});

		it("requires user verification and stores a bound registration challenge", async () => {
			const result = await twoFaService.beginPasskeyRegistration(1, "test@example.com", authenticatedRequest());
			expect(result.challengeId).toHaveLength(43);
			expect(challengeRows[0]).toMatchObject({
				type: "passkey_registration",
				purpose: "mfa_enrollment",
				rp_id: "app.example.test",
				origin: "https://app.example.test",
			});
			expect(webauthn.generateRegistrationOptions).toHaveBeenCalledWith(
				expect.objectContaining({
					authenticatorSelection: expect.objectContaining({ userVerification: "required" }),
				}),
			);
		});

		it("consumes registration once and stores a globally hashed credential ID", async () => {
			const req = authenticatedRequest("registration-access-token-value");
			const { challengeId } = await twoFaService.beginPasskeyRegistration(1, "test@example.com", req);
			const result = await twoFaService.completePasskeyRegistration(
				1,
				challengeId,
				{ response: { transports: ["internal"] } },
				req,
				"Laptop Passkey",
			);

			const passkey = methodRows.find((row) => row.type === "passkey");
			expect(passkey).toMatchObject({
				user_id: 1,
				secret: "credential-1",
				credential_id_hash: crypto.createHash("sha256").update("credential-1").digest("hex"),
				is_verified: 1,
			});
			expect(result.backupCodes).toHaveLength(8);
			expect(webauthn.verifyRegistrationResponse).toHaveBeenCalledWith(
				expect.objectContaining({ requireUserVerification: true }),
			);
			await expect(
				twoFaService.completePasskeyRegistration(1, challengeId, {}, req, "Replay"),
			).rejects.toMatchObject({ name: "ValidationError" });
		});

		it("atomically consumes authentication challenges and advances the counter", async () => {
			const credentialId = "credential-1";
			methodRows.push({
				id: 1,
				user_id: 1,
				type: "passkey",
				secret: credentialId,
				credential_id_hash: crypto.createHash("sha256").update(credentialId).digest("hex"),
				public_key: Buffer.from([1, 2, 3]).toString("base64"),
				counter: 0,
				is_verified: 1,
				is_deleted: 0,
			});
			const req = pendingRequest();
			const { challengeId } = await twoFaService.beginPasskeyAuthentication(1, req);
			await expect(
				twoFaService.completePasskeyAuthentication(1, challengeId, { id: credentialId }, req),
			).resolves.toBe(true);
			expect(methodRows[0].counter).toBe(1);
			expect(challengeRows[0].consumed_at).toBeInstanceOf(Date);
			await expect(
				twoFaService.completePasskeyAuthentication(1, challengeId, { id: credentialId }, req),
			).rejects.toMatchObject({ name: "ValidationError" });
		});

		it("rejects a cloned credential counter rollback", async () => {
			const credentialId = "credential-clone";
			methodRows.push({
				id: 1,
				user_id: 1,
				type: "passkey",
				secret: credentialId,
				credential_id_hash: crypto.createHash("sha256").update(credentialId).digest("hex"),
				public_key: Buffer.from([1]).toString("base64"),
				counter: 5,
				is_verified: 1,
				is_deleted: 0,
			});
			webauthn.verifyAuthenticationResponse.mockResolvedValueOnce({
				verified: true,
				authenticationInfo: { newCounter: 4 },
			});
			const req = pendingRequest("second-pending-token-with-entropy");
			const { challengeId } = await twoFaService.beginPasskeyAuthentication(1, req);
			await expect(
				twoFaService.completePasskeyAuthentication(1, challengeId, { id: credentialId }, req),
			).rejects.toThrow(/counter rollback/i);
		});

		it("rejects authentication challenges from another session or after expiry", async () => {
			const credentialId = "credential-bound";
			methodRows.push({
				id: 1,
				user_id: 1,
				type: "passkey",
				secret: credentialId,
				credential_id_hash: crypto.createHash("sha256").update(credentialId).digest("hex"),
				public_key: Buffer.from([1]).toString("base64"),
				counter: 0,
				is_verified: 1,
				is_deleted: 0,
			});
			const req = pendingRequest("bound-passkey-pending-token");
			const { challengeId } = await twoFaService.beginPasskeyAuthentication(1, req);

			await expect(
				twoFaService.completePasskeyAuthentication(
					1,
					challengeId,
					{ id: credentialId },
					pendingRequest("different-passkey-pending-token"),
				),
			).rejects.toMatchObject({ name: "ValidationError" });
			expect(challengeRows[0].consumed_at).toBeNull();

			challengeRows[0].expires_at = new Date(Date.now() - 1);
			await expect(
				twoFaService.completePasskeyAuthentication(1, challengeId, { id: credentialId }, req),
			).rejects.toMatchObject({ name: "ValidationError" });
			expect(webauthn.verifyAuthenticationResponse).not.toHaveBeenCalled();
		});
	});

	describe("Duo", () => {
		const config = {
			clientId: "DI123456789012345678",
			clientSecret: "s".repeat(40),
			apiHost: "api-123.duosecurity.com",
			redirectUrl: "https://app.example.test/duo-callback",
		};

		it("rejects unsafe provider configuration and encrypts accepted secrets", async () => {
			await expect(twoFaService.setupDuo(1, { ...config, apiHost: "attacker.example" })).rejects.toMatchObject({
				name: "ValidationError",
			});
			await expect(twoFaService.setupDuo(1, { ...config, clientSecret: "s".repeat(39) })).rejects.toMatchObject({
				name: "ValidationError",
			});
			const record = await twoFaService.setupDuo(1, config);
			expect(record.meta.clientSecret).toMatch(/^enc:v1:/);
		});

		it("binds, validates, and consumes callback state", async () => {
			await twoFaService.setupDuo(1, config);
			const req = pendingRequest("duo-pending-token-with-entropy");
			const { state } = await twoFaService.beginDuoAuthentication(1, "test@example.com", req);
			await expect(
				twoFaService.completeDuoAuthentication(1, "test@example.com", "duo-code", state, req),
			).resolves.toBe(true);
			await expect(
				twoFaService.completeDuoAuthentication(1, "test@example.com", "duo-code", state, req),
			).rejects.toMatchObject({ name: "ValidationError" });
		});

		it("revalidates stored provider configuration before every redirect", async () => {
			const record = await twoFaService.setupDuo(1, config);
			record.meta.apiHost = "attacker.example";

			await expect(
				twoFaService.beginDuoAuthentication(1, "test@example.com", pendingRequest("tampered-duo-config-token")),
			).rejects.toMatchObject({ name: "ConfigurationError" });
			expect(duo.createAuthUrl).not.toHaveBeenCalled();
		});

		it("rejects callback state from another session and after its TTL", async () => {
			await twoFaService.setupDuo(1, config);
			const req = pendingRequest("bound-duo-pending-token");
			const { state } = await twoFaService.beginDuoAuthentication(1, "test@example.com", req);

			await expect(
				twoFaService.completeDuoAuthentication(
					1,
					"test@example.com",
					"duo-code",
					state,
					pendingRequest("different-duo-pending-token"),
				),
			).rejects.toMatchObject({ name: "ValidationError" });
			expect(challengeRows[0].consumed_at).toBeNull();

			challengeRows[0].expires_at = new Date(Date.now() - 1);
			await expect(
				twoFaService.completeDuoAuthentication(1, "test@example.com", "duo-code", state, req),
			).rejects.toMatchObject({ name: "ValidationError" });
			expect(duo.exchange).not.toHaveBeenCalled();
		});
	});

	describe("YubiKey fail-closed behavior", () => {
		it("rejects malformed OTPs before network access", async () => {
			await expect(twoFaService.addYubikey(1, "short")).rejects.toMatchObject({ name: "ValidationError" });
		});

		it("requires signed-validator credentials instead of using a demo client", async () => {
			const otp = "c".repeat(44);
			await expect(twoFaService.addYubikey(1, otp)).rejects.toMatchObject({ name: "ConfigurationError" });
		});

		it("accepts only a signed response correlated to the submitted OTP and nonce", async () => {
			const secretKey = Buffer.alloc(20, 7);
			process.env.YUBICO_CLIENT_ID = "12345";
			process.env.YUBICO_SECRET_KEY = secretKey.toString("base64");
			mockYubicoResponse(secretKey);

			const record = await twoFaService.addYubikey(1, "c".repeat(44));
			expect(record.secret).toBe("c".repeat(12));
			expect(https.request).toHaveBeenCalledTimes(1);
		});

		it("rejects a correctly signed response for a different OTP", async () => {
			const secretKey = Buffer.alloc(20, 9);
			process.env.YUBICO_CLIENT_ID = "12345";
			process.env.YUBICO_SECRET_KEY = secretKey.toString("base64");
			mockYubicoResponse(secretKey, (fields) => ({ ...fields, otp: "d".repeat(44) }));

			await expect(twoFaService.addYubikey(1, "c".repeat(44))).rejects.toMatchObject({ name: "ValidationError" });
		});
	});
});
