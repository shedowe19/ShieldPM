import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import net from "node:net";
import path from "node:path";
import punycode from "punycode.js";
import errs from "../lib/error.js";
import { normalizeCachePolicy, normalizeUpstreamPool } from "../lib/host-traffic-policy.js";
import { getPoolObservations } from "../lib/upstream-pool-observations.js";
import { nginx as logger } from "../logger.js";

const dataPath = () => process.env.DATA_PATH || "/data";
const hostId = (value) => {
	if (!Number.isSafeInteger(value) || value < 1) throw new errs.ValidationError("Invalid proxy host ID");
	return value;
};
export const cacheDirectory = (id) => path.join(dataPath(), "nginx", "cache", `host-${hostId(id)}`);
export const cacheRequestKeyPath = (requestPath, policy) => {
	if (policy.cache_key !== "uri_ignore_query") return requestPath;
	try {
		return path.posix.normalize(decodeURIComponent(requestPath.split("?")[0])).replace(/\/{2,}/g, "/");
	} catch {
		throw new errs.ValidationError("Purge URI contains invalid percent encoding");
	}
};
/** Nginx records concrete IP:port attempts separated by commas or group separators. */
export const observedRequestsFor = (logs, target) => {
	if (!net.isIP(target.host)) return null;
	const address = `${target.host.includes(":") ? `[${target.host}]` : target.host}:${target.port}`;
	return logs.filter((row) =>
		String(row.upstream || "")
			.split(/\s*,\s*|\s+:\s+/)
			.includes(address),
	).length;
};
const trafficLog = (id) => path.join(dataPath(), "logs", `traffic_${hostId(id)}.log`);
const probes = new Map();
let logMaintenanceTimer;
let logMaintenancePromise;
const tcpProbe = (target) =>
	new Promise((resolve) => {
		const started = performance.now();
		const socket = net.connect({ host: target.host, port: target.port });
		let settled = false;
		const finish = (state) => {
			if (settled) return;
			settled = true;
			clearTimeout(timer);
			socket.destroy();
			resolve({ id: target.id, state, response_ms: Math.round(performance.now() - started) });
		};
		const timer = setTimeout(() => finish("down"), 2000);
		socket.once("connect", () => finish("up"));
		socket.once("error", () => finish("down"));
	});
const authorizedHost = async (access, id, write = false) => {
	hostId(id);
	const { default: hosts } = await import("./proxy-host.js");
	if (write) await access.can("proxy_hosts:update", id);
	return hosts.get(access, { id, expand: ["host_domains"] });
};

/** A configuration change cannot reuse a response from a different origin or policy revision. */
export const cacheNamespaceFor = (host) =>
	createHash("sha256")
		.update(
			JSON.stringify({
				scheme: host.forward_scheme,
				host: host.forward_host,
				port: host.forward_port,
				query: host.forward_query || "",
				advanced: host.advanced_config || "",
				access_list_id: host.access_list_id || 0,
				pool: host.meta?.upstream_pool || null,
				cache: normalizeCachePolicy(host.meta?.cache_policy, host),
				locations: host.locations || [],
				filters: (Array.isArray(host.meta?.wasm_filters) ? host.meta.wasm_filters : [])
					.filter((filter) => filter.enabled === true)
					.map(({ id, kind }) => ({ id, kind })),
			}),
		)
		.digest("hex")
		.slice(0, 24);

/** Prepare render-only policy data. Files are created by generateConfig, never by draft preview. */
export function prepareTrafficRender(host, options = { preview: false }) {
	const preview = options.preview && host.id === 0;
	const pool = normalizeUpstreamPool(host.meta?.upstream_pool, host);
	const cache = normalizeCachePolicy(host.meta?.cache_policy, host);
	const namespace = cache?.enabled ? cacheNamespaceFor(host) : null;
	host.waf_ruleset = host.meta?.waf_ruleset ?? (host.caching_enabled ? "crs" : "base");
	host.traffic_log_path = preview ? path.join(dataPath(), "logs", "traffic_preview.log") : trafficLog(host.id);
	host.pool = pool?.enabled ? { ...pool, name: `spm_pool_${host.id}` } : null;
	if (host.pool) {
		host.original_forward_host = host.forward_host;
		host.forward_host = host.pool.name;
		host.forward_port = null;
	}
	host.cache = cache?.enabled
		? {
				...cache,
				name: `spm_cache_${host.id}`,
				namespace,
				directory: preview ? path.join(dataPath(), "nginx", "cache", "preview") : cacheDirectory(host.id),
				protected:
					Boolean(host.access_list_id) ||
					(Array.isArray(host.meta?.wasm_filters) &&
						host.meta.wasm_filters.some((filter) => filter.enabled === true)),
			}
		: null;
	host.cache_ttl_seconds = host.cache?.routes.find((route) => route.path === "/")?.ttl_seconds ?? null;
	host.cache_extra_routes = (host.cache?.routes || []).filter(
		(route) => route.path !== "/" && !(host.locations || []).some((location) => location.path === route.path),
	);
	return host;
}

/** Never follow cache-directory symlinks; parent files remain owned by the deployment UID. */
export async function prepareTrafficFiles(host) {
	const normalized = normalizeCachePolicy(host.meta?.cache_policy, host);
	if (!normalized?.enabled) return;
	const directory = cacheDirectory(host.id);
	const ancestors = [dataPath(), path.join(dataPath(), "nginx"), path.dirname(directory), directory];
	for (const ancestor of ancestors) {
		await fs.mkdir(ancestor, { recursive: true, mode: 0o700 });
		const info = await fs.lstat(ancestor);
		if (!info.isDirectory() || info.isSymbolicLink())
			throw new errs.ConfigurationError("Cache storage must use regular directories");
	}
}

async function readTraffic(id) {
	let file;
	try {
		file = await fs.open(trafficLog(id), "r");
		const info = await file.stat();
		if (!info.isFile()) return [];
		const start = Math.max(0, info.size - 1024 * 1024);
		const buffer = Buffer.alloc(info.size - start);
		await file.read(buffer, 0, buffer.length, start);
		const lines = buffer.toString("utf8").split("\n");
		if (start) lines.shift();
		return lines.flatMap((line) => {
			try {
				const row = JSON.parse(line);
				return row && typeof row === "object" && !Array.isArray(row) ? [row] : [];
			} catch {
				return [];
			}
		});
	} catch (error) {
		if (error.code === "ENOENT") return [];
		throw error;
	} finally {
		await file?.close();
	}
}

const service = {
	/** Bound private traffic observations even when optional system logrotate is disabled. */
	async maintainLogs() {
		if (logMaintenancePromise) return logMaintenancePromise;
		logMaintenancePromise = (async () => {
			const directory = path.join(dataPath(), "logs");
			let entries;
			try {
				entries = await fs.readdir(directory, { withFileTypes: true });
			} catch (error) {
				if (error.code === "ENOENT") return;
				throw error;
			}
			for (const entry of entries) {
				if (!entry.isFile() || !/^traffic_[1-9]\d*\.log$/.test(entry.name)) continue;
				const filename = path.join(directory, entry.name);
				const info = await fs.lstat(filename);
				if (!info.isFile() || info.isSymbolicLink() || info.size <= 10 * 1024 * 1024) continue;
				// Copy/truncate retains Nginx's open append descriptor. These are sampled observations.
				await fs.copyFile(filename, `${filename}.1`);
				await fs.truncate(filename, 0);
			}
		})().finally(() => {
			logMaintenancePromise = null;
		});
		return logMaintenancePromise;
	},
	init() {
		if (logMaintenanceTimer) return;
		const run = () =>
			void service
				.maintainLogs()
				.catch((error) => logger.error(`Traffic log maintenance failed: ${error.message}`));
		run();
		logMaintenanceTimer = setInterval(run, 60_000);
		logMaintenanceTimer.unref?.();
	},
	async stop() {
		clearInterval(logMaintenanceTimer);
		logMaintenanceTimer = null;
		probes.clear();
		await logMaintenancePromise;
	},
	/** Remove only this host's cache after its listener has been removed successfully. */
	async removeHostFiles(id) {
		hostId(id);
		probes.delete(id);
		const directory = cacheDirectory(id);
		let cacheExists = true;
		for (const ancestor of [path.join(dataPath(), "nginx"), path.dirname(directory), directory]) {
			try {
				const info = await fs.lstat(ancestor);
				if (!info.isDirectory() || info.isSymbolicLink())
					throw new errs.ConfigurationError("Unsafe cache directory");
			} catch (error) {
				if (error.code === "ENOENT") {
					cacheExists = false;
					break;
				}
				throw error;
			}
		}
		if (cacheExists) await fs.rm(directory, { recursive: true, force: true });
		for (const filename of [trafficLog(id), `${trafficLog(id)}.1`]) {
			try {
				await fs.unlink(filename);
			} catch (error) {
				if (error.code !== "ENOENT") throw error;
			}
		}
	},
	/** Current bounded TCP observations and observed routing. These do not override Nginx passive failure state. */
	async poolStatus(access, id) {
		const host = await authorizedHost(access, id);
		const pool = normalizeUpstreamPool(host.meta?.upstream_pool, host);
		if (!pool?.enabled) return { enabled: false, targets: [], checked_at: null, observation: "tcp" };
		const key = `${id}:${JSON.stringify(pool.targets)}`;
		let entry = probes.get(id);
		if (!entry || entry.key !== key || entry.expires < Date.now()) {
			const promise = (async () => {
				const result = [];
				for (let start = 0; start < pool.targets.length; start += 4)
					result.push(...(await Promise.all(pool.targets.slice(start, start + 4).map(tcpProbe))));
				return result;
			})();
			entry = { key, expires: Date.now() + 5000, promise };
			probes.set(id, entry);
			if (probes.size > 100) probes.delete(probes.keys().next().value);
		}
		const states = await entry.promise;
		const monitorObservations = getPoolObservations(host);
		const logs = await readTraffic(id);
		return {
			enabled: true,
			checked_at: new Date().toISOString(),
			observation: "tcp",
			retry_policy: "idempotent-only",
			targets: pool.targets.map((target) => ({
				...target,
				...states.find((state) => state.id === target.id),
				monitor: monitorObservations.get(target.id) || null,
				observed_requests: observedRequestsFor(logs, target),
			})),
		};
	},
	/** Statistics cover at most the latest MiB of this host's traffic log, not lifetime counters. */
	async cacheStatus(access, id) {
		const host = await authorizedHost(access, id);
		const policy = normalizeCachePolicy(host.meta?.cache_policy, host);
		const rows = await readTraffic(id);
		const counts = {};
		for (const row of rows)
			if (typeof row.cache === "string" && /^[A-Z_]+$/.test(row.cache))
				counts[row.cache] = (counts[row.cache] || 0) + 1;
		const hits = counts.HIT || 0;
		const misses =
			(counts.MISS || 0) +
			(counts.EXPIRED || 0) +
			(counts.REVALIDATED || 0) +
			(counts.STALE || 0) +
			(counts.UPDATING || 0);
		return {
			enabled: policy?.enabled === true,
			protected_bypass:
				Boolean(host.access_list_id) ||
				(Array.isArray(host.meta?.wasm_filters) &&
					host.meta.wasm_filters.some((filter) => filter.enabled === true)),
			policy,
			counts,
			hit_ratio: hits + misses ? hits / (hits + misses) : null,
			sample_requests: rows.length,
			sample_limit_bytes: 1024 * 1024,
		};
	},
	/** Purge only this authorized host, optionally one original request URI across its DNS aliases/schemes. */
	async purgeCache(access, id, request = {}) {
		const host = await authorizedHost(access, id, true);
		const policy = normalizeCachePolicy(host.meta?.cache_policy, host);
		if (request.path && !policy?.enabled)
			throw new errs.ValidationError(
				"An exact-URI purge requires an enabled cache policy; use a full host purge instead",
			);
		if (
			request.path !== undefined &&
			(typeof request.path !== "string" ||
				request.path.length > 2048 ||
				!/^\/(?!\/)[A-Za-z0-9/_~.!$&'()*+,;=:@%?-]*$/.test(request.path))
		)
			throw new errs.ValidationError("Purge path must be an absolute request URI");
		const directory = cacheDirectory(id);
		let removed = 0;
		const visit = async (current) => {
			let items;
			try {
				const stat = await fs.lstat(current);
				if (!stat.isDirectory() || stat.isSymbolicLink())
					throw new errs.ConfigurationError("Unsafe cache directory");
				items = await fs.readdir(current, { withFileTypes: true });
			} catch (error) {
				if (error.code === "ENOENT") return;
				throw error;
			}
			for (const item of items) {
				const filename = path.join(current, item.name);
				if (item.isDirectory()) {
					await visit(filename);
					continue;
				}
				if (item.isSymbolicLink() || !item.isFile() || !/^[a-f0-9]{32}$/.test(item.name)) continue;
				if (hashes && !hashes.has(item.name)) continue;
				try {
					await fs.unlink(filename);
					removed++;
				} catch (error) {
					if (error.code !== "ENOENT") throw error;
				}
			}
		};
		const hashes = request.path
			? new Set(
					(host.domain_names || [])
						.filter((domain) => !domain.startsWith("~") && !domain.includes("*"))
						.flatMap((domain) =>
							["http", "https"].map((scheme) =>
								createHash("md5")
									.update(
										`${cacheNamespaceFor(host)}|${scheme}|GET|${punycode.toASCII(domain.toLowerCase())}|${cacheRequestKeyPath(request.path, policy)}`,
									)
									.digest("hex"),
							),
						),
				)
			: null;
		if (hashes && (host.domain_names || []).some((domain) => domain.includes("*") || domain.startsWith("~")))
			throw new errs.ValidationError("Wildcard hosts require a full host cache purge");
		await visit(directory);
		const { default: internalAuditLog } = await import("./audit-log.js");
		await internalAuditLog.add(access, {
			action: "updated",
			object_type: "proxy-host",
			object_id: id,
			meta: { cache_purge: true, path: request.path || null, removed },
		});
		return { removed, path: request.path || null };
	},
};
export default service;
