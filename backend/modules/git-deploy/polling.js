import fs from "node:fs";
import { isDemoMode } from "../../lib/config.js";
import { global as logger } from "../../logger.js";
import ProxyHost from "../../models/proxy_host.js";
import { WEBSITES_DIR, intervalToMs, pollingTimers } from "./helpers.js";
import { sync } from "./sync.js";

const stopPolling = (hostId) => {
	const timer = pollingTimers.get(hostId);
	if (timer) {
		clearInterval(timer);
		pollingTimers.delete(hostId);
		logger.debug(`[git-deploy] Stopped polling for host ${hostId}`);
	}
};

const startPollingForHost = (host) => {
	stopPolling(host.id);
	if (!host.git_sync_enabled || !host.git_repo_url) return;
	const intervalMs = intervalToMs(host.git_poll_interval, host.git_poll_unit);
	const timer = setInterval(async () => {
		try { await sync(null, host.id); } catch (err) { logger.error(`[git-deploy] Polling sync failed for host ${host.id}:`, err); }
	}, intervalMs);
	pollingTimers.set(host.id, timer);
	sync(null, host.id).catch((err) => logger.error(`[git-deploy] Initial sync failed for host ${host.id}:`, err));
};

const startPolling = async () => {
	if (isDemoMode()) return;
	try {
		const hosts = await ProxyHost.query().where("is_deleted", 0).where("forward_scheme", "path").where("git_sync_enabled", true).whereNotNull("git_repo_url");
		for (const host of hosts) startPollingForHost(host);
	} catch (err) {
		logger.error("[git-deploy] Failed to start polling:", err);
	}
};

const stopAllPolling = () => {
	for (const [hostId, timer] of pollingTimers) {
		clearInterval(timer);
		logger.debug(`[git-deploy] Stopped polling for host ${hostId}`);
	}
	pollingTimers.clear();
};

const init = async () => {
	if (isDemoMode()) return;
	if (!fs.existsSync(WEBSITES_DIR)) fs.mkdirSync(WEBSITES_DIR, { recursive: true });
	await startPolling();
};

export { init, startPolling, startPollingForHost, stopAllPolling, stopPolling };
