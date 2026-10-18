import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../internal/audit-log.js", () => ({ default: { add: vi.fn() } }));

import audit from "../../internal/audit-log.js";
import applications, { validateWasiApplication } from "../../internal/wasi-applications.js";
import errs from "../../lib/error.js";

const fixture = (name) => fs.readFile(new URL(`../fixtures/${name}.wasm`, import.meta.url));
const bytes = await fixture("standalone-wasi");
const access = { can: vi.fn() };
const metadata = { name: "Standalone command", filename: "command.wasm" };
let directory;

const deferred = () => {
	let resolve;
	const promise = new Promise((done) => {
		resolve = done;
	});
	return { promise, resolve };
};

// A complete binary command with an optional infinite module-instantiation start.
// The second function is the normal, empty exported WASI command entry point.
const commandWithStart = (reactor = false) => {
	const section = (id, payload) => [id, payload.length, ...payload];
	const name = (value) => [value.length, ...Buffer.from(value)];
	return Buffer.from([
		0,
		97,
		115,
		109,
		1,
		0,
		0,
		0,
		...section(1, [1, 96, 0, 0]),
		...section(3, [2, 0, 0]),
		...section(5, [1, 0, 1]),
		...section(7, [
			reactor ? 3 : 2,
			...name("memory"),
			2,
			0,
			...name("_start"),
			0,
			1,
			...(reactor ? [...name("_initialize"), 0, 1] : []),
		]),
		...section(8, [0]),
		...section(10, [2, 7, 0, 3, 64, 12, 0, 11, 11, 2, 0, 11]),
	]);
};

const changedName = (original, before, after) => {
	expect(after.length).toBe(before.length);
	const result = Buffer.from(original);
	const offset = result.indexOf(Buffer.from(before));
	expect(offset).toBeGreaterThanOrEqual(0);
	result.write(after, offset);
	return result;
};

beforeEach(async () => {
	directory = await fs.mkdtemp(path.join(os.tmpdir(), "shieldpm-wasi-applications-"));
	vi.stubEnv("DATA_PATH", directory);
	access.can.mockReset().mockResolvedValue(true);
	vi.mocked(audit.add).mockReset().mockResolvedValue(undefined);
});

afterEach(async () => {
	vi.unstubAllEnvs();
	await fs.rm(directory, { recursive: true, force: true });
});

describe("standalone WASI application catalog and real command execution", () => {
	it("requires administration before validation, inspection, catalog access or execution", async () => {
		const denied = { can: vi.fn().mockRejectedValue(new errs.PermissionError("administration denied")) };
		await expect(applications.list(denied)).rejects.toThrow("administration denied");
		await expect(applications.upload(denied, bytes, metadata)).rejects.toThrow("administration denied");
		await expect(applications.upload(denied, "invalid", null)).rejects.toThrow("administration denied");
		await expect(applications.run(denied, "invalid", { execArgv: ["--eval"] })).rejects.toThrow(
			"administration denied",
		);
		await expect(applications.remove(denied, "invalid")).rejects.toThrow("administration denied");
		expect(denied.can).toHaveBeenCalledTimes(5);
		for (const [permission] of denied.can.mock.calls) expect(permission).toBe("settings:update");
		expect(await fs.readdir(directory)).toEqual([]);
		expect(audit.add).not.toHaveBeenCalled();
	});

	it("publishes private immutable bytecode, deduplicates uploads and lists catalog metadata", async () => {
		const row = await applications.upload(access, bytes, { name: "  Own command  ", filename: "OWN.WASM" });
		expect(row).toMatchObject({
			id: row.sha256,
			name: "Own command",
			filename: "OWN.WASM",
			size: bytes.length,
			runtime: "wasi-preview1",
		});
		expect(row.id).toMatch(/^[a-f0-9]{64}$/);
		expect(new Date(row.created_on).getTime()).toBeGreaterThan(0);
		const artifact = path.join(directory, "wasm", "artifacts", `${row.id}.wasm`);
		const catalog = path.join(directory, "wasm", "applications", `${row.id}.json`);
		expect(await fs.readFile(artifact)).toEqual(bytes);
		for (const filename of [artifact, catalog]) {
			const info = await fs.stat(filename);
			expect(info.mode & 0o777).toBe(0o600);
			expect(info.nlink).toBe(1);
		}
		expect((await fs.stat(path.dirname(catalog))).mode & 0o777).toBe(0o700);
		expect(await applications.upload(access, bytes, { name: "Duplicate", filename: "duplicate.wasm" })).toEqual(
			row,
		);
		expect(await applications.list(access)).toEqual([row]);
		expect(audit.add).toHaveBeenCalledOnce();
	});

	it("compiles an infinite module start without instantiating it, then bounds actual execution", async () => {
		const infiniteStart = commandWithStart();
		await expect(validateWasiApplication(infiniteStart)).resolves.toBeUndefined();
		const row = await applications.upload(access, infiniteStart, metadata);
		expect(await applications.run(access, row.id, { timeout_ms: 100 })).toMatchObject({
			status: "timed_out",
			exit_code: null,
			signal: "SIGKILL",
			stdout: "",
			stderr: "",
		});
	}, 7000);

	it("runs exact guest inputs in a real child while keeping execution secrets out of audits", async () => {
		const row = await applications.upload(access, bytes, metadata);
		const result = await applications.run(access, row.id, {
			args: ["private-argument", "MixedCase"],
			env: [{ name: "GUEST_SECRET", value: "private-environment" }],
			stdin: "private-standard-input\n",
		});
		expect(result).toMatchObject({
			status: "failed",
			exit_code: 7,
			stdout: "application.wasm\nprivate-argument\nMixedCase\nGUEST_SECRET=private-environment\nprivate-standard-input\n",
			stderr: "diagnostic\n",
			signal: null,
			truncated: false,
		});
		const records = vi.mocked(audit.add).mock.calls.map(([, event]) => event);
		expect(records).toHaveLength(3);
		expect(records[1].meta).toMatchObject({ application_id: row.id, operation: "run_requested" });
		expect(records[2].meta).toMatchObject({ operation: "run_completed", status: "failed", exit_code: 7 });
		const serialized = JSON.stringify(records);
		for (const secret of [
			"private-argument",
			"MixedCase",
			"GUEST_SECRET",
			"private-environment",
			"private-standard-input",
			"diagnostic",
		])
			expect(serialized).not.toContain(secret);
	});

	it("rechecks permissions when a mutation reaches the catalog queue", async () => {
		const entered = deferred();
		const release = deferred();
		vi.mocked(audit.add).mockImplementationOnce(async () => {
			entered.resolve();
			await release.promise;
		});
		const first = applications.upload(access, bytes, metadata);
		await entered.promise;
		const revoked = {
			can: vi.fn().mockResolvedValueOnce(true).mockRejectedValueOnce(new errs.PermissionError("revoked")),
		};
		const queued = applications.remove(revoked, "a".repeat(64));
		const rejection = expect(queued).rejects.toThrow("revoked");
		try {
			await vi.waitFor(() => expect(revoked.can).toHaveBeenCalledOnce());
		} finally {
			release.resolve();
		}
		const row = await first;
		await rejection;
		expect(revoked.can).toHaveBeenCalledTimes(2);
		expect(await applications.list(access)).toEqual([row]);
	});

	it("lets an accepted run finish after catalog deletion and retains immutable bytecode", async () => {
		const row = await applications.upload(access, bytes, metadata);
		const entered = deferred();
		const release = deferred();
		vi.mocked(audit.add).mockImplementationOnce(async () => {
			entered.resolve();
			await release.promise;
		});
		const running = applications.run(access, row.id, { stdin: "accepted-run\n" });
		await entered.promise;
		try {
			expect(await applications.remove(access, row.id)).toEqual({ deleted: true });
			expect(await applications.list(access)).toEqual([]);
			expect(await fs.readFile(path.join(directory, "wasm", "artifacts", `${row.id}.wasm`))).toEqual(bytes);
		} finally {
			release.resolve();
		}
		expect(await running).toMatchObject({
			status: "failed",
			exit_code: 7,
			stdout: "application.wasm\naccepted-run\n",
		});
		await expect(applications.run(access, row.id, {})).rejects.toBeInstanceOf(errs.ItemNotFoundError);
	});

	it("rejects same-size bytecode tampering before execution or a run audit", async () => {
		const row = await applications.upload(access, bytes, metadata);
		const artifact = path.join(directory, "wasm", "artifacts", `${row.id}.wasm`);
		const changed = Buffer.from(bytes);
		changed[changed.length - 1] ^= 1;
		await fs.writeFile(artifact, changed);
		vi.mocked(audit.add).mockClear();
		await expect(applications.run(access, row.id, {})).rejects.toThrow("artifact hash mismatch");
		expect(audit.add).not.toHaveBeenCalled();
	});

	it("refuses a hard-linked artifact rather than executing an externally shared inode", async () => {
		const row = await applications.upload(access, bytes, metadata);
		await fs.link(
			path.join(directory, "wasm", "artifacts", `${row.id}.wasm`),
			path.join(directory, "outside.wasm"),
		);
		vi.mocked(audit.add).mockClear();
		await expect(applications.run(access, row.id, {})).rejects.toThrow("Unsafe Wasm artifact");
		expect(audit.add).not.toHaveBeenCalled();
	});

	it.each(["artifact", "catalog", "catalog-parent"])("rejects a substituted %s symlink", async (target) => {
		const row = await applications.upload(access, bytes, metadata);
		const artifact = path.join(directory, "wasm", "artifacts", `${row.id}.wasm`);
		const catalog = path.join(directory, "wasm", "applications", `${row.id}.json`);
		if (target === "catalog-parent") {
			const outside = path.join(directory, "outside");
			await fs.rename(path.dirname(catalog), outside);
			await fs.symlink(outside, path.dirname(catalog));
		} else {
			const filename = target === "artifact" ? artifact : catalog;
			const outside = path.join(directory, "outside");
			await fs.rename(filename, outside);
			await fs.symlink(outside, filename);
		}
		await expect(applications.run(access, row.id, {})).rejects.toThrow();
		expect((await fs.lstat(path.join(directory, "outside"))).isSymbolicLink()).toBe(false);
	});

	it("rejects corrupted catalog identifiers and runtime declarations", async () => {
		const row = await applications.upload(access, bytes, metadata);
		const catalog = path.join(directory, "wasm", "applications", `${row.id}.json`);
		await fs.writeFile(catalog, JSON.stringify({ ...row, runtime: "node", sha256: "a".repeat(64) }));
		await expect(applications.list(access)).rejects.toThrow("Invalid WASI application catalog entry");
		await expect(applications.run(access, row.id, {})).rejects.toThrow("Invalid WASI application catalog entry");
	});

	it.each([null, "AGFzbQEAAAA=", 17, {}, [], new Uint8Array([0, 97, 115, 109])])(
		"rejects a non-Buffer application body before filesystem writes: %j",
		async (body) => {
			await expect(applications.upload(access, body, metadata)).rejects.toThrow(
				"A binary Wasm application is required",
			);
			expect(await fs.readdir(directory)).toEqual([]);
		},
	);

	it.each([
		{ name: "Command", filename: "../command.wasm" },
		{ name: "Command", filename: "folder\\command.wasm" },
		{ name: "Command", filename: "command.wasm\n" },
		{ name: "Command\n", filename: "command.wasm" },
		{ name: "   ", filename: "command.wasm" },
		{ name: "Command", filename: "command.wasm", execArgv: ["--eval"] },
		null,
	])("rejects malformed application metadata without publishing bytecode: %j", async (input) => {
		await expect(applications.upload(access, bytes, input)).rejects.toBeInstanceOf(errs.ValidationError);
		expect(await fs.readdir(directory)).toEqual([]);
	});

	it("rejects missing command/memory exports, foreign imports, unknown WASI functions and component binaries", async () => {
		const invalid = [
			changedName(bytes, "_start", "_other"),
			changedName(bytes, "memory", "Memory"),
			changedName(bytes, "wasi_snapshot_preview1", "unknown_host_imports_1"),
			changedName(bytes, "fd_write", "fd_wrong"),
			Buffer.from([0, 97, 115, 109, 13, 0, 1, 0]),
			Buffer.from([0, 97, 115, 109, 1, 0, 0, 0, 255]),
		];
		for (const binary of invalid)
			await expect(applications.upload(access, binary, metadata)).rejects.toBeInstanceOf(errs.ValidationError);
		expect(await fs.readdir(directory)).toEqual([]);
	});

	it("rejects a reactor export even when the same valid module also exports a command entry point", async () => {
		const reactor = commandWithStart(true);
		await expect(WebAssembly.compile(reactor)).resolves.toBeInstanceOf(WebAssembly.Module);
		await expect(applications.upload(access, reactor, metadata)).rejects.toThrow(
			"standalone WASI Preview 1 command",
		);
		expect(await fs.readdir(directory)).toEqual([]);
	});

	it("rejects oversized binary input before compiling or publishing an application", async () => {
		await expect(applications.upload(access, Buffer.alloc(16 * 1024 * 1024 + 1), metadata)).rejects.toThrow(
			"16 MiB",
		);
		expect(await fs.readdir(directory)).toEqual([]);
		expect(audit.add).not.toHaveBeenCalled();
	});

	it.each([
		{ args: ["contains\0nul"] },
		{ args: ["ü".repeat(2049)] },
		{ args: Array(17).fill("x".repeat(4096)) },
		{ env: { KEY: "value" } },
		{ env: [{ name: "KEY", value: "ü".repeat(2049) }] },
		{ env: [{ name: "KEY", value: "contains\0nul" }] },
		{
			env: [
				{ name: "KEY", value: "one" },
				{ name: "KEY", value: "two" },
			],
		},
		{ stdin: "ü".repeat(32769) },
		{ timeout_ms: 60001 },
		{ execArgv: ["--eval", "private-input"] },
	])("rejects invalid execution input before catalog access or audit: %#", async (input) => {
		await expect(applications.run(access, "invalid", input)).rejects.toBeInstanceOf(errs.ValidationError);
		expect(await fs.readdir(directory)).toEqual([]);
		expect(audit.add).not.toHaveBeenCalled();
	});
});
