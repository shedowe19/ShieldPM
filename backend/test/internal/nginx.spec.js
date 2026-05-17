import { beforeEach, describe, expect, it, vi } from "vitest";

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

import fs from "node:fs";
import internalNginx from "../../internal/nginx.js";

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

	it("calls access.can('settings:read') before reading log", async () => {
		readFileSpy.mockResolvedValueOnce("some log");
		const access = makeAccess();
		await internalNginx.getLogs(access, "error");
		expect(access.can).toHaveBeenCalledWith("settings:read");
	});

	it("returns json_access log for log_type='json_access'", async () => {
		readFileSpy.mockResolvedValueOnce('{"status":200,"http_host":"example.com"}');
		const access = makeAccess();
		const result = await internalNginx.getLogs(access, "json_access");
		expect(result).toContain("http_host");
		expect(readFileSpy).toHaveBeenCalledWith(
			expect.stringContaining("json_access.log"),
			"utf8",
		);
	});

	it("returns stream log for log_type='stream'", async () => {
		readFileSpy.mockResolvedValueOnce("stream log content");
		const access = makeAccess();
		await internalNginx.getLogs(access, "stream");
		expect(readFileSpy).toHaveBeenCalledWith(
			expect.stringContaining("stream.log"),
			"utf8",
		);
	});

	it("defaults to error log for unknown log_type", async () => {
		readFileSpy.mockResolvedValueOnce("error log content");
		const access = makeAccess();
		await internalNginx.getLogs(access, "unknown_type");
		expect(readFileSpy).toHaveBeenCalledWith(expect.stringContaining("error.log"), "utf8");
	});
});
