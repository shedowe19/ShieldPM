/** Accepted Wasm pointers and secret-file retirement share the Nginx configuration lock. */
import { createHash, randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import errs from "../lib/error.js";

const root = () => path.resolve(process.env.DATA_PATH || "/data", "wasm");
const hostsDirectory = () => path.join(root(), "hosts");
const proxyDirectory = () =>
	process.env.SHIELDPM_WASM_PROXY_HOST_DIRECTORY ||
	path.resolve(process.env.DATA_PATH || "/data", "nginx/proxy_host");
const procRoot = () => process.env.SHIELDPM_WASM_PROC_ROOT || "/proc";
const configurationName = /^([1-9]\d*)-[a-f0-9]{64}\.json$/;
const pause = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

async function privateJson(filename, value) {
	await fs.mkdir(path.dirname(filename), { recursive: true, mode: 0o700 });
	const temporary = `${filename}.${randomUUID()}.tmp`;
	try {
		await fs.writeFile(temporary, JSON.stringify(value), { flag: "wx", mode: 0o600, flush: true });
		await fs.rename(temporary, filename);
		const directory = await fs.open(path.dirname(filename), "r");
		try {
			await directory.sync();
		} finally {
			await directory.close();
		}
	} finally {
		await fs.rm(temporary, { force: true });
	}
}

async function configurations() {
	try {
		const info = await fs.lstat(hostsDirectory());
		if (!info.isDirectory() || info.isSymbolicLink())
			throw new errs.ConfigurationError("Unsafe Wasm host directory");
		return (await fs.readdir(hostsDirectory(), { withFileTypes: true }))
			.filter((entry) => entry.isFile() && configurationName.test(entry.name))
			.map((entry) => entry.name);
	} catch (error) {
		if (error.code === "ENOENT") return [];
		throw error;
	}
}

async function retirement() {
	try {
		const value = JSON.parse(await fs.readFile(path.join(root(), "retirement.json"), "utf8"));
		if (value.version !== 1 || !Array.isArray(value.groups))
			throw new errs.ConfigurationError("Invalid Wasm retirement state");
		for (const group of value.groups) {
			if (
				!Array.isArray(group.files) ||
				group.files.some((name) => !configurationName.test(name)) ||
				!Array.isArray(group.workers) ||
				group.workers.some((worker) => !/^[1-9]\d*:[0-9]+$/.test(worker))
			)
				throw new errs.ConfigurationError("Invalid Wasm retirement lease");
		}
		return value;
	} catch (error) {
		if (error.code === "ENOENT") return { version: 1, groups: [] };
		throw error;
	}
}

async function processIdentity(pid) {
	try {
		const stat = await fs.readFile(path.join(procRoot(), String(pid), "stat"), "utf8");
		const fields = stat
			.slice(stat.lastIndexOf(")") + 2)
			.trim()
			.split(/\s+/);
		if (!/^\d+$/.test(fields[19] || "")) throw new errs.ConfigurationError("Invalid process identity");
		return { token: `${pid}:${fields[19]}`, state: fields[0], parent: fields[1] };
	} catch (error) {
		if (["ENOENT", "ESRCH"].includes(error.code)) return null;
		throw error;
	}
}

/** PID and kernel start time prevent a recycled PID from extending an old worker lease. */
export async function nginxWorkerSnapshot() {
	try {
		const pid = (
			await fs.readFile(process.env.SHIELDPM_WASM_NGINX_PIDFILE || "/run/shieldpm/nginx/nginx.pid", "utf8")
		).trim();
		if (!/^[1-9]\d*$/.test(pid)) throw new errs.ConfigurationError("Invalid Nginx master PID");
		const master = await processIdentity(pid);
		if (!master) return { known: false, workers: [] };
		const title = (await fs.readFile(path.join(procRoot(), pid, "cmdline"), "utf8")).replaceAll("\0", " ");
		if (!title.startsWith("nginx: master process")) return { known: false, workers: [] };
		let children;
		try {
			children = (await fs.readFile(path.join(procRoot(), pid, "task", pid, "children"), "utf8"))
				.trim()
				.split(/\s+/)
				.filter(Boolean);
		} catch (error) {
			if (error.code !== "ENOENT") throw error;
			// Kernels without CONFIG_CHECKPOINT_RESTORE omit task/*/children.
			children = [];
			for (const name of await fs.readdir(procRoot())) {
				if (!/^[1-9]\d*$/.test(name)) continue;
				const identity = await processIdentity(name);
				if (identity?.parent === pid) children.push(name);
			}
		}
		const workers = [];
		for (const child of children) {
			if (!/^[1-9]\d*$/.test(child)) throw new errs.ConfigurationError("Invalid Nginx child PID");
			try {
				const identity = await processIdentity(child);
				if (!identity || identity.state === "Z") continue;
				const name = (await fs.readFile(path.join(procRoot(), child, "cmdline"), "utf8")).replaceAll("\0", " ");
				if (name.startsWith("nginx: worker process"))
					workers.push({ token: identity.token, stopping: name.includes("shutting down") });
			} catch (error) {
				if (!["ENOENT", "ESRCH"].includes(error.code)) throw error;
			}
		}
		return { known: workers.length > 0, master: master.token, workers };
	} catch {
		return { known: false, workers: [] };
	}
}

async function protect(files, snapshot, acknowledged = []) {
	if (!files.length) return;
	const state = await retirement();
	const tracked = new Set(state.groups.flatMap((entry) => entry.files));
	const active = new Set([...(await configReferences(false)).values()].flat().concat(acknowledged));
	for (const name of await acknowledgedFiles()) active.add(name);
	try {
		for (const name of await fs.readdir(path.join(root(), "active"))) {
			if (!/^host-[1-9]\d*\.json$/.test(name)) continue;
			const pointer = JSON.parse(await fs.readFile(path.join(root(), "active", name), "utf8"));
			if (configurationName.test(pointer.configuration_file || "")) active.add(pointer.configuration_file);
		}
	} catch (error) {
		if (error.code !== "ENOENT") throw error;
	}
	const protectedNames = files.filter((name) => !tracked.has(name) || active.has(name));
	if (!protectedNames.length) return;
	const workers = snapshot.workers.map((worker) => worker.token).sort();
	const key = createHash("sha256")
		.update(JSON.stringify([snapshot.known, workers]))
		.digest("hex");
	const group = state.groups.find((entry) => entry.key === key);
	if (group) group.files = [...new Set([...group.files, ...protectedNames])];
	else state.groups.push({ key, unknown: !snapshot.known, workers, files: protectedNames });
	await privateJson(path.join(root(), "retirement.json"), state);
}

/** Called before any mutation, so a backend crash cannot lose the old worker's file lease. */
export async function createWasmLifecycle() {
	const files = await configurations();
	const context = {
		active: true,
		initial: new Set(files),
		hadSignal: false,
		lastReloadAccepted: false,
		accepted: null,
	};
	if (files.length) await protect(files, await nginxWorkerSnapshot());
	return context;
}

export async function beforeWasmReload(context) {
	const files = await configurations();
	if (!files.length && !(await retirement()).groups.length) return null;
	const snapshot = await nginxWorkerSnapshot();
	if (!snapshot.known)
		throw new errs.ConfigurationError("Cannot acknowledge Nginx Wasm workers; verify the managed master PID file");
	const pendingSignals = (await retirement()).groups.filter(
		(group) => group.unknown && group.key.startsWith("signal-") && group.master === snapshot.master,
	);
	const pendingFiles = pendingSignals.flatMap((group) => group.files);
	await protect(files, snapshot, [
		...(context.accepted ? [...context.accepted.values()].flat() : []),
		...pendingFiles,
	]);
	// A durable conservative lease covers workers which may be born after the signal
	// if recording the acknowledged generation subsequently fails or the backend dies.
	const state = await retirement();
	const signalLease = `signal-${randomUUID()}`;
	const signalledFiles = [...new Set([...(await configReferences(false)).values()].flat())];
	state.groups.push({ key: signalLease, unknown: true, master: snapshot.master, workers: [], files: signalledFiles });
	await privateJson(path.join(root(), "retirement.json"), state);
	context.hadSignal = true;
	context.lastReloadAccepted = false;
	return { ...snapshot, signalLease };
}

/** A successful signal alone does not acknowledge a new worker generation. */
export async function afterWasmReload(context, before) {
	if (!before) return;
	if (before.known) {
		const previous = new Set(before.workers.filter((worker) => !worker.stopping).map((worker) => worker.token));
		const requestedTimeout = Number(process.env.SHIELDPM_WASM_ACK_TIMEOUT_MS || 5000);
		const timeout =
			Number.isFinite(requestedTimeout) && requestedTimeout >= 50
				? Math.min(10000, Math.floor(requestedTimeout))
				: 5000;
		const deadline = Date.now() + timeout;
		let stable = 0;
		while (Date.now() < deadline) {
			const current = await nginxWorkerSnapshot();
			if (
				current.known &&
				current.master === before.master &&
				current.workers.filter((worker) => !worker.stopping && !previous.has(worker.token)).length >=
					previous.size &&
				current.workers.some((worker) => !worker.stopping && !previous.has(worker.token)) &&
				!current.workers.some((worker) => !worker.stopping && previous.has(worker.token))
			) {
				if (++stable >= 2) break;
			} else stable = 0;
			await pause(25);
		}
		if (stable < 2) throw new errs.ConfigurationError("Nginx Wasm worker generation was not acknowledged");
	}
	context.accepted = await configReferences(false);
	const confirmed = await nginxWorkerSnapshot();
	if (!confirmed.known || confirmed.master !== before.master)
		throw new errs.ConfigurationError("Acknowledged Nginx workers disappeared");
	const names = [...new Set([...context.accepted.values()].flat())];
	await protect(names, { ...confirmed, workers: confirmed.workers.filter((worker) => !worker.stopping) }, names);
	await privateJson(path.join(root(), "acknowledged.json"), { version: 1, references: [...context.accepted] });
	const state = await retirement();
	// The pre-reload snapshot now leases any workers from earlier failed attempts.
	state.groups = state.groups.filter((group) => !(group.key.startsWith("signal-") && group.master === before.master));
	await privateJson(path.join(root(), "retirement.json"), state);
	context.lastReloadAccepted = true;
}

async function configReferences(includeBackups) {
	const references = new Map();
	let entries;
	try {
		entries = await fs.readdir(proxyDirectory(), { withFileTypes: true });
	} catch (error) {
		if (error.code === "ENOENT") return references;
		throw error;
	}
	for (const entry of entries) {
		const match = entry.name.match(includeBackups ? /^([1-9]\d*)\.conf(?:\.bak)?$/ : /^([1-9]\d*)\.conf$/);
		if (!match || !entry.isFile()) continue;
		const content = await fs.readFile(path.join(proxyDirectory(), entry.name), "utf8");
		// Include the old generated Lua path syntax when upgrading an existing worker generation.
		const names = [...content.matchAll(/\b([1-9]\d*-[a-f0-9]{64}\.json)\b/g)]
			.map((found) => found[1])
			.filter((name) => configurationName.exec(name)?.[1] === match[1]);
		if (names.length) references.set(entry.name, names);
	}
	return references;
}

async function markAccepted(references, uncertain = false) {
	const active = new Map();
	for (const [filename, names] of references) active.set(Number(filename.split(".")[0]), names[0]);
	const ids = new Set([...active.keys()]);
	try {
		for (const name of [
			...(await fs.readdir(path.join(root(), "active")).catch((error) => {
				if (error.code === "ENOENT") return [];
				throw error;
			})),
			...(await fs.readdir(path.join(root(), "status")).catch((error) => {
				if (error.code === "ENOENT") return [];
				throw error;
			})),
		]) {
			const match = name.match(/^host-([1-9]\d*)\.json$/);
			if (match) ids.add(Number(match[1]));
		}
	} catch (error) {
		if (error.code !== "ENOENT") throw error;
	}
	const { markHostActive } = await import("./wasm.js");
	for (const id of ids) {
		const name = active.get(id);
		if (!name) {
			if (!uncertain) await markHostActive(id, null);
			continue;
		}
		const chain = JSON.parse(await fs.readFile(path.join(hostsDirectory(), name), "utf8"));
		if (chain.version !== 1 || !Array.isArray(chain.filters) || !chain.filters.length)
			throw new errs.ConfigurationError("Invalid accepted Wasm chain");
		await markHostActive(
			id,
			{
				configuration_path: path.join(hostsDirectory(), name),
				status_path: chain.status_path,
				version: chain.bundle_version,
				sha256: chain.filters[0].sha256,
				filter_count: chain.filters.length,
			},
			uncertain ? "The latest Nginx reload was not acknowledged; this is the last confirmed policy" : null,
		);
	}
}

async function acknowledgedReferences() {
	let state;
	try {
		state = JSON.parse(await fs.readFile(path.join(root(), "acknowledged.json"), "utf8"));
	} catch (error) {
		if (error.code === "ENOENT") return null;
		throw error;
	}
	if (
		state.version !== 1 ||
		!Array.isArray(state.references) ||
		state.references.some(
			([file, names]) =>
				!/^([1-9]\d*)\.conf$/.test(file) ||
				!Array.isArray(names) ||
				names.some((name) => !configurationName.test(name)),
		)
	)
		throw new errs.ConfigurationError("Invalid acknowledged Wasm generation");
	return new Map(state.references);
}

async function acknowledgedFiles() {
	const references = await acknowledgedReferences();
	return references ? [...references.values()].flat() : [];
}

async function retryAcceptedStatus() {
	let pending;
	try {
		pending = JSON.parse(await fs.readFile(path.join(root(), "accepted.json"), "utf8"));
	} catch (error) {
		if (error.code === "ENOENT") return;
		throw error;
	}
	if (!pending.pending) return;
	if (
		pending.version !== 1 ||
		!Array.isArray(pending.references) ||
		pending.references.some(
			([file, names]) =>
				!/^([1-9]\d*)\.conf$/.test(file) ||
				!Array.isArray(names) ||
				names.some((name) => !configurationName.test(name)),
		)
	)
		throw new errs.ConfigurationError("Invalid accepted Wasm status journal");
	await markAccepted(new Map(pending.references), pending.uncertain);
	await privateJson(path.join(root(), "accepted.json"), { ...pending, pending: false });
}

/** Call only while holding the configuration lock. Unknown process state always retains files. */
export async function collectRetiredWasmConfigurations() {
	await retryAcceptedStatus();
	const state = await retirement();
	if (!state.groups.length) return false;
	const protectedFiles = new Set([...(await configReferences(true)).values()].flat());
	for (const name of await acknowledgedFiles()) protectedFiles.add(name);
	try {
		for (const name of await fs.readdir(path.join(root(), "active"))) {
			if (!/^host-[1-9]\d*\.json$/.test(name)) continue;
			const pointer = JSON.parse(await fs.readFile(path.join(root(), "active", name), "utf8"));
			if (configurationName.test(pointer.configuration_file || ""))
				protectedFiles.add(pointer.configuration_file);
		}
	} catch (error) {
		if (error.code !== "ENOENT") throw error;
	}
	const live = [];
	for (const group of state.groups) {
		let retained = group.unknown;
		for (const token of group.workers) {
			const identity = await processIdentity(token.split(":")[0]);
			if (identity?.token === token && identity.state !== "Z") retained = true;
		}
		live.push({ ...group, retained });
	}
	const leased = new Set(live.filter((group) => group.retained).flatMap((group) => group.files));
	for (const group of state.groups)
		for (const name of group.files) {
			if (protectedFiles.has(name) || leased.has(name)) continue;
			await fs.unlink(path.join(hostsDirectory(), name)).catch((error) => {
				if (error.code !== "ENOENT") throw error;
			});
		}
	state.groups = live
		.map(({ retained, ...group }) => ({
			...group,
			files: group.files.filter((name) => protectedFiles.has(name) || leased.has(name)),
		}))
		.filter((group) => group.files.length);
	await privateJson(path.join(root(), "retirement.json"), state);
	const activeFiles = new Set([...(await configReferences(false)).values()].flat());
	return state.groups.some((group) => group.files.some((name) => !activeFiles.has(name)));
}

export async function finishWasmLifecycle(context) {
	if (context.hadSignal && !context.accepted && !context.lastReloadAccepted)
		context.accepted = await acknowledgedReferences();
	if (context.accepted) {
		await privateJson(path.join(root(), "accepted.json"), {
			version: 1,
			pending: true,
			references: [...context.accepted],
			uncertain: !context.lastReloadAccepted,
		});
		await retryAcceptedStatus();
	}
	// Files created after the last signal/preflight have never been leased to a worker.
	const tracked = new Set((await retirement()).groups.flatMap((group) => group.files));
	const references = new Set([...(await configReferences(true)).values()].flat());
	for (const name of await configurations())
		if (!context.initial.has(name) && !tracked.has(name) && !references.has(name))
			await fs.unlink(path.join(hostsDirectory(), name));
	return collectRetiredWasmConfigurations();
}
