import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const nameA = `11-${"a".repeat(64)}.json`;
const nameB = `11-${"b".repeat(64)}.json`;
const nameC = `11-${"c".repeat(64)}.json`;

describe("Wasm activation and worker-bound secret retirement", () => {
	let directory;
	let root;
	let proxy;
	let proc;
	let lifecycle;
	let wasm;
	const exists = (filename) =>
		fs.access(filename).then(
			() => true,
			() => false,
		);
	const config = (name) => `# ShieldPM Wasm configuration: ${name}\nserver {}\n`;
	const chain = async (name) => {
		const status = path.join(root, "status", name);
		await fs.writeFile(
			path.join(root, "hosts", name),
			JSON.stringify({
				version: 1,
				bundle_version: name === nameA ? "policy-a" : "policy-b",
				status_path: status,
				filters: [{ id: "credential", sha256: "d".repeat(64), configuration: "private-key-not-for-journal" }],
			}),
			{ mode: 0o600 },
		);
		return status;
	};
	const process = async (pid, start, title, state = "S") => {
		const parent = path.join(proc, String(pid));
		await fs.mkdir(parent, { recursive: true });
		const fields = Array(50).fill("0");
		fields[0] = state;
		fields[1] = pid === 100 ? "1" : "100";
		fields[19] = String(start);
		await fs.writeFile(path.join(parent, "stat"), `${pid} (nginx) ${fields.join(" ")}\n`);
		await fs.writeFile(path.join(parent, "cmdline"), `${title}\0`);
	};
	const workers = async (entries) => {
		await fs.mkdir(path.join(proc, "100/task/100"), { recursive: true });
		await fs.writeFile(path.join(proc, "100/task/100/children"), entries.map(({ pid }) => pid).join(" "));
		for (const { pid, start, stopping = false, state = "S" } of entries)
			await process(pid, start, `nginx: worker process${stopping ? " is shutting down" : ""}`, state);
	};
	const startA = async () => {
		await chain(nameA);
		await fs.writeFile(path.join(proxy, "11.conf"), config(nameA));
		await workers([{ pid: 201, start: 1000 }]);
	};
	const acceptB = async (context) => {
		await chain(nameB);
		await fs.writeFile(path.join(proxy, "11.conf"), config(nameB));
		const before = await lifecycle.beforeWasmReload(context);
		await workers([
			{ pid: 201, start: 1000, stopping: true },
			{ pid: 202, start: 2000 },
		]);
		await lifecycle.afterWasmReload(context, before);
	};
	beforeEach(async () => {
		vi.resetModules();
		directory = await fs.mkdtemp(path.join(os.tmpdir(), "shieldpm-wasm-lifecycle-"));
		root = path.join(directory, "wasm");
		proxy = path.join(directory, "proxy");
		proc = path.join(directory, "proc");
		for (const target of [path.join(root, "hosts"), path.join(root, "status"), path.join(root, "active"), proxy])
			await fs.mkdir(target, { recursive: true, mode: 0o700 });
		vi.stubEnv("DATA_PATH", directory);
		vi.stubEnv("SHIELDPM_WASM_PROXY_HOST_DIRECTORY", proxy);
		vi.stubEnv("SHIELDPM_WASM_PROC_ROOT", proc);
		vi.stubEnv("SHIELDPM_WASM_NGINX_PIDFILE", path.join(directory, "nginx.pid"));
		vi.stubEnv("SHIELDPM_WASM_ACK_TIMEOUT_MS", "90");
		await fs.writeFile(path.join(directory, "nginx.pid"), "100\n");
		await process(100, 100, "nginx: master process nginx");
		lifecycle = await import("../../internal/wasm-lifecycle.js");
		wasm = await import("../../internal/wasm.js");
	});
	afterEach(async () => {
		vi.restoreAllMocks();
		vi.unstubAllEnvs();
		await fs.rm(directory, { recursive: true, force: true });
	});

	it("does not inspect workers or publish activation when no Wasm configurations exist", async () => {
		const read = vi.spyOn(fs, "readFile");
		const context = await lifecycle.createWasmLifecycle();
		const before = await lifecycle.beforeWasmReload(context);
		expect(before).toBeNull();
		await lifecycle.afterWasmReload(context, before);
		expect(await lifecycle.finishWasmLifecycle(context)).toBe(false);
		expect(
			read.mock.calls.some(
				([filename]) => String(filename).startsWith(proc) || String(filename).endsWith("nginx.pid"),
			),
		).toBe(false);
		expect(await fs.readdir(path.join(root, "active"))).toEqual([]);
	});

	it("persists leases before mutation and survives backend module restart until a worker identity retires", async () => {
		await startA();
		await lifecycle.createWasmLifecycle();
		const journal = JSON.parse(await fs.readFile(path.join(root, "retirement.json"), "utf8"));
		expect(journal.groups.some((group) => group.files.includes(nameA) && group.workers.includes("201:1000"))).toBe(
			true,
		);
		expect(JSON.stringify(journal)).not.toContain("private-key-not-for-journal");
		expect((await fs.stat(path.join(root, "retirement.json"))).mode & 0o777).toBe(0o600);
		await fs.unlink(path.join(proxy, "11.conf"));
		vi.resetModules();
		const restarted = await import("../../internal/wasm-lifecycle.js");
		expect(await restarted.collectRetiredWasmConfigurations()).toBe(true);
		expect(await exists(path.join(root, "hosts", nameA))).toBe(true);
		// The PID exists again, but the different kernel start time ends its former lease.
		await process(201, 9000, "nginx: worker process");
		expect(await restarted.collectRetiredWasmConfigurations()).toBe(false);
		expect(await exists(path.join(root, "hosts", nameA))).toBe(false);
	});

	it("keeps backup references after workers drain and retires them once the backup disappears", async () => {
		await startA();
		await lifecycle.createWasmLifecycle();
		await fs.rename(path.join(proxy, "11.conf"), path.join(proxy, "11.conf.bak"));
		await fs.rm(path.join(proc, "201"), { recursive: true });
		await lifecycle.collectRetiredWasmConfigurations();
		expect(await exists(path.join(root, "hosts", nameA))).toBe(true);
		await fs.unlink(path.join(proxy, "11.conf.bak"));
		await lifecycle.collectRetiredWasmConfigurations();
		expect(await exists(path.join(root, "hosts", nameA))).toBe(false);
	});

	it("publishes only an acknowledged generation and retains lazy-load files for draining workers", async () => {
		await startA();
		const context = await lifecycle.createWasmLifecycle();
		await acceptB(context);
		await lifecycle.finishWasmLifecycle(context);
		const pointer = JSON.parse(await fs.readFile(path.join(root, "active/host-11.json"), "utf8"));
		expect(pointer.configuration_file).toBe(nameB);
		expect((await wasm.getHostStatus(11)).state).toBe("active");
		expect(await exists(path.join(root, "hosts", nameA))).toBe(true);
		await fs.rm(path.join(proc, "201"), { recursive: true });
		await workers([{ pid: 202, start: 2000 }]);
		await lifecycle.collectRetiredWasmConfigurations();
		expect(await exists(path.join(root, "hosts", nameA))).toBe(false);
		expect(await exists(path.join(root, "hosts", nameB))).toBe(true);
	});

	it("marks an acknowledged disable inactive while retaining old workers' lazy-load configuration", async () => {
		await startA();
		await wasm.markHostActive(11, {
			configuration_path: path.join(root, "hosts", nameA),
			status_path: path.join(root, "status", nameA),
			version: "policy-a",
			sha256: "d".repeat(64),
			filter_count: 1,
		});
		const context = await lifecycle.createWasmLifecycle();
		await fs.unlink(path.join(proxy, "11.conf"));
		const before = await lifecycle.beforeWasmReload(context);
		await workers([
			{ pid: 201, start: 1000, stopping: true },
			{ pid: 202, start: 2000 },
		]);
		await lifecycle.afterWasmReload(context, before);
		await lifecycle.finishWasmLifecycle(context);
		expect((await wasm.getHostStatus(11)).state).toBe("inactive");
		expect(await exists(path.join(root, "hosts", nameA))).toBe(true);
		await fs.rm(path.join(proc, "201"), { recursive: true });
		await workers([{ pid: 202, start: 2000 }]);
		await lifecycle.collectRetiredWasmConfigurations();
		expect(await exists(path.join(root, "hosts", nameA))).toBe(false);
	});

	it("ignores errors from retired or legacy workers and exposes only the current policy status", async () => {
		await startA();
		const context = await lifecycle.createWasmLifecycle();
		await acceptB(context);
		await lifecycle.finishWasmLifecycle(context);
		const failure = {
			state: "error",
			filter_id: "credential",
			phase: "request",
			message: "Trusted filter execution failed",
			checked_at: (Date.now() + 1000) / 1000,
			version: "old-policy",
		};
		await fs.writeFile(path.join(root, "status", nameA), JSON.stringify(failure));
		await fs.writeFile(path.join(root, "status/host-11.json"), JSON.stringify(failure));
		const current = await wasm.getHostStatus(11);
		expect(current.state).toBe("active");
		expect(current.version).toBe("policy-b");
		expect(current).not.toHaveProperty("configuration_file");
		expect(current).not.toHaveProperty("runtime_status_file");
		await fs.writeFile(path.join(root, "status", nameB), JSON.stringify(failure));
		const failed = await wasm.getHostStatus(11);
		expect(failed.state).toBe("error");
		expect(failed.version).toBe("policy-b");
		expect(JSON.stringify(failed)).not.toContain("private-key-not-for-journal");
		expect(JSON.stringify(failed)).not.toContain(nameB);
	});

	it("clears an existing runtime error when the same policy is successfully activated again", async () => {
		const runtimeStatus = await chain(nameA);
		const prepared = {
			configuration_path: path.join(root, "hosts", nameA),
			status_path: runtimeStatus,
			version: "policy-a",
			sha256: "d".repeat(64),
			filter_count: 1,
		};
		await wasm.markHostActive(11, prepared);
		await fs.writeFile(
			runtimeStatus,
			JSON.stringify({
				state: "error",
				filter_id: "credential",
				phase: "request",
				message: "Trusted filter execution failed",
				checked_at: (Date.now() + 1000) / 1000,
				version: "policy-a",
			}),
		);
		expect((await wasm.getHostStatus(11)).state).toBe("error");
		await wasm.markHostActive(11, prepared);
		expect((await wasm.getHostStatus(11)).state).toBe("active");
		expect((await wasm.getHostStatus(11)).version).toBe("policy-a");
	});

	it("preserves the previous authoritative pointer if atomic publication fails", async () => {
		const prepared = (name) => ({
			configuration_path: path.join(root, "hosts", name),
			status_path: path.join(root, "status", name),
			version: name === nameA ? "policy-a" : "policy-b",
			sha256: "d".repeat(64),
			filter_count: 1,
		});
		await wasm.markHostActive(11, prepared(nameA));
		const originalRename = fs.rename.bind(fs);
		vi.spyOn(fs, "rename").mockImplementation(async (source, target) => {
			if (target === path.join(root, "active/host-11.json"))
				throw new Error("injected pointer publication failure");
			return originalRename(source, target);
		});
		await expect(wasm.markHostActive(11, prepared(nameB))).rejects.toThrow("injected pointer publication failure");
		expect((await wasm.getHostStatus(11)).version).toBe("policy-a");
		expect(await fs.readdir(path.join(root, "active"))).toEqual(["host-11.json"]);
	});

	it("rejects unknown worker state before signalling and conservatively keeps its persisted lease", async () => {
		await startA();
		await fs.unlink(path.join(directory, "nginx.pid"));
		const context = await lifecycle.createWasmLifecycle();
		await expect(lifecycle.beforeWasmReload(context)).rejects.toThrow(/worker|generation|inspect|unknown/i);
		await fs.unlink(path.join(proxy, "11.conf"));
		expect(await lifecycle.collectRetiredWasmConfigurations()).toBe(true);
		expect(await exists(path.join(root, "hosts", nameA))).toBe(true);
		expect(await fs.readdir(path.join(root, "active"))).toEqual([]);
	});

	it("does not claim activation when a signal never produces a new acknowledged worker generation", async () => {
		await startA();
		const context = await lifecycle.createWasmLifecycle();
		await chain(nameB);
		await fs.writeFile(path.join(proxy, "11.conf"), config(nameB));
		const before = await lifecycle.beforeWasmReload(context);
		await expect(lifecycle.afterWasmReload(context, before)).rejects.toThrow("not acknowledged");
		await lifecycle.finishWasmLifecycle(context);
		expect((await wasm.getHostStatus(11)).state).not.toBe("active");
		expect(await exists(path.join(root, "hosts", nameA))).toBe(true);
		expect(await exists(path.join(root, "hosts", nameB))).toBe(true);
	});

	it("marks the persisted last policy uncertain when a later operation never acknowledges its new generation", async () => {
		await startA();
		const initial = await lifecycle.createWasmLifecycle();
		const first = await lifecycle.beforeWasmReload(initial);
		await workers([
			{ pid: 201, start: 1000, stopping: true },
			{ pid: 202, start: 2000 },
		]);
		await lifecycle.afterWasmReload(initial, first);
		await lifecycle.finishWasmLifecycle(initial);
		expect((await wasm.getHostStatus(11)).state).toBe("active");
		const later = await lifecycle.createWasmLifecycle();
		await chain(nameB);
		await fs.writeFile(path.join(proxy, "11.conf"), config(nameB));
		const before = await lifecycle.beforeWasmReload(later);
		await expect(lifecycle.afterWasmReload(later, before)).rejects.toThrow("not acknowledged");
		await lifecycle.finishWasmLifecycle(later);
		const pointer = JSON.parse(await fs.readFile(path.join(root, "active/host-11.json"), "utf8"));
		expect(pointer.configuration_file).toBe(nameA);
		expect(pointer.state).toBe("error");
		expect((await wasm.getHostStatus(11)).version).toBe("policy-a");
	});

	it("keeps the last acknowledged version when a compensating generation cannot be acknowledged", async () => {
		await startA();
		const context = await lifecycle.createWasmLifecycle();
		await acceptB(context);
		await fs.writeFile(path.join(proxy, "11.conf"), config(nameA));
		const before = await lifecycle.beforeWasmReload(context);
		await expect(lifecycle.afterWasmReload(context, before)).rejects.toThrow("not acknowledged");
		await lifecycle.finishWasmLifecycle(context);
		const pointer = JSON.parse(await fs.readFile(path.join(root, "active/host-11.json"), "utf8"));
		expect(pointer.configuration_file).toBe(nameB);
		expect(pointer.state).toBe("error");
		expect(await exists(path.join(root, "hosts", nameA))).toBe(true);
		expect(await exists(path.join(root, "hosts", nameB))).toBe(true);
	});

	it("leases every intermediate acknowledged policy to its draining generation during compensation", async () => {
		await startA();
		const context = await lifecycle.createWasmLifecycle();
		await acceptB(context);
		await fs.rm(path.join(proc, "201"), { recursive: true });
		await workers([{ pid: 202, start: 2000 }]);
		await fs.writeFile(path.join(proxy, "11.conf"), config(nameA));
		const before = await lifecycle.beforeWasmReload(context);
		await workers([
			{ pid: 202, start: 2000, stopping: true },
			{ pid: 203, start: 3000 },
		]);
		await lifecycle.afterWasmReload(context, before);
		await lifecycle.finishWasmLifecycle(context);
		expect((await wasm.getHostStatus(11)).version).toBe("policy-a");
		expect(await exists(path.join(root, "hosts", nameB))).toBe(true);
		await fs.rm(path.join(proc, "202"), { recursive: true });
		await workers([{ pid: 203, start: 3000 }]);
		await lifecycle.collectRetiredWasmConfigurations();
		expect(await exists(path.join(root, "hosts", nameB))).toBe(false);
		expect(await exists(path.join(root, "hosts", nameA))).toBe(true);
	});

	it("persists an acknowledged intermediate generation before a crash can lose its callback context", async () => {
		await startA();
		const context = await lifecycle.createWasmLifecycle();
		await acceptB(context);
		await fs.rm(path.join(proc, "201"), { recursive: true });
		await workers([{ pid: 202, start: 2000 }]);
		// A caller restored files for compensation, but crashed before attempting its reload.
		await fs.writeFile(path.join(proxy, "11.conf"), config(nameA));
		vi.resetModules();
		const restarted = await import("../../internal/wasm-lifecycle.js");
		await restarted.createWasmLifecycle();
		await restarted.collectRetiredWasmConfigurations();
		expect(await exists(path.join(root, "hosts", nameB))).toBe(true);
		expect(await exists(path.join(root, "hosts", nameA))).toBe(true);
	});

	it("removes an unreferenced candidate that was never signalled without touching the previous chain", async () => {
		await startA();
		const context = await lifecycle.createWasmLifecycle();
		await chain(nameC);
		await fs.writeFile(path.join(proxy, "11.conf.err"), config(nameC));
		await lifecycle.finishWasmLifecycle(context);
		expect(await exists(path.join(root, "hosts", nameC))).toBe(false);
		expect(await exists(path.join(root, "hosts", nameA))).toBe(true);
		expect(await fs.readdir(path.join(root, "active"))).toEqual([]);
	});
	it("does not extend an existing retired version lease to unrelated newer workers", async () => {
		await startA();
		const first = await lifecycle.createWasmLifecycle();
		await acceptB(first);
		await lifecycle.finishWasmLifecycle(first);
		const unrelated = await lifecycle.createWasmLifecycle();
		await lifecycle.finishWasmLifecycle(unrelated);
		await fs.rm(path.join(proc, "201"), { recursive: true });
		await workers([{ pid: 202, start: 2000 }]);
		await lifecycle.collectRetiredWasmConfigurations();
		expect(await exists(path.join(root, "hosts", nameA))).toBe(false);
		expect(await exists(path.join(root, "hosts", nameB))).toBe(true);
	});

	it("cleans an unsignalled candidate created after an earlier acknowledged reload in the same operation", async () => {
		await startA();
		const context = await lifecycle.createWasmLifecycle();
		await acceptB(context);
		await chain(nameC);
		await fs.writeFile(path.join(proxy, "11.conf.err"), config(nameC));
		await lifecycle.finishWasmLifecycle(context);
		expect(await exists(path.join(root, "hosts", nameC))).toBe(false);
		expect(await exists(path.join(root, "hosts", nameA))).toBe(true);
		expect(await exists(path.join(root, "hosts", nameB))).toBe(true);
	});

	it("bounds worker acknowledgement even when the timeout environment is infinite or enormous", async () => {
		await startA();
		const context = await lifecycle.createWasmLifecycle();
		const before = await lifecycle.beforeWasmReload(context);
		const timer = globalThis.setTimeout;
		vi.spyOn(globalThis, "setTimeout").mockImplementation((callback, milliseconds, ...args) =>
			timer(callback, Math.min(milliseconds, 1), ...args),
		);
		for (const value of ["Infinity", "1e100"]) {
			vi.stubEnv("SHIELDPM_WASM_ACK_TIMEOUT_MS", value);
			let ticks = 0;
			const clock = vi.spyOn(Date, "now").mockImplementation(() => {
				if (++ticks > 30) throw new Error("Unbounded acknowledgement timeout");
				return ticks * 1000;
			});
			await expect(lifecycle.afterWasmReload(context, before)).rejects.toThrow("not acknowledged");
			clock.mockRestore();
		}
	});
});
