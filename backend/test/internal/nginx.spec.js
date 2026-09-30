import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// ── Mocks ────────────────────────────────────────────────────────────────────
vi.mock("../../db.js", () => ({ default: () => ({}) }));
vi.mock("../../lib/config.js", () => ({
	isDestructiveTestMode: vi.fn().mockReturnValue(false),
	configHas: vi.fn().mockReturnValue(true),
	configGet: vi.fn().mockReturnValue("mock-value"),
	isSqlite: vi.fn().mockReturnValue(true),
	isMysql: vi.fn().mockReturnValue(false),
	isPostgres: vi.fn().mockReturnValue(false),
	getPrivateKey: vi.fn().mockReturnValue("mock-private-key"),
	getPublicKey: vi.fn().mockReturnValue("mock-public-key"),
	getEncryptionKey: vi.fn().mockReturnValue("0".repeat(64)),
	isDemoMode: vi.fn().mockReturnValue(false),
}));
vi.mock("../../internal/anubis.js", () => ({ default: {} }));
const state = vi.hoisted(() => ({ policy: vi.fn() }));
vi.mock("../../internal/nginx-options.js", () => ({ default: { getPolicy: state.policy } }));

import fs from "node:fs";
import internalNginx from "../../internal/nginx.js";
import utils from "../../lib/utils.js";

// Spy on fs.promises.readFile after import so we can control it per test
const readFileSpy = vi.spyOn(fs.promises, "readFile");

// ── Helpers ──────────────────────────────────────────────────────────────────
const makeAccess = () => ({ can: vi.fn().mockResolvedValue(true) });

// ── Tests ────────────────────────────────────────────────────────────────────
describe("Fix #59: internalNginx.getLogs", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it("getLogs is defined as a function", () => {
		expect(typeof internalNginx.getLogs).toBe("function");
	});

	it("returns error log contents for log_type='error'", async () => {
		readFileSpy.mockResolvedValueOnce("2026/01/01 00:00:00 [error] connect() failed");
		const access = makeAccess();
		const result = await internalNginx.getLogs(access, "error");
		expect(result).toContain("[error]");
		expect(readFileSpy).toHaveBeenCalledWith(expect.stringContaining("error.log"), "utf8");
	});

	it("returns access log contents for log_type='access'", async () => {
		readFileSpy.mockResolvedValueOnce('{"status":200,"request":"GET /"}');
		const access = makeAccess();
		const result = await internalNginx.getLogs(access, "access");
		expect(result).toContain("200");
		expect(readFileSpy).toHaveBeenCalledWith(expect.stringContaining("access.log"), "utf8");
	});

	it("returns friendly message when log file does not exist", async () => {
		const notFoundErr = Object.assign(new Error("ENOENT"), { code: "ENOENT" });
		readFileSpy.mockRejectedValueOnce(notFoundErr);
		const access = makeAccess();
		const result = await internalNginx.getLogs(access, "error");
		expect(result).toContain("Log file not found");
	});

	it("re-throws unexpected filesystem errors", async () => {
		const permErr = Object.assign(new Error("EACCES"), { code: "EACCES" });
		readFileSpy.mockRejectedValueOnce(permErr);
		const access = makeAccess();
		await expect(internalNginx.getLogs(access, "error")).rejects.toThrow("EACCES");
	});

	it("calls access.can('settings:get') before reading log", async () => {
		readFileSpy.mockResolvedValueOnce("some log");
		const access = makeAccess();
		await internalNginx.getLogs(access, "error");
		expect(access.can).toHaveBeenCalledWith("settings:get");
	});

	it("returns json_access log for log_type='json_access'", async () => {
		readFileSpy.mockResolvedValueOnce('{"status":200,"http_host":"example.com"}');
		const access = makeAccess();
		const result = await internalNginx.getLogs(access, "json_access");
		expect(result).toContain("http_host");
		expect(readFileSpy).toHaveBeenCalledWith(expect.stringContaining("json_access.log"), "utf8");
	});

	it("returns stream log for log_type='stream'", async () => {
		readFileSpy.mockResolvedValueOnce("stream log content");
		const access = makeAccess();
		await internalNginx.getLogs(access, "stream");
		expect(readFileSpy).toHaveBeenCalledWith(expect.stringContaining("stream.log"), "utf8");
	});

	it("defaults to error log for unknown log_type", async () => {
		readFileSpy.mockResolvedValueOnce("error log content");
		const access = makeAccess();
		await internalNginx.getLogs(access, "unknown_type");
		expect(readFileSpy).toHaveBeenCalledWith(expect.stringContaining("error.log"), "utf8");
	});
});

describe("saved Nginx formatting options", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		state.policy.mockResolvedValue({ beautifier_enabled: true });
		vi.spyOn(internalNginx, "renderConfig").mockResolvedValue("server { listen 80; }\n");
		vi.spyOn(fs.promises, "writeFile").mockResolvedValue();
		vi.spyOn(utils, "execFile").mockResolvedValue("");
	});
	afterEach(() => {
		vi.restoreAllMocks();
		vi.unstubAllEnvs();
	});
	it.each([true, false])("uses saved beautifier_enabled=%s despite a conflicting obsolete env", async (enabled) => {
		state.policy.mockResolvedValue({ beautifier_enabled: enabled });
		vi.stubEnv("DISABLE_NGINX_BEAUTIFIER", enabled ? "true" : "false");
		await expect(internalNginx.generateConfig("proxy_host", { id: 7 })).resolves.toBe(true);
		expect(fs.promises.writeFile).toHaveBeenCalledWith("/data/nginx/proxy_host/7.conf", "server { listen 80; }\n", {
			encoding: "utf8",
		});
		if (enabled)
			expect(utils.execFile).toHaveBeenCalledExactlyOnceWith("nginxbeautifier", [
				"-s",
				"4",
				"/data/nginx/proxy_host/7.conf",
			]);
		else expect(utils.execFile).not.toHaveBeenCalled();
	});
	it("rejects a failed saved-policy read before rendering, writing or starting the formatter", async () => {
		state.policy.mockRejectedValueOnce(new Error("saved policy is invalid"));
		await expect(internalNginx.generateConfig("proxy_host", { id: 7 })).rejects.toThrow("saved policy is invalid");
		expect(internalNginx.renderConfig).not.toHaveBeenCalled();
		expect(fs.promises.writeFile).not.toHaveBeenCalled();
		expect(utils.execFile).not.toHaveBeenCalled();
	});
	it("waits for the saved policy before any file rendering or write", async () => {
		const pending = Promise.withResolvers();
		state.policy.mockReturnValueOnce(pending.promise);
		const generating = internalNginx.generateConfig("proxy_host", { id: 7 });
		expect(internalNginx.renderConfig).not.toHaveBeenCalled();
		expect(fs.promises.writeFile).not.toHaveBeenCalled();
		pending.resolve({ beautifier_enabled: false });
		await generating;
		expect(internalNginx.renderConfig).toHaveBeenCalledOnce();
		expect(fs.promises.writeFile).toHaveBeenCalledOnce();
	});
	it("retains the generated configuration if the optional formatter fails", async () => {
		vi.mocked(utils.execFile).mockRejectedValueOnce(new Error("formatter unavailable"));
		await expect(internalNginx.generateConfig("proxy_host", { id: 7 })).resolves.toBe(true);
		expect(fs.promises.writeFile).toHaveBeenCalledOnce();
	});
});
