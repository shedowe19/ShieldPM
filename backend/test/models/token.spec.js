import { describe, expect, it, vi } from "vitest";

// vi.hoisted runs before vi.mock hoisting, so the pair is available
const { pair } = vi.hoisted(() => {
	const crypto = require("node:crypto");
	const pair = crypto.generateKeyPairSync("rsa", {
		modulusLength: 2048,
		publicKeyEncoding: { type: "spki", format: "pem" },
		privateKeyEncoding: { type: "pkcs8", format: "pem" },
	});
	return { pair };
});

vi.mock("../../lib/config.js", () => ({
	getPrivateKey: vi.fn(() => pair.privateKey),
	getPublicKey: vi.fn(() => pair.publicKey),
	configGet: vi.fn(),
	configHas: vi.fn(),
}));

vi.mock("../../lib/error.js", () => ({
	default: {
		AuthError: class AuthError extends Error {
			constructor(msg) {
				super(msg);
				this.name = "AuthError";
			}
		},
	},
}));

vi.mock("../../logger.js", () => ({
	global: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}));

const { default: tokenFactory } = await import("../../models/token.js");

describe("Token model", () => {
	it("is a factory function", () => {
		expect(typeof tokenFactory).toBe("function");
	});

	it("returns an object with create, load, hasScope, get, set, getUserId", () => {
		const token = tokenFactory();
		expect(typeof token.create).toBe("function");
		expect(typeof token.load).toBe("function");
		expect(typeof token.hasScope).toBe("function");
		expect(typeof token.get).toBe("function");
		expect(typeof token.set).toBe("function");
		expect(typeof token.getUserId).toBe("function");
	});

	it("set and get work", () => {
		const token = tokenFactory();
		token.set("foo", "bar");
		expect(token.get("foo")).toBe("bar");
	});

	it("get returns null for unknown key", () => {
		const token = tokenFactory();
		expect(token.get("nonexistent")).toBeNull();
	});

	it("getUserId returns 0 by default", () => {
		const token = tokenFactory();
		expect(token.getUserId()).toBe(0);
	});

	it("getUserId returns default value when provided", () => {
		const token = tokenFactory();
		expect(token.getUserId(42)).toBe(42);
	});

	it("hasScope returns false when no scope set", () => {
		const token = tokenFactory();
		expect(token.hasScope("user")).toBe(false);
	});

	it("create generates a JWT token", async () => {
		const token = tokenFactory();
		const result = await token.create({
			scope: ["user"],
			attrs: { id: 1 },
		});
		expect(result).toHaveProperty("token");
		expect(result).toHaveProperty("payload");
		expect(typeof result.token).toBe("string");
		expect(result.token.split(".")).toHaveLength(3);
	});

	it("create + load round-trips", async () => {
		const token = tokenFactory();
		const { token: jwt } = await token.create({
			scope: ["user"],
			attrs: { id: 5 },
			expiresIn: "1h",
		});

		const loader = tokenFactory();
		const data = await loader.load(jwt);
		expect(data.scope).toEqual(["user"]);
		expect(data.attrs.id).toBe(5);
	});

	it("hasScope returns true after loading a token with that scope", async () => {
		const token = tokenFactory();
		const { token: jwt } = await token.create({
			scope: ["user"],
			attrs: { id: 1 },
		});

		const loader = tokenFactory();
		await loader.load(jwt);
		expect(loader.hasScope("user")).toBe(true);
		expect(loader.hasScope("admin")).toBe(false);
	});

	it("getUserId returns attrs.id from loaded token", async () => {
		const token = tokenFactory();
		const { token: jwt } = await token.create({
			scope: ["user"],
			attrs: { id: 99 },
		});

		const loader = tokenFactory();
		await loader.load(jwt);
		expect(loader.getUserId()).toBe(99);
	});
});
