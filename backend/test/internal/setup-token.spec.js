import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ info: vi.fn(), error: vi.fn() }));
vi.mock("../../internal/nginx.js", () => ({ default: {} }));
vi.mock("../../lib/certbot.js", () => ({ installPlugins: vi.fn() }));
vi.mock("../../lib/utils.js", () => ({ default: { writeHash: vi.fn() } }));
vi.mock("../../logger.js", () => ({ setup: { info: mocks.info, error: mocks.error } }));
vi.mock("../../models/auth.js", () => ({ default: {} }));
vi.mock("../../models/certificate.js", () => ({ default: {} }));
vi.mock("../../models/dead_host.js", () => ({ default: {} }));
vi.mock("../../models/proxy_host.js", () => ({ default: {} }));
vi.mock("../../models/redirection_host.js", () => ({ default: {} }));
vi.mock("../../models/setting.js", () => ({ default: {} }));
vi.mock("../../models/stream.js", () => ({ default: {} }));
vi.mock("../../models/user.js", () => ({ default: {} }));
vi.mock("../../models/user_permission.js", () => ({ default: {} }));

import { getSetupToken, getSetupTokenPath, isSetupTokenValid } from "../../setup.js";

describe("first-administrator setup token", () => {
	let dataPath;

	beforeEach(() => {
		vi.clearAllMocks();
		dataPath = fs.mkdtempSync(path.join(os.tmpdir(), "shieldpm-setup-token-"));
		vi.stubEnv("DATA_PATH", dataPath);
		vi.stubEnv("SETUP_TOKEN", "");
	});
	afterEach(() => {
		vi.unstubAllEnvs();
		fs.rmSync(dataPath, { recursive: true, force: true });
	});

	it("uses SETUP_TOKEN exactly when configured and creates no file", () => {
		vi.stubEnv("SETUP_TOKEN", "configured-token");
		expect(getSetupToken()).toBe("configured-token");
		expect(isSetupTokenValid("configured-token")).toBe(true);
		expect(isSetupTokenValid("configured-token ")).toBe(false);
		expect(fs.existsSync(getSetupTokenPath())).toBe(false);
	});

	it("persists a random token with owner-only permissions and logs only its path", () => {
		const token = getSetupToken();
		expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);
		expect(fs.readFileSync(getSetupTokenPath(), "utf8").trim()).toBe(token);
		if (process.platform !== "win32") {
			expect(fs.statSync(getSetupTokenPath()).mode & 0o777).toBe(0o600);
		}
		const logged = mocks.info.mock.calls.flat().join(" ");
		expect(logged).toContain(getSetupTokenPath());
		expect(logged).not.toContain(token);
		expect(getSetupToken()).toBe(token);
		expect(isSetupTokenValid(token)).toBe(true);
		expect(isSetupTokenValid(`${token}x`)).toBe(false);
	});

	it("rejects missing, empty and non-string values", () => {
		const token = getSetupToken();
		expect(isSetupTokenValid(undefined)).toBe(false);
		expect(isSetupTokenValid(null)).toBe(false);
		expect(isSetupTokenValid("")).toBe(false);
		expect(isSetupTokenValid(["token"])).toBe(false);
		expect(isSetupTokenValid(token)).toBe(true);
	});

	it("resolves the token path inside DATA_PATH", () => {
		expect(getSetupTokenPath()).toBe(path.join(dataPath, "setup-token"));
	});
});
