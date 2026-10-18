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

import fs from "node:fs";
import internalNginx from "../../internal/nginx.js";
import utils from "../../lib/utils.js";

// Spy on fs.promises.readFile after import so we can control it per test
let readFileSpy;

afterEach(() => {
	vi.restoreAllMocks();
	vi.unstubAllEnvs();
});

// ── Helpers ──────────────────────────────────────────────────────────────────
const makeAccess = () => ({ can: vi.fn().mockResolvedValue(true) });

// ── Tests ────────────────────────────────────────────────────────────────────
describe("Fix #59: internalNginx.getLogs", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		readFileSpy = vi.spyOn(fs.promises, "readFile");
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

describe("Nginx config literal preservation", () => {
	let writeFile;
	let beautify;
	const rendered = `log_format fixture escape=json '{"status":$status}';
server {
    add_header X-Literal '{"trailing":"$status}#literal"}';
    content_by_lua_block { ngx.say([[  preserve { braces } and whitespace  ]]) }
}
`;
	beforeEach(() => {
		vi.spyOn(internalNginx, "renderConfig").mockResolvedValue(rendered);
		writeFile = vi.spyOn(fs.promises, "writeFile").mockResolvedValue();
		beautify = vi.spyOn(utils, "execFile").mockResolvedValue("");
	});

	it.each([undefined, "false", "true"])(
		"preserves literals with legacy DISABLE_NGINX_BEAUTIFIER=%s",
		async (value) => {
			vi.stubEnv("DISABLE_NGINX_BEAUTIFIER", value);
			const host = { id: 12 };
			const filename = internalNginx.getConfigName("proxy_host", host.id);
			expect(await internalNginx.generateConfig("proxy_host", host)).toBe(true);
			expect(internalNginx.renderConfig).toHaveBeenCalledExactlyOnceWith("proxy_host", host);
			expect(writeFile).toHaveBeenCalledExactlyOnceWith(filename, rendered, {
				encoding: "utf8",
			});
			expect(beautify).not.toHaveBeenCalled();
		},
	);
});
