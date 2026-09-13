import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../logger.js", () => ({ global: { info: vi.fn(), error: vi.fn() } }));

let dataPath;
let keysFile;
const originalWrite = fs.writeFileSync;

beforeEach(() => {
	vi.resetModules();
	dataPath = fs.mkdtempSync(path.join(os.tmpdir(), "shieldpm-keys-"));
	keysFile = path.join(dataPath, "shieldpm", "keys.json");
	fs.mkdirSync(path.dirname(keysFile));
	vi.stubEnv("DATA_PATH", dataPath);
	vi.spyOn(process, "exit").mockImplementation(() => {
		throw new Error("startup stopped");
	});
});

afterEach(() => {
	vi.restoreAllMocks();
	vi.unstubAllEnvs();
	fs.rmSync(dataPath, { recursive: true, force: true });
});

const legacyKeys = () => {
	const { privateKey, publicKey } = crypto.generateKeyPairSync("rsa", {
		modulusLength: 2048,
		publicKeyEncoding: { type: "spki", format: "pem" },
		privateKeyEncoding: { type: "pkcs8", format: "pem" },
	});
	return { key: privateKey, pub: publicKey };
};

const failKeyWrite = () =>
	vi.spyOn(fs, "writeFileSync").mockImplementation((filename, content, options) => {
		if (typeof content === "string" && content.includes('"encryptionKey"')) {
			originalWrite(filename, content.slice(0, 30), options);
			throw Object.assign(new Error("disk full"), { code: "ENOSPC" });
		}
		return originalWrite(filename, content, options);
	});

describe("persistent instance keys", () => {
	it("stops on a malformed existing database configuration instead of selecting a different database", async () => {
		fs.writeFileSync(path.join(dataPath, "shieldpm", "default.json"), '{"database":');
		const config = await import("../../lib/config.js");
		expect(() => config.configGet("database")).toThrow(/Could not read database configuration/);
		expect(fs.existsSync(keysFile)).toBe(false);
	});

	it("preserves the previous RSA key file when encryption-key migration cannot finish writing", async () => {
		const previous = JSON.stringify(legacyKeys());
		fs.writeFileSync(keysFile, previous);
		failKeyWrite();
		const config = await import("../../lib/config.js");
		expect(() => config.getEncryptionKey()).toThrow("startup stopped");
		expect(fs.readFileSync(keysFile, "utf8")).toBe(previous);
		expect(fs.readdirSync(path.dirname(keysFile))).toEqual(["keys.json"]);
	});

	it("does not publish a partial key file on failed initial creation, and permits retry", async () => {
		failKeyWrite();
		let config = await import("../../lib/config.js");
		expect(() => config.getPublicKey()).toThrow("startup stopped");
		expect(fs.existsSync(keysFile)).toBe(false);
		expect(fs.readdirSync(path.dirname(keysFile))).toEqual([]);
		vi.mocked(fs.writeFileSync).mockRestore();
		vi.resetModules();
		config = await import("../../lib/config.js");
		expect(config.getPublicKey()).toMatch(/BEGIN PUBLIC KEY/);
	});

	it("retains all existing keys while atomically adding the missing encryption key", async () => {
		const previous = { ...legacyKeys(), extension: { retained: true } };
		fs.writeFileSync(keysFile, JSON.stringify(previous), { mode: 0o644 });
		const config = await import("../../lib/config.js");
		expect(config.getEncryptionKey()).toMatch(/^[a-f0-9]{64}$/);
		const saved = JSON.parse(fs.readFileSync(keysFile, "utf8"));
		expect(saved).toMatchObject(previous);
		expect(saved.encryptionKey).toBe(config.getEncryptionKey());
		expect(fs.statSync(keysFile).mode & 0o777).toBe(0o600);
		expect(fs.readdirSync(path.dirname(keysFile))).toEqual(["keys.json"]);
	});

	it("uses the complete key pair already published by another creator", async () => {
		const winner = { ...legacyKeys(), encryptionKey: crypto.randomBytes(32).toString("hex") };
		const originalGenerate = crypto.generateKeyPairSync;
		vi.spyOn(crypto, "generateKeyPairSync").mockImplementation((...args) => {
			// Another process completes creation while this one generates its RSA pair.
			fs.writeFileSync(keysFile, JSON.stringify(winner), { mode: 0o600 });
			return originalGenerate(...args);
		});
		const config = await import("../../lib/config.js");
		expect(config.getPublicKey()).toBe(winner.pub);
		expect(config.getPrivateKey()).toBe(winner.key);
		expect(config.getEncryptionKey()).toBe(winner.encryptionKey);
		expect(JSON.parse(fs.readFileSync(keysFile, "utf8"))).toEqual(winner);
	});
	it("adopts an encryption key published after it read the legacy file", async () => {
		const previous = legacyKeys();
		const winner = { ...previous, encryptionKey: crypto.randomBytes(32).toString("hex") };
		fs.writeFileSync(keysFile, JSON.stringify(previous));
		const originalRead = fs.readFileSync;
		let firstRead = true;
		vi.spyOn(fs, "readFileSync").mockImplementation((filename, options) => {
			const content = originalRead(filename, options);
			if (filename === keysFile && firstRead) {
				firstRead = false;
				originalWrite(keysFile, JSON.stringify(winner), { mode: 0o600 });
			}
			return content;
		});
		const config = await import("../../lib/config.js");
		expect(config.getEncryptionKey()).toBe(winner.encryptionKey);
		expect(JSON.parse(originalRead(keysFile, "utf8"))).toEqual(winner);
		expect(fs.readdirSync(path.dirname(keysFile))).toEqual(["keys.json"]);
	});
	it("reuses the elected migration after a failed publication without changing the original RSA pair", async () => {
		const previous = legacyKeys();
		fs.writeFileSync(keysFile, JSON.stringify(previous));
		const originalRename = fs.renameSync;
		vi.spyOn(fs, "renameSync").mockImplementation((from, to) => {
			if (to === keysFile) throw Object.assign(new Error("disk full"), { code: "ENOSPC" });
			return originalRename(from, to);
		});
		let config = await import("../../lib/config.js");
		expect(() => config.getEncryptionKey()).toThrow("startup stopped");
		expect(JSON.parse(fs.readFileSync(keysFile, "utf8"))).toEqual(previous);
		const candidateFile = fs.readdirSync(path.dirname(keysFile)).find((file) => file.endsWith(".migration"));
		expect(candidateFile).toBeDefined();
		const candidate = JSON.parse(fs.readFileSync(path.join(path.dirname(keysFile), candidateFile), "utf8"));
		expect(candidate).toMatchObject(previous);
		vi.mocked(fs.renameSync).mockRestore();
		vi.resetModules();
		config = await import("../../lib/config.js");
		expect(config.getEncryptionKey()).toBe(candidate.encryptionKey);
		expect(fs.readdirSync(path.dirname(keysFile))).toEqual(["keys.json"]);
	});
});
