import { describe, expect, it, vi, beforeEach } from "vitest";

vi.mock("../../logger.js", () => ({
	global: { info: vi.fn(), error: vi.fn() },
	debug: vi.fn(),
}));

vi.mock("../../lib/error.js", () => {
	class CommandError extends Error {
		constructor(msg, code) {
			super(msg);
			this.name = "CommandError";
			this.code = code;
		}
	}
	return {
		default: { CommandError },
	};
});

const mockExecFile = vi.fn();
vi.mock("node:child_process", () => ({
	execFile: mockExecFile,
}));

vi.mock("node:util", async (importOriginal) => {
	const orig = await importOriginal();
	return {
		...orig,
		promisify: () => mockExecFile,
	};
});

const utils = (await import("../../lib/utils.js")).default;

describe("utils", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	describe("execFile", () => {
		it("returns trimmed stdout+stderr on success", async () => {
			mockExecFile.mockResolvedValue({ stdout: "  hello  ", stderr: "world  " });
			const result = await utils.execFile("echo", ["hi"]);
			expect(result).toBe("hello  world");
		});

		it("throws CommandError on failure", async () => {
			const err = new Error("fail");
			err.stdout = "out ";
			err.stderr = "err ";
			mockExecFile.mockRejectedValue(err);
			await expect(utils.execFile("bad", [])).rejects.toThrow("out err");
		});
	});

	describe("omitRow", () => {
		it("returns a function that omits specified keys", () => {
			const fn = utils.omitRow(["password", "secret"]);
			const result = fn({ id: 1, name: "test", password: "hidden", secret: "x" });
			expect(result).toEqual({ id: 1, name: "test" });
		});
	});

	describe("omitRows", () => {
		it("returns a function that omits keys from all rows", () => {
			const fn = utils.omitRows(["password"]);
			const rows = [
				{ id: 1, password: "a" },
				{ id: 2, password: "b" },
			];
			const result = fn(rows);
			expect(result).toEqual([{ id: 1 }, { id: 2 }]);
		});
	});

	describe("getRenderEngine", () => {
		it("returns an object with renderFile method", () => {
			const engine = utils.getRenderEngine();
			expect(engine).toBeDefined();
			expect(typeof engine.renderFile === "function" || typeof engine.parseAndRender === "function").toBe(true);
		});

		it("has nginxAccessRule filter registered", async () => {
			const engine = utils.getRenderEngine();
			// Test the filter via rendering a template string
			const result = await engine.parseAndRender("{{ rule | nginxAccessRule }}", {
				rule: { directive: "allow", address: "192.168.1.0/24" },
			});
			expect(result).toBe("allow 192.168.1.0/24;");
		});

		it("nginxAccessRule returns empty for missing fields", async () => {
			const engine = utils.getRenderEngine();
			const result = await engine.parseAndRender("{{ rule | nginxAccessRule }}", {
				rule: { directive: "", address: "" },
			});
			expect(result).toBe("");
		});
	});
});
