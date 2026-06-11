import _ from "lodash";
import errs from "../lib/error.js";
import { monitoring as logger } from "../logger.js";
import Monitor from "../models/monitor.js";
import MonitorCheck from "../models/monitor_check.js";
import ProxyHost from "../models/proxy_host.js";
import internalAuditLog from "./audit-log.js";

const DEFAULT_INTERVAL_MS = 30 * 1000;
const HISTORY_LIMIT = 250;
const RESPONSE_EXCERPT_LIMIT = 500;

let schedulerTimer = null;
let schedulerRunning = false;

const nowIso = () => new Date().toISOString();

const normalizeMethod = (method) => {
	const normalized = String(method || "GET").toUpperCase();
	return ["GET", "HEAD"].includes(normalized) ? normalized : "GET";
};

const responseExcerpt = (text) => (text ? String(text).slice(0, RESPONSE_EXCERPT_LIMIT) : null);

const computeFailureStatus = (monitor) => {
	const nextFailures = Number(monitor.consecutive_failures || 0) + 1;
	const threshold = Math.max(1, Number(monitor.failure_threshold || 1));
	return {
		consecutiveFailures: nextFailures,
		status: nextFailures >= threshold ? "down" : "degraded",
	};
};

const shouldRunMonitor = (monitor) => {
	if (!monitor.enabled || monitor.is_deleted) return false;
	if (!monitor.last_checked_on) return true;
	const intervalMs = Math.max(10, Number(monitor.interval_seconds || 60)) * 1000;
	return Date.now() - new Date(monitor.last_checked_on).getTime() >= intervalMs;
};

const buildProxyHostMonitor = async (access, proxyHostId) => {
	await access.can("proxy_hosts:get", proxyHostId);
	const proxyHost = await ProxyHost.query().findById(proxyHostId).where("is_deleted", 0);
	if (!proxyHost) throw new errs.ItemNotFoundError(`Proxy Host ${proxyHostId}`);
	const domain = proxyHost.domain_names?.[0];
	if (!domain) throw new errs.ValidationError("Proxy host has no domain name to monitor");
	const scheme = proxyHost.certificate_id || proxyHost.ssl_forced ? "https" : "http";
	return {
		name: `${domain} uptime`,
		type: "http",
		url: `${scheme}://${domain}`,
		method: "GET",
		expected_status: 200,
		interval_seconds: 60,
		timeout_seconds: 5,
		failure_threshold: 3,
		proxy_host_id: proxyHost.id,
		enabled: 1,
		notification_enabled: 1,
		meta: { source: "proxy-host" },
	};
};

const internalMonitoring = {
	initTimer: () => {
		if (schedulerTimer) return;
		logger.info("Starting Monitoring scheduler...");
		schedulerTimer = setInterval(() => {
			void internalMonitoring.processDueMonitors();
		}, DEFAULT_INTERVAL_MS);
		void internalMonitoring.processDueMonitors();
	},

	stopTimer: () => {
		if (schedulerTimer) {
			clearInterval(schedulerTimer);
			schedulerTimer = null;
		}
	},

	create: async (access, data) => {
		await access.can("monitoring:create", data);
		const thisData = _.cloneDeep(data);
		thisData.owner_user_id = access.token.getUserId(1);
		thisData.method = normalizeMethod(thisData.method);
		const row = await Monitor.query().insertAndFetch(thisData);
		await internalAuditLog.add(access, {
			action: "created",
			object_type: "monitor",
			object_id: row.id,
			meta: row,
		});
		return row;
	},

	createFromProxyHost: async (access, proxyHostId) => {
		const payload = await buildProxyHostMonitor(access, proxyHostId);
		return internalMonitoring.create(access, payload);
	},

	update: async (access, data) => {
		await access.can("monitoring:update", data.id);
		await internalMonitoring.get(access, { id: data.id });
		const thisData = _.cloneDeep(data);
		if (thisData.method) thisData.method = normalizeMethod(thisData.method);
		await Monitor.query().patchAndFetchById(thisData.id, thisData);
		const row = await internalMonitoring.get(access, { id: thisData.id });
		await internalAuditLog.add(access, {
			action: "updated",
			object_type: "monitor",
			object_id: row.id,
			meta: row,
		});
		return row;
	},

	get: async (access, data) => {
		const accessData = await access.can("monitoring:get", data.id);
		const query = Monitor.query().where("id", data.id).where("is_deleted", 0);
		if (accessData.permission_visibility !== "all") {
			query.where("owner_user_id", access.token.getUserId(1));
		}
		const row = await query.first();
		if (!row) throw new errs.ItemNotFoundError(data.id);
		return row;
	},

	getAll: async (access) => {
		const accessData = await access.can("monitoring:list");
		const query = Monitor.query().where("is_deleted", 0).orderBy("name", "ASC");
		if (accessData.permission_visibility !== "all") {
			query.where("owner_user_id", access.token.getUserId(1));
		}
		return query;
	},

	delete: async (access, data) => {
		await access.can("monitoring:delete", data.id);
		const row = await internalMonitoring.get(access, { id: data.id });
		await Monitor.query().patchAndFetchById(data.id, { is_deleted: 1, enabled: 0 });
		await internalAuditLog.add(access, {
			action: "deleted",
			object_type: "monitor",
			object_id: data.id,
			meta: { name: row.name },
		});
		return true;
	},

	getChecks: async (access, data) => {
		await internalMonitoring.get(access, { id: data.id });
		const limit = Math.min(Number(data.limit || HISTORY_LIMIT), HISTORY_LIMIT);
		return MonitorCheck.query().where("monitor_id", data.id).orderBy("checked_on", "DESC").limit(limit);
	},

	test: async (access, data) => {
		const row = await internalMonitoring.get(access, { id: data.id });
		return internalMonitoring.runCheck(row);
	},

	runCheck: async (monitor) => {
		if (monitor.type !== "http") {
			throw new errs.ValidationError(`Unsupported monitor type: ${monitor.type}`);
		}

		const checkedOn = nowIso();
		const started = Date.now();
		let httpStatus = null;
		let error = null;
		let body = null;

		try {
			const timeoutMs = Math.max(1, Number(monitor.timeout_seconds || 5)) * 1000;
			const controller = new AbortController();
			const timeout = setTimeout(() => controller.abort(), timeoutMs);
			try {
				const response = await fetch(monitor.url, {
					method: normalizeMethod(monitor.method),
					signal: controller.signal,
					redirect: "follow",
				});
				httpStatus = response.status;
				if (normalizeMethod(monitor.method) !== "HEAD") {
					body = await response.text();
				}
			} finally {
				clearTimeout(timeout);
			}

			const expectedStatus = Number(monitor.expected_status || 200);
			if (httpStatus !== expectedStatus) {
				error = `Expected HTTP ${expectedStatus}, got ${httpStatus}`;
			} else if (monitor.expected_body && !String(body || "").includes(monitor.expected_body)) {
				error = "Expected body text not found";
			}
		} catch (err) {
			error = err.name === "AbortError" ? `Timed out after ${monitor.timeout_seconds || 5}s` : err.message;
		}

		const latencyMs = Date.now() - started;
		const isSuccess = error === null;
		const failure = isSuccess ? { status: "up", consecutiveFailures: 0 } : computeFailureStatus(monitor);
		const status = failure.status;

		const checkRow = {
			monitor_id: monitor.id,
			checked_on: checkedOn,
			status,
			latency_ms: latencyMs,
			http_status: httpStatus,
			error,
			response_excerpt: responseExcerpt(body),
		};
		await MonitorCheck.query().insert(checkRow);

		const patch = {
			status,
			last_checked_on: checkedOn,
			last_latency_ms: latencyMs,
			last_http_status: httpStatus,
			last_error: error,
			consecutive_failures: failure.consecutiveFailures,
		};
		if (isSuccess) {
			patch.last_success_on = checkedOn;
		} else {
			patch.last_failure_on = checkedOn;
		}

		await Monitor.query().patchAndFetchById(monitor.id, patch);
		return checkRow;
	},

	processDueMonitors: async () => {
		if (schedulerRunning) return;
		schedulerRunning = true;
		try {
			const monitors = await Monitor.query().where("enabled", 1).where("is_deleted", 0);
			for (const monitor of monitors) {
				if (!shouldRunMonitor(monitor)) continue;
				try {
					await internalMonitoring.runCheck(monitor);
				} catch (err) {
					logger.error(`Monitor #${monitor.id} check failed: ${err.message}`);
				}
			}
		} finally {
			schedulerRunning = false;
		}
	},
};

export default internalMonitoring;
