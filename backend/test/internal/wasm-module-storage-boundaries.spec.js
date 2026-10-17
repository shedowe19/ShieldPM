import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import modules, {
	moduleArtifact,
	moduleIdentifier,
	readWasmFile,
	wasmDirectory,
	writeWasmArtifact,
} from "../../internal/wasm-modules.js";

let directory;
const bytes = Buffer.from("synthetic immutable artifact");
const access = { can: vi.fn().mockResolvedValue(true) };

beforeEach(async () => {
	directory = await fs.mkdtemp(path.join(os.tmpdir(), "shieldpm-wasm-storage-boundary-"));
	vi.stubEnv("DATA_PATH", directory);
	access.can.mockClear();
});
afterEach(async () => {
	vi.unstubAllEnvs();
	await fs.rm(directory, { recursive: true, force: true });
});

describe("Wasm artifact storage boundaries on the actual filesystem", () => {
	it.each(["", "modules", "artifacts", "hosts"])("allows the fixed trusted directory %s", async (child) => {
		const target = path.join(directory, "wasm", child);
		expect(await wasmDirectory(target)).toBe(target);
		expect((await fs.lstat(target)).isDirectory()).toBe(true);
	});

	it.each(["wasm/unknown", "wasm/modules/nested", "wasm-sibling/modules", "outside"])(
		"rejects untrusted directory %s before creating any filesystem entries",
		async (relative) => {
			await expect(wasmDirectory(path.join(directory, relative))).rejects.toThrow(
				"Unsafe Wasm storage directory",
			);
			expect(await fs.readdir(directory)).toEqual([]);
		},
	);

	it.each(["read", "write"])(
		"resolves traversal before %s and leaves an outside inode untouched",
		async (operation) => {
			const outside = path.join(directory, "escape.wasm");
			await fs.writeFile(outside, "outside contents");
			// Keep literal traversal segments: path.join would normalize them before the helper sees them.
			const target = `${path.join(directory, "wasm", "artifacts")}${path.sep}..${path.sep}..${path.sep}escape.wasm`;
			const attempted = operation === "read" ? readWasmFile(target) : writeWasmArtifact(target, bytes);
			await expect(attempted).rejects.toThrow("Unsafe Wasm artifact path");
			expect(await fs.readFile(outside, "utf8")).toBe("outside contents");
			expect(await fs.readdir(directory)).toEqual(["escape.wasm"]);
		},
	);

	it.each(["read", "write"])("rejects a root-prefix sibling before %s", async (operation) => {
		const sibling = path.join(directory, "wasm-sibling", "artifacts");
		await fs.mkdir(sibling, { recursive: true });
		const target = path.join(sibling, "fixture.wasm");
		await fs.writeFile(target, "sibling contents");
		const attempted = operation === "read" ? readWasmFile(target) : writeWasmArtifact(target, bytes);
		await expect(attempted).rejects.toThrow("Unsafe Wasm artifact path");
		expect(await fs.readFile(target, "utf8")).toBe("sibling contents");
		expect(await fs.readdir(directory)).toEqual(["wasm-sibling"]);
	});

	it.each(["read", "write"])("rejects unknown nested storage before %s creates the parent", async (operation) => {
		const target = path.join(directory, "wasm", "artifacts", "nested", "fixture.wasm");
		const attempted = operation === "read" ? readWasmFile(target) : writeWasmArtifact(target, bytes);
		await expect(attempted).rejects.toThrow("Unsafe Wasm storage directory");
		expect(await fs.readdir(directory)).toEqual([]);
	});

	it.each(["directory", "read", "write"])(
		"rejects a symlink ancestor before %s can create a descendant outside the trusted path",
		async (operation) => {
			const outside = path.join(directory, "outside");
			const ancestor = path.join(directory, "ancestor");
			await fs.mkdir(outside);
			await fs.symlink(outside, ancestor);
			const dataPath = path.join(ancestor, "not-created", "data");
			vi.stubEnv("DATA_PATH", dataPath);
			const parent = path.join(dataPath, "wasm", "artifacts");
			const target = path.join(parent, "fixture.wasm");
			const attempted =
				operation === "directory"
					? wasmDirectory(parent)
					: operation === "read"
						? readWasmFile(target)
						: writeWasmArtifact(target, bytes);
			await expect(attempted).rejects.toThrow("Unsafe Wasm storage directory");
			expect(await fs.readdir(outside)).toEqual([]);
			expect((await fs.lstat(ancestor)).isSymbolicLink()).toBe(true);
		},
	);

	it("reads trusted immutable artifact bytes and refuses replacement without creating a temporary file", async () => {
		const target = path.join(directory, "wasm", "artifacts", "fixture.wasm");
		await writeWasmArtifact(target, bytes);
		expect(await readWasmFile(target)).toEqual(bytes);
		await expect(writeWasmArtifact(target, Buffer.from("changed bytes"))).rejects.toThrow(
			"Immutable Wasm artifact changed",
		);
		expect(await readWasmFile(target)).toEqual(bytes);
		expect(await fs.readdir(path.dirname(target))).toEqual(["fixture.wasm"]);
	});

	it("rejects a 64-hex identifier followed by a newline before catalog access", async () => {
		const id = `${"a".repeat(64)}\n`;
		expect(() => moduleIdentifier(id)).toThrow("Invalid Wasm module identifier");
		await expect(moduleArtifact(id)).rejects.toThrow("Invalid Wasm module identifier");
		await expect(modules.get(access, id)).rejects.toThrow("Invalid Wasm module identifier");
		await expect(modules.remove(access, id)).rejects.toThrow("Invalid Wasm module identifier");
		expect(await fs.readdir(directory)).toEqual([]);
	});
});

describe("Wasm upload input guards before runtime or database services are loaded", () => {
	it.each([undefined, null, "AGFzbQEAAAA=", 17, [], {}, new Uint8Array([0, 97, 115, 109])])(
		"rejects a non-Buffer body (%s) without filesystem writes",
		async (body) => {
			await expect(modules.upload(access, body, { name: "Fixture", filename: "fixture.wasm" })).rejects.toThrow(
				"A binary Wasm module is required",
			);
			expect(access.can).toHaveBeenCalledWith("settings:update");
			expect(await fs.readdir(directory)).toEqual([]);
		},
	);

	it.each([
		{ name: "Fixture", filename: "fixture.wasm", unexpected: true },
		{ name: "Fixture", filename: "../fixture.wasm" },
		{ name: "Fixture", filename: "fixture.wasm\n" },
		{ name: "Fixture\n", filename: "fixture.wasm" },
		{ name: "Fixture" },
		null,
	])("rejects malformed or unknown upload metadata (%j) without filesystem writes", async (metadata) => {
		await expect(modules.upload(access, Buffer.from([0, 97, 115, 109, 1, 0, 0, 0]), metadata)).rejects.toThrow(
			"A module name and plain .wasm filename are required",
		);
		expect(await fs.readdir(directory)).toEqual([]);
	});
});
