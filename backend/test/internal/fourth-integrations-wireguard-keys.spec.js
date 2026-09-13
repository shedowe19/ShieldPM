import { EventEmitter } from "node:events";
import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
	files: new Map(),
	exec: vi.fn(),
	spawn: vi.fn(),
	write: vi.fn(),
	link: vi.fn(),
	completions: [],
}));
vi.mock("node:child_process", () => ({ execSync: state.exec, spawn: state.spawn }));
vi.mock("node:fs", () => ({
	default: {
		existsSync: (file) => file.endsWith("/wireguard") || state.files.has(file),
		readFileSync: (file) => state.files.get(file),
		writeFileSync: state.write,
		linkSync: state.link,
		renameSync: (source, destination) => {
			state.files.set(destination, state.files.get(source));
			state.files.delete(source);
		},
		unlinkSync: (file) => state.files.delete(file),
		promises: { writeFile: async (...args) => state.write(...args) },
	},
}));
vi.mock("../../models/setting.js", () => ({
	default: { query: () => ({ where: () => ({ first: async () => null }) }) },
}));
vi.mock("../../models/wireguard_peer.js", () => ({ default: {} }));
vi.mock("../../logger.js", () => ({ global: { info: vi.fn(), error: vi.fn(), warn: vi.fn() } }));

import wireguard from "../../internal/wireguard.js";

const keyDirectory = `${process.env.DATA_PATH || "/data"}/wireguard`;
const privateKeyFile = `${keyDirectory}/server_private.key`;
const publicKeyFile = `${keyDirectory}/server_public.key`;

describe("WireGuard server identity initialization", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		state.files.clear();
		state.completions = [];
		state.write.mockImplementation((file, value) => state.files.set(file, value));
		state.link.mockImplementation((source, destination) => {
			if (state.files.has(destination)) throw Object.assign(new Error("File exists"), { code: "EEXIST" });
			state.files.set(destination, state.files.get(source));
		});
		let keys = 0;
		state.exec.mockImplementation((command) => (command === "wg genkey" ? `private-${++keys}` : ""));
		state.spawn.mockImplementation(() => {
			const child = Object.assign(new EventEmitter(), {
				stdin: new EventEmitter(),
				stdout: new EventEmitter(),
				stderr: new EventEmitter(),
			});
			let input;
			child.stdin.write = (value) => {
				input = value;
			};
			child.stdin.end = () =>
				state.completions.push((error) => {
					if (error) child.emit("error", error);
					else {
						child.stdout.emit("data", `public-for-${input}`);
						child.emit("close", 0);
					}
				});
			return child;
		});
	});

	it("shares one server identity across simultaneous first-use requests", async () => {
		const pending = [wireguard.getServerInfo(), wireguard.getServerInfo()];
		await vi.waitFor(() => expect(state.completions.length).toBeGreaterThan(0));
		for (const finish of state.completions) finish();
		const results = await Promise.all(pending);
		expect(state.exec.mock.calls.filter(([command]) => command === "wg genkey")).toHaveLength(1);
		expect(results.map((result) => result.publicKey)).toEqual(["public-for-private-1", "public-for-private-1"]);
		expect([...state.files.values()]).toEqual(["private-1", "public-for-private-1"]);
	});

	it("allows a later request to retry failed key initialization", async () => {
		const failed = wireguard.getServerInfo();
		await vi.waitFor(() => expect(state.completions).toHaveLength(1));
		state.completions[0](new Error("key generation failed"));
		expect((await failed).available).toBe(false);
		const retry = wireguard.getServerInfo();
		await vi.waitFor(() => expect(state.completions).toHaveLength(2));
		state.completions[1]();
		expect((await retry).publicKey).toBe("public-for-private-2");
	});

	it("does not publish a partial private key when the initial write fails", async () => {
		state.write.mockImplementationOnce((file, value) => {
			state.files.set(file, value.slice(0, 4));
			throw Object.assign(new Error("Disk full"), { code: "ENOSPC" });
		});
		const failed = wireguard.getServerInfo();
		await vi.waitFor(() => expect(state.completions).toHaveLength(1));
		state.completions[0]();
		expect((await failed).available).toBe(false);
		expect(state.files.has(privateKeyFile)).toBe(false);
		expect([...state.files.keys()]).toEqual([]);

		const retry = wireguard.getServerInfo();
		await vi.waitFor(() => expect(state.completions).toHaveLength(2));
		state.completions[1]();
		expect((await retry).publicKey).toBe("public-for-private-2");
		expect(state.files.get(privateKeyFile)).toBe("private-2");
	});

	it("repairs a failed public-key write without replacing the published private identity", async () => {
		let failedOnce = false;
		state.write.mockImplementation((file, value) => {
			if (!failedOnce && file.includes("server_public.key")) {
				failedOnce = true;
				state.files.set(file, value.slice(0, 4));
				throw Object.assign(new Error("Disk full"), { code: "ENOSPC" });
			}
			state.files.set(file, value);
		});
		const failed = wireguard.getServerInfo();
		await vi.waitFor(() => expect(state.completions).toHaveLength(1));
		state.completions[0]();
		expect((await failed).available).toBe(false);
		expect(state.files.get(privateKeyFile)).toBe("private-1");
		expect(state.files.has(publicKeyFile)).toBe(false);
		expect([...state.files.keys()]).toEqual([privateKeyFile]);

		const retries = [wireguard.getServerInfo(), wireguard.getServerInfo()];
		await vi.waitFor(() => expect(state.completions.length).toBeGreaterThan(1));
		for (const finish of state.completions.slice(1)) finish();
		expect((await Promise.all(retries)).map((result) => result.publicKey)).toEqual([
			"public-for-private-1",
			"public-for-private-1",
		]);
		expect(state.completions).toHaveLength(2);
		expect(state.exec.mock.calls.filter(([command]) => command === "wg genkey")).toHaveLength(1);
		expect(state.files.get(privateKeyFile)).toBe("private-1");
	});

	it("shares public-key recovery from an existing private identity", async () => {
		state.files.set(privateKeyFile, "existing-private\n");
		const pending = [wireguard.getServerInfo(), wireguard.getServerInfo()];
		await vi.waitFor(() => expect(state.completions.length).toBeGreaterThan(0));
		for (const finish of state.completions) finish();
		expect((await Promise.all(pending)).map((result) => result.publicKey)).toEqual([
			"public-for-existing-private",
			"public-for-existing-private",
		]);
		expect(state.spawn).toHaveBeenCalledTimes(1);
		expect(state.exec.mock.calls.filter(([command]) => command === "wg genkey")).toHaveLength(0);
		expect(state.files.get(privateKeyFile)).toBe("existing-private\n");
	});

	it("keeps an existing private identity that appears while generation is pending", async () => {
		const pending = wireguard.getServerInfo();
		await vi.waitFor(() => expect(state.completions).toHaveLength(1));
		state.files.set(privateKeyFile, "existing-private");
		state.completions[0]();
		await vi.waitFor(() => expect(state.completions).toHaveLength(2));
		state.completions[1]();
		expect((await pending).publicKey).toBe("public-for-existing-private");
		expect(state.files.get(privateKeyFile)).toBe("existing-private");
		expect([...state.files.keys()].sort()).toEqual([privateKeyFile, publicKeyFile].sort());
	});
});
